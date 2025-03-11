# XDR Development Stack Troubleshooting Guide

This guide provides solutions for common issues you might encounter with the XDR Development Stack.

## Quick Fixes

| Issue | Quick Fix |
|-------|-----------|
| Services not starting | `./stop.sh && ./start.sh` |
| Data issues | `./clear-data.sh` |
| Complete reset | `./clean.sh && ./start.sh` |
| Flink job issues | `./build-flink-job.sh --force-rebuild` |

## Common Issues and Solutions

### 1. Docker Environment Issues

#### Port Conflicts

**Symptom**: Error when starting containers about ports being already allocated.

**Solution**:
- Check for port conflicts: `sudo lsof -i :PORT_NUMBER`
- Edit docker-compose.yml to use different ports
- Example fix for Redpanda/Flink conflict:
  ```yaml
  redpanda:
    ports:
      - "9092:9092"  # Kafka API
      - "8083:8081"  # Changed from 8081 to 8083
      - "8082:8082"  # HTTP Proxy
  ```

#### Container Not Starting

**Symptom**: One or more containers fail to start.

**Solution**:
1. Check container logs:
   ```bash
   docker logs edr-redpanda
   docker logs edr-clickhouse
   docker logs edr-flink-jobmanager
   ```

2. Verify disk space:
   ```bash
   df -h
   ```

3. Restart Docker service:
   ```bash
   sudo systemctl restart docker
   ```

### 2. Data Pipeline Issues

#### Kafka/Redpanda Connection Issues

**Symptom**: Data generator can't connect to Redpanda/Kafka or no events flowing.

**Solution**:
1. Create topics manually:
   ```bash
   docker exec edr-redpanda rpk topic create raw-events --partitions 4 --replicas 1
   docker exec edr-redpanda rpk topic create processed-events --partitions 4 --replicas 1
   docker exec edr-redpanda rpk topic create detections --partitions 4 --replicas 1
   ```

2. Verify Redpanda is running:
   ```bash
   docker ps | grep redpanda
   ```

3. Check topics:
   ```bash
   docker exec edr-redpanda rpk topic list
   ```

4. Try using the run-generator.sh script:
   ```bash
   ./run-generator.sh
   ```

5. Check consumer group status:
   ```bash
   docker exec edr-redpanda rpk group describe edr-flink-processor
   ```

#### No Detections Being Generated

**Symptom**: Events are flowing but no detections in ClickHouse.

**Solution**:
1. Check Flink job status in UI: http://localhost:8081
2. Verify event processing:
   ```bash
   docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query="SELECT count() FROM edr.events"
   ```
3. Restart Flink job with fresh state:
   ```bash
   ./clear-data.sh
   ```
4. Generate test data with suspicious patterns:
   ```bash
   ./run-generator.sh --suspicious
   ```

### 3. Flink Job Issues

#### Deployment Failures

**Symptom**: Errors when deploying Flink job.

**Solution**:
1. Check Flink JobManager UI: http://localhost:8081
2. Manually verify job JAR:
   ```bash
   docker exec edr-flink-jobmanager ls -la /opt/flink/usrlib/
   ```
3. Rebuild with proper dependencies:
   ```bash
   ./build-flink-job.sh --force-rebuild --verbose
   ```
4. Check for Java compatibility issues:
   ```bash
   docker exec edr-flink-jobmanager java -version
   ```

#### Job Fails After Deployment

**Symptom**: Job starts but fails shortly after.

**Solution**:
1. Check Flink exceptions in the UI: http://localhost:8081/#/job/running
2. Look for errors in JobManager logs:
   ```bash
   docker logs edr-flink-jobmanager | grep ERROR
   ```
3. Ensure connections to other services:
   ```bash
   docker exec edr-flink-jobmanager ping redpanda
   docker exec edr-flink-jobmanager ping clickhouse
   ```

### 4. Database Issues

#### ClickHouse Connection Issues

**Symptom**: Cannot connect to ClickHouse or table creation errors.

**Solution**:
1. Check ClickHouse is running:
   ```bash
   docker ps | grep clickhouse
   ```
2. Verify ClickHouse initialization:
   ```bash
   docker logs edr-clickhouse
   ```
