import { useEffect } from 'react';
import useSearchStore from '../../stores/searchStore';
import MarketPressureCard from './MarketPressureCard';
import MarketConfidenceCard from './MarketConfidenceCard';
import LiquidityScoreCard from './LiquidityScoreCard';
import MarketAssessment from './MarketAssessment';
import PricingRecommendations from './PricingRecommendations';
import styles from './AnalysisDashboard.module.css';

/**
 * AnalysisDashboard - Container component that assembles all market analysis components
 * 
 * Features:
 * - Grid layout for indicator cards
 * - Calculates metrics automatically when data changes
 * - Shows loading states during calculation
 * - Responsive design
 * 
 * This component connects to the searchStore and automatically triggers
 * market analysis calculations when sold/active listings and FMV are available.
 */
function AnalysisDashboard() {
  // Get state and actions from store
  const {
    soldListings,
    activeListings,
    fmv,
    marketMetrics,
    marketTier,
    marketAdvice,
    pricingRecommendations,
    marketMessage,
    loadingMarketAnalysis,
    loading,
    loadingFmv,
    loadingActive,
    calculateMarketMetrics,
    fetchMarketMessage,
    hasResults
  } = useSearchStore(state => ({
    soldListings: state.soldListings,
    activeListings: state.activeListings,
    fmv: state.fmv,
    marketMetrics: state.marketMetrics,
    marketTier: state.marketTier,
    marketAdvice: state.marketAdvice,
    pricingRecommendations: state.pricingRecommendations,
    marketMessage: state.marketMessage,
    loadingMarketAnalysis: state.loadingMarketAnalysis,
    loading: state.loading,
    loadingFmv: state.loadingFmv,
    loadingActive: state.loadingActive,
    calculateMarketMetrics: state.calculateMarketMetrics,
    fetchMarketMessage: state.fetchMarketMessage,
    hasResults: state.hasResults()
  }));

  // Calculate metrics when data becomes available
  useEffect(() => {
    // Only calculate if we have sold listings and we're not in the middle of loading
    if (
      hasResults && 
      !loading && 
      !loadingFmv && 
      !loadingActive &&
      !marketMetrics
    ) {
      console.log('[AnalysisDashboard] Triggering market metrics calculation');
      calculateMarketMetrics();
    }
  }, [hasResults, loading, loadingFmv, loadingActive, marketMetrics, calculateMarketMetrics]);

  // Fetch market message when tier is determined
  useEffect(() => {
    if (marketTier && fmv && !marketMessage) {
      console.log('[AnalysisDashboard] Fetching market message');
      fetchMarketMessage();
    }
  }, [marketTier, fmv, marketMessage, fetchMarketMessage]);

  // Don't render if no results
  if (!hasResults) {
    return null;
  }

  // Determine overall loading state
  const isLoading = loading || loadingFmv || loadingActive || loadingMarketAnalysis;
  const fmvValue = fmv?.marketValue || fmv?.expectedHigh;

  return (
    <section className={styles.analysisSection}>
      <div className="analysis-dashboard-header">
        <h2 className="analysis-dashboard-title">
          <span className="analysis-icon">📊</span>
          Market Analysis
        </h2>
        <p className="analysis-dashboard-subtitle">
          Deep insights into market conditions and pricing
        </p>
      </div>

      {/* Indicator Cards Grid */}
      <div className={styles.indicatorsGrid}>
        <MarketPressureCard
          pressure={marketMetrics?.pressure}
          fmv={fmvValue}
          loading={isLoading}
        />
        <MarketConfidenceCard
          confidence={marketMetrics?.confidence}
          soldCount={soldListings?.length || 0}
          loading={isLoading}
        />
        <LiquidityScoreCard
          liquidity={marketMetrics?.liquidity}
          soldCount={soldListings?.length || 0}
          activeCount={activeListings?.length || 0}
          loading={isLoading}
        />
      </div>

      {/* Market Assessment and Pricing side by side */}
      <div className={styles.detailsGrid}>
        <div className={styles.detailCard}>
          <MarketAssessment
            tier={marketTier}
            advice={marketAdvice}
            marketMessage={marketMessage}
            loading={isLoading}
          />
        </div>
        <div className={styles.detailCard}>
          <PricingRecommendations
            recommendations={pricingRecommendations}
            fmv={fmvValue}
            loading={isLoading}
          />
        </div>
      </div>
    </section>
  );
}

export default AnalysisDashboard;
