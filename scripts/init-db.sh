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

    -- NEW MATERIALIZED VIEWS FOR OPTIMIZED LOOKUPS

    -- Endpoint events summary for faster endpoint event lookups
    CREATE MATERIALIZED VIEW IF NOT EXISTS edr.endpoint_events_mv
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (endpoint_id, date, event_type)
    POPULATE AS
    SELECT 
        endpoint_id,
        toDate(timestamp) AS date,
        event_type,
        count() AS event_count,
        min(timestamp) AS first_seen,
        max(timestamp) AS last_seen,
        uniqExact(user) AS unique_users
    FROM edr.events
    GROUP BY endpoint_id, date, event_type;

    -- User events summary for faster user event lookups
    CREATE MATERIALIZED VIEW IF NOT EXISTS edr.user_events_mv
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (user, date, event_type)
    POPULATE AS
    SELECT 
        user,
        toDate(timestamp) AS date,
        event_type,
        count() AS event_count,
        min(timestamp) AS first_seen,
        max(timestamp) AS last_seen,
        uniqExact(endpoint_id) AS unique_endpoints
    FROM edr.events
    WHERE user != ''
    GROUP BY user, date, event_type;

    -- User detection summary (indirectly through events associated with detections)
    CREATE MATERIALIZED VIEW IF NOT EXISTS edr.user_detections_mv
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (user, date, severity)
    POPULATE AS
    SELECT 
        e.user,
        toDate(d.timestamp) AS date,
        d.severity,
        d.rule_id,
        count() AS detection_count
    FROM edr.detections d
    JOIN (
        SELECT DISTINCT user, endpoint_id
        FROM edr.events
        WHERE user != ''
    ) e ON d.endpoint_id = e.endpoint_id
    GROUP BY e.user, date, d.severity, d.rule_id;

    -- Endpoint detail view to replace endpoint lookup logic in the API
    CREATE MATERIALIZED VIEW IF NOT EXISTS edr.endpoint_details_mv
    ENGINE = ReplacingMergeTree()
    ORDER BY endpoint_id
    POPULATE AS
    SELECT 
        endpoint_id,
        any(user) AS primary_user,
        max(timestamp) AS last_seen,
        count() AS total_events,
        uniqExact(event_type) AS unique_event_types,
        uniqExact(user) AS unique_users,
        groupArray(10)(DISTINCT event_type) AS recent_event_types
    FROM edr.events
    GROUP BY endpoint_id;

    -- User detail view to replace user lookup logic in the API
    CREATE MATERIALIZED VIEW IF NOT EXISTS edr.user_details_mv
    ENGINE = ReplacingMergeTree()
    ORDER BY user
    POPULATE AS
    SELECT 
        user,
        max(timestamp) AS last_seen,
        count() AS total_events,
        uniqExact(event_type) AS unique_event_types,
        uniqExact(endpoint_id) AS unique_endpoints,
        groupArray(10)(DISTINCT endpoint_id) AS recent_endpoints
    FROM edr.events
    WHERE user != ''
    GROUP BY user;
EOSQL

echo "ClickHouse schema initialization complete."
