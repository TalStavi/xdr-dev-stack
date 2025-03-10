#!/bin/bash
set -e

clickhouse client -h localhost -u default --password edrpassword -n <<-EOSQL
    CREATE DATABASE IF NOT EXISTS edr;

    -- Events table
    CREATE TABLE IF NOT EXISTS edr.events (
        id String,
        timestamp DateTime64(3),
        endpoint_id String,
        event_type String,
        status String,
        direction String,
        bytes UInt64,
        source_ip String,
        destination_ip String,
        process_name String,
        user String,
        date Date DEFAULT toDate(timestamp)
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (endpoint_id, timestamp)
    TTL date + INTERVAL 30 DAY
    SETTINGS index_granularity = 8192;

    -- Detections table
    CREATE TABLE IF NOT EXISTS edr.detections (
        id String,
        timestamp DateTime64(3),
        rule_id String,
        severity UInt8,
        endpoint_id String,
        description String,
        event_ids String,
        date Date DEFAULT toDate(timestamp)
    ) ENGINE = ReplacingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (severity, rule_id, timestamp)
    TTL date + INTERVAL 90 DAY
    SETTINGS index_granularity = 8192;

    -- Endpoint lookup table
    CREATE TABLE IF NOT EXISTS edr.endpoints (
        endpoint_id String,
        hostname String,
        ip String,
        os String,
        last_seen DateTime64(3)
    ) ENGINE = ReplacingMergeTree()
    ORDER BY endpoint_id
    SETTINGS index_granularity = 8192;
    
    -- Fast query materialized views
    CREATE MATERIALIZED VIEW IF NOT EXISTS edr.detection_summary_mv
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, severity, rule_id)
    POPULATE AS
    SELECT 
        toDate(timestamp) AS date,
        rule_id,
        severity,
        count() AS detection_count,
        uniqExact(endpoint_id) AS affected_endpoints
    FROM edr.detections
    GROUP BY date, rule_id, severity;
    
    -- Fast access for endpoint detections
    CREATE MATERIALIZED VIEW IF NOT EXISTS edr.endpoint_detections_mv
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (endpoint_id, date)
    POPULATE AS
    SELECT 
        endpoint_id,
        toDate(timestamp) AS date,
        uniqExact(rule_id) AS unique_rules,
        count() AS detection_count,
        max(severity) AS max_severity
    FROM edr.detections
    GROUP BY endpoint_id, date;
EOSQL

echo "ClickHouse schema initialization complete."
