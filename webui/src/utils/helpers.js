import { format, formatDistance } from 'date-fns';

// Format timestamp to readable date/time
export const formatDateTime = (timestamp) => {
  if (!timestamp) return 'Unknown';
  
  try {
    const date = new Date(timestamp);
    return format(date, 'MMM dd, yyyy HH:mm:ss');
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

// Format timestamp as relative time
export const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'Unknown';
  
  try {
    const date = new Date(timestamp);
    return formatDistance(date, new Date(), { addSuffix: true });
  } catch (error) {
    console.error('Error formatting relative date:', error);
    return 'Invalid date';
  }
};

// Map severity level to color
export const getSeverityColor = (severity) => {
  const severityMap = {
    1: 'cyber-green',
    2: 'cyber-yellow',
    3: 'cyber-yellow',
    4: 'cyber-red',
    5: 'cyber-red',
    'low': 'cyber-green',
    'medium': 'cyber-yellow',
    'high': 'cyber-red',
    'critical': 'cyber-red',
  };
  
  return severityMap[severity] || 'cyber-blue';
};

// Get human-readable severity name
export const getSeverityName = (severity) => {
  const severityMap = {
    1: 'Low',
    2: 'Medium',
    3: 'Medium',
    4: 'High',
    5: 'Critical',
  };
  
  return severityMap[severity] || 'Unknown';
};

// Map event type to icon name (for use with react-icons)
export const getEventTypeIcon = (eventType) => {
  const typeMap = {
    'process': 'MdOutlineMemory',
    'file': 'FiFile',
    'network': 'FiWifi',
    'registry': 'FiDatabase',
    'login': 'FiLogIn',
    'logout': 'FiLogOut',
    'user': 'FiUser',
    'service': 'FiSettings',
    'dns': 'FiGlobe',
    'http': 'FiGlobe',
  };
  
  return typeMap[eventType?.toLowerCase()] || 'FiActivity';
};

// Truncate text with ellipsis
export const truncate = (text, length = 30) => {
  if (!text) return '';
  return text.length > length ? `${text.substring(0, length)}...` : text;
};

// Extract hostname from URL
export const extractHostname = (url) => {
  if (!url) return '';
  
  try {
    let hostname = url.indexOf('//') > -1 
      ? url.split('/')[2] 
      : url.split('/')[0];
    
    hostname = hostname.split(':')[0];
    hostname = hostname.split('?')[0];
    
    return hostname;
  } catch (error) {
    return url;
  }
};

// Create a unique ID
export const createId = () => {
  return Math.random().toString(36).substring(2, 15);
};

// Filter data with multiple filters
export const multiFilter = (items, filters) => {
  return items.filter(item => {
    return Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      return item[key] === value;
    });
  });
}; 