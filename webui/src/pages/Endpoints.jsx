import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiServer, FiSearch, FiRefreshCw, FiClock, FiActivity, FiDatabase } from 'react-icons/fi';

import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';

import { EndpointsService } from '../utils/api';
import { formatDateTime, formatTimeAgo } from '../utils/helpers';

const Endpoints = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [endpoints, setEndpoints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch endpoints
  useEffect(() => {
    const fetchEndpoints = async () => {
      setIsLoading(true);
      try {
        const data = await EndpointsService.getEndpoints();
        setEndpoints(data);
      } catch (error) {
        console.error('Error fetching endpoints:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchEndpoints();
  }, []);
  
  // Refresh data manually
  const refreshData = async () => {
    setIsLoading(true);
    try {
      const data = await EndpointsService.getEndpoints();
      setEndpoints(data);
    } catch (error) {
      console.error('Error refreshing endpoints:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Filter endpoints by search term
  const filteredEndpoints = searchTerm ? 
    endpoints.filter(endpoint => 
      endpoint.endpoint_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      endpoint.user?.toLowerCase().includes(searchTerm.toLowerCase())
    ) : 
    endpoints;
  
  // Handle row click
  const handleRowClick = (endpoint) => {
    navigate(`/endpoints/${endpoint.endpoint_id}`);
  };
  
  // Table columns
  const columns = [
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
            <div className="text-xs text-cyber-text/60">{row.endpoint_id}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'user',
      label: 'User',
      sortable: true,
      render: (row) => (
        <div className="text-sm text-cyber-text">{row.user || 'Unknown'}</div>
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

  return (
    <div>
      <PageHeader
        title="Endpoints"
        icon={<FiServer size={24} />}
        description="Monitored endpoints in your environment"
        actions={
          <div className="flex space-x-2">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyber-text/60" />
              <input
                type="text"
                placeholder="Search endpoints..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="cyber-input pl-9 w-60"
              />
            </div>
            <button 
              onClick={refreshData}
              className="cyber-button-sm"
              disabled={isLoading}
              title="Refresh data"
            >
              <FiRefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              <span className="ml-1">Refresh</span>
            </button>
          </div>
        }
      />
      
      {/* Endpoint Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="cyber-card flex items-center"
        >
          <div className="w-12 h-12 bg-cyber-blue/20 rounded-full flex items-center justify-center mr-4">
            <FiServer size={24} className="text-cyber-blue" />
          </div>
          <div>
            <div className="text-sm text-cyber-text/70">Total Endpoints</div>
            <div className="text-2xl font-medium text-cyber-text">{endpoints.length}</div>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="cyber-card flex items-center"
        >
          <div className="w-12 h-12 bg-cyber-green/20 rounded-full flex items-center justify-center mr-4">
            <FiClock size={24} className="text-cyber-green" />
          </div>
          <div>
            <div className="text-sm text-cyber-text/70">Active Today</div>
            <div className="text-2xl font-medium text-cyber-text">
              {endpoints.filter(endpoint => {
                const lastSeen = new Date(endpoint.last_seen);
                const today = new Date();
                return lastSeen.toDateString() === today.toDateString();
              }).length}
            </div>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="cyber-card flex items-center"
        >
          <div className="w-12 h-12 bg-cyber-purple/20 rounded-full flex items-center justify-center mr-4">
            <FiActivity size={24} className="text-cyber-purple" />
          </div>
          <div>
            <div className="text-sm text-cyber-text/70">Total Events</div>
            <div className="text-2xl font-medium text-cyber-text">
              {endpoints.reduce((total, endpoint) => total + (endpoint.event_count || 0), 0).toLocaleString()}
            </div>
          </div>
        </motion.div>
      </div>
      
      {/* Endpoints Table */}
      <div className="cyber-card">
        <DataTable 
          columns={columns}
          data={filteredEndpoints}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          emptyMessage={
            searchTerm ? 
              "No endpoints match your search" : 
              "No endpoints found in your environment"
          }
        />
      </div>
    </div>
  );
};

export default Endpoints; 