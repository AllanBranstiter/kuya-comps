import PropTypes from 'prop-types';
import { useState } from 'react';

/**
 * MarketIndicatorCard - Reusable card for displaying a market metric
 * 
 * Features:
 * - Title, value, progress bar
 * - Color-coded by band (green/yellow/red)
 * - Info button with tooltip/modal explanation
 * 
 * @param {string} title - Card title
 * @param {number|null} value - Metric value (0-100 for most, can be negative for pressure)
 * @param {string} unit - Unit to display after value (e.g., '%', '/100')
 * @param {Object} band - Band info from getMetricBand { color, bgColor, label, description, icon }
 * @param {number} min - Minimum value for progress bar (default 0)
 * @param {number} max - Maximum value for progress bar (default 100)
 * @param {string} subtitle - Optional subtitle text
 * @param {boolean} loading - Show loading state
 */
function MarketIndicatorCard({
  title,
  value,
  unit = '',
  band,
  min = 0,
  max = 100,
  subtitle,
  loading = false,
  infoContent
}) {
  const [showInfo, setShowInfo] = useState(false);

  // Calculate progress percentage (clamped to 0-100)
  const progressValue = value !== null ? Math.max(min, Math.min(max, value)) : 0;
  const progressPercent = ((progressValue - min) / (max - min)) * 100;

  // Format display value
  const displayValue = value !== null 
    ? (Number.isInteger(value) ? value : value.toFixed(1))
    : '--';

  if (loading) {
    return (
      <div className="indicator-card indicator-card-loading">
        <div className="indicator-card-header">
          <span className="indicator-card-title">{title}</span>
        </div>
        <div className="indicator-card-body">
          <div className="indicator-value-skeleton"></div>
          <div className="indicator-bar-skeleton"></div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="indicator-card"
      style={{ '--indicator-color': band?.color || 'var(--subtle-text-color)' }}
    >
      <div className="indicator-card-header">
        <span className="indicator-card-title">{title}</span>
        {infoContent && (
          <button 
            className="indicator-info-btn"
            onClick={() => setShowInfo(!showInfo)}
            title="More information"
            aria-label={`Info about ${title}`}
          >
            ℹ️
          </button>
        )}
      </div>

      <div className="indicator-card-body">
        <div className="indicator-value-row">
          <span className="indicator-icon">{band?.icon || '📊'}</span>
          <span 
            className="indicator-value"
            style={{ color: band?.color }}
          >
            {displayValue}{unit}
          </span>
          <span 
            className="indicator-band-label"
            style={{ 
              color: band?.color,
              backgroundColor: band?.bgColor
            }}
          >
            {band?.label || 'N/A'}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="indicator-progress-container">
          <div 
            className="indicator-progress-bar"
            style={{ 
              width: `${Math.max(0, progressPercent)}%`,
              backgroundColor: band?.color || 'var(--primary-blue)'
            }}
          />
        </div>

        {/* Subtitle / Description */}
        {subtitle && (
          <div className="indicator-subtitle">{subtitle}</div>
        )}
      </div>

      {/* Info Tooltip/Panel */}
      {showInfo && infoContent && (
        <div className="indicator-info-panel">
          <div className="indicator-info-content">
            <p className="indicator-info-description">{band?.description}</p>
            {infoContent}
          </div>
          <button 
            className="indicator-info-close"
            onClick={() => setShowInfo(false)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

MarketIndicatorCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.number,
  unit: PropTypes.string,
  band: PropTypes.shape({
    color: PropTypes.string,
    bgColor: PropTypes.string,
    label: PropTypes.string,
    description: PropTypes.string,
    icon: PropTypes.string
  }),
  min: PropTypes.number,
  max: PropTypes.number,
  subtitle: PropTypes.string,
  loading: PropTypes.bool,
  infoContent: PropTypes.node
};

export default MarketIndicatorCard;
