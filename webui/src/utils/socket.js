import { io } from 'socket.io-client';

// Create a socket instance
const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
  reconnectionDelayMax: 10000,
  transports: ['websocket'],
  timeout: 15000,
});

// Socket connection status
let isConnected = false;

// Connection event handlers
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
  isConnected = true;
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket server');
  isConnected = false;
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  isConnected = false;
});

// Helper function to emit events with Promise-based response handling
const emitAsync = (eventName, data, customTimeout = 15000) => {
  return new Promise((resolve, reject) => {
    // Set timeout for response
    const timeout = setTimeout(() => {
      console.error(`Request timed out for event: ${eventName}`);
      reject(new Error(`Request timed out for event: ${eventName}`));
    }, customTimeout);
    
    // Listen for response
    // Special handling for dashboard:stats event
    const responseEvent = eventName === 'dashboard:stats' 
      ? 'dashboard:stats:data'
      : `${eventName.split(':')[0]}:data`;
      
    const errorEvent = eventName === 'dashboard:stats'
      ? 'dashboard:stats:error'
      : `${eventName.split(':')[0]}:error`;
    
    const handleResponse = (response) => {
      clearTimeout(timeout);
      socket.off(errorEvent, handleError);
      resolve(response);
    };
    
    const handleError = (error) => {
      clearTimeout(timeout);
      socket.off(responseEvent, handleResponse);
      console.error(`Error in ${eventName}:`, error);
      reject(error);
    };
    
    socket.once(responseEvent, handleResponse);
    socket.once(errorEvent, handleError);
    
    // Emit the event
    socket.emit(eventName, data);
  });
};

// Socket service
export const SocketService = {
  isConnected: () => isConnected,
  
  // Events
  getEvents: async (params = {}) => {
    try {
      return await emitAsync('events:get', params);
    } catch (error) {
      console.error('Failed to get events:', error);
      return [];
    }
  },
  
  subscribeToLiveEvents: (callback) => {
    socket.on('events:live', callback);
    socket.emit('events:subscribe');
    
    return () => {
      socket.off('events:live', callback);
      socket.emit('events:unsubscribe');
    };
  },
  
  // Detections
  getDetections: async (params = {}) => {
    try {
      return await emitAsync('detections:get', params);
    } catch (error) {
      console.error('Failed to get detections:', error);
      return [];
    }
  },
  
  subscribeToLiveDetections: (callback) => {
    socket.on('detections:live', callback);
    socket.emit('detections:subscribe');
    
    return () => {
      socket.off('detections:live', callback);
      socket.emit('detections:unsubscribe');
    };
  },
  
  // Dashboard
  getDashboardStats: async () => {
    try {
      return await emitAsync('dashboard:stats', null, 20000);
    } catch (error) {
      console.error('Failed to get dashboard stats:', error);
      return {
        eventCount: 0,
        detectionCount: 0,
        severityDistribution: [],
        eventTypeDistribution: [],
        activeEndpoints: [],
        activeUsers: []
      };
    }
  },
  
  subscribeToLiveDashboardStats: (callback) => {
    socket.on('dashboard:stats:live', callback);
    socket.emit('dashboard:stats:subscribe');
    
    return () => {
      socket.off('dashboard:stats:live', callback);
      socket.emit('dashboard:stats:unsubscribe');
    };
  },
  
  // Endpoints
  getEndpoints: async () => {
    try {
      return await emitAsync('endpoints:get');
    } catch (error) {
      console.error('Failed to get endpoints:', error);
      return [];
    }
  },
  
  getEndpointDetails: async (endpointId) => {
    try {
      return await emitAsync('endpoint:details', endpointId);
    } catch (error) {
      console.error('Failed to get endpoint details:', error);
      return {};
    }
  },
  
  // Users
  getUsers: async () => {
    try {
      return await emitAsync('users:get');
    } catch (error) {
      console.error('Failed to get users:', error);
      return [];
    }
  },
  
  getUserDetails: async (username) => {
    try {
      return await emitAsync('user:details', username);
    } catch (error) {
      console.error('Failed to get user details:', error);
      return {};
    }
  }
};

export default socket; 