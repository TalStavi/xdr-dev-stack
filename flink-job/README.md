# EDR Processing Flink Job

This project is a Flink job that processes endpoint detection and response (EDR) events and identifies suspicious patterns using Flink's Complex Event Processing (CEP) capabilities.

## Project Structure

The project has been organized into the following packages:

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

## Adding New Detection Rules

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

## Running the Job

Build the project with Maven:

```
mvn clean package
```

Submit the job to a Flink cluster:

```
flink run -c com.edr.flink.EDRProcessingJob target/flink-job-1.0.0.jar
``` 