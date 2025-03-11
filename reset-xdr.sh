#!/bin/bash

echo "==============================================="
echo "XDR/EDR Development Stack - Data Clearing Tool"
echo "==============================================="
echo

# Function to check if a docker container is running
check_container() {
  local container_name=$1
  if ! docker ps | grep -q $container_name; then
    echo "Error: Container $container_name is not running."
    echo "Please make sure your dev stack is up before running this script."
    exit 1
  fi
}

# Check if required containers are running
echo "Checking if required containers are running..."
check_container "edr-clickhouse"
check_container "edr-redpanda"
check_container "edr-flink-jobmanager"
echo "✅ All required containers are running."
echo

# Clear ClickHouse data
echo "Clearing ClickHouse data..."
echo "- Getting list of tables in 'edr' database..."
TABLES=$(docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query="SHOW TABLES FROM edr")

if [ -z "$TABLES" ]; then
  echo "  No tables found in the 'edr' database."
else
  echo "- Found tables: $TABLES"
  echo "- Truncating all tables..."
  
  for TABLE in $TABLES; do
    echo "  Truncating table: $TABLE"
    # Skip internal tables that can't be truncated
    if [[ $TABLE == .inner_id.* ]]; then
      echo "    Skipping internal table: $TABLE"
      continue
    fi
    # Use backticks to properly escape table names
    docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query="TRUNCATE TABLE edr.\`$TABLE\`"
  done
  
  echo "✅ All ClickHouse tables have been cleared."
fi
echo

# Reset Flink state
echo "Resetting Flink state..."

# Function to wait for job termination
wait_for_job_termination() {
  local JOB_ID="$1"
  local ACTION="$2"
  for i in {1..10}; do
    if ! docker exec edr-flink-jobmanager flink list -r 2>/dev/null | grep -q "$JOB_ID"; then
      echo "  Job $ACTION successfully"
      return 0
    fi
    echo "  Waiting for job to be $ACTION... attempt $i"
    sleep 2
  done
  
  echo "  Warning: Job $ACTION may not have completed. Proceeding anyway..."
}

# Proper job cancellation for running jobs
echo "- Gracefully stopping all running Flink jobs..."
JOB_OUTPUT=$(docker exec edr-flink-jobmanager flink list -r 2>/dev/null || echo "")

if echo "$JOB_OUTPUT" | grep -q "EDR Processing and Detection"; then
  # Extract job ID for the EDR job
  JOB_ID=$(echo "$JOB_OUTPUT" | grep "EDR Processing and Detection" | awk '{print $4}')
  
  if [[ -n "$JOB_ID" ]]; then
    echo "  Found EDR job with ID: $JOB_ID"
    echo "  Canceling job with ID: $JOB_ID"
    docker exec edr-flink-jobmanager flink cancel $JOB_ID
    wait_for_job_termination "$JOB_ID" "cancelled"
  fi
else
  # Look for other running jobs
  JOBS=$(echo "$JOB_OUTPUT" | grep "RUNNING" | awk '{print $4}')
  if [ -z "$JOBS" ]; then
    echo "  No running Flink jobs found."
  else
    for JOB in $JOBS; do
      echo "  Canceling job with ID: $JOB"
      docker exec edr-flink-jobmanager flink cancel $JOB
      wait_for_job_termination "$JOB" "cancelled"
    done
  fi
fi

