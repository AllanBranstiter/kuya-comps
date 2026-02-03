import PropTypes from 'prop-types';
import MarketIndicatorCard from './MarketIndicatorCard';
import { getMetricBand } from '../../utils/marketAnalysisUtils';
import { formatMoney } from '../../utils/searchUtils';

/**
 * MarketConfidenceCard - Shows market confidence score
 * 
 * Market Confidence measures how consistent sold prices are.
 * Higher score = more consistent prices = more reliable FMV
 * 
 * Formula: 100 / (1 + coefficientOfVariation / 100)
 * 
 * Bands:
 * - High (80-100): Very consistent - FMV is reliable
 * - Good (60-80): Reasonably consistent
 * - Moderate (40-60): Some variance - FMV is estimate
 * - Low (20-40): High variance - use caution
 * - Very Low (0-20): Wide variance - FMV unreliable
 * 
 * @param {Object} confidence - { value, stdDev, mean } from calculateMarketConfidence
 * @param {number} soldCount - Number of sold listings for context
 * @param {boolean} loading - Loading state
 */
function MarketConfidenceCard({ confidence, soldCount, loading = false }) {
  const value = confidence?.value ?? null;
  const stdDev = confidence?.stdDev;
  const mean = confidence?.mean;
  const band = getMetricBand('confidence', value);

  // Build subtitle with context
  let subtitle = '';
  if (mean && stdDev !== null && stdDev !== undefined) {
    subtitle = `Avg: ${formatMoney(mean)} ± ${formatMoney(stdDev)} (${soldCount || 0} sales)`;
  } else if (soldCount) {
    subtitle = `Based on ${soldCount} sales`;
  }

  // Info content explaining the metric
  const infoContent = (
    <div className="indicator-info-details">
      <h4>How Market Confidence is Calculated</h4>
      <p>
        Confidence = 100 / (1 + Coefficient of Variation / 100)
      </p>
      <p>
        The Coefficient of Variation (CV) measures price spread relative to the average.
        Lower CV = more consistent prices = higher confidence.
      </p>
      <h4>What It Means</h4>
      <ul>
        <li><strong>80-100:</strong> Highly consistent - FMV is very reliable</li>
        <li><strong>60-80:</strong> Good consistency - FMV is solid estimate</li>
        <li><strong>40-60:</strong> Moderate - consider the price range</li>
        <li><strong>20-40:</strong> Low - prices vary significantly</li>
        <li><strong>0-20:</strong> Very low - wide price swings, FMV unreliable</li>
      </ul>
      <h4>Why It Matters</h4>
      <p>
        High confidence means you can trust the FMV estimate. Low confidence suggests 
        the market hasn&apos;t agreed on a price - you might find bargains or overpay.
      </p>
      <h4>Improving Confidence</h4>
      <p>
        Try refining your search with more specific terms (e.g., add year, variation, 
        or condition) to get more comparable sales.
      </p>
    </div>
  );

  return (
    <MarketIndicatorCard
      title="Market Confidence"
      value={value}
      unit="/100"
      band={band}
      min={0}
      max={100}
      subtitle={subtitle}
      loading={loading}
      infoContent={infoContent}
    />
  );
}

MarketConfidenceCard.propTypes = {
  confidence: PropTypes.shape({
    value: PropTypes.number,
    stdDev: PropTypes.number,
    mean: PropTypes.number
  }),
  soldCount: PropTypes.number,
  loading: PropTypes.bool
};

export default MarketConfidenceCard;
