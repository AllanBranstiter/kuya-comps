import { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import useSearchStore from '../../stores/searchStore';
import { formatMoney, escapeHtml, getItemPrice, isMobileDevice, isIOSDevice } from '../../utils/searchUtils';

/**
 * Table displaying active listings
 * 
 * Features:
 * - "See All" toggle to show all listings or just below FMV
 * - Columns: Title, Price, Discount, Type, Item ID (link)
 * - Discount calculated from FMV: ((fmv - price) / fmv * 100)
 * - Color-coded discounts (green for positive, red for negative)
 * - Shows "Buy It Now" listings only
 * - Sortable columns
 * - Links to eBay (uses deep_link for mobile)
 */
function ActiveListingsTable({ className = '' }) {
  const { activeListings, fmv, loadingActive, getFilteredActiveListings } = useSearchStore();
  
  // Toggle for showing all vs filtered listings
  const [showAll, setShowAll] = useState(false);
  
  // Sort state
  const [sortColumn, setSortColumn] = useState('discount');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Selected row state
  const [selectedRow, setSelectedRow] = useState(null);

  // Get Market Value for discount calculation
  const marketValue = fmv?.marketValue || 0;

  // Filter listings based on showAll toggle
  const filteredListings = useMemo(() => {
    if (showAll) {
      return activeListings || [];
    }
    return getFilteredActiveListings();
  }, [activeListings, showAll, getFilteredActiveListings]);

  // Calculate discount percentage for a listing
  const calculateDiscount = useCallback((item) => {
    if (!marketValue || marketValue === 0) return 0;
    const price = getItemPrice(item);
    return ((marketValue - price) / marketValue) * 100;
  }, [marketValue]);

  // Handle column sort
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  }, [sortColumn]);

  // Sort listings
  const sortedListings = useMemo(() => {
    if (!filteredListings || filteredListings.length === 0) return [];
    
    const sorted = [...filteredListings].sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
        case 'price':
          comparison = getItemPrice(a) - getItemPrice(b);
          break;
        case 'discount':
          comparison = calculateDiscount(a) - calculateDiscount(b);
          break;
        case 'type':
          comparison = (a.buying_options?.[0] || '').localeCompare(b.buying_options?.[0] || '');
          break;
        case 'item_id':
          comparison = (a.item_id || '').localeCompare(b.item_id || '');
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [filteredListings, sortColumn, sortDirection, calculateDiscount]);

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

  // Format discount with sign and color class
  const formatDiscount = (discount) => {
    const sign = discount >= 0 ? '+' : '';
    const colorClass = discount >= 0 ? 'discount-positive' : 'discount-negative';
    return {
      text: `${sign}${discount.toFixed(1)}%`,
      colorClass
    };
  };

  // Get buying type label
  const getBuyingType = (item) => {
    if (!item.buying_options || item.buying_options.length === 0) {
      return 'Unknown';
    }
    const option = item.buying_options[0];
    if (option === 'FIXED_PRICE') return 'Buy It Now';
    if (option === 'AUCTION') return 'Auction';
    if (option === 'BEST_OFFER') return 'Best Offer';
    return option;
  };

  // Loading state
  if (loadingActive) {
    return (
      <div className={`listings-table-container ${className}`}>
        <h3 className="listings-table-title">Active BIN Listings Below Market Value</h3>
        <div className="listings-table-loading">
          <div className="spinner spinner-md spinner-primary" role="status">
            <span className="visually-hidden">Loading active listings...</span>
          </div>
          <span>Loading active listings...</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (!activeListings || activeListings.length === 0) {
    return (
      <div className={`listings-table-container ${className}`}>
        <h3 className="listings-table-title">Active BIN Listings Below Market Value</h3>
        <div className="listings-table-empty">
          <div className="listings-empty-icon">🛒</div>
          <p className="listings-empty-text">No active listings found</p>
          <p className="listings-empty-hint">Try adjusting your search terms or filters</p>
        </div>
      </div>
    );
  }

  // No filtered results state
  if (!showAll && sortedListings.length === 0) {
    return (
      <div className={`listings-table-container ${className}`}>
        <h3 className="listings-table-title">Active BIN Listings Below Market Value</h3>
        <div className="listings-table-controls">
          <label className="listings-toggle-label">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="listings-toggle-checkbox"
            />
            <span>See All ({activeListings.length} total)</span>
          </label>
        </div>
        <div className="listings-table-empty">
          <div className="listings-empty-icon">💰</div>
          <p className="listings-empty-text">No listings below Market Value</p>
          <p className="listings-empty-hint">Enable &quot;See All&quot; to view all active listings</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`listings-table-container ${className}`}>
      <h3 className="listings-table-title">Active BIN Listings Below Market Value</h3>
      
      <div className="listings-table-controls">
        <label className="listings-toggle-label">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="listings-toggle-checkbox"
          />
          <span>See All ({activeListings.length} total)</span>
        </label>
      </div>
      
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
                onClick={() => handleSort('discount')}
                className="sortable-header"
                role="columnheader"
                aria-sort={sortColumn === 'discount' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                Discount{getSortIndicator('discount')}
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
            {sortedListings.map((item) => {
              const discount = calculateDiscount(item);
              const { text: discountText, colorClass } = formatDiscount(discount);
              
              return (
                <tr
                  key={item.item_id}
                  onClick={() => handleRowClick(item.item_id)}
                  className={selectedRow === item.item_id ? 'row-selected' : ''}
                >
                  <td className="listing-title-cell">
                    {escapeHtml(item.title)}
                  </td>
                  <td className="listing-price-cell">
                    {formatMoney(getItemPrice(item))}
                  </td>
                  <td className={`listing-discount-cell ${colorClass}`}>
                    {marketValue > 0 ? discountText : 'N/A'}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

ActiveListingsTable.propTypes = {
  className: PropTypes.string
};

export default ActiveListingsTable;
