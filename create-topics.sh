#!/bin/bash
# create-topics.sh - Create required Kafka topics

echo "Creating Kafka topics..."
docker exec edr-redpanda rpk topic create raw-events --partitions 6 --replicas 1
docker exec edr-redpanda rpk topic create detections --partitions 6 --replicas 1

echo "Topics created successfully."
echo "You can now run the data generator: ./scripts/generate-data.py"
