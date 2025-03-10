import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiShield, FiFilter, FiX, FiRefreshCw, FiDownload, FiDatabase } from 'react-icons/fi';

import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import SeverityBadge from '../components/SeverityBadge';

import { DetectionsService } from '../utils/api';
import { formatDateTime } from '../utils/helpers';

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
    setSelectedDetection(detection);
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
      
      {/* Detections List and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DataTable 
            columns={columns}
            data={detections}
            isLoading={isLoading}
            onRowClick={handleRowClick}
            selectedRow={selectedDetection}
            emptyMessage={
              <div className="text-center py-8">
                <FiDatabase size={48} className="mx-auto text-cyber-gray mb-4" />
                <h3 className="text-lg font-medium text-cyber-text mb-2">No detections found</h3>
                <p className="text-cyber-text/70">Try adjusting your filters or check back later</p>
              </div>
            }
            className="cyber-card"
          />
        </div>
        
        {/* Detection Details */}
        <div>
          <div className="cyber-card h-full">
            {selectedDetection ? (
              <div>
                <h3 className="text-lg font-medium text-cyber-text mb-4">Detection Details</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Severity</h4>
                    <SeverityBadge severity={selectedDetection.severity} />
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Timestamp</h4>
                    <p className="text-cyber-text">{formatDateTime(selectedDetection.timestamp)}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Rule</h4>
                    <p className="text-cyber-text">{formatRuleId(selectedDetection.rule_id)}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Endpoint</h4>
                    <p className="text-xs text-cyber-text/90">{selectedDetection.endpoint_id}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Description</h4>
                    <p className="text-cyber-text">{selectedDetection.description || 'No description available'}</p>
                  </div>
                  
                  {selectedDetection.event_ids && (
                    <div>
                      <h4 className="text-sm font-medium text-cyber-text/70 mb-1">Related Events</h4>
                      <p className="text-xs text-cyber-text break-all font-mono bg-cyber-black/40 p-2 rounded">
                        {selectedDetection.event_ids}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <FiShield size={48} className="text-cyber-gray mb-4" />
                <h3 className="text-lg font-medium text-cyber-text mb-2">No detection selected</h3>
                <p className="text-cyber-text/70 text-center">Select a detection from the table to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Detections; 