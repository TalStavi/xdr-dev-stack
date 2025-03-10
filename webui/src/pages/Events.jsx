import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiActivity, FiFilter, FiX, FiRefreshCw, FiDownload, FiDatabase } from 'react-icons/fi';

import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';

import { EventsService } from '../utils/api';
import { formatDateTime, getEventTypeIcon } from '../utils/helpers';

// Import all icon types we might need
import * as Icons from 'react-icons/fi';
import { MdOutlineMemory } from 'react-icons/md';

const Events = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [filters, setFilters] = useState({
    event_type: '',
    endpoint_id: '',
    username: '',
    from: '',
    to: '',
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLiveMode, setIsLiveMode] = useState(true);

  // Get URL params for direct linking
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const id = searchParams.get('id');
    
    if (id) {
      // Find and select the event with this ID
      const event = events.find(e => e.id === id);
      if (event) {
        setSelectedEvent(event);
      }
    }
  }, [location.search, events]);

  // Fetch events with filters
  useEffect(() => {
    const fetchEvents = async () => {
      setIsLoading(true);
      try {
        const data = await EventsService.getEvents(filters);
        setEvents(data);
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchEvents();
  }, [filters]);
  
  // Handle live events subscription
  useEffect(() => {
    let unsubscribe = null;
    
    if (isLiveMode) {
      unsubscribe = EventsService.subscribeToLiveEvents((liveEvents) => {
        if (liveEvents && liveEvents.length > 0) {
          setEvents(prevEvents => {
            // Mark new events with isNew flag and timestamp for animation
            const newEventsWithFlag = liveEvents.map(event => ({
              ...event,
              isNew: true,
              newTimestamp: Date.now()
            }));
            
            // Combine new events with existing ones and remove duplicates
            const combinedEvents = [...newEventsWithFlag, ...prevEvents];
            return Array.from(new Map(combinedEvents.map(event => [event.id, event])).values());
          });
        }
      });
    }
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isLiveMode]);

  // Clear "new" flag after animation time
  useEffect(() => {
    const clearNewFlags = () => {
      if (events.some(e => e.isNew)) {
        setEvents(prevEvents => 
          prevEvents.map(event => {
            // Remove isNew flag after 4 seconds
            if (event.isNew && Date.now() - event.newTimestamp > 4000) {
              const { isNew, newTimestamp, ...rest } = event;
              return rest;
            }
            return event;
          })
        );
      }
    };

    const interval = setInterval(clearNewFlags, 1000);
    return () => clearInterval(interval);
  }, [events]);

  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      event_type: '',
      endpoint_id: '',
      username: '',
      from: '',
      to: '',
    });
  };
  
  // Toggle live mode
  const toggleLiveMode = () => {
    setIsLiveMode(prev => !prev);
  };
  
  // Refresh data manually
  const refreshData = async () => {
    setIsLoading(true);
    try {
      const data = await EventsService.getEvents(filters);
      setEvents(data);
    } catch (error) {
      console.error('Error refreshing events:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle row click
  const handleRowClick = (event) => {
    setSelectedEvent(event);
  };

  // Export data as CSV
  const exportCSV = () => {
    if (!events.length) return;
    
    const headers = Object.keys(events[0]).join(',');
    const rows = events.map(event => Object.values(event).map(value => {
      // Handle values with commas by wrapping in quotes
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value;
    }).join(','));
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

  // Table columns
  const columns = [
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
          <span>{row.event_type}</span>
        </div>
      ),
    },
    {
      key: 'endpoint_id',
      label: 'Endpoint',
      sortable: true,
      render: (row) => (
        <div>
          <div className="text-sm text-cyber-text">{row.hostname || 'Unknown'}</div>
          <div className="text-xs text-cyber-text/50">{row.endpoint_id?.substring(0, 8) || 'Unknown'}</div>
        </div>
      ),
    },
    {
      key: 'user',
      label: 'User',
      sortable: true,
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

  return (
    <div>
      <PageHeader
        title="Security Events"
        icon={<FiActivity size={24} />}
        description="Browse and analyze security events from all endpoints"
        actions={
          <div className="flex space-x-2">
            <button 
              onClick={toggleLiveMode}
              className={`cyber-button-sm ${isLiveMode ? 'cyber-button-active' : ''}`}
              title={isLiveMode ? 'Disable live updates' : 'Enable live updates'}
            >
              <FiRefreshCw size={16} className={isLiveMode ? 'animate-spin' : ''} />
              <span className="ml-1">{isLiveMode ? 'Live Mode On' : 'Live Mode Off'}</span>
            </button>
            <button 
              onClick={refreshData}
              className="cyber-button-sm"
              disabled={isLoading}
              title="Refresh data"
            >
              <FiRefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              <span className="ml-1">Refresh</span>
            </button>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`cyber-button-sm ${showFilters ? 'cyber-button-active' : ''}`}
              title="Toggle filters"
            >
              <FiFilter size={16} />
              <span className="ml-1">Filters</span>
            </button>
            <button 
              onClick={exportCSV}
              className="cyber-button-sm"
              disabled={!events.length}
              title="Export as CSV"
            >
              <FiDownload size={16} />
              <span className="ml-1">Export</span>
            </button>
          </div>
        }
      />
      
      {/* Filters */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="cyber-card mb-6"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-cyber-text">Filters</h3>
            <button 
              onClick={clearFilters}
              className="cyber-button-sm"
              title="Clear all filters"
            >
              <FiX size={16} />
              <span className="ml-1">Clear</span>
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-cyber-text mb-1">Event Type</label>
              <select
                name="event_type"
                value={filters.event_type}
                onChange={handleFilterChange}
                className="cyber-input w-full"
              >
                <option value="">All Types</option>
                <option value="process_start">Process Start</option>
                <option value="file_access">File Access</option>
                <option value="network_connection">Network Connection</option>
                <option value="registry_change">Registry Change</option>
                <option value="login">Login</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-cyber-text mb-1">Endpoint ID</label>
              <input
                type="text"
                name="endpoint_id"
                value={filters.endpoint_id}
                onChange={handleFilterChange}
                placeholder="Enter endpoint ID"
                className="cyber-input w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-cyber-text mb-1">Username</label>
              <input
                type="text"
                name="username"
                value={filters.username}
                onChange={handleFilterChange}
                placeholder="Enter username"
                className="cyber-input w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-cyber-text mb-1">From Date</label>
              <input
                type="datetime-local"
                name="from"
                value={filters.from}
                onChange={handleFilterChange}
                className="cyber-input w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-cyber-text mb-1">To Date</label>
              <input
                type="datetime-local"
                name="to"
                value={filters.to}
                onChange={handleFilterChange}
                className="cyber-input w-full"
              />
            </div>
          </div>
        </motion.div>
      )}
      
      {/* Events Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DataTable 
            columns={columns}
            data={events}
            isLoading={isLoading}
            onRowClick={handleRowClick}
            selectedRow={selectedEvent}
            emptyMessage={
              <div className="text-center py-8">
                <FiDatabase size={48} className="mx-auto text-cyber-gray mb-4" />
                <h3 className="text-lg font-medium text-cyber-text mb-2">No events found</h3>
                <p className="text-cyber-text/70">Try adjusting your filters or check back later</p>
              </div>
            }
            className="cyber-card"
          />
        </div>
        
        {/* Event Details */}
        <div>
          <div className="cyber-card h-full">
            {selectedEvent ? (
              <div>
                <h3 className="text-lg font-medium text-cyber-text mb-4">Event Details</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Event Type</h4>
                    <div className="flex items-center">
                      <span className="mr-2 text-cyber-blue">{getIconComponent(selectedEvent.event_type)}</span>
                      <span className="text-cyber-text">{selectedEvent.event_type}</span>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Timestamp</h4>
                    <p className="text-cyber-text">{formatDateTime(selectedEvent.timestamp)}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Endpoint</h4>
                    <p className="text-cyber-text">{selectedEvent.hostname || 'Unknown'}</p>
                    <p className="text-xs text-cyber-text/50">{selectedEvent.endpoint_id}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-cyber-text/70 mb-1">User</h4>
                    <p className="text-cyber-text">{selectedEvent.user || 'Unknown'}</p>
                  </div>
                  
                  {selectedEvent.process_name && (
                    <div>
                      <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Process</h4>
                      <p className="text-cyber-text">{selectedEvent.process_name}</p>
                    </div>
                  )}
                  
                  {selectedEvent.status && (
                    <div>
                      <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Status</h4>
                      <span className={`px-2 py-1 rounded text-xs ${
                        selectedEvent.status === 'success' ? 'bg-green-900/30 text-green-400' :
                        selectedEvent.status === 'failure' ? 'bg-red-900/30 text-red-400' :
                        'bg-gray-900/30 text-gray-400'
                      }`}>
                        {selectedEvent.status}
                      </span>
                    </div>
                  )}
                  
                  {/* Additional fields based on event type */}
                  {selectedEvent.source_ip && (
                    <div>
                      <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Source IP</h4>
                      <p className="text-cyber-text">{selectedEvent.source_ip}</p>
                    </div>
                  )}
                  
                  {selectedEvent.destination_ip && (
                    <div>
                      <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Destination IP</h4>
                      <p className="text-cyber-text">{selectedEvent.destination_ip}</p>
                    </div>
                  )}
                  
                  {selectedEvent.direction && (
                    <div>
                      <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Direction</h4>
                      <p className="text-cyber-text">{selectedEvent.direction}</p>
                    </div>
                  )}
                  
                  {selectedEvent.bytes && (
                    <div>
                      <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Bytes</h4>
                      <p className="text-cyber-text">{selectedEvent.bytes.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <FiActivity size={48} className="text-cyber-gray mb-4" />
                <h3 className="text-lg font-medium text-cyber-text mb-2">No event selected</h3>
                <p className="text-cyber-text/70 text-center">Select an event from the table to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Events; 