const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const { ClickHouse } = require('clickhouse');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ClickHouse client
const clickhouse = new ClickHouse({
  url: process.env.CLICKHOUSE_HOST || 'clickhouse',
  port: process.env.CLICKHOUSE_PORT || 8123,
  debug: false,
  basicAuth: {
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || 'edrpassword',
  },
  format: 'json',
  raw: false,
});

// Routes - Keep health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
  
  // Handle events request
  socket.on('events:get', async (params = {}) => {
    try {
      const { limit = 100, offset = 0, endpoint_id, event_type, from, to, username } = params;
      
      // Build WHERE clause
      let whereClause = '';
      const conditions = [];
      
      if (endpoint_id) conditions.push(`endpoint_id = '${endpoint_id}'`);
      if (event_type) conditions.push(`event_type = '${event_type}'`);
      if (from) conditions.push(`timestamp >= toDateTime64('${from}', 3)`);
      if (to) conditions.push(`timestamp <= toDateTime64('${to}', 3)`);
      if (username) conditions.push(`user = '${username}'`);
      
      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
      
      const query = `
        SELECT *
        FROM edr.events
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
      
      const result = await clickhouse.query(query).toPromise();
      socket.emit('events:data', result);
    } catch (error) {
      console.error('Error fetching events:', error);
      socket.emit('events:error', { error: 'Failed to fetch events' });
    }
  });
  
  // Handle live events subscription
  socket.on('events:subscribe', async () => {
    // Set up interval to poll for new events
    const eventsPollInterval = setInterval(async () => {
      try {
        // Get the most recent events
        const query = `
          SELECT *
          FROM edr.events
          ORDER BY timestamp DESC
          LIMIT 20
        `;
        
        const result = await clickhouse.query(query).toPromise();
        socket.emit('events:live', result);
      } catch (error) {
        console.error('Error fetching live events:', error);
      }
    }, 1000); // Poll every 1 second
    
    // Store the interval ID in the socket object for cleanup
    socket.eventsPollInterval = eventsPollInterval;
    
    // Clean up on unsubscribe
    socket.on('events:unsubscribe', () => {
      if (socket.eventsPollInterval) {
        clearInterval(socket.eventsPollInterval);
      }
    });
  });
  
  // Handle detections request
  socket.on('detections:get', async (params = {}) => {
    try {
      const { limit = 100, offset = 0, severity, rule_id, endpoint_id, from, to, username } = params;
      
      // Build WHERE clause
      let whereClause = '';
      const conditions = [];
      
      if (severity) conditions.push(`severity = ${severity}`);
      if (rule_id) conditions.push(`rule_id = '${rule_id}'`);
      if (endpoint_id) conditions.push(`endpoint_id = '${endpoint_id}'`);
      if (from) conditions.push(`timestamp >= toDateTime64('${from}', 3)`);
      if (to) conditions.push(`timestamp <= toDateTime64('${to}', 3)`);
      
      // For username, we need to join with events table since username is in events
      if (username) {
        // This is a simplified approach - in a real system, you might have a more complex query
        // that joins detections with events based on the event_ids field
        conditions.push(`endpoint_id IN (
          SELECT DISTINCT endpoint_id FROM edr.events WHERE user = '${username}'
        )`);
      }
      
      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
      
      const query = `
        SELECT *
        FROM edr.detections
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
      
      const result = await clickhouse.query(query).toPromise();
      
      // Fetch related events for each detection
      const detectionsWithEvents = await Promise.all(
        result.map(async (detection) => {
          if (!detection.event_ids) return { ...detection, events: [] };
          
          // Split event_ids string into an array
          const eventIds = detection.event_ids.split(',');
          
          // Fetch the events
          const eventsQuery = `
            SELECT *
            FROM edr.events
            WHERE id IN (${eventIds.map(id => `'${id}'`).join(',')})
            ORDER BY timestamp ASC
          `;
          
          try {
            const events = await clickhouse.query(eventsQuery).toPromise();
            return { ...detection, events };
          } catch (error) {
            console.error('Error fetching events for detection:', error);
            return { ...detection, events: [] };
          }
        })
      );
      
      socket.emit('detections:data', detectionsWithEvents);
    } catch (error) {
      console.error('Error fetching detections:', error);
      socket.emit('detections:error', { error: 'Failed to fetch detections' });
    }
  });
  
  // Handle live detections subscription
  socket.on('detections:subscribe', async () => {
    // Set up interval to poll for new detections
    const detectionsPollInterval = setInterval(async () => {
      try {
        // Get the most recent detections
        const query = `
          SELECT *
          FROM edr.detections
          ORDER BY timestamp DESC
          LIMIT 20
        `;
        
        const result = await clickhouse.query(query).toPromise();
        
        // Fetch related events for each detection
        const detectionsWithEvents = await Promise.all(
          result.map(async (detection) => {
            if (!detection.event_ids) return { ...detection, events: [] };
            
            // Split event_ids string into an array
            const eventIds = detection.event_ids.split(',');
            
            // Fetch the events
            const eventsQuery = `
              SELECT *
              FROM edr.events
              WHERE id IN (${eventIds.map(id => `'${id}'`).join(',')})
              ORDER BY timestamp ASC
            `;
            
            try {
              const events = await clickhouse.query(eventsQuery).toPromise();
              return { ...detection, events };
            } catch (error) {
              console.error('Error fetching events for detection:', error);
              return { ...detection, events: [] };
            }
          })
        );
        
        socket.emit('detections:live', detectionsWithEvents);
      } catch (error) {
        console.error('Error fetching live detections:', error);
      }
    }, 1000); // Poll every 1 seconds
    
    // Store the interval ID in the socket object for cleanup
    socket.detectionsPollInterval = detectionsPollInterval;
    
    // Clean up on unsubscribe
    socket.on('detections:unsubscribe', () => {
      if (socket.detectionsPollInterval) {
        clearInterval(socket.detectionsPollInterval);
      }
    });
  });
  
  // Handle dashboard stats request
  socket.on('dashboard:stats', async () => {
    try {
      // Get event count using endpoint_events_mv for better performance
      const eventCountQuery = `
        SELECT sum(event_count) as count
        FROM edr.endpoint_events_mv
        WHERE toDate(last_seen) >= today() - 1
      `;
      const eventCountResult = await clickhouse.query(eventCountQuery).toPromise();
      
      // Get detection count using endpoint_detections_mv for better performance
      const detectionCountQuery = `
        SELECT sum(detection_count) as count
        FROM edr.endpoint_detections_mv
        WHERE date >= today() - 1
      `;
      const detectionCountResult = await clickhouse.query(detectionCountQuery).toPromise();
      
      // Get severity distribution from user_detections_mv for better performance
      const severityQuery = `
        SELECT severity, sum(detection_count) as count
        FROM edr.user_detections_mv
        WHERE date >= today() - 1
        GROUP BY severity
        ORDER BY severity
      `;
      const severityResult = await clickhouse.query(severityQuery).toPromise();
      
      // Get event type distribution from endpoint_events_mv for better performance
      const eventTypeQuery = `
        SELECT event_type, sum(event_count) as count
        FROM edr.endpoint_events_mv
        WHERE toDate(last_seen) >= today() - 1
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 10
      `;
      const eventTypeResult = await clickhouse.query(eventTypeQuery).toPromise();
      
      // Get top active endpoints
      const activeEndpointsQuery = `
        SELECT 
          endpoint_id,
          primary_user as user,
          total_events as event_count
        FROM edr.endpoint_details_mv
        WHERE last_seen >= now() - INTERVAL 24 HOUR
        ORDER BY total_events DESC
        LIMIT 5
      `;
      const activeEndpointsResult = await clickhouse.query(activeEndpointsQuery).toPromise();
      
      // Get top active users
      const activeUsersQuery = `
        SELECT 
          user,
          total_events as event_count,
          unique_endpoints
        FROM edr.user_details_mv
        WHERE last_seen >= now() - INTERVAL 24 HOUR
        ORDER BY total_events DESC
        LIMIT 5
      `;
      const activeUsersResult = await clickhouse.query(activeUsersQuery).toPromise();
      
      const stats = {
        eventCount: eventCountResult[0]?.count || 0,
        detectionCount: detectionCountResult[0]?.count || 0,
        severityDistribution: severityResult,
        eventTypeDistribution: eventTypeResult,
        activeEndpoints: activeEndpointsResult,
        activeUsers: activeUsersResult
      };
      
      socket.emit('dashboard:stats:data', stats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      socket.emit('dashboard:stats:error', { error: 'Failed to fetch dashboard stats' });
    }
  });
  
  // Handle live dashboard stats subscription
  socket.on('dashboard:stats:subscribe', async () => {
    // Set up interval to poll for updated stats
    const statsPollInterval = setInterval(async () => {
      try {
        // Get event count using endpoint_events_mv
        const eventCountQuery = `
          SELECT sum(event_count) as count
          FROM edr.endpoint_events_mv
          WHERE toDate(last_seen) >= today() - 1
        `;
        const eventCountResult = await clickhouse.query(eventCountQuery).toPromise();
        
        // Get detection count using endpoint_detections_mv
        const detectionCountQuery = `
          SELECT sum(detection_count) as count
          FROM edr.endpoint_detections_mv
          WHERE date >= today() - 1
        `;
        const detectionCountResult = await clickhouse.query(detectionCountQuery).toPromise();
        
        // Get severity distribution from user_detections_mv
        const severityQuery = `
          SELECT severity, sum(detection_count) as count
          FROM edr.user_detections_mv
          WHERE date >= today() - 1
          GROUP BY severity
          ORDER BY severity
        `;
        const severityResult = await clickhouse.query(severityQuery).toPromise();
        
        // Get event type distribution from endpoint_events_mv
        const eventTypeQuery = `
          SELECT event_type, sum(event_count) as count
          FROM edr.endpoint_events_mv
          WHERE toDate(last_seen) >= today() - 1
          GROUP BY event_type
          ORDER BY count DESC
          LIMIT 10
        `;
        const eventTypeResult = await clickhouse.query(eventTypeQuery).toPromise();
        
        // Get top active endpoints (new)
        const activeEndpointsQuery = `
          SELECT 
            endpoint_id,
            primary_user as user,
            total_events as event_count
          FROM edr.endpoint_details_mv
          WHERE last_seen >= now() - INTERVAL 24 HOUR
          ORDER BY total_events DESC
          LIMIT 5
        `;
        const activeEndpointsResult = await clickhouse.query(activeEndpointsQuery).toPromise();
        
        // Get top active users (new)
        const activeUsersQuery = `
          SELECT 
            user,
            total_events as event_count,
            unique_endpoints
          FROM edr.user_details_mv
          WHERE last_seen >= now() - INTERVAL 24 HOUR
          ORDER BY total_events DESC
          LIMIT 5
        `;
        const activeUsersResult = await clickhouse.query(activeUsersQuery).toPromise();
        
        const stats = {
          eventCount: eventCountResult[0]?.count || 0,
          detectionCount: detectionCountResult[0]?.count || 0,
          severityDistribution: severityResult,
          eventTypeDistribution: eventTypeResult,
          activeEndpoints: activeEndpointsResult,
          activeUsers: activeUsersResult
        };
        
        socket.emit('dashboard:stats:live', stats);
      } catch (error) {
        console.error('Error fetching live dashboard stats:', error);
      }
    }, 10000); // Poll every 10 seconds
    
    // Store the interval ID in the socket object for cleanup
    socket.statsPollInterval = statsPollInterval;
    
    // Clean up on unsubscribe
    socket.on('dashboard:stats:unsubscribe', () => {
      if (socket.statsPollInterval) {
        clearInterval(socket.statsPollInterval);
      }
    });
  });
  
  // Handle endpoints request
  socket.on('endpoints:get', async () => {
    try {
      // Use the optimized endpoint_details_mv materialized view instead of querying events
      const query = `
        SELECT 
          endpoint_id,
          primary_user as user,
          last_seen,
          total_events as event_count,
          unique_users,
          recent_event_types
        FROM edr.endpoint_details_mv
        ORDER BY last_seen DESC
      `;
      
      const result = await clickhouse.query(query).toPromise();
      socket.emit('endpoints:data', result);
    } catch (error) {
      console.error('Error fetching endpoints:', error);
      socket.emit('endpoints:error', { error: 'Failed to fetch endpoints' });
    }
  });
  
  // Handle endpoint details request
  socket.on('endpoint:details', async (endpointId) => {
    try {
      // Get endpoint details from the materialized view
      const detailsQuery = `
        SELECT 
          endpoint_id,
          primary_user as user,
          last_seen,
          total_events as event_count,
          unique_event_types,
          unique_users,
          recent_event_types
        FROM edr.endpoint_details_mv
        WHERE endpoint_id = '${endpointId}'
      `;
      
      // Get event summary by type for this endpoint
      const eventSummaryQuery = `
        SELECT
          endpoint_id,
          event_type,
          sum(event_count) as event_count,
          max(last_seen) as last_seen,
          sum(unique_users) as unique_users
        FROM edr.endpoint_events_mv
        WHERE endpoint_id = '${endpointId}'
        GROUP BY endpoint_id, event_type
        ORDER BY event_count DESC
      `;
      
      // Get recent events for this endpoint (still using the base table for detailed data)
      const eventsQuery = `
        SELECT *
        FROM edr.events
        WHERE endpoint_id = '${endpointId}'
        ORDER BY timestamp DESC
        LIMIT 20
      `;
      
      // Get detections summary for this endpoint
      const detectionSummaryQuery = `
        SELECT
          endpoint_id,
          sum(detection_count) as detection_count,
          max(max_severity) as max_severity
        FROM edr.endpoint_detections_mv
        WHERE endpoint_id = '${endpointId}'
        GROUP BY endpoint_id
      `;
      
      // Get recent detections for this endpoint
      const detectionsQuery = `
        SELECT *
        FROM edr.detections
        WHERE endpoint_id = '${endpointId}'
        ORDER BY timestamp DESC
        LIMIT 20
      `;
      
      const [details, eventSummary, events, detectionSummary, detections] = await Promise.all([
        clickhouse.query(detailsQuery).toPromise(),
        clickhouse.query(eventSummaryQuery).toPromise(),
        clickhouse.query(eventsQuery).toPromise(),
        clickhouse.query(detectionSummaryQuery).toPromise(),
        clickhouse.query(detectionsQuery).toPromise()
      ]);
      
      // Fetch related events for each detection
      const detectionsWithEvents = await Promise.all(
        detections.map(async (detection) => {
          if (!detection.event_ids) return { ...detection, events: [] };
          
          // Split event_ids string into an array
          const eventIds = detection.event_ids.split(',');
          
          // Fetch the events
          const detectionEventsQuery = `
            SELECT *
            FROM edr.events
            WHERE id IN (${eventIds.map(id => `'${id}'`).join(',')})
            ORDER BY timestamp ASC
          `;
          
          try {
            const detectionEvents = await clickhouse.query(detectionEventsQuery).toPromise();
            return { ...detection, events: detectionEvents };
          } catch (error) {
            console.error('Error fetching events for detection:', error);
            return { ...detection, events: [] };
          }
        })
      );
      
      socket.emit('endpoint:details:data', {
        details: details[0] || {},
        eventSummary,
        events,
        detectionSummary: detectionSummary[0] || {},
        detections: detectionsWithEvents
      });
    } catch (error) {
      console.error('Error fetching endpoint details:', error);
      socket.emit('endpoint:details:error', { error: 'Failed to fetch endpoint details' });
    }
  });
  
  // Handle users request
  socket.on('users:get', async () => {
    try {
      // Use the optimized user_details_mv materialized view instead of querying events
      const query = `
        SELECT 
          user,
          last_seen,
          total_events as event_count,
          unique_endpoints
        FROM edr.user_details_mv
        ORDER BY last_seen DESC
      `;
      
      const result = await clickhouse.query(query).toPromise();
      socket.emit('users:data', result);
    } catch (error) {
      console.error('Error fetching users:', error);
      socket.emit('users:error', { error: 'Failed to fetch users' });
    }
  });
  
  // Handle user details request
  socket.on('user:details', async (username) => {
    try {
      // Get user details from the materialized view
      const detailsQuery = `
        SELECT 
          user,
          last_seen,
          total_events as event_count,
          unique_event_types,
          unique_endpoints,
          recent_endpoints
        FROM edr.user_details_mv
        WHERE user = '${username}'
      `;
      
      // Get event summary by type for this user
      const eventSummaryQuery = `
        SELECT
          user,
          event_type,
          sum(event_count) as event_count,
          max(last_seen) as last_seen,
          sum(unique_endpoints) as unique_endpoints
        FROM edr.user_events_mv
        WHERE user = '${username}'
        GROUP BY user, event_type
        ORDER BY event_count DESC
      `;
      
      // Get recent events for this user (still using the base table for detailed data)
      const eventsQuery = `
        SELECT *
        FROM edr.events
        WHERE user = '${username}'
        ORDER BY timestamp DESC
        LIMIT 20
      `;
      
      // Get detection summary for this user
      const detectionSummaryQuery = `
        SELECT
          user,
          max(severity) as max_severity,
          sum(detection_count) as detection_count,
          uniqExact(rule_id) as unique_rules
        FROM edr.user_detections_mv
        WHERE user = '${username}'
        GROUP BY user
      `;
      
      const [details, eventSummary, events, detectionSummary] = await Promise.all([
        clickhouse.query(detailsQuery).toPromise(),
        clickhouse.query(eventSummaryQuery).toPromise(),
        clickhouse.query(eventsQuery).toPromise(),
        clickhouse.query(detectionSummaryQuery).toPromise()
      ]);
      
      // Get endpoints associated with this user from the materialized view
      const endpointIds = details[0]?.recent_endpoints || [];
      
      // Initialize empty arrays
      let endpoints = [];
      let detections = [];
      
      // Only query if we have endpoints
      if (endpointIds.length > 0) {
        const endpointsQuery = `
          SELECT 
            endpoint_id,
            primary_user as user,
            last_seen,
            total_events as event_count
          FROM edr.endpoint_details_mv
          WHERE endpoint_id IN (${endpointIds.map(id => `'${id}'`).join(',')})
        `;
        
        endpoints = await clickhouse.query(endpointsQuery).toPromise();
      }
      
      // Get detections related to the user through their endpoints
      if (endpointIds.length > 0) {
        const detectionsQuery = `
          SELECT *
          FROM edr.detections
          WHERE endpoint_id IN (${endpointIds.map(id => `'${id}'`).join(',')})
          ORDER BY timestamp DESC
          LIMIT 20
        `;
        
        detections = await clickhouse.query(detectionsQuery).toPromise();
        
        // Fetch related events for each detection
        detections = await Promise.all(
          detections.map(async (detection) => {
            if (!detection.event_ids) return { ...detection, events: [] };
            
            // Split event_ids string into an array
            const eventIds = detection.event_ids.split(',');
            
            // Fetch the events
            const detectionEventsQuery = `
              SELECT *
              FROM edr.events
              WHERE id IN (${eventIds.map(id => `'${id}'`).join(',')})
              ORDER BY timestamp ASC
            `;
            
            try {
              const detectionEvents = await clickhouse.query(detectionEventsQuery).toPromise();
              return { ...detection, events: detectionEvents };
            } catch (error) {
              console.error('Error fetching events for detection:', error);
              return { ...detection, events: [] };
            }
          })
        );
      }
      
      socket.emit('user:details:data', {
        details: details[0] || {},
        eventSummary,
        events,
        detectionSummary: detectionSummary[0] || {},
        endpoints,
        detections
      });
    } catch (error) {
      console.error('Error fetching user details:', error);
      socket.emit('user:details:error', { error: 'Failed to fetch user details' });
    }
  });
});

// Clean up all intervals on server shutdown
process.on('SIGINT', () => {
  io.sockets.sockets.forEach(socket => {
    if (socket.eventsPollInterval) clearInterval(socket.eventsPollInterval);
    if (socket.detectionsPollInterval) clearInterval(socket.detectionsPollInterval);
    if (socket.statsPollInterval) clearInterval(socket.statsPollInterval);
  });
  process.exit(0);
});

// Start server
server.listen(PORT, () => {
  console.log(`WebSocket API server running on port ${PORT}`);
  console.log('Available WebSocket events:');
  console.log('  events:get            - Get events');
  console.log('  events:subscribe      - Subscribe to live events');
  console.log('  detections:get        - Get detections');
  console.log('  detections:subscribe  - Subscribe to live detections');
  console.log('  dashboard:stats       - Get dashboard stats');
  console.log('  dashboard:stats:subscribe - Subscribe to live dashboard stats');
  console.log('  endpoints:get         - Get endpoints');
  console.log('  endpoint:details      - Get endpoint details');
  console.log('  users:get             - Get users');
  console.log('  user:details          - Get user details');
});
