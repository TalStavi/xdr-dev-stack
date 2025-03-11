# XDR Development Stack

This project provides a complete development environment for an Extended Detection and Response (XDR) system, including data processing, storage, analysis, and visualization components.

## Architecture Overview

The XDR development stack consists of the following components:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│             │    │             │    │             │    │             │
│    Data     │───►│   Redpanda  │───►│    Flink    │───►│ ClickHouse  │
│  Generator  │    │  (Kafka)    │    │    Job      │    │  Database   │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
                                                               ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│             │    │             │    │             │    │             │
│   Web UI    │◄───│     API     │◄───│    Redis    │◄───│   Grafana   │
│  Dashboard  │    │   Service   │    │    Cache    │    │  Dashboard  │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Components

1. **Message Broker (Redpanda)**: Kafka-compatible message broker for event streaming
2. **Stream Processing (Flink)**: Apache Flink job for real-time EDR event processing and detection
3. **Database (ClickHouse)**: Column-oriented database for storing events and detections
4. **API Service**: Backend API for querying and managing EDR/XDR data
5. **Web UI**: Frontend dashboard for visualizing and interacting with detections
6. **Development Dashboard (Grafana)**: Monitoring and analytics dashboards
7. **Data Generator**: Utility for generating test data
8. **Redis**: Cache for API responses

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Maven (for building the Flink job)
- Git

### Setup and Launch

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/xdr-dev-stack.git
   cd xdr-dev-stack
   ```

2. Start the environment:
   ```bash
   ./start.sh
   ```

3. Build and deploy the Flink job:
   ```bash
   ./build-flink-job.sh
   ```

4. Generate test data:
   ```bash
   ./run-generator.sh
   ```

### Available Services

After startup, the following services are available:

- Redpanda Console: http://localhost:8080
- Redpanda Admin: http://localhost:8083
- Flink Dashboard: http://localhost:8081
- ClickHouse UI: http://localhost:8123/play
- API Service: http://localhost:3000
- XDR Web UI: http://localhost:3001
- Grafana: http://localhost:3002 (admin/admin)

## Usage Guide

### Managing the Environment

- Start the environment: `./start.sh`
- Stop the environment: `./stop.sh`
- Reset data: `./clear-data.sh`
- Full cleanup: `./clean.sh`

### Flink Job Development

The Flink job processes EDR events and identifies suspicious patterns using Flink's Complex Event Processing (CEP) capabilities.

#### Project Structure

```
com.edr.flink
├── EDRProcessingJob.java           # Main entry point
├── detection/                      # Detection rules and utilities
│   ├── DetectionRule.java          # Interface for all detection rules
│   ├── DetectionRuleRegistry.java  # Registry for managing and applying rules
│   ├── DetectionUtils.java         # Utilities for working with detections
│   └── rules/                      # Implementation of specific rules
│       ├── FileWriteExecuteRule.java
│       ├── MultipleFailedLoginsRule.java
│       └── SuspiciousProcessNetworkRule.java
├── functions/                      # Flink function implementations
│   ├── EventNormalizer.java        # Normalizes events
│   └── EventParser.java            # Parses JSON events
├── kafka/                          # Kafka-related utilities
│   └── KafkaFactory.java           # Factory for Kafka sources and sinks
├── model/                          # Data models
│   ├── Detection.java              # Detection model
│   └── Event.java                  # Event model
└── sink/                           # Database sinks
    └── ClickHouseSinkFactory.java  # Factory for ClickHouse database sinks
```

#### Building and Deploying

The Flink job can be built and deployed using the provided script:

```bash
./build-flink-job.sh [options]
```

Options:
- `--force-rebuild`: Force rebuild even if no changes detected
- `--skip-deploy`: Build only, don't deploy to Flink
- `--verbose`: Show more detailed output

#### Adding New Detection Rules

To add a new detection rule:

1. Create a new class in the `com.edr.flink.detection.rules` package that implements the `DetectionRule` interface
2. Implement the required methods:
   - `getRuleId()`: Return a unique ID for the rule
   - `getSeverity()`: Return the severity level (1-5)
   - `getDescription()`: Return a description of the rule
   - `definePattern()`: Define the CEP pattern for detection
   - `getPatternSelectFunction()`: Define how to create a Detection from matched events
3. Register the rule in `DetectionRuleRegistry.createDefault()` method

Example of a new rule:

```java
public class NewDetectionRule implements DetectionRule {
    private static final String RULE_ID = "RULE-004";
    private static final int SEVERITY = 4;
    private static final String DESCRIPTION = "Description of new detection";

    @Override
    public String getRuleId() {
        return RULE_ID;
    }

    @Override
    public int getSeverity() {
        return SEVERITY;
    }

    @Override
    public String getDescription() {
        return DESCRIPTION;
    }

    @Override
    public Pattern<Event, ?> definePattern() {
        // Define your pattern here
        return Pattern.<Event>begin("first")
                .where(/* your condition */)
                .next("second")
                .where(/* your condition */);
    }

    @Override
    public PatternSelectFunction<Event, Detection> getPatternSelectFunction() {
        return patternMap -> {
            // Extract events from pattern map
            Event event1 = patternMap.get("first").get(0);
            
            // Create and return a detection
            return DetectionUtils.createDetection(
                RULE_ID, 
                SEVERITY, 
                event1.getEndpointId(),
                "Detection details: " + event1.getProcessName(),
                List.of(event1)
            );
        };
    }
}
```

Then add it to the registry:

```java
public static DetectionRuleRegistry createDefault() {
    return builder()
            .addRule(new MultipleFailedLoginsRule())
            .addRule(new SuspiciousProcessNetworkRule())
            .addRule(new FileWriteExecuteRule())
            .addRule(new NewDetectionRule())  // Add your new rule here
            .build();
}
```

### Working with Test Data

Use the data generator to create test events:

```bash
./run-generator.sh [options]
```

## Troubleshooting

For common issues and solutions, see the [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) file. 