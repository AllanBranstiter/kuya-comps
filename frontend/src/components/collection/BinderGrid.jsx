import PropTypes from 'prop-types';
import { Button } from '../ui';
import BinderCard from './BinderCard';

/**
 * BinderGrid - Displays grid of all binders with collection overview
 * 
 * @param {Object} props
 * @param {Array} props.binders - Array of binder objects
 * @param {function} props.onBinderClick - Handler for clicking a binder
 * @param {function} props.onEditBinder - Handler for editing a binder
 * @param {function} props.onDeleteBinder - Handler for deleting a binder
 * @param {function} props.onCreateBinder - Handler for creating new binder
 * @param {string} props.sortOption - Current sort option
 * @param {function} props.onSortChange - Handler for sort change
 * @param {boolean} props.loading - Loading state
 */
function BinderGrid({
  binders = [],
  onBinderClick,
  onEditBinder,
  onDeleteBinder,
  onCreateBinder,
  sortOption = 'newest',
  onSortChange,
  loading = false
}) {
  // Calculate collection-wide stats
  const collectionStats = binders.reduce(
    (acc, binder) => {
      const stats = binder.stats || {};
      return {
        totalCards: acc.totalCards + (stats.totalCards || 0),
        totalCost: acc.totalCost + (stats.totalCost || 0),
        totalFMV: acc.totalFMV + (stats.totalFMV || 0)
      };
    },
    { totalCards: 0, totalCost: 0, totalFMV: 0 }
  );

  const collectionROI =
    collectionStats.totalCost > 0
      ? ((collectionStats.totalFMV - collectionStats.totalCost) / collectionStats.totalCost) * 100
      : 0;

  const roiColor = collectionROI >= 0 ? 'var(--color-success)' : 'var(--color-error)';
  const roiSign = collectionROI >= 0 ? '+' : '';

  const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'az', label: 'A-Z' },
    { value: 'za', label: 'Z-A' },
    { value: 'value_high', label: 'Highest Value' },
    { value: 'value_low', label: 'Lowest Value' }
  ];

  return (
    <div className="binder-grid-container">
      {/* Collection Overview */}
      <div className="collection-overview">
        <h2 className="collection-overview-title">Collection Overview</h2>
        <div className="collection-overview-stats">
          <div className="collection-stat">
            <span className="collection-stat-label">Total Cards</span>
            <span className="collection-stat-value">{collectionStats.totalCards}</span>
          </div>
          <div className="collection-stat">
            <span className="collection-stat-label">Total Cost</span>
            <span className="collection-stat-value">
              ${collectionStats.totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="collection-stat">
            <span className="collection-stat-label">Total FMV</span>
            <span className="collection-stat-value">
              ${collectionStats.totalFMV.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="collection-stat">
            <span className="collection-stat-label">Total ROI</span>
            <span className="collection-stat-value" style={{ color: roiColor }}>
              {roiSign}{collectionROI.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Grid Header */}
      <div className="binder-grid-header">
        <h3 className="binder-grid-title">My Binders ({binders.length})</h3>
        <div className="binder-grid-controls">
          {/* Sort Dropdown */}
          <div className="sort-control">
            <label htmlFor="binder-sort" className="sort-label">Sort:</label>
            <select
              id="binder-sort"
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

          {/* New Binder Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={onCreateBinder}
            disabled={loading}
          >
            + New Binder
          </Button>
        </div>
      </div>

      {/* Binders Grid */}
      {binders.length > 0 ? (
        <div className="binder-grid">
          {binders.map((binder) => (
            <BinderCard
              key={binder.id}
              binder={binder}
              onClick={onBinderClick}
              onEdit={onEditBinder}
              onDelete={onDeleteBinder}
            />
          ))}
        </div>
      ) : (
        <div className="binder-empty-state">
          <div className="binder-empty-icon">📚</div>
          <h4 className="binder-empty-title">No Binders Yet</h4>
          <p className="binder-empty-text">
            Create your first binder to start organizing your collection.
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={onCreateBinder}
            disabled={loading}
          >
            + Create Your First Binder
          </Button>
        </div>
      )}
    </div>
  );
}

BinderGrid.propTypes = {
  binders: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired,
      created_at: PropTypes.string.isRequired,
      stats: PropTypes.shape({
        totalCards: PropTypes.number,
        totalCost: PropTypes.number,
        totalFMV: PropTypes.number,
        roi: PropTypes.number
      })
    })
  ),
  onBinderClick: PropTypes.func,
  onEditBinder: PropTypes.func,
  onDeleteBinder: PropTypes.func,
  onCreateBinder: PropTypes.func,
  sortOption: PropTypes.string,
  onSortChange: PropTypes.func,
  loading: PropTypes.bool
};

export default BinderGrid;
