import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const StatCard = ({ 
  title, 
  value, 
  icon, 
  color = 'cyber-blue', 
  change, 
  link,
  glowing = false,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`cyber-card relative overflow-hidden ${
        glowing ? `shadow-${color} border-${color}` : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-cyber-text/60 text-sm font-medium mb-1">{title}</h3>
          <div className="text-2xl font-mono font-bold text-cyber-text">
            {value || '0'}
          </div>
          
          {change && (
            <div className={`text-xs mt-2 ${
              change > 0 ? 'text-cyber-green' : change < 0 ? 'text-cyber-red' : 'text-cyber-text/60'
            }`}>
              {change > 0 ? '↑' : change < 0 ? '↓' : '•'} {Math.abs(change)}% from previous
            </div>
          )}
        </div>
        
        {icon && (
          <div className={`p-2 rounded-md bg-${color}/10 text-${color}`}>
            {icon}
          </div>
        )}
      </div>
      
      {link && (
        <Link 
          to={link}
          className={`absolute bottom-2 right-2 text-xs text-${color} hover:underline`}
        >
          View all →
        </Link>
      )}
      
      {/* Decorative background element */}
      <div 
        className={`absolute -right-8 -bottom-8 w-24 h-24 rounded-full bg-gradient-to-r from-${color}/0 to-${color}/10 blur-xl`}
      />
    </motion.div>
  );
};

export default StatCard; 