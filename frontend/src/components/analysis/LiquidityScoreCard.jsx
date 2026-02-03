import PropTypes from 'prop-types';
import MarketIndicatorCard from './MarketIndicatorCard';
import { getMetricBand } from '../../utils/marketAnalysisUtils';

/**
 * LiquidityScoreCard - Shows liquidity/absorption score
 * 
 * Liquidity measures how quickly cards are selling relative to supply.
 * Based on absorption ratio: completedSales / activeListings
 * 
 * Bands:
 * - High (ratio ≥ 1.0): More sales than active - hot market
 * - Moderate (0.5-1.0): Balanced market activity
 * - Low (0.2-0.5): More supply than demand
 * - Very Low (<0.2): Oversupplied - slow sales expected
 * 
 * @param {Object} liquidity - { value, ratio, band } from calculateLiquidityScore
 * @param {number} soldCount - Number of sold listings
 * @param {number} activeCount - Number of active listings
 * @param {boolean} loading - Loading state
 */
function LiquidityScoreCard({ liquidity, soldCount, activeCount, loading = false }) {
  const value = liquidity?.value ?? null;
  const ratio = liquidity?.ratio;
  const band = getMetricBand('liquidity', value);

  // Build subtitle with sold:active ratio
  let subtitle = '';
  if (soldCount !== null && activeCount !== null) {
    const ratioDisplay = ratio !== null ? ratio.toFixed(2) : '--';
    subtitle = `${soldCount} sold : ${activeCount} active (${ratioDisplay}x)`;
  }

  // Info content explaining the metric
  const infoContent = (
    <div className="indicator-info-details">
      <h4>How Liquidity is Calculated</h4>
      <p>
        Absorption Ratio = Recent Sales / Active Listings
      </p>
      <p>
        The score converts this ratio to a 0-100 scale where higher means 
        faster-moving market.
      </p>
      <h4>What the Ratio Means</h4>
      <ul>
        <li><strong>≥ 1.0:</strong> More sales than listings - high demand</li>
        <li><strong>0.5 - 1.0:</strong> Balanced - healthy turnover</li>
        <li><strong>0.2 - 0.5:</strong> Low - supply exceeds demand</li>
        <li><strong>&lt; 0.2:</strong> Very low - oversupplied market</li>
      </ul>
      <h4>For Buyers</h4>
      <p>
        Low liquidity means more negotiating power and less urgency. 
        High liquidity means act fast on good deals.
      </p>
      <h4>For Sellers</h4>
      <p>
        High liquidity = price confidently, cards move quickly.
        Low liquidity = price competitively and be patient.
      </p>
      <h4>For Flippers</h4>
      <p>
        High liquidity is ideal - you can buy and resell quickly.
        Low liquidity means capital tied up longer.
      </p>
    </div>
  );

  return (
    <MarketIndicatorCard
      title="Liquidity Score"
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

LiquidityScoreCard.propTypes = {
  liquidity: PropTypes.shape({
    value: PropTypes.number,
    ratio: PropTypes.number,
    band: PropTypes.string
  }),
  soldCount: PropTypes.number,
  activeCount: PropTypes.number,
  loading: PropTypes.bool
};

export default LiquidityScoreCard;
