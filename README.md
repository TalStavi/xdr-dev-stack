# EDR/XDR Development Stack

A comprehensive development environment for XDR/EDR systems, providing a complete stack for event processing, detection, and analysis.

## Prerequisites

- Docker and Docker Compose
- Java 11+ (for building Flink jobs)
- Maven (for building Flink jobs)
- Python 3.9+ (for test data generation)

## Getting Started

1. Start the environment:

   ```bash
   ./start.sh
   ```

2. Build and deploy the Flink job:

   ```bash
   ./build-flink-job.sh
   ```

3. Generate test data:

   ```bash
   ./run-generator.sh
   ```

## Available Services

- **Redpanda Console**: http://localhost:8080
- **Redpanda Admin**: http://localhost:8083
- **Flink Dashboard**: http://localhost:8081
- **ClickHouse UI**: http://localhost:8123/play
- **API Service**: http://localhost:3000
- **XDR Web UI**: http://localhost:3001
- **Grafana**: http://localhost:3002 (admin/admin)

## Project Structure

- **api/**: API service for querying data and managing detections
- **webui/**: Web UI for visualization and interaction
- **config/**: Configuration files for services (ClickHouse, Grafana, etc.)
- **flink-job/**: Apache Flink streaming job for event processing and detection
- **generator/**: Data generator for simulating endpoint events
- **scripts/**: Utility scripts for the environment
- **volumes/**: Data persistence volumes (created automatically)

## Main Components

- **Redpanda**: Fast Kafka-compatible event broker
- **ClickHouse**: High-performance columnar database for event storage
- **Apache Flink**: Stream processing for real-time detections
- **Redis**: In-memory cache for API performance
- **Node.js API**: Backend service for queries and management
- **Web UI**: Frontend dashboard for visualization
- **Grafana**: Development metrics and monitoring

## Utility Scripts

- **start.sh**: Start the development environment
- **stop.sh**: Stop the development environment
- **build-flink-job.sh**: Build and deploy the Flink processing job
- **run-generator.sh**: Generate test data for development
- **clear-data.sh**: Clear all data while preserving the environment
- **clean.sh**: Stop and completely clean the environment (removes volumes)

## Development Workflow

1. Start the environment with `./start.sh`
2. Modify the Flink job code in `flink-job/src/main/java/`
3. Rebuild and deploy the job with `./build-flink-job.sh`
4. Generate test data with `./run-generator.sh`
5. View processed events and detections in the Web UI or ClickHouse
6. For API development, the API code is mounted as a volume for hot-reloading
7. The Web UI code is also mounted as a volume for frontend development

## Data Management

- Reset data without rebuilding: `./clear-data.sh`
- Completely clean environment: `./clean.sh`

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.
