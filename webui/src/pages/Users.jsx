import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiUsers, FiSearch, FiRefreshCw, FiUser, FiClock, FiActivity } from 'react-icons/fi';

import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';

import { UsersService } from '../utils/api';
import { formatDateTime, formatTimeAgo } from '../utils/helpers';

const Users = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const data = await UsersService.getUsers();
        setUsers(data);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUsers();
  }, []);
  
  // Refresh data manually
  const refreshData = async () => {
    setIsLoading(true);
    try {
      const data = await UsersService.getUsers();
      setUsers(data);
    } catch (error) {
      console.error('Error refreshing users:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Filter users by search term
  const filteredUsers = searchTerm ? 
    users.filter(user => 
      user.user?.toLowerCase().includes(searchTerm.toLowerCase())
    ) : 
    users;
  
  // Handle row click
  const handleRowClick = (user) => {
    navigate(`/users/${user.user}`);
  };
  
  // Table columns
  const columns = [
    {
      key: 'user',
      label: 'Username',
      sortable: true,
      render: (row) => (
        <div className="flex items-center">
          <div className="w-8 h-8 bg-cyber-gray rounded-full flex items-center justify-center mr-3">
            <FiUser className="text-cyber-blue" />
          </div>
          <span className="text-cyber-text">{row.user}</span>
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

  return (
    <div>
      <PageHeader
        title="Users"
        icon={<FiUsers size={24} />}
        description="Users active in your environment"
        actions={
          <div className="flex space-x-2">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyber-text/60" />
              <input
                type="text"
                placeholder="Search users..."
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
      
      {/* User Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="cyber-card flex items-center"
        >
          <div className="w-12 h-12 bg-cyber-blue/20 rounded-full flex items-center justify-center mr-4">
            <FiUsers size={24} className="text-cyber-blue" />
          </div>
          <div>
            <div className="text-sm text-cyber-text/70">Total Users</div>
            <div className="text-2xl font-medium text-cyber-text">{users.length}</div>
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
              {users.filter(user => {
                const lastSeen = new Date(user.last_seen);
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
              {users.reduce((total, user) => total + (user.event_count || 0), 0).toLocaleString()}
            </div>
          </div>
        </motion.div>
      </div>
      
      {/* Users Table */}
      <div className="cyber-card">
        <DataTable 
          columns={columns}
          data={filteredUsers}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          emptyMessage={
            searchTerm ? 
              "No users match your search" : 
              "No users found in your environment"
          }
        />
      </div>
    </div>
  );
};

export default Users; 