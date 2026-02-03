import PropTypes from 'prop-types';
import useSearchStore from '../../stores/searchStore';
import { formatMoney } from '../../utils/searchUtils';

/**
 * Display FMV values (Quick Sale, Market Value, Patient Sale)
 * 
 * Features:
 * - 3-column grid with labels and values
 * - Visual distinction for Market Value (center, larger)
 * - Loading state with skeleton placeholders
 * - Tooltip explanations for each value
 */
function FMVDisplay({ className = '' }) {
  const { fmv, loadingComps } = useSearchStore();

  // Loading state with skeleton placeholders
  if (loadingComps) {
    return (
      <div className={`fmv-display ${className}`}>
        <h3 className="fmv-title">Fair Market Value</h3>
        <div className="fmv-grid">
          <div className="fmv-item fmv-skeleton">
            <span className="fmv-label">Quick Sale</span>
            <span className="fmv-value skeleton-text">Loading...</span>
          </div>
          <div className="fmv-item fmv-item-main fmv-skeleton">
            <span className="fmv-label">Market Value</span>
            <span className="fmv-value skeleton-text">Loading...</span>
          </div>
          <div className="fmv-item fmv-skeleton">
            <span className="fmv-label">Patient Sale</span>
            <span className="fmv-value skeleton-text">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // Empty state when no FMV data available
  if (!fmv || !fmv.marketValue) {
    return (
      <div className={`fmv-display fmv-empty ${className}`}>
        <h3 className="fmv-title">Fair Market Value</h3>
        <div className="fmv-grid">
          <div className="fmv-item">
            <span className="fmv-label">Quick Sale</span>
            <span className="fmv-value fmv-value-empty">--</span>
          </div>
          <div className="fmv-item fmv-item-main">
            <span className="fmv-label">Market Value</span>
            <span className="fmv-value fmv-value-empty">--</span>
          </div>
          <div className="fmv-item">
            <span className="fmv-label">Patient Sale</span>
            <span className="fmv-value fmv-value-empty">--</span>
          </div>
        </div>
        <p className="fmv-hint">Search for a card to calculate FMV</p>
      </div>
    );
  }

  return (
    <div className={`fmv-display ${className}`}>
      <h3 className="fmv-title">Fair Market Value</h3>
      <div className="fmv-grid">
        <div className="fmv-item fmv-item-quick">
          <span className="fmv-label">Quick Sale</span>
          <span className="fmv-value fmv-value-quick">{formatMoney(fmv.quickSale)}</span>
          <span className="fmv-sublabel" title="Sell within 24-48 hours at a discount">
            🏃 Fast sale price
          </span>
        </div>
        <div className="fmv-item fmv-item-main">
          <span className="fmv-label">Market Value</span>
          <span className="fmv-value fmv-value-market">{formatMoney(fmv.marketValue)}</span>
          <span className="fmv-sublabel" title="Average recent sales price">
            💰 Fair price
          </span>
        </div>
        <div className="fmv-item fmv-item-patient">
          <span className="fmv-label">Patient Sale</span>
          <span className="fmv-value fmv-value-patient">{formatMoney(fmv.patientSale)}</span>
          <span className="fmv-sublabel" title="Wait for the right buyer at premium">
            ⏳ Maximum price
          </span>
        </div>
      </div>
    </div>
  );
}

FMVDisplay.propTypes = {
  className: PropTypes.string
};

export default FMVDisplay;
