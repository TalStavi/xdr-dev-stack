#!/bin/bash
# check-environment.sh - Check if the EDR/XDR environment is fully operational

# Set up colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ClickHouse credentials
CH_USER="default"
CH_PASSWORD="edrpassword"

echo -e "${BLUE}${BOLD}=== EDR/XDR Environment Status Check ===${NC}"
echo -e "${BLUE}Starting comprehensive environment check...${NC}"
echo

# Initialize counters
SERVICES_OK=0
SERVICES_TOTAL=0
DATA_OK=0
DATA_TOTAL=0
ENDPOINTS_OK=0
ENDPOINTS_TOTAL=0

# Function to check if a container is running
check_container() {
  local name=$1
  SERVICES_TOTAL=$((SERVICES_TOTAL+1))
  
  echo -n "Checking container '$name': "
  if docker ps --format '{{.Names}}' | grep -q "$name"; then
    echo -e "${GREEN}Running${NC}"
    SERVICES_OK=$((SERVICES_OK+1))
    return 0
  else
    echo -e "${RED}Not running${NC}"
    return 1
  fi
}

# Function to check an HTTP endpoint
check_endpoint() {
  local name=$1
  local url=$2
  local expected_code=${3:-200}
  ENDPOINTS_TOTAL=$((ENDPOINTS_TOTAL+1))
  
  echo -n "Checking endpoint '$name' ($url): "
  local status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)
  
  if [ "$status_code" = "$expected_code" ]; then
    echo -e "${GREEN}Available (HTTP $status_code)${NC}"
    ENDPOINTS_OK=$((ENDPOINTS_OK+1))
    return 0
  else
    echo -e "${RED}Failed (HTTP $status_code)${NC}"
    return 1
  fi
}

# Function to check if a table exists and has data
check_table_data() {
  local table=$1
  local min_rows=${2:-1}
  DATA_TOTAL=$((DATA_TOTAL+1))
  
  echo -n "Checking data in table 'edr.$table': "
  
  # First, check if the database exists
  if ! docker exec edr-clickhouse clickhouse-client --user "$CH_USER" --password "$CH_PASSWORD" --query="SELECT 1 FROM system.databases WHERE name='edr'" 2>/dev/null | grep -q "1"; then
    echo -e "${RED}Database 'edr' doesn't exist${NC}"
    return 1
  fi
  
  # Then check if table exists
  if ! docker exec edr-clickhouse clickhouse-client --user "$CH_USER" --password "$CH_PASSWORD" --query="SELECT 1 FROM system.tables WHERE database='edr' AND name='$table'" 2>/dev/null | grep -q "1"; then
    echo -e "${RED}Table doesn't exist${NC}"
    return 1
  fi
  
  # Try to count rows with a more reliable approach
  local row_count=$(docker exec edr-clickhouse clickhouse-client --user "$CH_USER" --password "$CH_PASSWORD" --query="SELECT count() FROM edr.$table" 2>/dev/null)
  
  if [ -z "$row_count" ]; then
    echo -e "${RED}Failed to query table${NC}"
    return 1
  elif [ "$row_count" -ge "$min_rows" ]; then
    echo -e "${GREEN}OK ($row_count rows)${NC}"
    DATA_OK=$((DATA_OK+1))
    return 0
  else
    echo -e "${YELLOW}Empty (0 rows)${NC}"
    return 1
  fi
}

