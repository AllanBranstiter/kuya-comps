import PropTypes from 'prop-types';
import { Button } from '../ui';
import CardListTable from './CardListTable';

/**
 * BinderDetailView - Shows single binder details with cards
 * 
 * @param {Object} props
 * @param {Object} props.binder - Binder object with stats
 * @param {Array} props.cards - Array of card objects in this binder
 * @param {function} props.onBack - Handler for back button
 * @param {function} props.onAddCard - Handler for adding a card
 * @param {function} props.onEditCard - Handler for editing a card
 * @param {function} props.onDeleteCard - Handler for deleting a card
 * @param {function} props.onMoveCard - Handler for moving a card
 * @param {string} props.sortOption - Current sort option for cards
 * @param {function} props.onSortChange - Handler for sort change
 * @param {boolean} props.loading - Loading state
 * @param {Array} props.allBinders - All binders for move card dropdown
 */
function BinderDetailView({
  binder,
  cards = [],
  onBack,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onMoveCard,
  sortOption = 'newest',
  onSortChange,
  loading = false,
  allBinders = []
}) {
  if (!binder) {
    return null;
  }

  const stats = binder.stats || {};
  const roiColor = (stats.roi || 0) >= 0 ? 'var(--color-success)' : 'var(--color-error)';
  const roiSign = (stats.roi || 0) >= 0 ? '+' : '';

  return (
    <div className="binder-detail-container">
      {/* Header with Back Button */}
      <div className="binder-detail-header">
        <button 
          className="binder-back-btn"
          onClick={onBack}
          aria-label="Back to binders"
        >
          <span aria-hidden="true">←</span>
          <span>Back to Binders</span>
        </button>
        
        <div className="binder-detail-title-wrapper">
          <h2 className="binder-detail-title">{binder.name}</h2>
          <span className="binder-detail-subtitle">
            Created {new Date(binder.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Binder Stats */}
      <div className="binder-detail-stats">
        <div className="binder-detail-stat">
          <span className="binder-detail-stat-label">Cards</span>
          <span className="binder-detail-stat-value">{stats.totalCards || 0}</span>
        </div>
        <div className="binder-detail-stat">
          <span className="binder-detail-stat-label">Total Cost</span>
          <span className="binder-detail-stat-value">
            ${(stats.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="binder-detail-stat">
          <span className="binder-detail-stat-label">Total FMV</span>
          <span className="binder-detail-stat-value">
            ${(stats.totalFMV || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="binder-detail-stat">
          <span className="binder-detail-stat-label">ROI</span>
          <span className="binder-detail-stat-value" style={{ color: roiColor }}>
            {roiSign}{(stats.roi || 0).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Cards Section */}
      <div className="binder-cards-section">
        <div className="binder-cards-header">
          <h3 className="binder-cards-title">Cards in Binder</h3>
          <Button
            variant="primary"
            size="sm"
            onClick={onAddCard}
            disabled={loading}
          >
            + Add Card
          </Button>
        </div>

        {/* Card List Table */}
        <CardListTable
          cards={cards}
          onEditCard={onEditCard}
          onDeleteCard={onDeleteCard}
          onMoveCard={onMoveCard}
          sortOption={sortOption}
          onSortChange={onSortChange}
          loading={loading}
          allBinders={allBinders}
          currentBinderId={binder.id}
        />
      </div>
    </div>
  );
}

BinderDetailView.propTypes = {
  binder: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    created_at: PropTypes.string.isRequired,
    stats: PropTypes.shape({
      totalCards: PropTypes.number,
      totalCost: PropTypes.number,
      totalFMV: PropTypes.number,
      roi: PropTypes.number
    })
  }),
  cards: PropTypes.array,
  onBack: PropTypes.func,
  onAddCard: PropTypes.func,
  onEditCard: PropTypes.func,
  onDeleteCard: PropTypes.func,
  onMoveCard: PropTypes.func,
  sortOption: PropTypes.string,
  onSortChange: PropTypes.func,
  loading: PropTypes.bool,
  allBinders: PropTypes.array
};

export default BinderDetailView;
