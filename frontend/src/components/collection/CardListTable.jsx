import { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * CardListTable - Table showing cards in a binder
 * 
 * @param {Object} props
 * @param {Array} props.cards - Array of card objects
 * @param {function} props.onEditCard - Handler for editing a card
 * @param {function} props.onDeleteCard - Handler for deleting a card
 * @param {function} props.onMoveCard - Handler for moving a card
 * @param {string} props.sortOption - Current sort option
 * @param {function} props.onSortChange - Handler for sort change
 * @param {boolean} props.loading - Loading state
 * @param {Array} props.allBinders - All binders for move dropdown
 * @param {string} props.currentBinderId - Current binder ID
 */
function CardListTable({
  cards = [],
  onEditCard,
  onDeleteCard,
  onMoveCard,
  sortOption = 'newest',
  onSortChange,
  loading = false,
  allBinders = [],
  currentBinderId
}) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [moveMenuCardId, setMoveMenuCardId] = useState(null);

  const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'az', label: 'A-Z (Athlete)' },
    { value: 'za', label: 'Z-A (Athlete)' },
    { value: 'value_high', label: 'Highest FMV' },
    { value: 'value_low', label: 'Lowest FMV' }
  ];

  const handleOptionsClick = (e, cardId) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === cardId ? null : cardId);
    setMoveMenuCardId(null);
  };

  const handleEdit = (card) => {
    setOpenMenuId(null);
    onEditCard?.(card);
  };

  const handleDelete = (card) => {
    setOpenMenuId(null);
    onDeleteCard?.(card);
  };

  const handleMoveClick = (cardId) => {
    setMoveMenuCardId(moveMenuCardId === cardId ? null : cardId);
  };

  const handleMoveSelect = (card, targetBinderId) => {
    setOpenMenuId(null);
    setMoveMenuCardId(null);
    onMoveCard?.(card, targetBinderId);
  };

  // Check if card FMV is stale (> 90 days old)
  const isStale = (lastUpdated) => {
    if (!lastUpdated) return false;
    const lastDate = new Date(lastUpdated);
    const now = new Date();
    const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
    return diffDays > 90;
  };

  // Format card display name
  const formatCardName = (card) => {
    const parts = [];
    if (card.year) parts.push(card.year);
    if (card.set_name) parts.push(card.set_name);
    if (card.athlete) parts.push(card.athlete);
    if (card.card_number) parts.push(`#${card.card_number}`);
    if (card.variation) parts.push(`(${card.variation})`);
    return parts.join(' ') || 'Unnamed Card';
  };

  // Format condition display
  const formatCondition = (card) => {
    if (card.grading_company && card.grade) {
      return `${card.grading_company} ${card.grade}`;
    }
    return 'Raw';
  };

  // Get condition badge class
  const getConditionClass = (card) => {
    if (!card.grading_company) return 'condition-badge condition-raw';
    
    const gradeNum = parseFloat(card.grade);
    
    if (gradeNum >= 9) return 'condition-badge condition-gem';
    if (gradeNum >= 7) return 'condition-badge condition-high';
    return 'condition-badge condition-low';
  };

  // Get status indicators
  const getStatusIndicators = (card) => {
    const indicators = [];
    
    if (card.review_required) {
      indicators.push({
        icon: '⚠️',
        text: card.review_reason || 'Review Required',
        className: 'status-warning'
      });
    }
    
    if (isStale(card.last_updated_at)) {
      indicators.push({
        icon: '🔄',
        text: 'FMV may be outdated',
        className: 'status-stale'
      });
    }
    
    if (card.auto_update) {
      indicators.push({
        icon: '✓',
        text: 'Auto-update enabled',
        className: 'status-auto'
      });
    }
    
    return indicators;
  };

  // Close menu when clicking outside
  const handleTableClick = () => {
    setOpenMenuId(null);
    setMoveMenuCardId(null);
  };

  if (cards.length === 0) {
    return (
      <div className="card-list-empty">
        <div className="card-list-empty-icon">🃏</div>
        <h4 className="card-list-empty-title">No Cards Yet</h4>
        <p className="card-list-empty-text">
          Add your first card to this binder to start tracking its value.
        </p>
      </div>
    );
  }

  return (
    <div className="card-list-container">
      {/* Sort Controls */}
      <div className="card-list-controls">
        <span className="card-list-count">{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
        <div className="sort-control">
          <label htmlFor="card-sort" className="sort-label">Sort:</label>
          <select
            id="card-sort"
            className="sort-select"
            value={sortOption}
            onChange={(e) => onSortChange?.(e.target.value)}
            disabled={loading}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cards Table */}
      <div className="card-list-table-wrapper" onClick={handleTableClick}>
        <table className="card-list-table" role="grid">
          <thead>
            <tr>
              <th scope="col" className="card-col-options">Options</th>
              <th scope="col" className="card-col-card">Card</th>
              <th scope="col" className="card-col-condition">Condition</th>
              <th scope="col" className="card-col-cost">Cost</th>
              <th scope="col" className="card-col-fmv">FMV</th>
              <th scope="col" className="card-col-status">Status</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => {
              const statusIndicators = getStatusIndicators(card);
              const otherBinders = allBinders.filter(b => b.id !== currentBinderId);
              
              return (
                <tr 
                  key={card.id} 
                  className={`card-row ${card.review_required ? 'card-row-warning' : ''}`}
                >
                  {/* Options Column */}
                  <td className="card-col-options">
                    <div className="card-options-wrapper">
                      <button
                        className="card-options-btn"
                        onClick={(e) => handleOptionsClick(e, card.id)}
                        aria-label="Card options"
                        aria-expanded={openMenuId === card.id}
                        aria-haspopup="menu"
                      >
                        <span className="dot"></span>
                        <span className="dot"></span>
                        <span className="dot"></span>
                      </button>
                      
                      {openMenuId === card.id && (
                        <div className="card-options-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                          <button 
                            className="card-menu-item" 
                            onClick={() => handleEdit(card)}
                            role="menuitem"
                          >
                            <span>✏️</span>
                            <span>Edit</span>
                          </button>
                          
                          {otherBinders.length > 0 && (
                            <div className="card-menu-item-group">
                              <button 
                                className="card-menu-item"
                                onClick={() => handleMoveClick(card.id)}
                                role="menuitem"
                                aria-expanded={moveMenuCardId === card.id}
                              >
                                <span>📁</span>
                                <span>Move to...</span>
                                <span className="menu-arrow">{moveMenuCardId === card.id ? '▾' : '▸'}</span>
                              </button>
                              
                              {moveMenuCardId === card.id && (
                                <div className="card-move-submenu">
                                  {otherBinders.map((binder) => (
                                    <button
                                      key={binder.id}
                                      className="card-submenu-item"
                                      onClick={() => handleMoveSelect(card, binder.id)}
                                      role="menuitem"
                                    >
                                      {binder.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          
                          <button 
                            className="card-menu-item card-menu-item-danger" 
                            onClick={() => handleDelete(card)}
                            role="menuitem"
                          >
                            <span>🗑️</span>
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Card Name Column */}
                  <td className="card-col-card">
                    <div className="card-name-wrapper">
                      <span className="card-name">{formatCardName(card)}</span>
                      {Array.isArray(card.tags) && card.tags.length > 0 && (
                        <div className="card-tags">
                          {card.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="card-tag">{tag}</span>
                          ))}
                          {card.tags.length > 3 && (
                            <span className="card-tag card-tag-more">+{card.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Condition Column */}
                  <td className="card-col-condition">
                    <span className={getConditionClass(card)}>
                      {formatCondition(card)}
                    </span>
                  </td>

                  {/* Cost Column */}
                  <td className="card-col-cost">
                    {card.purchase_price 
                      ? `$${parseFloat(card.purchase_price).toFixed(2)}`
                      : '—'
                    }
                  </td>

                  {/* FMV Column */}
                  <td className="card-col-fmv">
                    <div className="card-fmv-wrapper">
                      <span className="card-fmv">
                        {card.current_fmv 
                          ? `$${parseFloat(card.current_fmv).toFixed(2)}`
                          : '—'
                        }
                      </span>
                      {card.current_fmv && card.purchase_price && (
                        <span 
                          className={`card-roi ${
                            parseFloat(card.current_fmv) >= parseFloat(card.purchase_price) 
                              ? 'card-roi-positive' 
                              : 'card-roi-negative'
                          }`}
                        >
                          {parseFloat(card.current_fmv) >= parseFloat(card.purchase_price) ? '+' : ''}
                          {(((parseFloat(card.current_fmv) - parseFloat(card.purchase_price)) / parseFloat(card.purchase_price)) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Status Column */}
                  <td className="card-col-status">
                    <div className="card-status-wrapper">
                      {statusIndicators.length > 0 ? (
                        statusIndicators.map((indicator, idx) => (
                          <span 
                            key={idx} 
                            className={`card-status-indicator ${indicator.className}`}
                            title={indicator.text}
                          >
                            {indicator.icon}
                          </span>
                        ))
                      ) : (
                        <span className="card-status-indicator status-ok" title="All good">
                          ✓
                        </span>
                      )}
                    </div>
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

CardListTable.propTypes = {
  cards: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      year: PropTypes.string,
      set_name: PropTypes.string,
      athlete: PropTypes.string,
      card_number: PropTypes.string,
      variation: PropTypes.string,
      grading_company: PropTypes.string,
      grade: PropTypes.string,
      purchase_price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      current_fmv: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      auto_update: PropTypes.bool,
      review_required: PropTypes.bool,
      review_reason: PropTypes.string,
      last_updated_at: PropTypes.string,
      tags: PropTypes.oneOfType([
        PropTypes.arrayOf(PropTypes.string),
        PropTypes.string
      ])
    })
  ),
  onEditCard: PropTypes.func,
  onDeleteCard: PropTypes.func,
  onMoveCard: PropTypes.func,
  sortOption: PropTypes.string,
  onSortChange: PropTypes.func,
  loading: PropTypes.bool,
  allBinders: PropTypes.array,
  currentBinderId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export default CardListTable;
