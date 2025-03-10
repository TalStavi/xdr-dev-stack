# EDR/XDR Development Environment

This is a lightweight development environment for the EDR/XDR system, designed to run on a developer's laptop.

## Prerequisites

- Docker and Docker Compose
- Java 11+ (for building Flink jobs)
- Maven (for building Flink jobs)
- Python 3.6+ (for test data generation)
  - Required packages are installed by setup.sh in a virtual environment

## Getting Started

1. Run the setup script to create the environment:

   ```
   ./setup.sh
   ```

2. Start the environment:

   ```
   ./start.sh
   ```

3. Build and deploy the Flink job:

   ```
   ./build-flink-job.sh
   ```

4. Generate test data:

   ```
   ./run-generator.sh
   ```

## Available Services

- **Redpanda Console**: http://localhost:8080
- **Redpanda Admin**: http://localhost:8083
- **Flink Dashboard**: http://localhost:8081
- **ClickHouse UI**: http://localhost:8123/play
- **API Service**: http://localhost:3000
- **Grafana**: http://localhost:3001 (admin/admin)

## Project Structure

- **api/**: API service code
- **config/**: Configuration files for services
- **flink-job/**: Flink job code
- **scripts/**: Utility scripts
- **volumes/**: Data volumes for persistence
- **generator/**: Data generator container

## Development Workflow

1. Modify the Flink job code in `flink-job/src/main/java/com/edr/flink/EDRProcessingJob.java`
2. Rebuild and redeploy the job with `./build-flink-job.sh`
3. Generate new test data with `./run-generator.sh`
4. Check results in the Flink UI, ClickHouse, or through the API

## Stopping and Cleaning

- Stop the environment: `./stop.sh`
- Clean all data: `./clean.sh`

## Troubleshooting

If you encounter any issues:

1. Check if all containers are running: `docker ps | grep edr`
2. View container logs: `docker logs edr-redpanda`
3. Make sure topics are created: `docker exec edr-redpanda rpk topic list`
4. Generate data directly: `./run-generator.sh --file` to save to a file instead
