#!/bin/bash
# build-flink-job.sh - Build and deploy the Flink job
# 
# Improved to:
# - Check if code has changed before rebuilding
# - Check for existing jobs before submitting
# - Add command line options
# - Improve error handling
# - Use savepoints for stateful job updates

set -e

# Default options
FORCE_REBUILD=false
SKIP_DEPLOY=false
VERBOSE=false
SAVEPOINT_DIR="/opt/flink/savepoints"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --force-rebuild)
      FORCE_REBUILD=true
      shift
      ;;
    --skip-deploy)
      SKIP_DEPLOY=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --force-rebuild   Force rebuild even if no changes detected"
      echo "  --skip-deploy     Build only, don't deploy to Flink"
      echo "  --verbose         Show more detailed output"
      echo "  --help            Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Function to log messages
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Function to log verbose messages
log_verbose() {
  if [[ "$VERBOSE" == "true" ]]; then
    log "$1"
  fi
}

# Ensure required directories exist
ensure_directories() {
  log_verbose "Ensuring required directories exist..."
  mkdir -p volumes/flink-savepoints
  # Ensure the directory has correct permissions inside the container
  if docker ps | grep edr-flink-jobmanager > /dev/null; then
    docker exec edr-flink-jobmanager mkdir -p $SAVEPOINT_DIR
    docker exec edr-flink-jobmanager chmod 777 $SAVEPOINT_DIR
  fi
}

# Check if JobManager is running
check_jobmanager() {
  if ! docker ps | grep edr-flink-jobmanager > /dev/null; then
    log "Error: JobManager container is not running. Start with './start.sh' first."
    exit 1
  fi
}

# Function to check if rebuild is needed
check_rebuild_needed() {
  if [[ "$FORCE_REBUILD" == "true" ]]; then
    log_verbose "Force rebuild enabled, will rebuild regardless of changes"
    return 0  # True, rebuild needed
  fi
  
  # Store hashes in workspace root to prevent deletion during Maven clean
  local LAST_BUILD_FILE=".last_build_hash"
  
  # Better change detection using find with a specific list of source directories
  local CURRENT_HASH=$(find flink-job/src -type f -name "*.java" | sort | xargs cat 2>/dev/null | md5sum | cut -d' ' -f1)
  
  if [[ ! -f "$LAST_BUILD_FILE" ]]; then
    log_verbose "No previous build detected, rebuild needed"
    echo "$CURRENT_HASH" > "$LAST_BUILD_FILE"
    return 0  # True, rebuild needed
  fi
  
  local LAST_HASH=$(cat "$LAST_BUILD_FILE")
  if [[ "$CURRENT_HASH" == "$LAST_HASH" ]]; then
    log "No code changes detected since last build"
    return 1  # False, no rebuild needed
  else
    log_verbose "Code changes detected, rebuild needed"
    echo "$CURRENT_HASH" > "$LAST_BUILD_FILE"
    return 0  # True, rebuild needed
  fi
}

# Function to build the Flink job
build_job() {
  log "Building Flink job..."
  cd flink-job
  mvn clean package
  cd ..
  log "Build completed successfully"
}

