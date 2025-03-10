import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiUser, FiActivity, FiClock, FiServer, FiAlertTriangle, FiArrowLeft, FiRefreshCw } from 'react-icons/fi';

import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import SeverityBadge from '../components/SeverityBadge';

import { UsersService } from '../utils/api';
import { formatDateTime, formatTimeAgo, getEventTypeIcon } from '../utils/helpers';

// Import all icon types we might need
import * as Icons from 'react-icons/fi';
import { MdOutlineMemory } from 'react-icons/md';

const UserDetails = () => {
  const { id: userId } = useParams();
  const navigate = useNavigate();
  
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Fetch user details
  useEffect(() => {
    const fetchUserDetails = async () => {
      setIsLoading(true);
      try {
        const data = await UsersService.getUserById(userId);
        setUserData(data);
      } catch (error) {
        console.error('Error fetching user details:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUserDetails();
  }, [userId]);
  
  // Refresh data manually
  const refreshData = async () => {
    setIsLoading(true);
    try {
      const data = await UsersService.getUserById(userId);
      setUserData(data);
    } catch (error) {
      console.error('Error refreshing user details:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Format event type to be more readable
  const formatEventType = (eventType) => {
    if (!eventType) return 'Unknown';
    
    // Convert snake_case to Title Case
    return eventType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  // Format rule ID to be more readable
  const formatRuleId = (ruleId) => {
    if (!ruleId) return 'Unknown';
    
    // Convert snake_case to Title Case
    return ruleId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  // Get icon component for event type
  const getIconComponent = (eventType) => {
    const iconName = getEventTypeIcon(eventType);
    
    if (iconName.startsWith('Md')) {
      return <MdOutlineMemory size={18} />;
    }
    
    const IconComponent = Icons[iconName];
    return IconComponent ? <IconComponent size={18} /> : <Icons.FiActivity size={18} />;
  };
  
  // Event columns
  const eventColumns = [
    { 
      key: 'timestamp', 
      label: 'Time', 
      sortable: true,
      render: (row) => formatDateTime(row.timestamp),
    },
    { 
      key: 'event_type', 
      label: 'Type', 
      sortable: true,
      render: (row) => (
        <div className="flex items-center">
          <span className="mr-2 text-cyber-blue">{getIconComponent(row.event_type)}</span>
          <span>{formatEventType(row.event_type)}</span>
        </div>
      ),
    },
    {
      key: 'endpoint_id',
      label: 'Endpoint',
      sortable: true,
      render: (row) => (
        <div>
          <div className="text-sm text-cyber-text">{row.endpoint_id.substring(0, 8)}...</div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span className={`px-2 py-1 rounded text-xs ${
          row.status === 'success' ? 'bg-green-900/30 text-green-400' :
          row.status === 'failure' ? 'bg-red-900/30 text-red-400' :
          'bg-gray-900/30 text-gray-400'
        }`}>
          {row.status || 'unknown'}
        </span>
      ),
    },
  ];
  
  // Detection columns
  const detectionColumns = [
    { 
      key: 'timestamp', 
      label: 'Time', 
      sortable: true,
      render: (row) => formatDateTime(row.timestamp),
    },
    {
      key: 'severity',
      label: 'Severity',
      sortable: true,
      render: (row) => <SeverityBadge severity={row.severity} />,
    },
    { 
      key: 'rule_id', 
      label: 'Rule', 
      sortable: true,
      render: (row) => (
        <div className="text-sm text-cyber-text">{formatRuleId(row.rule_id)}</div>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      sortable: false,
      render: (row) => (
        <div className="text-sm text-cyber-text truncate max-w-xs">
          {row.description || 'No description available'}
        </div>
      ),
    },
  ];
  
  // Endpoint columns
  const endpointColumns = [
    {
      key: 'endpoint_id',
      label: 'Endpoint ID',
      sortable: true,
      render: (row) => (
        <div className="flex items-center">
          <div className="w-8 h-8 bg-cyber-gray rounded-full flex items-center justify-center mr-3">
            <FiServer className="text-cyber-blue" />
          </div>
          <div>
            <div className="text-sm text-cyber-text">{row.endpoint_id.substring(0, 8)}...</div>
          </div>
        </div>
      ),
    },
    {
      key: 'last_seen',
      label: 'Last Active',
      sortable: true,
      render: (row) => (
        <div className="flex items-center">
          <FiClock className="text-cyber-text/60 mr-2" />
          <div>
            <div className="text-sm text-cyber-text">{formatTimeAgo(row.last_seen)}</div>
            <div className="text-xs text-cyber-text/60">{formatDateTime(row.last_seen)}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'event_count',
      label: 'Events',
      sortable: true,
      render: (row) => (
        <div className="flex items-center">
          <FiActivity className="text-cyber-blue mr-2" />
          <span className="text-cyber-text">{row.event_count?.toLocaleString() || 0}</span>
        </div>
      ),
    }
  ];
  
  // Handle endpoint row click
  const handleEndpointClick = (endpoint) => {
    navigate(`/endpoints/${endpoint.endpoint_id}`);
  };

  if (isLoading && !userData) {
    return (
      <div>
        <PageHeader
          title="User Details"
          icon={<FiUser size={24} />}
          description="Loading user information..."
          backLink="/users"
          backText="Back to Users"
        />
        <div className="cyber-card p-8 flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyber-blue"></div>
        </div>
      </div>
    );
  }

  if (!userData && !isLoading) {
    return (
      <div>
        <PageHeader
          title="User Not Found"
          icon={<FiUser size={24} />}
          description={`No user found with ID: ${userId}`}
          backLink="/users"
          backText="Back to Users"
        />
        <div className="cyber-card p-8 text-center">
          <p className="text-cyber-text">The requested user could not be found. It may have been deleted or you may have insufficient permissions.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`User: ${userData?.details?.user || userId}`}
        icon={<FiUser size={24} />}
        description="User activity and security events"
        backLink="/users"
        backText="Back to Users"
        actions={
          <button 
            onClick={refreshData}
            className="cyber-button-sm"
            disabled={isLoading}
            title="Refresh data"
          >
            <FiRefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            <span className="ml-1">Refresh</span>
          </button>
        }
      />
      
      {/* User Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="cyber-card mb-6"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
          <div className="w-16 h-16 bg-cyber-gray rounded-full flex items-center justify-center">
            <FiUser size={32} className="text-cyber-blue" />
          </div>
          
          <div className="flex-grow">
            <h3 className="text-xl font-medium text-cyber-text">{userData?.details?.user}</h3>
            <p className="text-cyber-text/70">
              Last activity: {formatTimeAgo(userData?.details?.last_seen)} ({formatDateTime(userData?.details?.last_seen)})
            </p>
          </div>
          
          <div className="flex flex-col items-end">
            <div className="flex space-x-4">
              <div className="text-center">
                <div className="text-2xl font-mono text-cyber-blue">{userData?.events?.length || 0}</div>
                <div className="text-xs text-cyber-text/70">Events</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-mono text-cyber-purple">{userData?.endpoints?.length || 0}</div>
                <div className="text-xs text-cyber-text/70">Endpoints</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-mono text-cyber-red">{userData?.detections?.length || 0}</div>
                <div className="text-xs text-cyber-text/70">Detections</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      
      {/* Tabs */}
      <div className="flex border-b border-cyber-light/20 mb-6">
        <button
          className={`py-2 px-4 font-medium ${activeTab === 'overview' ? 'text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-text/70 hover:text-cyber-text'}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`py-2 px-4 font-medium ${activeTab === 'events' ? 'text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-text/70 hover:text-cyber-text'}`}
          onClick={() => setActiveTab('events')}
        >
          Events
        </button>
        <button
          className={`py-2 px-4 font-medium ${activeTab === 'endpoints' ? 'text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-text/70 hover:text-cyber-text'}`}
          onClick={() => setActiveTab('endpoints')}
        >
          Endpoints
        </button>
        <button
          className={`py-2 px-4 font-medium ${activeTab === 'detections' ? 'text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-text/70 hover:text-cyber-text'}`}
          onClick={() => setActiveTab('detections')}
        >
          Detections
        </button>
      </div>
      
      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="cyber-card"
          >
            <h3 className="text-lg font-medium text-cyber-text mb-4">Recent Activity</h3>
            
            {userData?.events?.length > 0 ? (
              <div className="space-y-4">
                {userData.events.slice(0, 5).map((event, index) => (
                  <div 
                    key={event.id || index} 
                    className="flex items-start space-x-3 p-2 hover:bg-cyber-light/10 rounded transition-colors"
                  >
                    <div className="mt-1 p-2 bg-cyber-blue/10 rounded-full">
                      {getIconComponent(event.event_type)}
                    </div>
                    <div className="flex-grow">
                      <div className="flex justify-between">
                        <p className="text-sm font-medium text-cyber-text">{formatEventType(event.event_type)}</p>
                        <p className="text-xs text-cyber-text/60">{formatTimeAgo(event.timestamp)}</p>
                      </div>
                      <p className="text-xs text-cyber-text/70">
                        Endpoint: {event.endpoint_id?.substring(0, 8)}
                      </p>
                      {event.process_name && (
                        <p className="text-xs text-cyber-text/70 truncate">
                          Process: {event.process_name}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-cyber-text/50">
                No recent activity found
              </div>
            )}
            
            {userData?.events?.length > 5 && (
              <button 
                className="text-sm text-cyber-blue hover:underline mt-4 block w-full text-center"
                onClick={() => setActiveTab('events')}
              >
                View all {userData.events.length} events
              </button>
            )}
          </motion.div>
          
          {/* Security Alerts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="cyber-card"
          >
            <h3 className="text-lg font-medium text-cyber-text mb-4">Security Alerts</h3>
            
            {userData?.detections?.length > 0 ? (
              <div className="space-y-4">
                {userData.detections.slice(0, 5).map((detection, index) => (
                  <div 
                    key={detection.id || index} 
                    className="flex items-start space-x-3 p-2 hover:bg-cyber-light/10 rounded transition-colors"
                  >
                    <div className="mt-1">
                      <SeverityBadge severity={detection.severity} />
                    </div>
                    <div className="flex-grow">
                      <div className="flex justify-between">
                        <p className="text-sm font-medium text-cyber-text">{formatRuleId(detection.rule_id)}</p>
                        <p className="text-xs text-cyber-text/60">{formatTimeAgo(detection.timestamp)}</p>
                      </div>
                      <p className="text-xs text-cyber-text/70">
                        Endpoint: {detection.endpoint_id?.substring(0, 8)}
                      </p>
                      <p className="text-xs text-cyber-text/70 truncate">
                        {detection.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-cyber-text/50">
                No security alerts found
              </div>
            )}
            
            {userData?.detections?.length > 5 && (
              <button 
                className="text-sm text-cyber-blue hover:underline mt-4 block w-full text-center"
                onClick={() => setActiveTab('detections')}
              >
                View all {userData.detections.length} alerts
              </button>
            )}
          </motion.div>
          
          {/* Used Endpoints */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="cyber-card lg:col-span-2"
          >
            <h3 className="text-lg font-medium text-cyber-text mb-4">Associated Endpoints</h3>
            
            {userData?.endpoints?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-cyber-light/20">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-cyber-text/70 uppercase tracking-wider">Endpoint ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-cyber-text/70 uppercase tracking-wider">Last Seen</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-cyber-text/70 uppercase tracking-wider">Event Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyber-light/10">
                    {userData.endpoints.map((endpoint, index) => (
                      <tr 
                        key={endpoint.endpoint_id || index}
                        className="hover:bg-cyber-light/10 cursor-pointer transition-colors"
                        onClick={() => handleEndpointClick(endpoint)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <FiServer className="text-cyber-blue mr-2" />
                            <div>
                              <div className="text-sm text-cyber-text">{endpoint.endpoint_id.substring(0, 8)}...</div>
                              <div className="text-xs text-cyber-text/50">{endpoint.endpoint_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-cyber-text">{formatTimeAgo(endpoint.last_seen)}</div>
                          <div className="text-xs text-cyber-text/50">{formatDateTime(endpoint.last_seen)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-cyber-text">{endpoint.event_count}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 text-cyber-text/50">
                No endpoints associated with this user
              </div>
            )}
          </motion.div>
        </div>
      )}
      
      {activeTab === 'events' && (
        <div className="cyber-card">
          <DataTable 
            columns={eventColumns}
            data={userData?.events || []}
            isLoading={isLoading}
            emptyMessage="No events found for this user"
          />
        </div>
      )}
      
      {activeTab === 'endpoints' && (
        <div className="cyber-card">
          <DataTable 
            columns={endpointColumns}
            data={userData?.endpoints || []}
            isLoading={isLoading}
            onRowClick={handleEndpointClick}
            emptyMessage="No endpoints associated with this user"
          />
        </div>
      )}
      
      {activeTab === 'detections' && (
        <div className="cyber-card">
          <DataTable 
            columns={detectionColumns}
            data={userData?.detections || []}
            isLoading={isLoading}
            emptyMessage="No security alerts found for this user"
          />
        </div>
      )}
    </div>
  );
};

export default UserDetails; 