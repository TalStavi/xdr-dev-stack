import React from 'react';
import { motion } from 'framer-motion';

const PageHeader = ({ title, description, icon }) => {
  const variants = {
    hidden: { opacity: 0, y: -20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.5,
        ease: 'easeOut'
      }
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={variants}
      className="mb-8"
    >
      <div className="flex items-center space-x-2 mb-1">
        {icon && <span className="text-cyber-blue">{icon}</span>}
        <h1 className="text-2xl md:text-3xl font-bold text-cyber-text">{title}</h1>
      </div>
      
      {description && (
        <p className="text-cyber-text/70 max-w-2xl">{description}</p>
      )}
      
      <div className="mt-4 h-1 w-16 bg-gradient-to-r from-cyber-blue to-cyber-green rounded" />
    </motion.div>
  );
};

export default PageHeader; 