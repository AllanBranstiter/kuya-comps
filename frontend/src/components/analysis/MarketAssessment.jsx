import PropTypes from 'prop-types';

/**
 * MarketAssessment - Shows tier-based market assessment message
 * 
 * Displays:
 * - Tier badge with color
 * - Overall assessment message
 * - Persona-specific advice (collector, seller, flipper)
 * 
 * @param {Object} tier - { tier, label, color, bgColor, icon, description }
 * @param {Object} advice - { collector, seller, flipper } persona advice
 * @param {Object} marketMessage - Optional API response from /market-message
 * @param {boolean} loading - Loading state
 */
function MarketAssessment({ tier, advice, marketMessage, loading = false }) {
  if (loading) {
    return (
      <div className="market-assessment market-assessment-loading">
        <div className="assessment-header">
          <div className="assessment-badge-skeleton"></div>
          <div className="assessment-title-skeleton"></div>
        </div>
        <div className="assessment-body-skeleton"></div>
      </div>
    );
  }

  if (!tier) {
    return (
      <div className="market-assessment market-assessment-empty">
        <div className="assessment-header">
          <span className="assessment-icon">📊</span>
          <h3 className="assessment-title">Market Assessment</h3>
        </div>
        <p className="assessment-empty-text">
          Run a search to see market assessment
        </p>
      </div>
    );
  }

  return (
    <div className="market-assessment">
      {/* Header with tier badge */}
      <div className="assessment-header">
        <span 
          className="tier-badge"
          style={{ 
            color: tier.color,
            backgroundColor: tier.bgColor,
            borderColor: tier.color
          }}
        >
          <span className="tier-icon">{tier.icon}</span>
          <span className="tier-label">{tier.label}</span>
          <span className="tier-number">Tier {tier.tier}</span>
        </span>
        <h3 className="assessment-title">Market Assessment</h3>
      </div>

      {/* Main description */}
      <div className="assessment-description">
        <p>{tier.description}</p>
        {marketMessage?.message && (
          <p className="assessment-api-message">{marketMessage.message}</p>
        )}
      </div>

      {/* Persona advice sections */}
      {advice && (
        <div className="advice-sections">
          {advice.collector && (
            <div className="advice-section advice-collector">
              <div className="advice-header">
                <span className="advice-icon">🎯</span>
                <span className="advice-label">For Collectors</span>
              </div>
              <p className="advice-text">{advice.collector}</p>
            </div>
          )}

          {advice.seller && (
            <div className="advice-section advice-seller">
              <div className="advice-header">
                <span className="advice-icon">💰</span>
                <span className="advice-label">For Sellers</span>
              </div>
              <p className="advice-text">{advice.seller}</p>
            </div>
          )}

          {advice.flipper && (
            <div className="advice-section advice-flipper">
              <div className="advice-header">
                <span className="advice-icon">📈</span>
                <span className="advice-label">For Flippers</span>
              </div>
              <p className="advice-text">{advice.flipper}</p>
            </div>
          )}
        </div>
      )}

      {/* API-provided recommendations if available */}
      {marketMessage?.recommendations && (
        <div className="api-recommendations">
          <h4>Additional Insights</h4>
          <ul>
            {marketMessage.recommendations.map((rec, index) => (
              <li key={index}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

MarketAssessment.propTypes = {
  tier: PropTypes.shape({
    tier: PropTypes.number,
    label: PropTypes.string,
    color: PropTypes.string,
    bgColor: PropTypes.string,
    icon: PropTypes.string,
    description: PropTypes.string
  }),
  advice: PropTypes.shape({
    collector: PropTypes.string,
    seller: PropTypes.string,
    flipper: PropTypes.string
  }),
  marketMessage: PropTypes.shape({
    message: PropTypes.string,
    recommendations: PropTypes.arrayOf(PropTypes.string)
  }),
  loading: PropTypes.bool
};

export default MarketAssessment;