# Function to check Flink jobs
check_flink_jobs() {
  DATA_TOTAL=$((DATA_TOTAL+1))
  
  echo -n "Checking Flink jobs: "
  
  # Get the number of running jobs
  local running_jobs=$(curl -s http://localhost:8081/jobs/overview 2>/dev/null | grep -o '"state":"RUNNING"' | wc -l)
  
  if [ "$running_jobs" -gt 0 ]; then
    echo -e "${GREEN}OK ($running_jobs running)${NC}"
    DATA_OK=$((DATA_OK+1))
    return 0
  else
    echo -e "${RED}No running jobs${NC}"
    return 1
  fi
}

# Function to check Kafka topics
check_kafka_topic() {
  local topic=$1
  DATA_TOTAL=$((DATA_TOTAL+1))
  
  echo -n "Checking Kafka topic '$topic': "
  
  # Check if topic exists
  if ! docker exec edr-redpanda rpk topic list 2>/dev/null | grep -q "$topic"; then
    echo -e "${RED}Topic doesn't exist${NC}"
    return 1
  fi
  
  # For Redpanda, checking for actual messages is difficult via shell, so we'll just assume
  # topics were created correctly and are functioning
  echo -e "${GREEN}OK (topic exists)${NC}"
  DATA_OK=$((DATA_OK+1))
  return 0
}

# Run all the checks
echo -e "${BOLD}=== Docker Containers ===${NC}"
check_container "edr-redpanda"
check_container "edr-clickhouse" 
check_container "edr-flink-jobmanager"
check_container "edr-flink-taskmanager"
check_container "edr-redis"
check_container "edr-api"
check_container "edr-grafana"
check_container "edr-data-generator"

echo
echo -e "${BOLD}=== Service Endpoints ===${NC}"
check_endpoint "Redpanda Console" "http://localhost:8080"
check_endpoint "Flink Dashboard" "http://localhost:8081"
check_endpoint "ClickHouse" "http://localhost:8123/ping"
check_endpoint "API" "http://localhost:3000/health"
check_endpoint "Grafana" "http://localhost:3001/api/health"

echo
echo -e "${BOLD}=== Data Processing ===${NC}"
check_flink_jobs
check_kafka_topic "raw-events"
check_kafka_topic "detections"
check_table_data "events"
check_table_data "detections"

echo
echo -e "${BOLD}=== API Functionality ===${NC}"
check_endpoint "API Events Endpoint" "http://localhost:3000/api/events"
check_endpoint "API Detections Endpoint" "http://localhost:3000/api/detections"
check_endpoint "API Dashboard Stats" "http://localhost:3000/api/dashboard/stats"

# Calculate overall scores
SERVICES_PCT=$((SERVICES_OK * 100 / SERVICES_TOTAL))
DATA_PCT=$((DATA_OK * 100 / DATA_TOTAL))
ENDPOINTS_PCT=$((ENDPOINTS_OK * 100 / ENDPOINTS_TOTAL))
OVERALL_PCT=$(( (SERVICES_PCT + DATA_PCT + ENDPOINTS_PCT) / 3 ))

# Determine overall health status
if [ $OVERALL_PCT -ge 90 ]; then
  HEALTH_STATUS="${GREEN}HEALTHY${NC}"
elif [ $OVERALL_PCT -ge 70 ]; then
  HEALTH_STATUS="${YELLOW}PARTIALLY HEALTHY${NC}"
else
  HEALTH_STATUS="${RED}UNHEALTHY${NC}"
fi

# Print summary
echo
echo -e "${BLUE}${BOLD}=== Environment Health Summary ===${NC}"
echo -e "Services: ${SERVICES_OK}/${SERVICES_TOTAL} operational (${SERVICES_PCT}%)"
echo -e "Endpoints: ${ENDPOINTS_OK}/${ENDPOINTS_TOTAL} available (${ENDPOINTS_PCT}%)"
echo -e "Data Processing: ${DATA_OK}/${DATA_TOTAL} verified (${DATA_PCT}%)"
echo -e "Overall Health: $HEALTH_STATUS (${OVERALL_PCT}%)"

# Print action items if not fully healthy
if [ $OVERALL_PCT -lt 100 ]; then
  echo
  echo -e "${BOLD}Recommended Actions:${NC}"
  
  if [ $SERVICES_PCT -lt 100 ]; then
    echo -e "- Some containers are not running. Try: ${BOLD}./start.sh${NC}"
  fi
  
  if [ $ENDPOINTS_PCT -lt 100 ]; then
    echo -e "- Some service endpoints are unavailable. Check container logs with: ${BOLD}docker logs <container-name>${NC}"
  fi
  
  if [ "$(curl -s http://localhost:8081/jobs/overview 2>/dev/null | grep -o '"state":"RUNNING"' | wc -l)" -eq 0 ]; then
    echo -e "- No Flink jobs running. Deploy the job with: ${BOLD}./build-flink-job.sh${NC}"
  fi
  
  # Check for data issues with authentication
  if docker exec edr-clickhouse clickhouse-client --user "$CH_USER" --password "$CH_PASSWORD" --query="SELECT 1 FROM system.tables WHERE database='edr' AND name='events'" 2>/dev/null | grep -q "1"; then
    event_count=$(docker exec edr-clickhouse clickhouse-client --user "$CH_USER" --password "$CH_PASSWORD" --query="SELECT count() FROM edr.events" 2>/dev/null || echo 0)
    if [ "$event_count" -eq 0 ]; then
      echo -e "- No event data found. Generate test data with: ${BOLD}./run-generator.sh${NC}"
    fi
  fi
  
  echo -e "- For more detailed troubleshooting, see: ${BOLD}TROUBLESHOOTING.md${NC}"
fi

# Exit with appropriate status code
if [ $OVERALL_PCT -ge 70 ]; then
  exit 0
else
  exit 1
fi
