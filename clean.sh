#!/bin/bash
# clean.sh - Clean the EDR/XDR development environment data

echo "Stopping environment..."
docker-compose down

echo "Removing volumes..."
docker volume rm edr-dev_redpanda_data edr-dev_clickhouse_data edr-dev_redis_data 2>/dev/null || echo "No volumes to remove"

echo "Environment cleaned."
