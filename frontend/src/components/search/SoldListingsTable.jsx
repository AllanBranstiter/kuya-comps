import { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import useSearchStore from '../../stores/searchStore';
import { formatMoney, escapeHtml, isMobileDevice, isIOSDevice } from '../../utils/searchUtils';

/**
 * Table displaying sold listings (comps)
 * 
 * Features:
 * - Sortable columns (Title, Price, Item ID)
 * - Links to eBay (uses deep_link for mobile)
 * - Row click to highlight
 * - Empty state when no results
 */
function SoldListingsTable({ className = '' }) {
  const { soldListings, loadingComps } = useSearchStore();
  
  // Sort state
  const [sortColumn, setSortColumn] = useState('price');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Selected row state
  const [selectedRow, setSelectedRow] = useState(null);

  // Handle column sort
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  }, [sortColumn]);

  // Sort and limit listings to 10 visible rows
  const sortedListings = useMemo(() => {
    if (!soldListings || soldListings.length === 0) return [];
    
    const sorted = [...soldListings].sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
        case 'price':
          comparison = (a.total_price || 0) - (b.total_price || 0);
          break;
        case 'item_id':
          comparison = (a.item_id || '').localeCompare(b.item_id || '');
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    // Return all sorted items for scrolling (CSS handles max-height)
    return sorted;
  }, [soldListings, sortColumn, sortDirection]);

  // Get sort indicator
  const getSortIndicator = (column) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  // Handle row click
  const handleRowClick = useCallback((itemId) => {
    setSelectedRow(prev => prev === itemId ? null : itemId);
  }, []);

  // Get link URL (deep link on mobile, regular on desktop)
  const getLinkUrl = (item) => {
    const isMobile = isMobileDevice();
    return (isMobile && item.deep_link) ? item.deep_link : item.link;
  };

  // Get link target attribute
  const getLinkTarget = () => {
    return isIOSDevice() ? '_self' : '_blank';
  };

  // Loading state
  if (loadingComps) {
    return (
      <div className={`listings-table-container ${className}`}>
        <h3 className="listings-table-title">Recently Sold Listings</h3>
        <div className="listings-table-loading">
          <div className="spinner spinner-md spinner-primary" role="status">
            <span className="visually-hidden">Loading sold listings...</span>
          </div>
          <span>Loading sold listings...</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (!soldListings || soldListings.length === 0) {
    return (
      <div className={`listings-table-container ${className}`}>
        <h3 className="listings-table-title">Recently Sold Listings</h3>
        <div className="listings-table-empty">
          <div className="listings-empty-icon">📭</div>
          <p className="listings-empty-text">No recently sold listings found</p>
          <p className="listings-empty-hint">Try adjusting your search terms or filters</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`listings-table-container ${className}`}>
      <p className="listings-table-count">
        {soldListings.length} results found
      </p>
      
      <div className="listings-table-wrapper">
        <table className="listings-table">
          <thead>
            <tr>
              <th 
                onClick={() => handleSort('title')}
                className="sortable-header"
                role="columnheader"
                aria-sort={sortColumn === 'title' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Title{getSortIndicator('title')}
              </th>
              <th 
                onClick={() => handleSort('price')}
                className="sortable-header"
                role="columnheader"
                aria-sort={sortColumn === 'price' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Price{getSortIndicator('price')}
              </th>
              <th 
                onClick={() => handleSort('item_id')}
                className="sortable-header"
                role="columnheader"
                aria-sort={sortColumn === 'item_id' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Item ID{getSortIndicator('item_id')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedListings.map((item) => (
              <tr 
                key={item.item_id}
                onClick={() => handleRowClick(item.item_id)}
                className={selectedRow === item.item_id ? 'row-selected' : ''}
              >
                <td className="listing-title-cell">
                  {escapeHtml(item.title)}
                </td>
                <td className="listing-price-cell">
                  {formatMoney(item.total_price)}
                </td>
                <td className="listing-id-cell">
                  <a 
                    href={getLinkUrl(item)}
                    target={getLinkTarget()}
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="listing-link"
                  >
                    {item.item_id}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

SoldListingsTable.propTypes = {
  className: PropTypes.string
};

export default SoldListingsTable;
