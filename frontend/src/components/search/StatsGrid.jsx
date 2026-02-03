import PropTypes from 'prop-types';
import useSearchStore from '../../stores/searchStore';
import { formatMoney } from '../../utils/searchUtils';

/**
 * Display price statistics (min, max, avg)
 * 
 * Features:
 * - 3-column grid with values
 * - Formatted currency display
 * - Loading skeletons when fetching
 * - Handles missing data gracefully
 */
function StatsGrid({ className = '' }) {
  const { stats, loadingComps } = useSearchStore();

  // Loading state with skeleton placeholders
  if (loadingComps) {
    return (
      <div className={`stats-grid ${className}`}>
        <div className="stats-item stats-skeleton">
          <span className="stats-label">Minimum</span>
          <span className="stats-value skeleton-text">Loading...</span>
        </div>
        <div className="stats-item stats-skeleton">
          <span className="stats-label">Average</span>
          <span className="stats-value skeleton-text">Loading...</span>
        </div>
        <div className="stats-item stats-skeleton">
          <span className="stats-label">Maximum</span>
          <span className="stats-value skeleton-text">Loading...</span>
        </div>
      </div>
    );
  }

  // Empty state when no stats available
  if (!stats || stats.count === 0) {
    return (
      <div className={`stats-grid stats-empty ${className}`}>
        <div className="stats-item">
          <span className="stats-label">Minimum</span>
          <span className="stats-value stats-value-empty">--</span>
        </div>
        <div className="stats-item">
          <span className="stats-label">Average</span>
          <span className="stats-value stats-value-empty">--</span>
        </div>
        <div className="stats-item">
          <span className="stats-label">Maximum</span>
          <span className="stats-value stats-value-empty">--</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`stats-grid ${className}`}>
      <div className="stats-item stats-item-min">
        <span className="stats-label">Minimum</span>
        <span className="stats-value">{formatMoney(stats.min)}</span>
        <span className="stats-sublabel">Lowest sale</span>
      </div>
      <div className="stats-item stats-item-avg">
        <span className="stats-label">Average</span>
        <span className="stats-value stats-value-main">{formatMoney(stats.avg)}</span>
        <span className="stats-sublabel">Mean of {stats.count} sales</span>
      </div>
      <div className="stats-item stats-item-max">
        <span className="stats-label">Maximum</span>
        <span className="stats-value">{formatMoney(stats.max)}</span>
        <span className="stats-sublabel">Highest sale</span>
      </div>
    </div>
  );
}

StatsGrid.propTypes = {
  className: PropTypes.string
};

export default StatsGrid;
