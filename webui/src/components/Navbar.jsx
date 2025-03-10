import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiActivity, FiShield, FiServer, FiUsers, FiMenu, FiX } from 'react-icons/fi';
import { motion } from 'framer-motion';

const Navbar = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Navigation links
  const navLinks = [
    { name: 'Dashboard', path: '/', icon: <FiActivity /> },
    { name: 'Detections', path: '/detections', icon: <FiShield /> },
    { name: 'Events', path: '/events', icon: <FiActivity /> },
    { name: 'Endpoints', path: '/endpoints', icon: <FiServer /> },
    { name: 'Users', path: '/users', icon: <FiUsers /> },
  ];

  // Close mobile menu when location changes
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  return (
    <header 
      className={`sticky top-0 z-50 w-full ${
        scrolled ? 'backdrop-blur-md bg-cyber-black/80 border-b border-cyber-light/20' : 'bg-transparent'
      } transition-all duration-300`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-md overflow-hidden border border-cyber-blue shadow-neon-blue flex items-center justify-center">
              <div className="text-cyber-blue font-bold text-xl">X</div>
            </div>
            <div className="font-mono font-bold text-lg">
              <span className="text-cyber-blue">XDR</span>
              <span className="text-cyber-text">Security</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex md:items-center md:justify-between md:space-x-4">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`flex items-center px-3 py-2 rounded-md text-sm transition-all duration-300 ${
                  location.pathname === link.path
                    ? 'text-cyber-blue font-semibold shadow-neon-blue border border-cyber-blue'
                    : 'text-cyber-text hover:text-cyber-blue'
                }`}
              >
                <span className="mr-1">{link.icon}</span>
                {link.name}
                {location.pathname === link.path && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-md -z-10"
                    transition={{ type: 'spring', duration: 0.6 }}
                  />
                )}
              </Link>
            ))}
          </nav>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-md text-cyber-text hover:text-cyber-blue focus:outline-none"
            >
              {isOpen ? <FiX size={24} /> : <FiMenu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className="md:hidden p-4 bg-cyber-dark border-b border-cyber-light/20"
        >
          <nav className="flex flex-col space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`flex items-center px-3 py-3 rounded-md transition-all duration-300 ${
                  location.pathname === link.path
                    ? 'bg-cyber-light/20 text-cyber-blue font-semibold'
                    : 'text-cyber-text hover:bg-cyber-light/10 hover:text-cyber-blue'
                }`}
              >
                <span className="mr-2">{link.icon}</span>
                {link.name}
              </Link>
            ))}
          </nav>
        </motion.div>
      )}
    </header>
  );
};

export default Navbar; 