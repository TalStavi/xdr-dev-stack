import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiAlertTriangle, FiHome } from 'react-icons/fi';

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="cyber-card max-w-lg w-full p-8"
      >
        <div className="text-cyber-red mb-4">
          <FiAlertTriangle size={48} className="mx-auto" />
        </div>
        
        <h1 className="text-4xl font-mono font-bold mb-2 text-cyber-red glitch">
          404
        </h1>
        
        <h2 className="text-xl font-medium mb-4 text-cyber-text">
          System Breach Detected
        </h2>
        
        <p className="text-cyber-text/70 mb-6">
          The resource you're looking for has been moved, deleted, or never existed in the first place.
          Our security systems have logged this attempt.
        </p>
        
        <div className="font-mono text-xs text-cyber-green mb-6 bg-cyber-black/50 p-4 rounded-md text-left overflow-x-auto">
          <div>$ locate requested_resource</div>
          <div>ERROR: Access denied. Resource not found.</div>
          <div>$ system_scan --security</div>
          <div>Scanning system integrity...</div>
          <div>Security protocols intact.</div>
          <div>$ suggest_action</div>
          <div>Recommended action: Return to dashboard.</div>
        </div>
        
        <Link 
          to="/"
          className="cyber-button inline-flex items-center space-x-2 bg-cyber-blue hover:bg-cyber-blue/80 text-cyber-black"
        >
          <FiHome />
          <span>Return to Dashboard</span>
        </Link>
      </motion.div>
      
      {/* Matrix-like binary background */}
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-5 pointer-events-none">
        {Array.from({ length: 10 }).map((_, i) => (
          <div 
            key={i}
            className="absolute text-cyber-green font-mono text-xs"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              transform: `rotate(${Math.random() * 360}deg)`,
              opacity: Math.random() * 0.5 + 0.5,
            }}
          >
            {Array.from({ length: 20 }).map((_, j) => (
              <div key={j}>{Math.random() > 0.5 ? '1' : '0'}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotFound; 