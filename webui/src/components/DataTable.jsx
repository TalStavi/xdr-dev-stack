import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiChevronDown, FiChevronUp, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { formatDateTime, formatTimeAgo } from '../utils/helpers';

const DataTable = ({ 
  data, 
  columns, 
  isLoading = false,
  isPaginated = true,
  pageSize = 10,
  emptyMessage = 'No data available',
  onRowClick = null,
}) => {
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'asc'
  });
  const [currentPage, setCurrentPage] = useState(1);

  // Handle sorting
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Sorted and paginated data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;
    
    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      
      // Handle date sorting
      if (sortConfig.key === 'timestamp' || sortConfig.key === 'lastSeen') {
        return sortConfig.direction === 'asc'
          ? new Date(aValue) - new Date(bValue)
          : new Date(bValue) - new Date(aValue);
      }
      
      // Handle string sorting
      if (typeof aValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      // Handle number sorting
      return sortConfig.direction === 'asc'
        ? aValue - bValue
        : bValue - aValue;
    });
  }, [data, sortConfig]);

  // Pagination
  const totalPages = isPaginated ? Math.ceil(sortedData.length / pageSize) : 1;
  const paginatedData = isPaginated
    ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedData;

  // Empty state
  if (!isLoading && data.length === 0) {
    return (
      <div className="cyber-card flex items-center justify-center py-12">
        <p className="text-cyber-text/60">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden cyber-card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cyber-light/20">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-cyber-text/70 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:text-cyber-blue' : ''
                  }`}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.label}</span>
                    {column.sortable && (
                      <span className="text-cyber-text/50">
                        {sortConfig.key === column.key ? (
                          sortConfig.direction === 'asc' ? (
                            <FiChevronUp size={14} />
                          ) : (
                            <FiChevronDown size={14} />
                          )
                        ) : (
                          <FiChevronDown size={14} className="opacity-30" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-cyber-light/10">
            {isLoading ? (
              // Loading state
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`loading-${index}`}>
                  {columns.map((column, colIndex) => (
                    <td key={`loading-${index}-${colIndex}`} className="px-4 py-3">
                      <div className="h-4 bg-cyber-light/20 rounded animate-pulse"></div>
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              // Data rows
              paginatedData.map((row, rowIndex) => (
                <motion.tr
                  key={row.id || rowIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: rowIndex * 0.05 }}
                  className={`hover:bg-cyber-light/10 ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${row.isNew ? 'new-event-row' : ''}`}
                  onClick={() => onRowClick && onRowClick(row)}
                >
                  {columns.map((column) => (
                    <td 
                      key={`${row.id || rowIndex}-${column.key}`} 
                      className={`px-4 py-3 ${row.isNew ? 'new-event-cell' : ''}`}
                    >
                      {column.render ? (
                        column.render(row)
                      ) : column.key.includes('time') || column.key.includes('date') ? (
                        <>
                          <div className="text-sm text-cyber-text">{formatDateTime(row[column.key])}</div>
                          <div className="text-xs text-cyber-text/50">{formatTimeAgo(row[column.key])}</div>
                        </>
                      ) : (
                        <div className="text-sm text-cyber-text">{row[column.key]}</div>
                      )}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {isPaginated && totalPages > 1 && (
        <div className="px-4 py-3 flex items-center justify-between border-t border-cyber-light/20">
          <div className="text-xs text-cyber-text/60">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length} results
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className={`cyber-button p-1 ${
                currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <FiChevronLeft size={16} />
            </button>
            
            <span className="text-sm text-cyber-text">{currentPage} / {totalPages}</span>
            
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className={`cyber-button p-1 ${
                currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <FiChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable; 