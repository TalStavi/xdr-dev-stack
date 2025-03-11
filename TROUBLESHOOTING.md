# EDR/XDR Development Stack Troubleshooting Guide

This document provides solutions for common issues when working with the EDR/XDR development stack.

## Quick Checks

Before diving into specific issues, try these quick checks:

```bash
# Check running containers
docker ps | grep edr

# Check container logs
docker logs edr-redpanda
docker logs edr-clickhouse
docker logs edr-flink-jobmanager
docker logs edr-api
docker logs edr-webui

# Check Redpanda topics
docker exec edr-redpanda rpk topic list

# Check ClickHouse tables
docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query="SHOW TABLES FROM edr"
```

## Common Issues and Solutions

### 1. Port Conflicts

**Symptom**: Error when starting containers about ports being already allocated.

**Solution**:
- Identify conflicting ports: `sudo lsof -i :PORT_NUMBER`
- Stop any services using those ports
- Or, edit docker-compose.yml to use different ports:
  ```yaml
  # Example change for Redpanda admin port
  redpanda:
    ports:
      - "9092:9092"  # Kafka API
      - "8083:8081"  # Changed from 8081 to 8083
  ```

### 2. Event Data Flow Issues

**Symptom**: Events aren't flowing through the system or detections aren't being generated.

**Solution**:
1. Check if Redpanda topics exist:
   ```bash
   docker exec edr-redpanda rpk topic list
   ```

2. Check if data is making it to ClickHouse:
   ```bash
   docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query="SELECT count() FROM edr.events"
   ```

3. Verify the Flink job is running:
   ```bash
   docker exec edr-flink-jobmanager flink list -r
   ```

4. Reset the data flow pipeline:
   ```bash
   ./clear-data.sh
   ```

### 3. Flink Job Deployment Issues

**Symptom**: Errors when deploying or running Flink jobs.

**Solution**:
1. Check Flink logs:
   ```bash
   docker logs edr-flink-jobmanager
   ```

2. Check if the JAR file was copied correctly:
   ```bash
   docker exec edr-flink-jobmanager ls -la /opt/flink/usrlib/
   ```

3. Rebuild with verbose output:
   ```bash
   ./build-flink-job.sh --verbose
   ```

4. Check Flink Task Manager logs for runtime errors:
   ```bash
   docker logs edr-flink-taskmanager
   ```

5. Verify Flink job status in the UI: http://localhost:8081

### 4. ClickHouse Database Issues

**Symptom**: Unable to query data or table-related errors.

**Solution**:
1. Check if ClickHouse is running properly:
   ```bash
   docker exec edr-clickhouse clickhouse-client --query="SELECT 1"
   ```

2. Verify database and table existence:
   ```bash
   docker exec edr-clickhouse clickhouse-client --query="SHOW DATABASES"
   docker exec edr-clickhouse clickhouse-client --query="SHOW TABLES FROM edr"
   ```

3. Run the initialization script manually:
   ```bash
   docker exec edr-clickhouse bash /docker-entrypoint-initdb.d/init-db.sh
   ```

### 5. Web UI or API Issues

**Symptom**: Web UI doesn't load or API endpoints return errors.

**Solution**:
1. Check service logs:
   ```bash
   docker logs edr-api
   docker logs edr-webui
   ```

2. Verify services are running:
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3001/
   ```

3. Restart individual services:
   ```bash
   docker-compose restart api webui
   ```

4. Check if services can connect to their dependencies:
   ```bash
   docker exec edr-api wget -q -O- clickhouse:8123/ping
   docker exec edr-webui wget -q -O- api:3000/health
   ```

### 6. Data Generator Issues

**Symptom**: Cannot generate test data or data isn't appearing in the system.

**Solution**:
1. Access the data generator container:
   ```bash
   docker exec -it edr-data-generator bash
   ```

2. Run the generator script manually:
   ```bash
   docker exec edr-data-generator python /app/scripts/generate-data.py --kafka redpanda:9092 --rate 10 --duration 5 --topic raw-events
   ```

3. Check Redpanda to verify events were produced:
   ```bash
   docker exec edr-redpanda rpk topic consume raw-events -n 5
   ```

### 7. Complete Reset

If you need to completely reset the development environment:

```bash
# Stop all services
./stop.sh

# Remove all volumes and data
./clean.sh

# Start fresh
./start.sh
./build-flink-job.sh
./run-generator.sh
```

## Advanced Debugging Tips

### Network Connectivity Between Containers

```bash
# Check if containers can reach each other
docker exec edr-api ping clickhouse
docker exec edr-webui ping api
docker exec edr-flink-jobmanager ping redpanda
```

### Interactive Database Access

```bash
# ClickHouse CLI
docker exec -it edr-clickhouse clickhouse-client

# Redis CLI
docker exec -it edr-redis redis-cli
```

### Inspecting Container Resources

```bash
# Check container stats
docker stats edr-flink-jobmanager edr-clickhouse edr-redpanda

# Check disk space
docker exec edr-clickhouse df -h
```

### Flink Job Savepoints and Checkpoints

```bash
# List savepoints
docker exec edr-flink-jobmanager ls -la /opt/flink/savepoints

# List checkpoints
docker exec edr-flink-jobmanager ls -la /opt/flink/checkpoints
```

If you encounter issues not covered in this guide, check the official documentation for the individual components or reach out to the development team for assistance.