# Clear Flink state from all possible locations
echo "- Clearing Flink checkpoints and savepoints..."
docker exec edr-flink-jobmanager rm -rf /opt/flink/checkpoints/*
docker exec edr-flink-jobmanager rm -rf /opt/flink/savepoints/*

# Remove saved savepoint path file
if [ -f ".last_savepoint_path" ]; then
  echo "- Removing saved savepoint reference..."
  rm -f .last_savepoint_path
fi

# Clear any state from local volumes
echo "- Clearing local Flink state volumes..."
if [ -d "./volumes/flink-checkpoints" ]; then
  rm -rf ./volumes/flink-checkpoints/*
fi
if [ -d "./volumes/flink-savepoints" ]; then
  rm -rf ./volumes/flink-savepoints/*
fi

echo "✅ Flink state has been reset."
echo

# Clear Redpanda data and reset consumer offsets
echo "Clearing Redpanda data..."
echo "- Getting list of topics..."
TOPICS=$(docker exec edr-redpanda rpk topic list | tail -n +2 | awk '{print $1}')

if [ -z "$TOPICS" ]; then
  echo "  No topics found in Redpanda."
else
  echo "- Found topics: $TOPICS"
  
  # Delete consumer group first to ensure no stale offsets
  echo "- Deleting consumer group 'edr-flink-processor'..."
  docker exec edr-redpanda rpk group delete edr-flink-processor || echo "  Group may not exist yet, continuing..."
  
  echo "- Clearing all topics..."
  for TOPIC in $TOPICS; do
    echo "  Clearing topic: $TOPIC"
    # Get proper topic configuration before deleting
    PARTITIONS=$(docker exec edr-redpanda rpk topic describe $TOPIC | grep "Partition count" | awk '{print $3}')
    REPLICATION=$(docker exec edr-redpanda rpk topic describe $TOPIC | grep "Replication factor" | awk '{print $3}')
    
    if [ -z "$PARTITIONS" ]; then
      PARTITIONS=1  # Default to 1 partition if we can't determine
    fi
    
    if [ -z "$REPLICATION" ]; then
      REPLICATION=1  # Default to 1 replica if we can't determine
    fi
    
    # Delete and recreate the topic with proper configuration
    docker exec edr-redpanda rpk topic delete $TOPIC
    docker exec edr-redpanda rpk topic create $TOPIC --partitions $PARTITIONS --replicas $REPLICATION
    
    echo "  Topic $TOPIC recreated with $PARTITIONS partitions and $REPLICATION replicas"
  done
  
  echo "✅ All Redpanda topics have been cleared."
fi
echo

# Restart the Flink job
echo "Redeploying Flink job..."
if [ -f "flink-job/target/edr-flink-1.0-SNAPSHOT.jar" ]; then
  # Check if the JAR is already in the container
  JAR_EXISTS=$(docker exec edr-flink-jobmanager test -f /opt/flink/usrlib/edr-flink-1.0-SNAPSHOT.jar && echo "yes" || echo "no")
  
  if [ "$JAR_EXISTS" == "no" ]; then
    echo "- Copying JAR file to JobManager..."
    docker exec edr-flink-jobmanager mkdir -p /opt/flink/usrlib/
    docker cp flink-job/target/edr-flink-1.0-SNAPSHOT.jar edr-flink-jobmanager:/opt/flink/usrlib/
  fi
  
  echo "- Starting Flink job..."
  docker exec edr-flink-jobmanager flink run -d /opt/flink/usrlib/edr-flink-1.0-SNAPSHOT.jar
  echo "✅ Flink job has been redeployed."

  # Wait for the job to start properly
  echo "- Waiting for job to be running..."
  sleep 10
  
  # Generate test data to verify functionality, focusing on patterns that trigger detections
  echo "- Generating test data with suspicious patterns..."
  for i in {1..5}; do
    echo "  Generating batch $i of suspicious events..."
    docker exec edr-data-generator python /app/scripts/generate-data.py --kafka redpanda:9092 --rate 10 --duration 5 --topic raw-events
    sleep 2
  done
  
  # Check if detections are being generated
  echo "- Checking for detections in ClickHouse..."
  sleep 5
  
  DETECTION_COUNT=$(docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query="SELECT count() FROM edr.detections")
  
  if [ "$DETECTION_COUNT" -gt 0 ]; then
    echo "✅ Success! $DETECTION_COUNT detections were generated and stored in ClickHouse."
  else
    echo "⚠️ No detections found in ClickHouse yet."
    echo "  This might be because:"
    echo "  1. The suspicious events didn't match detection patterns"
    echo "  2. The Flink job needs more time to process"
    echo "  3. There might be an issue with detection rules"
    echo ""
    echo "  You can check manually with:"
    echo "  docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query=\"SELECT count() FROM edr.detections\""
  fi
else
  echo "⚠️ Could not find Flink job JAR file. To redeploy the job, run './build-flink-job.sh' manually."
fi
echo

echo "Data clearing completed successfully."
echo "Your XDR/EDR stack has been reset with clean data and redeployed Flink jobs."

# Add debug information section
echo
echo "==============================================="
echo "DEBUG INFORMATION & NEXT STEPS"
echo "==============================================="
echo "If you're having issues with detections not being generated, here's what to check:"
echo
echo "1. Event Processing Pipeline Status:"
echo "   Events in raw-events topic: $(docker exec edr-redpanda rpk topic consume raw-events -n 1 2>/dev/null | wc -l || echo "none")"
echo "   Events in ClickHouse: $(docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query="SELECT count() FROM edr.events")"
echo "   Consumer group status: $(docker exec edr-redpanda rpk group describe edr-flink-processor | grep STATE | awk '{print $2}')"
echo
echo "2. Detections Status:"
echo "   Detections in ClickHouse: $(docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query="SELECT count() FROM edr.detections")"
echo
echo "3. Generate Detections Manually:"
echo "   Run the following command to generate suspicious events that should trigger detections:"
echo "   ./scripts/generate-data.py --kafka redpanda:9092 --rate 50 --duration 20 --topic raw-events"
echo
echo "For more advanced troubleshooting, access the Flink UI at:"
echo "http://localhost:8081/"
echo 