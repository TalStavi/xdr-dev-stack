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
    }, 5000); // Poll every 5 seconds
    
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
      socket.emit('detections:data', result);
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
        socket.emit('detections:live', result);
      } catch (error) {
        console.error('Error fetching live detections:', error);
      }
    }, 5000); // Poll every 5 seconds
    
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
      // Get event count
      const eventCountQuery = `
        SELECT count() as count
        FROM edr.events
        WHERE timestamp >= now() - INTERVAL 24 HOUR
      `;
      const eventCountResult = await clickhouse.query(eventCountQuery).toPromise();
      
      // Get detection count
      const detectionCountQuery = `
        SELECT count() as count
        FROM edr.detections
        WHERE timestamp >= now() - INTERVAL 24 HOUR
      `;
      const detectionCountResult = await clickhouse.query(detectionCountQuery).toPromise();
      
      // Get severity distribution
      const severityQuery = `
        SELECT severity, count() as count
        FROM edr.detections
        WHERE timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY severity
        ORDER BY severity
      `;
      const severityResult = await clickhouse.query(severityQuery).toPromise();
      
      // Get event type distribution
      const eventTypeQuery = `
        SELECT event_type, count() as count
        FROM edr.events
        WHERE timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 10
      `;
      const eventTypeResult = await clickhouse.query(eventTypeQuery).toPromise();
      
      const stats = {
        eventCount: eventCountResult[0]?.count || 0,
        detectionCount: detectionCountResult[0]?.count || 0,
        severityDistribution: severityResult,
        eventTypeDistribution: eventTypeResult
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
        // Get event count
        const eventCountQuery = `
          SELECT count() as count
          FROM edr.events
          WHERE timestamp >= now() - INTERVAL 24 HOUR
        `;
        const eventCountResult = await clickhouse.query(eventCountQuery).toPromise();
        
        // Get detection count
        const detectionCountQuery = `
          SELECT count() as count
          FROM edr.detections
          WHERE timestamp >= now() - INTERVAL 24 HOUR
        `;
        const detectionCountResult = await clickhouse.query(detectionCountQuery).toPromise();
        
        // Get severity distribution
        const severityQuery = `
          SELECT severity, count() as count
          FROM edr.detections
          WHERE timestamp >= now() - INTERVAL 24 HOUR
          GROUP BY severity
          ORDER BY severity
        `;
        const severityResult = await clickhouse.query(severityQuery).toPromise();
        
        // Get event type distribution
        const eventTypeQuery = `
          SELECT event_type, count() as count
          FROM edr.events
          WHERE timestamp >= now() - INTERVAL 24 HOUR
          GROUP BY event_type
          ORDER BY count DESC
          LIMIT 10
        `;
        const eventTypeResult = await clickhouse.query(eventTypeQuery).toPromise();
        
        const stats = {
          eventCount: eventCountResult[0]?.count || 0,
          detectionCount: detectionCountResult[0]?.count || 0,
          severityDistribution: severityResult,
          eventTypeDistribution: eventTypeResult
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
      // Get unique endpoints from events
      const query = `
        SELECT 
          endpoint_id,
          any(user) as user,
          max(timestamp) as last_seen,
          count() as event_count
        FROM edr.events
        GROUP BY endpoint_id
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
      // Get endpoint details
      const detailsQuery = `
        SELECT 
          endpoint_id,
          any(user) as user,
          max(timestamp) as last_seen,
          count() as event_count
        FROM edr.events
        WHERE endpoint_id = '${endpointId}'
        GROUP BY endpoint_id
      `;
      
      // Get recent events for this endpoint
      const eventsQuery = `
        SELECT *
        FROM edr.events
        WHERE endpoint_id = '${endpointId}'
        ORDER BY timestamp DESC
        LIMIT 20
      `;
      
      // Get recent detections for this endpoint
      const detectionsQuery = `
        SELECT *
        FROM edr.detections
        WHERE endpoint_id = '${endpointId}'
        ORDER BY timestamp DESC
        LIMIT 20
      `;
      
      const [details, events, detections] = await Promise.all([
        clickhouse.query(detailsQuery).toPromise(),
        clickhouse.query(eventsQuery).toPromise(),
        clickhouse.query(detectionsQuery).toPromise()
      ]);
      
      socket.emit('endpoint:details:data', {
        details: details[0] || {},
        events,
        detections
      });
    } catch (error) {
      console.error('Error fetching endpoint details:', error);
      socket.emit('endpoint:details:error', { error: 'Failed to fetch endpoint details' });
    }
  });
  
  // Handle users request
  socket.on('users:get', async () => {
    try {
      // Get unique users from events
      const query = `
        SELECT 
          user,
          max(timestamp) as last_seen,
          count() as event_count
        FROM edr.events
        WHERE user != ''
        GROUP BY user
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
      // Get user details
      const detailsQuery = `
        SELECT 
          user,
          max(timestamp) as last_seen,
          count() as event_count
        FROM edr.events
        WHERE user = '${username}'
        GROUP BY user
      `;
      
      // Get recent events for this user
      const eventsQuery = `
        SELECT *
        FROM edr.events
        WHERE user = '${username}'
        ORDER BY timestamp DESC
        LIMIT 20
      `;
      
      // Get endpoints associated with this user
      const endpointsQuery = `
        SELECT 
          endpoint_id,
          max(timestamp) as last_seen,
          count() as event_count
        FROM edr.events
        WHERE user = '${username}'
        GROUP BY endpoint_id
        ORDER BY last_seen DESC
      `;
      
      const [details, events, endpoints] = await Promise.all([
        clickhouse.query(detailsQuery).toPromise(),
        clickhouse.query(eventsQuery).toPromise(),
        clickhouse.query(endpointsQuery).toPromise()
      ]);
      
      // Get detections for the endpoints associated with this user
      const endpointIds = endpoints.map(endpoint => `'${endpoint.endpoint_id}'`).join(',');
      
      let detections = [];
      if (endpointIds.length > 0) {
        const detectionsQuery = `
          SELECT *
          FROM edr.detections
          WHERE endpoint_id IN (${endpointIds})
          ORDER BY timestamp DESC
          LIMIT 20
        `;
        
        detections = await clickhouse.query(detectionsQuery).toPromise();
      }
      
      socket.emit('user:details:data', {
        details: details[0] || {},
        events,
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
