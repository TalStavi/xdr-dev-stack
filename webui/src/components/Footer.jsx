import React from 'react';
import { Link } from 'react-router-dom';
import { FiGithub, FiExternalLink } from 'react-icons/fi';

const Footer = () => {
  return (
    <footer className="w-full py-6 px-4 mt-auto border-t border-cyber-light/20">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded overflow-hidden border border-cyber-blue flex items-center justify-center">
                <span className="text-cyber-blue font-bold text-sm">X</span>
              </div>
              <span className="text-cyber-text font-mono text-sm">
                XDR Security Dashboard
              </span>
            </div>
            <p className="text-sm text-cyber-text/60 mt-1">
              &copy; {new Date().getFullYear()} XDR Security. All rights reserved.
            </p>
          </div>
          
          <div className="flex flex-wrap justify-center md:justify-end gap-4">
            <Link to="/" className="text-cyber-text hover:text-cyber-blue text-sm transition">
              Dashboard
            </Link>
            <Link to="/detections" className="text-cyber-text hover:text-cyber-blue text-sm transition">
              Detections
            </Link>
            <Link to="/events" className="text-cyber-text hover:text-cyber-blue text-sm transition">
              Events
            </Link>
            <Link to="/endpoints" className="text-cyber-text hover:text-cyber-blue text-sm transition">
              Endpoints
            </Link>
          </div>
          
          <div className="mt-4 md:mt-0 flex items-center space-x-4">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyber-text hover:text-cyber-blue transition"
            >
              <FiGithub size={18} />
            </a>
            <a
              href="https://example.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyber-text hover:text-cyber-blue transition"
            >
              <FiExternalLink size={18} />
            </a>
          </div>
        </div>
        
        <div className="mt-6 text-center text-xs text-cyber-text/40">
          <p>Advanced security monitoring and threat detection</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 