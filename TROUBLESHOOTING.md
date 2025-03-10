# EDR/XDR Development Environment Troubleshooting Guide

## Common Issues and Solutions

### 1. Port Conflicts

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

### 2. Kafka Connection Issues

**Symptom**: Data generator can't connect to Redpanda/Kafka.

**Solution**:
1. Create topics manually:
   ```bash
   chmod +x create-topics.sh
   ./create-topics.sh
   ```

2. Verify Redpanda is running:
   ```bash
   docker ps | grep redpanda
   ```

3. Check topics:
   ```bash
   docker exec edr-redpanda rpk topic list
   ```

4. Try using the run-generator.sh script instead:
   ```bash
   ./run-generator.sh
   ```

5. Try file mode as fallback:
   ```bash
   ./run-generator.sh --file
   ```

### 3. Missing Dependencies

**Symptom**: Python scripts fail with import errors.

**Solution**:
```bash
source ./venv/bin/activate  # Or ./activate_venv.sh if it exists
pip install kafka-python clickhouse-driver redis
```

### 4. Flink Job Deployment Issues

**Symptom**: Errors when deploying Flink job.

**Solution**:
1. Check Flink JobManager UI: http://localhost:8081
2. Manually verify job JAR:
   ```bash
   docker exec edr-flink-jobmanager ls -la /opt/flink/usrlib/
   ```
3. Rebuild with proper dependencies:
   ```bash
   cd flink-job
   mvn clean package
   ```

### 5. ClickHouse Connection Issues

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
3. Connect via CLI:
   ```bash
   docker exec -it edr-clickhouse clickhouse-client
   ```

### 6. Complete Reset

If you need to start fresh:

```bash
# Stop everything
./stop.sh

# Remove volumes
docker volume rm edr-dev_redpanda_data edr-dev_clickhouse_data edr-dev_redis_data

# Reset setup progress tracking
rm -f .setup_progress

# Start from scratch
./setup.sh
./start.sh
./create-topics.sh
./build-flink-job.sh
```

## Debugging Tips

### Check Container Logs

```bash
docker logs edr-redpanda
docker logs edr-clickhouse
docker logs edr-flink-jobmanager
docker logs edr-api
```

### Interactive Shell Access

```bash
docker exec -it edr-redpanda bash
docker exec -it edr-clickhouse bash
docker exec -it edr-flink-jobmanager bash
```

### Verify Network Connectivity

```bash
# Check if containers can reach each other
docker exec edr-flink-jobmanager ping redpanda
docker exec edr-api ping clickhouse
```
