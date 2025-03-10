#!/bin/bash
# run-generator.sh - Run data generator from inside Docker network

# Create the required topics first
echo "Creating Kafka topics..."
docker exec edr-redpanda rpk topic create raw-events --partitions 6 --replicas 1 || true
docker exec edr-redpanda rpk topic create detections --partitions 6 --replicas 1 || true

# Run the generator from inside the container
echo "Running data generator inside Docker network..."
docker exec edr-data-generator python /app/scripts/generate-data.py --kafka redpanda:9092 "$@"

echo "Done!"
