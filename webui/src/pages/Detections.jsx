import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiShield, FiFilter, FiX, FiRefreshCw, FiDownload, FiDatabase, 
  FiClock, FiActivity, FiArrowRight, FiWifi, FiFile, FiUser,
  FiLogIn, FiSettings, FiGlobe, FiInfo, FiChevronRight, FiChevronDown
} from 'react-icons/fi';
import { MdOutlineMemory } from 'react-icons/md';

import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import SeverityBadge from '../components/SeverityBadge';

import { DetectionsService } from '../utils/api';
import { formatDateTime, formatTimeAgo, getEventTypeIcon } from '../utils/helpers';

const Detections = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [filters, setFilters] = useState({
    severity: '',
    rule_id: '',
    endpoint_id: '',
    from: '',
    to: '',
  });
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [detections, setDetections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [activeEvent, setActiveEvent] = useState(null);

  // Get URL params for direct linking
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const id = searchParams.get('id');
    
    if (id) {
      // Find and select the detection with this ID
      const detection = detections.find(d => d.id === id);
      if (detection) {
        setSelectedDetection(detection);
      }
    }
  }, [location.search, detections]);

  // Fetch detections with filters
  useEffect(() => {
    const fetchDetections = async () => {
      setIsLoading(true);
      try {
        const data = await DetectionsService.getDetections(filters);
        setDetections(data);
      } catch (error) {
        console.error('Error fetching detections:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDetections();
  }, [filters]);
  
  // Handle live detections subscription
  useEffect(() => {
    let unsubscribe = null;
    
    if (isLiveMode) {
      unsubscribe = DetectionsService.subscribeToLiveDetections((liveDetections) => {
        if (liveDetections && liveDetections.length > 0) {
          setDetections(prevDetections => {
            // Mark new detections with isNew flag and timestamp for animation
            const newDetectionsWithFlag = liveDetections.map(detection => ({
              ...detection,
              isNew: true,
              newTimestamp: Date.now()
            }));
            
            // Combine new detections with existing ones and remove duplicates
            const combinedDetections = [...newDetectionsWithFlag, ...prevDetections];
            return Array.from(new Map(combinedDetections.map(detection => [detection.id, detection])).values());
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
      if (detections.some(d => d.isNew)) {
        setDetections(prevDetections => 
          prevDetections.map(detection => {
            // Remove isNew flag after 4 seconds
            if (detection.isNew && Date.now() - detection.newTimestamp > 4000) {
              const { isNew, newTimestamp, ...rest } = detection;
              return rest;
            }
            return detection;
          })
        );
      }
    };

    const interval = setInterval(clearNewFlags, 1000);
    return () => clearInterval(interval);
  }, [detections]);

  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      severity: '',
      rule_id: '',
      endpoint_id: '',
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
      const data = await DetectionsService.getDetections(filters);
      setDetections(data);
    } catch (error) {
      console.error('Error refreshing detections:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle row click
  const handleRowClick = (detection) => {
    console.log('Row clicked:', detection);
    setSelectedDetection(detection);
    // Reset activeEvent when selecting a new detection
    setActiveEvent(null);
  };

  // Export data as CSV
  const exportCSV = () => {
    if (!detections.length) return;
    
    const headers = Object.keys(detections[0]).join(',');
    const rows = detections.map(detection => Object.values(detection).map(value => {
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
    a.download = `detections-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

  // Table columns
  const columns = [
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
      key: 'endpoint_id',
      label: 'Endpoint',
      sortable: true,
      render: (row) => (
        <div>
          <div className="text-sm text-cyber-text">{row.endpoint_id?.substring(0, 8) || 'Unknown'}</div>
        </div>
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

  // Helper to get the icon component
  const getIconComponent = (eventType) => {
    const iconName = getEventTypeIcon(eventType);
    
    if (iconName === 'MdOutlineMemory') {
      return <MdOutlineMemory size={18} />;
    }
    
    switch(iconName) {
      case 'FiWifi':
        return <FiWifi size={18} />;
      case 'FiFile':
        return <FiFile size={18} />;
      case 'FiLogIn':
        return <FiLogIn size={18} />;
      case 'FiDatabase':
        return <FiDatabase size={18} />;
      case 'FiUser':
        return <FiUser size={18} />;
      case 'FiSettings':
        return <FiSettings size={18} />;
      case 'FiGlobe':
        return <FiGlobe size={18} />;
      default:
        return <FiActivity size={18} />;
    }
  };

  // Handle event click in timeline
  const handleEventClick = (event) => {
    setActiveEvent(event);
    // You could also navigate to the event in the events page
    navigate(`/events?id=${event.id}`);
  };

  // Create a timeline component to display events
  const EventTimeline = ({ events }) => {
    if (!events || events.length === 0) return null;

    // Sort events by timestamp
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    return (
      <div className="mt-2 relative py-6">
        <div className="flex flex-col space-y-8">
          {sortedEvents.map((event, index) => {
            const isLastEvent = index === sortedEvents.length - 1;
            
            return (
              <div key={event.id || index} className="relative">
                <motion.div 
                  className="flex items-start space-x-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  {/* Event node */}
                  <div className="relative">
                    <motion.div 
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg
                        ${activeEvent?.id === event.id 
                          ? 'bg-cyber-blue shadow-neon-blue' 
                          : 'bg-cyber-black border border-cyber-blue hover:bg-cyber-blue/20'}`}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleEventClick(event)}
                    >
                      <span className="text-cyber-text">
                        {getIconComponent(event.event_type)}
                      </span>
                    </motion.div>

                    {/* Animated connecting arrow */}
                    {!isLastEvent && (
                      <div className="absolute left-4 top-8 w-[2px] h-[calc(100%+24px)] overflow-hidden">
                        <motion.div 
                          className="w-full h-full bg-gradient-to-b from-cyber-blue via-cyber-green to-cyber-blue"
                          initial={{ y: "-100%" }}
                          animate={{ y: "100%" }}
                          transition={{ 
                            duration: 2,
                            repeat: Infinity,
                            ease: "linear"
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Event details card */}
                  <motion.div 
                    className={`flex-1 p-2 bg-cyber-black/80 border rounded-lg shadow-lg
                      ${activeEvent?.id === event.id 
                        ? 'border-cyber-blue shadow-neon-blue' 
                        : 'border-cyber-light/20 hover:border-cyber-blue/50'}`}
                    whileHover={{ x: 5 }}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center text-cyber-blue">
                        <span className="text-xs font-medium">{event.event_type}</span>
                      </div>
                      <div className="text-[10px] text-cyber-text/70">
                        {formatTimeAgo(event.timestamp)}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-cyber-text/90">
                      {event.user && <div><span className="text-cyber-text/70">User:</span> {event.user}</div>}
                      {event.process_name && (
                        <div className="truncate">
                          <span className="text-cyber-text/70">Process:</span> 
                          <span className="font-mono">{event.process_name}</span>
                        </div>
                      )}
                      {event.source_ip && <div><span className="text-cyber-text/70">From:</span> {event.source_ip}</div>}
                      {event.destination_ip && <div><span className="text-cyber-text/70">To:</span> {event.destination_ip}</div>}
                      {event.status && (
                        <div>
                          <span className="text-cyber-text/70">Status:</span>
                          <span className={`ml-1 ${
                            event.status === 'success' ? 'text-green-400' :
                            event.status === 'failure' ? 'text-red-400' : ''
                          }`}>
                            {event.status}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* View details button */}
                    <motion.button
                      className="mt-1 text-cyber-blue text-[10px] flex items-center hover:text-cyber-green"
                      whileHover={{ x: 5 }}
                      onClick={() => handleEventClick(event)}
                    >
                      <span>View details</span>
                      <FiChevronRight className="ml-1" size={10} />
                    </motion.button>
                  </motion.div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Component for related events with improved styling and click navigation
  const RelatedEventsList = ({ events }) => {
    if (!events || events.length === 0) return <p className="text-cyber-text/70">No related events found</p>;
    
    const [expanded, setExpanded] = useState({});
    
    const toggleExpanded = (eventId) => {
      setExpanded(prev => ({
        ...prev,
        [eventId]: !prev[eventId]
      }));
    };
    
    return (
      <div className="space-y-3">
        {events.map((event, index) => (
          <motion.div 
            key={event.id || index} 
            className="bg-cyber-black/80 border border-cyber-light/10 rounded-md overflow-hidden cursor-pointer hover:border-cyber-blue/50 transition-colors duration-200"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            whileHover={{ x: 2 }}
            onClick={() => navigate(`/events?id=${event.id}`)}
          >
            <div 
              className="flex justify-between items-center p-3"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(event.id);
              }}
            >
              <div className="flex items-center">
                <span className="mr-2 text-cyber-blue">{getIconComponent(event.event_type)}</span>
                <div>
                  <div className="text-sm text-cyber-blue font-medium">{event.event_type}</div>
                  <div className="text-xs text-cyber-text/70">{formatDateTime(event.timestamp)}</div>
                </div>
              </div>
              <motion.div
                animate={{ rotate: expanded[event.id] ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <FiChevronDown className="text-cyber-text/70" />
              </motion.div>
            </div>
            
            <AnimatePresence>
              {expanded[event.id] && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="px-3 pb-3 border-t border-cyber-light/10"
                >
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                    <div><span className="text-cyber-text/70">User:</span> {event.user || 'N/A'}</div>
                    <div><span className="text-cyber-text/70">Process:</span> {event.process_name || 'N/A'}</div>
                    <div><span className="text-cyber-text/70">Status:</span> {event.status || 'N/A'}</div>
                    <div><span className="text-cyber-text/70">Direction:</span> {event.direction || 'N/A'}</div>
                    {event.source_ip && <div><span className="text-cyber-text/70">Source IP:</span> {event.source_ip}</div>}
                    {event.destination_ip && <div><span className="text-cyber-text/70">Destination IP:</span> {event.destination_ip}</div>}
                  </div>
                  <div className="mt-2 text-xs text-cyber-blue flex items-center">
                    <FiInfo size={12} className="mr-1" />
                    <span>Click to view in Events page</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Security Detections"
        icon={<FiShield size={24} />}
        description="Security alerts and threats detected in your environment"
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
              disabled={!detections.length}
              title="Export as CSV"
            >
              <FiDownload size={16} />
              <span className="ml-1">Export</span>
            </button>
          </div>
        }
      />
      
      {/* Filters */}
      <AnimatePresence>
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
                <label className="block text-sm font-medium text-cyber-text mb-1">Severity</label>
                <select
                  name="severity"
                  value={filters.severity}
                  onChange={handleFilterChange}
                  className="cyber-input w-full"
                >
                  <option value="">All Severities</option>
                  <option value="1">Critical (1)</option>
                  <option value="2">High (2)</option>
                  <option value="3">Medium (3)</option>
                  <option value="4">Low (4)</option>
                </select>
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
                <label className="block text-sm font-medium text-cyber-text mb-1">Rule ID</label>
                <input
                  type="text"
                  name="rule_id"
                  value={filters.rule_id}
                  onChange={handleFilterChange}
                  placeholder="Enter rule ID"
                  className="cyber-input w-full"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Detections List and Details */}
      <div className="flex flex-col gap-4">
        {/* Table Section */}
        <div className="w-full">
          <DataTable 
            columns={columns}
            data={detections}
            isLoading={isLoading}
            onRowClick={handleRowClick}
            selectedRow={selectedDetection}
            emptyMessage={
              <div className="text-center py-6">
                <FiDatabase size={40} className="mx-auto text-cyber-gray mb-3" />
                <h3 className="text-base font-medium text-cyber-text mb-1">No detections found</h3>
                <p className="text-xs text-cyber-text/70">Try adjusting your filters or check back later</p>
              </div>
            }
            className="cyber-card"
          />
        </div>
        
        {/* Detection Details */}
        {selectedDetection && (
          <motion.div 
            className="cyber-card p-3 w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-base font-medium text-cyber-text flex items-center">
                <FiShield size={16} className="text-cyber-blue mr-2" />
                Detection Details
              </h3>
              <SeverityBadge severity={selectedDetection.severity} size="sm" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div>
                  <h4 className="text-xs font-medium text-cyber-text/70">Timestamp</h4>
                  <p className="text-xs text-cyber-text">{formatDateTime(selectedDetection.timestamp)}</p>
                </div>
                
                <div>
                  <h4 className="text-xs font-medium text-cyber-text/70">Rule</h4>
                  <p className="text-xs text-cyber-text">{formatRuleId(selectedDetection.rule_id)}</p>
                </div>
                
                <div>
                  <h4 className="text-xs font-medium text-cyber-text/70">Endpoint</h4>
                  <p className="text-[11px] text-cyber-text/90 font-mono">{selectedDetection.endpoint_id}</p>
                </div>
              </div>
              
              <div className="md:col-span-2">
                <h4 className="text-xs font-medium text-cyber-text/70 mb-1">Description</h4>
                <motion.div 
                  className="bg-cyber-black/40 p-2 rounded border border-cyber-light/10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <p className="text-xs text-cyber-text">{selectedDetection.description || 'No description available'}</p>
                </motion.div>
              </div>
            </div>
            
            {selectedDetection.events && selectedDetection.events.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-medium text-cyber-text/70 mb-2 flex items-center">
                  <FiClock className="mr-2 text-cyber-blue" size={12} />
                  Event Timeline
                </h4>
                <div className="border border-cyber-light/10 rounded-md bg-cyber-black/40 p-3">
                  <EventTimeline events={selectedDetection.events} />
                </div>
                
                <div className="mt-4">
                  <h4 className="text-xs font-medium text-cyber-text/70 mb-2 flex items-center">
                    <FiActivity className="mr-2 text-cyber-blue" size={12} />
                    Related Events
                  </h4>
                  <div className="border border-cyber-light/10 rounded-md bg-cyber-black/40 p-3">
                    <RelatedEventsList events={selectedDetection.events} />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Detections; 