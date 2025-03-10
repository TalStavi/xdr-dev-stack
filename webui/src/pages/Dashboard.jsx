import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiActivity, FiShield, FiServer, FiUsers, FiClock, FiAlertTriangle } from 'react-icons/fi';
import { Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import SeverityBadge from '../components/SeverityBadge';

import { DashboardService, EventsService, DetectionsService } from '../utils/api';
import { formatTimeAgo } from '../utils/helpers';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const Dashboard = () => {
  const navigate = useNavigate();
  
  // State for live data
  const [stats, setStats] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [recentDetections, setRecentDetections] = useState([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingDetections, setIsLoadingDetections] = useState(true);
  
  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const statsData = await DashboardService.getStats();
        setStats(statsData);
        setIsLoadingStats(false);
        
        const eventsData = await EventsService.getEvents({ limit: 5 });
        setRecentEvents(eventsData);
        setIsLoadingEvents(false);
        
        const detectionsData = await DetectionsService.getDetections({ limit: 5 });
        setRecentDetections(detectionsData);
        setIsLoadingDetections(false);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };
    
    fetchInitialData();
  }, []);
  
  // Subscribe to live updates
  useEffect(() => {
    // Subscribe to live dashboard stats
    const unsubscribeStats = DashboardService.subscribeToLiveStats((liveStats) => {
      setStats(liveStats);
    });
    
    // Subscribe to live events
    const unsubscribeEvents = EventsService.subscribeToLiveEvents((liveEvents) => {
      // Only update if we have new events
      if (liveEvents && liveEvents.length > 0) {
        setRecentEvents(prevEvents => {
          // Combine new events with existing ones, remove duplicates, and take the first 5
          const combinedEvents = [...liveEvents, ...prevEvents];
          const uniqueEvents = Array.from(new Map(combinedEvents.map(event => [event.id, event])).values());
          return uniqueEvents.slice(0, 5);
        });
      }
    });
    
    // Subscribe to live detections
    const unsubscribeDetections = DetectionsService.subscribeToLiveDetections((liveDetections) => {
      // Only update if we have new detections
      if (liveDetections && liveDetections.length > 0) {
        setRecentDetections(prevDetections => {
          // Combine new detections with existing ones, remove duplicates, and take the first 5
          const combinedDetections = [...liveDetections, ...prevDetections];
          const uniqueDetections = Array.from(new Map(combinedDetections.map(detection => [detection.id, detection])).values());
          return uniqueDetections.slice(0, 5);
        });
      }
    });
    
    // Clean up subscriptions on unmount
    return () => {
      unsubscribeStats();
      unsubscribeEvents();
      unsubscribeDetections();
    };
  }, []);

  // Chart configs
  const severityChartData = {
    labels: ['Critical', 'High', 'Medium', 'Low'],
    datasets: [
      {
        data: stats?.severityDistribution?.map(item => item.count) || [0, 0, 0, 0],
        backgroundColor: [
          '#ff4040', // cyber-red
          '#ff7070', // lighter red
          '#ffcc00', // cyber-yellow
          '#00cc66', // cyber-green
        ],
        borderWidth: 0,
      },
    ],
  };
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#e0e0e0',
          font: {
            family: 'Inter',
          },
        },
      },
      tooltip: {
        backgroundColor: '#2a2a2a',
        titleColor: '#e0e0e0',
        bodyColor: '#e0e0e0',
        borderColor: '#3a3a3a',
        borderWidth: 1,
      },
    },
    cutout: '70%',
  };
  
  // Event columns
  const eventColumns = [
    { key: 'timestamp', label: 'Time', sortable: true },
    { 
      key: 'event_type', 
      label: 'Type', 
      sortable: true,
      render: (row) => (
        <div className="text-sm text-cyber-text">{row.event_type}</div>
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
  ];
  
  // Detection columns
  const detectionColumns = [
    { key: 'timestamp', label: 'Time', sortable: true },
    {
      key: 'severity',
      label: 'Severity',
      sortable: true,
      render: (row) => <SeverityBadge severity={row.severity} />,
    },
    { key: 'rule_id', label: 'Detection', sortable: true },
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
  ];

  return (
    <div>
      <PageHeader
        title="Security Dashboard"
        icon={<FiActivity size={24} />}
        description="Real-time monitoring of security events and detections"
      />
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="Events (24h)"
          value={stats?.eventCount?.toLocaleString() || '0'} 
          icon={<FiActivity size={20} />}
          link="/events"
        />
        <StatCard 
          title="Detections (24h)"
          value={stats?.detectionCount?.toLocaleString() || '0'}
          icon={<FiShield size={20} />}
          color="cyber-red"
          glowing={stats?.detectionCount > 0}
          link="/detections"
        />
        <StatCard 
          title="Active Endpoints"
          value="25" // placeholder value
          icon={<FiServer size={20} />}
          color="cyber-purple"
          link="/endpoints"
        />
        <StatCard 
          title="Active Users"
          value="12" // placeholder value
          icon={<FiUsers size={20} />}
          color="cyber-green"
          link="/users"
        />
      </div>
      
      {/* Charts & Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="cyber-card"
        >
          <h3 className="text-lg font-medium text-cyber-text mb-4">Detection Severity</h3>
          <div className="h-64">
            <Doughnut data={severityChartData} options={chartOptions} />
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="cyber-card"
        >
          <h3 className="text-lg font-medium text-cyber-text mb-4">Event Type Distribution</h3>
          <div className="space-y-4">
            {isLoadingStats ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-full h-8 bg-cyber-light/20 rounded animate-pulse"></div>
                ))}
              </div>
            ) : (
              stats?.eventTypeDistribution?.map((item, index) => (
                <div key={index} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-cyber-text">{item.event_type}</span>
                    <span className="text-cyber-text/70">{item.count}</span>
                  </div>
                  <div className="w-full bg-cyber-gray/30 rounded-full h-2">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.count / (Math.max(...stats.eventTypeDistribution.map(i => i.count)))) * 100}%` }}
                      transition={{ duration: 1, delay: index * 0.1 }}
                      className="bg-cyber-blue h-2 rounded-full"
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
      
      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-cyber-text">Recent Detections</h3>
            <Link to="/detections" className="text-sm text-cyber-blue hover:underline">View all</Link>
          </div>
          <DataTable 
            columns={detectionColumns}
            data={recentDetections}
            isLoading={isLoadingDetections}
            onRowClick={(row) => navigate(`/detections/${row.id}`)}
            emptyMessage="No recent detections"
            className="cyber-card"
          />
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-cyber-text">Recent Events</h3>
            <Link to="/events" className="text-sm text-cyber-blue hover:underline">View all</Link>
          </div>
          <DataTable 
            columns={eventColumns}
            data={recentEvents}
            isLoading={isLoadingEvents}
            onRowClick={(row) => navigate(`/events/${row.id}`)}
            emptyMessage="No recent events"
            className="cyber-card"
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 