#!/bin/bash
# start.sh - Start the EDR/XDR development environment

echo "Starting EDR/XDR development environment..."
docker-compose up -d

echo "Waiting for services to initialize..."
sleep 10

echo "Environment is ready!"
echo ""
echo "Available services:"
echo "  Redpanda Console: http://localhost:8080"
echo "  Redpanda Admin:   http://localhost:8083"
echo "  Flink Dashboard:  http://localhost:8081"
echo "  ClickHouse UI:    http://localhost:8123/play"
echo "  API Service:      http://localhost:3000"
echo "  XDR Web UI:       http://localhost:3001"
echo "  Grafana:          http://localhost:3002 (admin/admin)"
echo ""
echo "Use './run-generator.sh' to generate test data inside the Docker network"
echo "Use './build-flink-job.sh' to build and deploy the Flink job"
echo "Use './stop.sh' to stop the environment"
