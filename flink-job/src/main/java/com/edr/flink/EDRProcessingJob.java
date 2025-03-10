package com.edr.flink;

import com.edr.flink.detection.DetectionRuleRegistry;
import com.edr.flink.functions.EventNormalizer;
import com.edr.flink.functions.EventParser;
import com.edr.flink.kafka.KafkaFactory;
import com.edr.flink.model.Detection;
import com.edr.flink.model.Event;
import com.edr.flink.sink.ClickHouseSinkFactory;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

import java.time.Duration;

/**
 * Main class for the EDR Processing Flink Job
 */
public class EDRProcessingJob {

    private static final ObjectMapper jsonParser = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        // Set up execution environment
        final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(10000); // Checkpoint every 10 seconds
        env.setParallelism(2);

        // Create the detection rule registry with all configured rules
        DetectionRuleRegistry ruleRegistry = DetectionRuleRegistry.createDefault();

        // Process the event pipeline
        DataStream<Detection> detections = processEventPipeline(env, ruleRegistry);
        
        // Store and publish the detections
        storeAndPublishDetections(detections);

        // Execute the Flink job
        env.execute("EDR Processing and Detection");
    }

    /**
     * Process the event pipeline from raw events to detections
     */
    private static DataStream<Detection> processEventPipeline(
            StreamExecutionEnvironment env, 
            DetectionRuleRegistry ruleRegistry) {
        
        // Read and parse events from Kafka
        DataStream<Event> rawEvents = env
                .fromSource(
                    KafkaFactory.createRawEventSource(), 
                    WatermarkStrategy.forBoundedOutOfOrderness(Duration.ofSeconds(5)), 
                    "Raw Events Source"
                )
                .map(new EventParser())
                .assignTimestampsAndWatermarks(
                        WatermarkStrategy.<Event>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                                .withTimestampAssigner((event, timestamp) -> event.getTimestamp())
                );

        // Apply normalization to all events
        DataStream<Event> normalizedEvents = rawEvents.map(new EventNormalizer());

        // Store all normalized events in ClickHouse
        normalizedEvents.addSink(ClickHouseSinkFactory.createEventSink());

        // Apply all detection rules to the normalized events
        return ruleRegistry.applyRules(normalizedEvents);
    }

    /**
     * Store detections in ClickHouse and publish to Kafka
     */
    private static void storeAndPublishDetections(DataStream<Detection> detections) {
        // Store detections in ClickHouse
        detections.addSink(ClickHouseSinkFactory.createDetectionSink());

        // Also publish detections to Kafka for real-time alerting
        detections
                .map(detection -> jsonParser.writeValueAsString(detection))
                .sinkTo(KafkaFactory.createDetectionSink());
    }
}
