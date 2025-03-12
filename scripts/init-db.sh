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
    
    -- Dashboard stats refreshable materialized view
    -- This automatically refreshes every minute to provide real-time dashboard metrics
    DROP VIEW IF EXISTS edr.dashboard_stats_refresher;
    DROP VIEW IF EXISTS edr.dashboard_stats_mv;
    
    CREATE MATERIALIZED VIEW IF NOT EXISTS edr.dashboard_stats_mv
    REFRESH EVERY 5 SECOND
    ENGINE = ReplacingMergeTree()
    ORDER BY (snapshot_date, snapshot_hour, snapshot_minute)
    POPULATE AS
    WITH 
        toDate(now()) as current_date,
        toHour(now()) as current_hour,
        toMinute(now()) as current_minute,
        
        -- Severity distribution subquery
        severity_levels_array AS (
            SELECT groupArray(severity) as levels
            FROM (
                SELECT 
                    severity
                FROM edr.user_detections_mv
                WHERE date >= current_date - 1
                GROUP BY severity
                ORDER BY severity
            )
        ),
        
        severity_counts_array AS (
            SELECT groupArray(total) as counts
            FROM (
                SELECT 
                    severity,
                    sum(detection_count) as total
                FROM edr.user_detections_mv
                WHERE date >= current_date - 1
                GROUP BY severity
                ORDER BY severity
            )
        ),
        
        -- Event type distribution subquery
        event_types_array AS (
            SELECT groupArray(event_type) as types
            FROM (
                SELECT 
                    event_type
                FROM edr.endpoint_events_mv
                WHERE date >= current_date - 1
                GROUP BY event_type
                ORDER BY sum(event_count) DESC
                LIMIT 10
            )
        ),
        
        event_counts_array AS (
            SELECT groupArray(total) as counts
            FROM (
                SELECT 
                    event_type,
                    sum(event_count) as total
                FROM edr.endpoint_events_mv
                WHERE date >= current_date - 1
                GROUP BY event_type
                ORDER BY total DESC
                LIMIT 10
            )
        ),
        
        -- Active endpoints arrays
        active_endpoint_ids_array AS (
            SELECT groupArray(endpoint_id) as ids
            FROM (
                SELECT endpoint_id
                FROM edr.endpoint_details_mv
                WHERE last_seen >= now() - INTERVAL 24 HOUR
                ORDER BY total_events DESC
                LIMIT 50
            )
        ),
        
        active_endpoint_users_array AS (
            SELECT groupArray(primary_user) as users
            FROM (
                SELECT endpoint_id, primary_user
                FROM edr.endpoint_details_mv
                WHERE last_seen >= now() - INTERVAL 24 HOUR
                ORDER BY total_events DESC
                LIMIT 50
            )
        ),
        
        active_endpoint_counts_array AS (
            SELECT groupArray(total_events) as counts
            FROM (
                SELECT endpoint_id, total_events
                FROM edr.endpoint_details_mv
                WHERE last_seen >= now() - INTERVAL 24 HOUR
                ORDER BY total_events DESC
                LIMIT 50
            )
        ),
        
        -- Active users arrays
        active_user_names_array AS (
            SELECT groupArray(user) as names
            FROM (
                SELECT user
                FROM edr.user_details_mv
                WHERE last_seen >= now() - INTERVAL 24 HOUR
                ORDER BY total_events DESC
                LIMIT 50
            )
        ),
        
        active_user_counts_array AS (
            SELECT groupArray(total_events) as counts
            FROM (
                SELECT user, total_events
                FROM edr.user_details_mv
                WHERE last_seen >= now() - INTERVAL 24 HOUR
                ORDER BY total_events DESC
                LIMIT 50
            )
        ),
        
        active_user_endpoints_array AS (
            SELECT groupArray(unique_endpoints) as endpoints
            FROM (
                SELECT user, unique_endpoints
                FROM edr.user_details_mv
                WHERE last_seen >= now() - INTERVAL 24 HOUR
                ORDER BY total_events DESC
                LIMIT 50
            )
        ),
        
        -- Recent events arrays
        recent_event_ids_array AS (
            SELECT groupArray(id) as ids
            FROM (
                SELECT id
                FROM edr.events
                ORDER BY timestamp DESC
                LIMIT 20
            )
        ),
        
        recent_event_timestamps_array AS (
            SELECT groupArray(timestamp) as timestamps
            FROM (
                SELECT id, timestamp
                FROM edr.events
                ORDER BY timestamp DESC
                LIMIT 20
            )
        ),
        
        recent_event_endpoints_array AS (
            SELECT groupArray(endpoint_id) as endpoints
            FROM (
                SELECT id, endpoint_id
                FROM edr.events
                ORDER BY timestamp DESC
                LIMIT 20
            )
        ),
        
        recent_event_types_array AS (
            SELECT groupArray(event_type) as types
            FROM (
                SELECT id, event_type
                FROM edr.events
                ORDER BY timestamp DESC
                LIMIT 20
            )
        ),
        
        recent_event_users_array AS (
            SELECT groupArray(user) as users
            FROM (
                SELECT id, user
                FROM edr.events
                ORDER BY timestamp DESC
                LIMIT 20
            )
        ),
        
        -- Recent detections arrays
        recent_detection_ids_array AS (
            SELECT groupArray(id) as ids
            FROM (
                SELECT id
                FROM edr.detections
                ORDER BY timestamp DESC
                LIMIT 20
            )
        ),
        
        recent_detection_timestamps_array AS (
            SELECT groupArray(timestamp) as timestamps
            FROM (
                SELECT id, timestamp
                FROM edr.detections
                ORDER BY timestamp DESC
                LIMIT 20
            )
        ),
        
        recent_detection_endpoints_array AS (
            SELECT groupArray(endpoint_id) as endpoints
            FROM (
                SELECT id, endpoint_id
                FROM edr.detections
                ORDER BY timestamp DESC
                LIMIT 20
            )
        ),
        
        recent_detection_rules_array AS (
            SELECT groupArray(rule_id) as rules
            FROM (
                SELECT id, rule_id
                FROM edr.detections
                ORDER BY timestamp DESC
                LIMIT 20
            )
        ),
        
        recent_detection_severities_array AS (
            SELECT groupArray(severity) as severities
            FROM (
                SELECT id, severity
                FROM edr.detections
                ORDER BY timestamp DESC
                LIMIT 20
            )
        ),
        
        -- Get event and detection counts
        event_count AS (
            SELECT sum(event_count) as total_events
            FROM edr.endpoint_events_mv
            WHERE date >= current_date - 1
        ),
        
        detection_count AS (
            SELECT sum(detection_count) as total_detections
            FROM edr.endpoint_detections_mv
            WHERE date >= current_date - 1
        )
    
    SELECT
        current_date as snapshot_date,
        current_hour as snapshot_hour,
        current_minute as snapshot_minute,
        now() as snapshot_timestamp,
        
        (SELECT total_events FROM event_count) as total_events,
        (SELECT total_detections FROM detection_count) as total_detections,
        
        (SELECT levels FROM severity_levels_array) as severity_levels,
        (SELECT counts FROM severity_counts_array) as severity_counts,
        
        (SELECT types FROM event_types_array) as event_types,
        (SELECT counts FROM event_counts_array) as event_counts,
        
        (SELECT ids FROM active_endpoint_ids_array) as active_endpoint_ids,
        (SELECT users FROM active_endpoint_users_array) as active_endpoint_users,
        (SELECT counts FROM active_endpoint_counts_array) as active_endpoint_counts,
        
        (SELECT names FROM active_user_names_array) as active_user_names,
        (SELECT counts FROM active_user_counts_array) as active_user_counts,
        (SELECT endpoints FROM active_user_endpoints_array) as active_user_endpoints,
        
        (SELECT ids FROM recent_event_ids_array) as recent_event_ids,
        (SELECT timestamps FROM recent_event_timestamps_array) as recent_event_timestamps,
        (SELECT endpoints FROM recent_event_endpoints_array) as recent_event_endpoints,
        (SELECT types FROM recent_event_types_array) as recent_event_types,
        (SELECT users FROM recent_event_users_array) as recent_event_users,
        
        (SELECT ids FROM recent_detection_ids_array) as recent_detection_ids,
        (SELECT timestamps FROM recent_detection_timestamps_array) as recent_detection_timestamps,
        (SELECT endpoints FROM recent_detection_endpoints_array) as recent_detection_endpoints,
        (SELECT rules FROM recent_detection_rules_array) as recent_detection_rules,
        (SELECT severities FROM recent_detection_severities_array) as recent_detection_severities;
EOSQL

echo "ClickHouse schema initialization complete, including refreshable dashboard materialized view."
