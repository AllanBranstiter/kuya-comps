import PropTypes from 'prop-types';
import { formatMoney } from '../../utils/searchUtils';

/**
 * PricingRecommendations - Shows pricing recommendations
 * 
 * Displays:
 * - Quick Sale price (for fast turnaround)
 * - Target/FMV price (fair market value)
 * - Patient Sale price (maximize value)
 * - Visual range indicator showing the spread
 * 
 * @param {Object} recommendations - { quickSale, target, patientSale, rangeMin, rangeMax, quickDiscount, patientPremium }
 * @param {number} fmv - Fair market value for reference
 * @param {boolean} loading - Loading state
 */
function PricingRecommendations({ recommendations, fmv, loading = false }) {
  if (loading) {
    return (
      <div className="pricing-recommendations pricing-loading">
        <h3 className="pricing-title">Pricing Recommendations</h3>
        <div className="pricing-skeleton">
          <div className="pricing-item-skeleton"></div>
          <div className="pricing-item-skeleton"></div>
          <div className="pricing-item-skeleton"></div>
        </div>
      </div>
    );
  }

  if (!recommendations || !fmv) {
    return (
      <div className="pricing-recommendations pricing-empty">
        <h3 className="pricing-title">Pricing Recommendations</h3>
        <p className="pricing-empty-text">
          Pricing recommendations will appear after a search with valid FMV data.
        </p>
      </div>
    );
  }

  const { quickSale, target, patientSale, quickDiscount, patientPremium } = recommendations;

  // Calculate positions for the visual range indicator (as percentages)
  // Use quick sale as 0% and patient sale as 100%
  const range = patientSale - quickSale;
  const targetPosition = range > 0 ? ((target - quickSale) / range) * 100 : 50;

  return (
    <div className="pricing-recommendations">
      <h3 className="pricing-title">
        <span className="pricing-icon">💵</span>
        Pricing Recommendations
      </h3>

      {/* Visual Price Range */}
      <div className="pricing-range-visual">
        <div className="pricing-range-bar">
          {/* Quick sale marker */}
          <div 
            className="pricing-marker pricing-marker-quick"
            style={{ left: '0%' }}
          >
            <div className="pricing-marker-line"></div>
            <div className="pricing-marker-dot"></div>
          </div>

          {/* Target/FMV marker */}
          <div 
            className="pricing-marker pricing-marker-target"
            style={{ left: `${targetPosition}%` }}
          >
            <div className="pricing-marker-line pricing-marker-line-target"></div>
            <div className="pricing-marker-dot pricing-marker-dot-target"></div>
          </div>

          {/* Patient sale marker */}
          <div 
            className="pricing-marker pricing-marker-patient"
            style={{ left: '100%' }}
          >
            <div className="pricing-marker-line"></div>
            <div className="pricing-marker-dot"></div>
          </div>

          {/* Filled area representing the range */}
          <div className="pricing-range-fill"></div>
        </div>

        {/* Labels below the bar */}
        <div className="pricing-range-labels">
          <span className="pricing-range-label pricing-range-label-quick">Quick</span>
          <span className="pricing-range-label pricing-range-label-target">Target</span>
          <span className="pricing-range-label pricing-range-label-patient">Patient</span>
        </div>
      </div>

      {/* Price Cards */}
      <div className="pricing-cards">
        {/* Quick Sale */}
        <div className="pricing-card pricing-card-quick">
          <div className="pricing-card-header">
            <span className="pricing-card-icon">⚡</span>
            <span className="pricing-card-label">Quick Sale</span>
          </div>
          <div className="pricing-card-value">
            {formatMoney(quickSale)}
          </div>
          <div className="pricing-card-note">
            {quickDiscount}% below FMV
          </div>
          <div className="pricing-card-description">
            Price to sell within days. Best for moving inventory fast.
          </div>
        </div>

        {/* Target / FMV */}
        <div className="pricing-card pricing-card-target">
          <div className="pricing-card-header">
            <span className="pricing-card-icon">🎯</span>
            <span className="pricing-card-label">Target Price</span>
          </div>
          <div className="pricing-card-value pricing-card-value-main">
            {formatMoney(target)}
          </div>
          <div className="pricing-card-note">
            Fair Market Value
          </div>
          <div className="pricing-card-description">
            What comparable cards are actually selling for.
          </div>
        </div>

        {/* Patient Sale */}
        <div className="pricing-card pricing-card-patient">
          <div className="pricing-card-header">
            <span className="pricing-card-icon">⏳</span>
            <span className="pricing-card-label">Patient Sale</span>
          </div>
          <div className="pricing-card-value">
            {formatMoney(patientSale)}
          </div>
          <div className="pricing-card-note">
            {patientPremium}% above FMV
          </div>
          <div className="pricing-card-description">
            For patient sellers. May take weeks to find the right buyer.
          </div>
        </div>
      </div>

      {/* Additional context */}
      <div className="pricing-context">
        <p className="pricing-context-text">
          <strong>Tip:</strong> Prices adjust based on market conditions. 
          High liquidity markets support higher asks; oversupplied markets need competitive pricing.
        </p>
      </div>
    </div>
  );
}

PricingRecommendations.propTypes = {
  recommendations: PropTypes.shape({
    quickSale: PropTypes.number,
    target: PropTypes.number,
    patientSale: PropTypes.number,
    rangeMin: PropTypes.number,
    rangeMax: PropTypes.number,
    quickDiscount: PropTypes.number,
    patientPremium: PropTypes.number
  }),
  fmv: PropTypes.number,
  loading: PropTypes.bool
};

export default PricingRecommendations;