# Function to check and stop existing jobs with savepoint
check_and_stop_existing_jobs() {
  log "Checking for existing jobs..."
  local JOB_OUTPUT=$(docker exec edr-flink-jobmanager flink list -r 2>/dev/null)
  
  if echo "$JOB_OUTPUT" | grep -q "EDR Processing and Detection"; then
    log "Found existing EDR Processing job. Creating savepoint before stopping..."
    
    # Extract job ID - this assumes the job name is unique
    local JOB_ID=$(echo "$JOB_OUTPUT" | grep "EDR Processing and Detection" | awk '{print $4}')
    
    if [[ -n "$JOB_ID" ]]; then
      # Ensure savepoint directory exists
      docker exec edr-flink-jobmanager mkdir -p $SAVEPOINT_DIR
      docker exec edr-flink-jobmanager chmod 777 $SAVEPOINT_DIR
      
      # Create a savepoint
      log "Creating savepoint for job $JOB_ID"
      local SAVEPOINT_OUTPUT=$(docker exec edr-flink-jobmanager flink savepoint $JOB_ID $SAVEPOINT_DIR 2>&1)
      local SAVEPOINT_EXIT_CODE=$?
      
      if [[ "$VERBOSE" == "true" ]]; then
        log "Savepoint command output: $SAVEPOINT_OUTPUT"
      fi
      
      # Extract savepoint path from output
      local SAVEPOINT_PATH=$(echo "$SAVEPOINT_OUTPUT" | grep -o "$SAVEPOINT_DIR/savepoint-[0-9a-f-]\+")
      
      if [[ $SAVEPOINT_EXIT_CODE -ne 0 ]]; then
        log "Error: Savepoint command failed with exit code $SAVEPOINT_EXIT_CODE. Falling back to cancel."
        docker exec edr-flink-jobmanager flink cancel "$JOB_ID"
        # Wait for job to be fully cancelled
        wait_for_job_termination "$JOB_ID" "cancelled"
      elif [[ -n "$SAVEPOINT_PATH" ]]; then
        log "Savepoint created at $SAVEPOINT_PATH"
        
        # Store the savepoint path for later use
        echo "$SAVEPOINT_PATH" > .last_savepoint_path
        
        # Stop the job after savepoint is created
        log "Stopping job with ID $JOB_ID"
        docker exec edr-flink-jobmanager flink stop --savepointPath $SAVEPOINT_PATH $JOB_ID
        
        # Wait for job to be fully stopped
        wait_for_job_termination "$JOB_ID" "stopped with savepoint"
      else
        log "Error: Failed to create savepoint (no path found). Output: $SAVEPOINT_OUTPUT. Falling back to cancel."
        docker exec edr-flink-jobmanager flink cancel "$JOB_ID"
        
        # Wait for job to be fully cancelled
        wait_for_job_termination "$JOB_ID" "cancelled"
      fi
    else
      log "Error: Could not extract job ID from listing. Please check manually."
      return 1
    fi
  else
    log_verbose "No existing EDR Processing job found"
  fi
}

# Helper function to wait for job termination
wait_for_job_termination() {
  local JOB_ID="$1"
  local ACTION="$2"
  for i in {1..10}; do
    if ! docker exec edr-flink-jobmanager flink list -r 2>/dev/null | grep -q "$JOB_ID"; then
      log "Job $ACTION successfully"
      return 0
    fi
    log_verbose "Waiting for job to be $ACTION... attempt $i"
    sleep 2
  done
  
  log "Warning: Job $ACTION may not have completed. Proceeding anyway..."
}

# Function to deploy the job
deploy_job() {
  if [[ "$SKIP_DEPLOY" == "true" ]]; then
    log "Deployment skipped as requested"
    return 0
  fi
  
  check_jobmanager
  
  log "Creating target directory..."
  docker exec edr-flink-jobmanager mkdir -p /opt/flink/usrlib/
  
  log "Copying Flink job to JobManager..."
  docker cp flink-job/target/edr-flink-1.0-SNAPSHOT.jar edr-flink-jobmanager:/opt/flink/usrlib/
  
  # Stop existing jobs if running
  check_and_stop_existing_jobs
  
  # Check if we have a savepoint to restore from
  if [[ -f ".last_savepoint_path" ]]; then
    local SAVEPOINT_PATH=$(cat .last_savepoint_path)
    
    if [[ -n "$SAVEPOINT_PATH" ]]; then
      log "Submitting Flink job with savepoint restoration from $SAVEPOINT_PATH..."
      docker exec edr-flink-jobmanager flink run -d -s $SAVEPOINT_PATH /opt/flink/usrlib/edr-flink-1.0-SNAPSHOT.jar
      log "Flink job deployed successfully with state restored from savepoint"
      return 0
    fi
  fi
  
  # If no savepoint available, start without it
  log "No savepoint available. Submitting Flink job without state restoration..."
  docker exec edr-flink-jobmanager flink run -d /opt/flink/usrlib/edr-flink-1.0-SNAPSHOT.jar
  
  log "Flink job deployed successfully (without state restoration)"
}

# Main execution
main() {
  # Ensure required directories exist
  ensure_directories
  
  # Check if we need to rebuild
  if check_rebuild_needed; then
    build_job
  else
    log "Skipping build as no changes detected"
  fi
  
  # Deploy the job
  deploy_job
  
  log "Operation completed successfully"
}

main "$@"
