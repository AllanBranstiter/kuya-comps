import PropTypes from 'prop-types';
import MarketIndicatorCard from './MarketIndicatorCard';
import { getMetricBand } from '../../utils/marketAnalysisUtils';
import { formatMoney } from '../../utils/searchUtils';

/**
 * MarketPressureCard - Shows market pressure with visual indicator
 * 
 * Market Pressure measures how much sellers are asking above/below FMV
 * Formula: ((medianAskingPrice - FMV) / FMV) * 100
 * 
 * Bands:
 * - Below FMV (negative): Sellers pricing below market - deals available
 * - Healthy (0-15%): Good alignment between asking and selling prices
 * - Optimistic (15-30%): Sellers slightly hopeful - room for negotiation
 * - Resistance (30-50%): Significant gap - hard to sell at asking prices
 * - Unrealistic (50%+): Sellers asking way above what market will bear
 * 
 * @param {Object} pressure - { value, medianAsking } from calculateMarketPressure
 * @param {number} fmv - Fair market value for context
 * @param {boolean} loading - Loading state
 */
function MarketPressureCard({ pressure, fmv, loading = false }) {
  const value = pressure?.value ?? null;
  const medianAsking = pressure?.medianAsking;
  const band = getMetricBand('pressure', value);

  // Build subtitle with context
  let subtitle = '';
  if (medianAsking && fmv) {
    subtitle = `Median asking: ${formatMoney(medianAsking)} vs FMV: ${formatMoney(fmv)}`;
  }

  // Info content explaining the metric
  const infoContent = (
    <div className="indicator-info-details">
      <h4>How Market Pressure is Calculated</h4>
      <p>
        Market Pressure = ((Median Asking Price - FMV) / FMV) × 100
      </p>
      <h4>What It Means</h4>
      <ul>
        <li><strong>Negative:</strong> Sellers pricing below FMV - good buying opportunity</li>
        <li><strong>0-15%:</strong> Healthy market - prices align with recent sales</li>
        <li><strong>15-30%:</strong> Sellers optimistic - expect negotiation</li>
        <li><strong>30-50%:</strong> Market resistance - many listings may not sell</li>
        <li><strong>50%+:</strong> Unrealistic asks - wait for price drops</li>
      </ul>
      <h4>For Buyers</h4>
      <p>
        Lower pressure means better buying conditions. When pressure is high, 
        make offers below asking price or wait for sellers to reduce prices.
      </p>
      <h4>For Sellers</h4>
      <p>
        High market pressure indicates your competition is pricing too high. 
        Price competitively near FMV for faster sales.
      </p>
    </div>
  );

  return (
    <MarketIndicatorCard
      title="Market Pressure"
      value={value}
      unit="%"
      band={band}
      min={-50}
      max={100}
      subtitle={subtitle}
      loading={loading}
      infoContent={infoContent}
    />
  );
}

MarketPressureCard.propTypes = {
  pressure: PropTypes.shape({
    value: PropTypes.number,
    medianAsking: PropTypes.number
  }),
  fmv: PropTypes.number,
  loading: PropTypes.bool
};

export default MarketPressureCard;
