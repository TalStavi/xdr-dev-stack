#!/bin/bash
# build-flink-job.sh - Build and deploy the Flink job
# 
# Improved to:
# - Check if code has changed before rebuilding
# - Check for existing jobs before submitting
# - Add command line options
# - Improve error handling

set -e

# Default options
FORCE_REBUILD=false
SKIP_DEPLOY=false
VERBOSE=false

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

# Function to check and stop existing jobs
check_and_stop_existing_jobs() {
  log "Checking for existing jobs..."
  local JOB_OUTPUT=$(docker exec edr-flink-jobmanager flink list -r 2>/dev/null)
  
  if echo "$JOB_OUTPUT" | grep -q "EDR Processing and Detection"; then
    log "Found existing EDR Processing job. Cancelling before deploying new version..."
    
    # Extract job ID - this assumes the job name is unique
    local JOB_ID=$(echo "$JOB_OUTPUT" | grep "EDR Processing and Detection" | awk '{print $4}')
    
    if [[ -n "$JOB_ID" ]]; then
      log "Cancelling job with ID $JOB_ID"
      docker exec edr-flink-jobmanager flink cancel "$JOB_ID"
      
      # Wait for job to be fully cancelled
      for i in {1..10}; do
        if ! docker exec edr-flink-jobmanager flink list -r 2>/dev/null | grep -q "$JOB_ID"; then
          log "Job cancelled successfully"
          return 0
        fi
        log_verbose "Waiting for job to be cancelled... attempt $i"
        sleep 2
      done
      
      log "Warning: Job cancellation may not have completed. Proceeding anyway..."
    else
      log "Error: Could not extract job ID from listing. Please check manually."
      return 1
    fi
  else
    log_verbose "No existing EDR Processing job found"
  fi
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
  
  log "Submitting Flink job..."
  docker exec edr-flink-jobmanager flink run -d /opt/flink/usrlib/edr-flink-1.0-SNAPSHOT.jar
  
  log "Flink job deployed successfully"
}

# Main execution
main() {
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
