import { SocketService } from './socket';

// API Services using WebSockets
export const EventsService = {
  getEvents: async (params = {}) => {
    return await SocketService.getEvents(params);
  },
  
  getEventsByEndpoint: async (endpointId, params = {}) => {
    return await SocketService.getEvents({ 
      endpoint_id: endpointId,
      ...params 
    });
  },
  
  getEventsByUser: async (username, params = {}) => {
    return await SocketService.getEvents({ 
      username,
      ...params 
    });
  },
  
  subscribeToLiveEvents: (callback) => {
    return SocketService.subscribeToLiveEvents(callback);
  }
};

export const DetectionsService = {
  getDetections: async (params = {}) => {
    return await SocketService.getDetections(params);
  },
  
  getDetectionsByEndpoint: async (endpointId, params = {}) => {
    return await SocketService.getDetections({ 
      endpoint_id: endpointId,
      ...params 
    });
  },
  
  getDetectionsByUser: async (username, params = {}) => {
    return await SocketService.getDetections({ 
      username,
      ...params 
    });
  },
  
  subscribeToLiveDetections: (callback) => {
    return SocketService.subscribeToLiveDetections(callback);
  }
};

export const DashboardService = {
  getStats: async () => {
    return await SocketService.getDashboardStats();
  },
  
  subscribeToLiveStats: (callback) => {
    return SocketService.subscribeToLiveDashboardStats(callback);
  }
};

export const EndpointsService = {
  getEndpoints: async () => {
    return await SocketService.getEndpoints();
  },
  
  getEndpointById: async (id) => {
    return await SocketService.getEndpointDetails(id);
  }
};

export const UsersService = {
  getUsers: async () => {
    return await SocketService.getUsers();
  },
  
  getUserById: async (id) => {
    return await SocketService.getUserDetails(id);
  }
};

export default {
  EventsService,
  DetectionsService,
  DashboardService,
  EndpointsService,
  UsersService
}; 