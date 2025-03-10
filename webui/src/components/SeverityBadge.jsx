import React from 'react';
import { getSeverityColor, getSeverityName } from '../utils/helpers';

const SeverityBadge = ({ severity, showLabel = true, size = 'md' }) => {
  const severityColor = getSeverityColor(severity);
  const severityName = getSeverityName(severity);
  
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };
  
  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };
  
  return (
    <div className="flex items-center space-x-1.5">
      <div className={`rounded-full bg-${severityColor} ${sizeClasses[size]} animate-pulse-slow`} />
      {showLabel && (
        <span className={`text-${severityColor} font-medium ${textSizeClasses[size]}`}>
          {severityName}
        </span>
      )}
    </div>
  );
};

export default SeverityBadge; 