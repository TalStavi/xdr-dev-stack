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
IGNORE_SAVEPOINTS=false
CLEAR_SAVEPOINTS=false
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
    --ignore-savepoints)
      IGNORE_SAVEPOINTS=true
      shift
      ;;
    --clear-savepoints)
      CLEAR_SAVEPOINTS=true
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --force-rebuild     Force rebuild even if no changes detected"
      echo "  --skip-deploy       Build only, don't deploy to Flink"
      echo "  --verbose           Show more detailed output"
      echo "  --ignore-savepoints Don't use or create savepoints (use with caution)"
      echo "  --clear-savepoints  Delete any saved savepoint references" 
      echo "  --help              Show this help message"
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
  
  # Create the savepoint directory on the host
  mkdir -p volumes/flink-savepoints
  
  # Ensure the directory has correct permissions inside the container
  if docker ps | grep edr-flink-jobmanager > /dev/null; then
    # Make sure savepoint directory exists in the container
    docker exec edr-flink-jobmanager mkdir -p $SAVEPOINT_DIR
    
    # Ensure proper permissions for saving and reading savepoints
    docker exec edr-flink-jobmanager chmod 777 $SAVEPOINT_DIR
    
    # Verify the directories
    log_verbose "Verifying savepoint directory in container..."
    if ! docker exec edr-flink-jobmanager bash -c "[ -d '$SAVEPOINT_DIR' ] && [ -w '$SAVEPOINT_DIR' ]"; then
      log "Warning: Savepoint directory $SAVEPOINT_DIR in container is not properly configured."
      log "         This may cause issues with savepoint creation or restoration."
    else
      log_verbose "Savepoint directory $SAVEPOINT_DIR is properly configured in container."
    fi
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
  
  # Check if Maven is installed
  if ! command -v mvn &> /dev/null; then
    log "Error: Maven is not installed or not in PATH. Please install Maven to build the Flink job."
    exit 1
  fi
  
  # Check if flink-job directory exists
  if [ ! -d "flink-job" ]; then
    log "Error: flink-job directory not found. Make sure you're running this script from the correct location."
    exit 1
  fi
  
  # Save current directory to return to it later
  local CURRENT_DIR=$(pwd)
  
  # Enter the flink-job directory
  cd flink-job || { log "Error: Failed to change to flink-job directory"; exit 1; }
  
  # Check for pom.xml
  if [ ! -f "pom.xml" ]; then
    log "Error: pom.xml not found in flink-job directory. Cannot build project."
    cd "$CURRENT_DIR"
    exit 1
  fi
  
  log_verbose "Running Maven build..."
  
  # Run Maven with more detailed output capture
  local MVN_OUTPUT
  MVN_OUTPUT=$(mvn clean package 2>&1)
  local MVN_EXIT_CODE=$?
  
  # Return to original directory
  cd "$CURRENT_DIR"
  
  if [ $MVN_EXIT_CODE -ne 0 ]; then
    log "Error: Maven build failed with exit code $MVN_EXIT_CODE"
    log "Maven output:"
    echo "$MVN_OUTPUT" | tail -n 20
    
    # Check for common errors
    if echo "$MVN_OUTPUT" | grep -q "Could not resolve dependencies"; then
      log "It appears there might be dependency resolution issues. Check your internet connection or Maven repository settings."
    elif echo "$MVN_OUTPUT" | grep -q "Compilation failure"; then
      log "There are compilation errors in your code. Please fix them and try again."
    fi
    
    exit 1
  fi
  
  # Verify the JAR was created
  if [ ! -f "flink-job/target/edr-flink-1.0-SNAPSHOT.jar" ]; then
    log "Error: Build completed but JAR file was not created. Check Maven configuration."
    exit 1
  fi
  
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
      # If we're ignoring savepoints, just cancel the job
      if [[ "$IGNORE_SAVEPOINTS" == "true" ]]; then
        log "Savepoints are disabled. Cancelling job without savepoint..."
        docker exec edr-flink-jobmanager flink cancel "$JOB_ID"
        wait_for_job_termination "$JOB_ID" "cancelled"
        return 0
      fi
      
      # Ensure savepoint directory exists
      docker exec edr-flink-jobmanager mkdir -p $SAVEPOINT_DIR
      docker exec edr-flink-jobmanager chmod 777 $SAVEPOINT_DIR
      
      # Create a savepoint
      log "Creating savepoint for job $JOB_ID"
      
      # Ensure the savepoint directory exists and is writable
      if ! docker exec edr-flink-jobmanager bash -c "[ -d '$SAVEPOINT_DIR' ] && [ -w '$SAVEPOINT_DIR' ]"; then
        log "Recreating savepoint directory with proper permissions..."
        docker exec edr-flink-jobmanager mkdir -p $SAVEPOINT_DIR
        docker exec edr-flink-jobmanager chmod 777 $SAVEPOINT_DIR
      fi
      
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
        
        # Verify the savepoint actually exists
        if docker exec edr-flink-jobmanager bash -c "[ -e '$SAVEPOINT_PATH' ]"; then
          # Store the savepoint path for later use
          echo "$SAVEPOINT_PATH" > .last_savepoint_path
          
          # Stop the job after savepoint is created
          log "Stopping job with ID $JOB_ID"
          docker exec edr-flink-jobmanager flink stop --savepointPath $SAVEPOINT_PATH $JOB_ID
          
          # Wait for job to be fully stopped
          wait_for_job_termination "$JOB_ID" "stopped with savepoint"
        else
          log "Error: Savepoint was reportedly created but does not exist at '$SAVEPOINT_PATH'. Falling back to cancel."
          docker exec edr-flink-jobmanager flink cancel "$JOB_ID"
          wait_for_job_termination "$JOB_ID" "cancelled"
        fi
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
  
  # Verify the JAR exists before proceeding
  if [ ! -f "flink-job/target/edr-flink-1.0-SNAPSHOT.jar" ]; then
    log "Error: JAR file not found at flink-job/target/edr-flink-1.0-SNAPSHOT.jar. Build may have failed."
    exit 1
  fi
  
  # Check if Docker is running
  if ! command -v docker &> /dev/null; then
    log "Error: Docker command not found. Please install Docker to deploy the Flink job."
    exit 1
  fi
  
  # Verify Docker is running
  if ! docker info &> /dev/null; then
    log "Error: Docker is not running or you don't have sufficient permissions. Start Docker and try again."
    exit 1
  fi
  
  check_jobmanager
  
  # Verify JobManager container is accessible
  if ! docker exec edr-flink-jobmanager echo "Container access test" &> /dev/null; then
    log "Error: Cannot access edr-flink-jobmanager container. The container may be unhealthy."
    exit 1
  fi
  
  log "Creating target directory..."
  if ! docker exec edr-flink-jobmanager mkdir -p /opt/flink/usrlib/ &> /dev/null; then
    log "Error: Failed to create directory in JobManager container. Check container permissions."
    exit 1
  fi
  
  log "Copying Flink job to JobManager..."
  if ! docker cp flink-job/target/edr-flink-1.0-SNAPSHOT.jar edr-flink-jobmanager:/opt/flink/usrlib/ &> /dev/null; then
    log "Error: Failed to copy JAR file to JobManager container. Check file permissions and container status."
    exit 1
  fi
  
  # Stop existing jobs if running
  check_and_stop_existing_jobs
  
  # Check if we have a savepoint to restore from (unless we're ignoring savepoints)
  if [[ "$IGNORE_SAVEPOINTS" == "false" ]] && [[ -f ".last_savepoint_path" ]]; then
    local SAVEPOINT_PATH=$(cat .last_savepoint_path)
    
    if [[ -n "$SAVEPOINT_PATH" ]]; then
      # Verify the savepoint path actually exists in the container
      log "Verifying savepoint at $SAVEPOINT_PATH..."
      local SAVEPOINT_EXISTS=$(docker exec edr-flink-jobmanager bash -c "if [ -e '$SAVEPOINT_PATH' ]; then echo 'exists'; else echo 'not_found'; fi")
      
      if [[ "$SAVEPOINT_EXISTS" == "exists" ]]; then
        log "Submitting Flink job with savepoint restoration from $SAVEPOINT_PATH..."
        if ! docker exec edr-flink-jobmanager flink run -d -s $SAVEPOINT_PATH /opt/flink/usrlib/edr-flink-1.0-SNAPSHOT.jar; then
          log "Error: Failed to deploy Flink job with savepoint. Check JobManager logs for details."
          exit 1
        fi
        log "Flink job deployed successfully with state restored from savepoint"
        return 0
      else
        log "Warning: Savepoint path $SAVEPOINT_PATH no longer exists. Removing invalid savepoint reference."
        rm -f .last_savepoint_path
        log "Will deploy without savepoint instead."
      fi
    fi
  fi
  
  # If no savepoint available or savepoints are disabled, start without it
  if [[ "$IGNORE_SAVEPOINTS" == "true" ]]; then
    log "Savepoints are disabled. Submitting Flink job without state restoration..."
  else
    log "No savepoint available. Submitting Flink job without state restoration..."
  fi
  
  if ! docker exec edr-flink-jobmanager flink run -d /opt/flink/usrlib/edr-flink-1.0-SNAPSHOT.jar; then
    log "Error: Failed to deploy Flink job. Check JobManager logs for details."
    exit 1
  fi
  
  log "Flink job deployed successfully (without state restoration)"
}

# Main execution
main() {
  # Check for clear savepoints option
  if [[ "$CLEAR_SAVEPOINTS" == "true" ]]; then
    log "Clearing savepoint references as requested..."
    rm -f .last_savepoint_path
  fi

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
