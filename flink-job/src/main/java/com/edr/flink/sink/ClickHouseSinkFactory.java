package com.edr.flink.sink;

import com.edr.flink.model.Detection;
import com.edr.flink.model.Event;
import org.apache.flink.connector.jdbc.JdbcConnectionOptions;
import org.apache.flink.connector.jdbc.JdbcExecutionOptions;
import org.apache.flink.connector.jdbc.JdbcSink;
import org.apache.flink.streaming.api.functions.sink.SinkFunction;

public class ClickHouseSinkFactory {
    private static final String CLICKHOUSE_URL = "jdbc:clickhouse://clickhouse:8123/edr";
    private static final String CLICKHOUSE_DRIVER = "com.clickhouse.jdbc.ClickHouseDriver";
    private static final String CLICKHOUSE_USERNAME = "default";
    private static final String CLICKHOUSE_PASSWORD = "edrpassword";
    
    /**
     * Create a ClickHouse sink for events
     */
    public static SinkFunction<Event> createEventSink() {
        return JdbcSink.sink(
                "INSERT INTO edr.events (id, timestamp, endpoint_id, event_type, status, direction, bytes, source_ip, destination_ip, process_name, user) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (statement, event) -> {
                    statement.setString(1, event.getId());
                    statement.setLong(2, event.getTimestamp());
                    statement.setString(3, event.getEndpointId());
                    statement.setString(4, event.getEventType());
                    statement.setString(5, event.getStatus());
                    statement.setString(6, event.getDirection());
                    statement.setLong(7, event.getBytes());
                    statement.setString(8, event.getSourceIp());
                    statement.setString(9, event.getDestinationIp());
                    statement.setString(10, event.getProcessName());
                    statement.setString(11, event.getUser());
                },
                createJdbcExecutionOptions(1000, 200),
                createJdbcConnectionOptions()
        );
    }
    
    /**
     * Create a ClickHouse sink for detections
     */
    public static SinkFunction<Detection> createDetectionSink() {
        return JdbcSink.sink(
                "INSERT INTO edr.detections (id, timestamp, rule_id, severity, endpoint_id, description, event_ids) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (statement, detection) -> {
                    statement.setString(1, detection.getId());
                    statement.setLong(2, detection.getTimestamp());
                    statement.setString(3, detection.getRuleId());
                    statement.setInt(4, detection.getSeverity());
                    statement.setString(5, detection.getEndpointId());
                    statement.setString(6, detection.getDescription());
                    statement.setString(7, detection.getEventIds());
                },
                createJdbcExecutionOptions(100, 200),
                createJdbcConnectionOptions()
        );
    }
    
    private static JdbcExecutionOptions createJdbcExecutionOptions(int batchSize, int batchIntervalMs) {
        return JdbcExecutionOptions.builder()
                .withBatchSize(batchSize)
                .withBatchIntervalMs(batchIntervalMs)
                .withMaxRetries(5)
                .build();
    }
    
    private static JdbcConnectionOptions createJdbcConnectionOptions() {
        return new JdbcConnectionOptions.JdbcConnectionOptionsBuilder()
                .withUrl(CLICKHOUSE_URL)
                .withDriverName(CLICKHOUSE_DRIVER)
                .withUsername(CLICKHOUSE_USERNAME)
                .withPassword(CLICKHOUSE_PASSWORD)
                .build();
    }
} 