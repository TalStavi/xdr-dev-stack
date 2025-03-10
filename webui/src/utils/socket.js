import { io } from 'socket.io-client';

// Create a socket instance
const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
  reconnectionDelayMax: 10000,
  transports: ['websocket'],
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
const emitAsync = (eventName, data) => {
  return new Promise((resolve, reject) => {
    // Set timeout for response
    const timeout = setTimeout(() => {
      reject(new Error(`Request timed out for event: ${eventName}`));
    }, 10000);
    
    // Listen for response
    const responseEvent = `${eventName.split(':')[0]}:data`;
    const errorEvent = `${eventName.split(':')[0]}:error`;
    
    const handleResponse = (response) => {
      clearTimeout(timeout);
      socket.off(errorEvent, handleError);
      resolve(response);
    };
    
    const handleError = (error) => {
      clearTimeout(timeout);
      socket.off(responseEvent, handleResponse);
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
    return await emitAsync('events:get', params);
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
    return await emitAsync('detections:get', params);
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
    return await emitAsync('dashboard:stats');
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
    return await emitAsync('endpoints:get');
  },
  
  getEndpointDetails: async (endpointId) => {
    return await emitAsync('endpoint:details', endpointId);
  },
  
  // Users
  getUsers: async () => {
    return await emitAsync('users:get');
  },
  
  getUserDetails: async (username) => {
    return await emitAsync('user:details', username);
  }
};

export default socket; 