3. Connect via CLI and check tables:
   ```bash
   docker exec -it edr-clickhouse clickhouse-client --user default --password edrpassword
   SHOW TABLES FROM edr;
   ```
4. Recreate tables if needed:
   ```bash
   docker exec -it edr-clickhouse clickhouse-client --user default --password edrpassword --query="DROP TABLE IF EXISTS edr.events; CREATE TABLE edr.events (...)"
   ```

#### Redis Issues

**Symptom**: API response slow or "cannot connect to Redis" errors.

**Solution**:
1. Check Redis status:
   ```bash
   docker ps | grep redis
   ```
2. Clear Redis cache:
   ```bash
   docker exec edr-redis redis-cli FLUSHALL
   ```
3. Restart Redis:
   ```bash
   docker restart edr-redis
   ```

### 5. API and Web UI Issues

#### API Not Responding

**Symptom**: API endpoints returning errors or not responding.

**Solution**:
1. Check API logs:
   ```bash
   docker logs edr-api
   ```
2. Verify API container health:
   ```bash
   docker inspect edr-api | grep Status
   ```
3. Restart API:
   ```bash
   docker restart edr-api
   ```
4. Re-deploy API from clean state if needed:
   ```bash
   docker-compose up -d --force-recreate api
   ```

#### Web UI Issues

**Symptom**: Web UI not loading or showing errors.

**Solution**:
1. Check Web UI logs:
   ```bash
   docker logs edr-webui
   ```
2. Clear browser cache and cookies
3. Verify web UI can reach the API:
   ```bash
   docker exec edr-webui wget -q --spider http://api:3000/health
   ```
4. Rebuild and restart:
   ```bash
   docker-compose up -d --force-recreate --build webui
   ```

### 6. Complete Environment Reset

If you need to start fresh with all data and state removed:

```bash
# Stop everything
./stop.sh

# Clean all data (remove volumes)
./clean.sh

# Rebuild Flink job
cd flink-job
mvn clean package
cd ..

# Start fresh
./start.sh
./build-flink-job.sh --force-rebuild
./run-generator.sh
```

## Debugging Tips

### Checking Component Connectivity

```bash
# From Flink to Redpanda
docker exec edr-flink-jobmanager ping -c 2 redpanda

# From Flink to ClickHouse
docker exec edr-flink-jobmanager ping -c 2 clickhouse

# From API to ClickHouse
docker exec edr-api ping -c 2 clickhouse

# From API to Redis
docker exec edr-api ping -c 2 redis

# From Web UI to API
docker exec edr-webui ping -c 2 api
```

### Viewing Service Logs

```bash
# Redpanda logs
docker logs edr-redpanda

# ClickHouse logs
docker logs edr-clickhouse

# Flink JobManager logs
docker logs edr-flink-jobmanager

# Flink TaskManager logs
docker logs edr-flink-taskmanager

# API service logs
docker logs edr-api

# Web UI logs
docker logs edr-webui
```

### Checking Event Pipeline State

```bash
# Check events in Redpanda raw-events topic
docker exec edr-redpanda rpk topic consume raw-events -n 5

# Check events in ClickHouse
docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query="SELECT COUNT() FROM edr.events"

# Check detections in ClickHouse
docker exec edr-clickhouse clickhouse-client --user default --password edrpassword --query="SELECT COUNT(), rule_id FROM edr.detections GROUP BY rule_id"
```

## Advanced Troubleshooting

### Manual Deployment of Flink Job

If the automated deployment script is failing, try manual deployment:

```bash
# Copy JAR to JobManager
docker cp flink-job/target/edr-flink-1.0-SNAPSHOT.jar edr-flink-jobmanager:/opt/flink/usrlib/

# Deploy job manually
docker exec -it edr-flink-jobmanager flink run -d /opt/flink/usrlib/edr-flink-1.0-SNAPSHOT.jar
```

### Examining Container Network

```bash
# Get container network information
docker network inspect edr-network

# Check for network issues
docker exec edr-flink-jobmanager ping -c 2 redpanda
docker exec edr-api curl -s http://clickhouse:8123/ping
```

### Examining Resource Usage

```bash
# Check resource usage of containers
docker stats edr-redpanda edr-clickhouse edr-flink-jobmanager edr-flink-taskmanager edr-api edr-webui

# Check disk usage
docker system df
```
