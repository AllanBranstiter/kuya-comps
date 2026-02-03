import PropTypes from 'prop-types';

/**
 * BinderCard - Displays a single binder with stats
 * Shows card count, total value, and ROI
 * 
 * @param {Object} props
 * @param {Object} props.binder - Binder object with stats
 * @param {function} props.onClick - Click handler for viewing binder details
 * @param {function} props.onEdit - Edit handler
 * @param {function} props.onDelete - Delete handler
 */
function BinderCard({ binder, onClick, onEdit, onDelete }) {
  const stats = binder.stats || {};
  const roiColor = (stats.roi || 0) >= 0 ? 'var(--color-success)' : 'var(--color-error)';
  const roiSign = (stats.roi || 0) >= 0 ? '+' : '';

  const handleOptionsClick = (e) => {
    e.stopPropagation();
    // Toggle dropdown menu
    const menu = e.currentTarget.nextElementSibling;
    if (menu) {
      menu.classList.toggle('visible');
    }
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit?.(binder);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(binder);
  };

  const handleClick = () => {
    onClick?.(binder);
  };

  return (
    <div 
      className="binder-card"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`View ${binder.name} binder`}
    >
      {/* Options Menu */}
      <div className="binder-card-options">
        <button
          className="binder-options-btn"
          onClick={handleOptionsClick}
          aria-label="Binder options"
          title="Options"
        >
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </button>
        <div className="binder-options-menu">
          <button className="binder-menu-item" onClick={handleEdit}>
            <span>✏️</span>
            <span>Edit</span>
          </button>
          <button className="binder-menu-item binder-menu-item-danger" onClick={handleDelete}>
            <span>🗑️</span>
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Binder Name */}
      <h4 className="binder-card-title">{binder.name}</h4>

      {/* Stats Grid */}
      <div className="binder-card-stats">
        <div className="binder-stat">
          <div className="binder-stat-label">Cards</div>
          <div className="binder-stat-value">{stats.totalCards || 0}</div>
        </div>
        <div className="binder-stat">
          <div className="binder-stat-label">FMV</div>
          <div className="binder-stat-value">${(stats.totalFMV || 0).toFixed(0)}</div>
        </div>
        <div className="binder-stat">
          <div className="binder-stat-label">Cost</div>
          <div className="binder-stat-value">${(stats.totalCost || 0).toFixed(0)}</div>
        </div>
        <div className="binder-stat">
          <div className="binder-stat-label">ROI</div>
          <div className="binder-stat-value" style={{ color: roiColor }}>
            {roiSign}{(stats.roi || 0).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="binder-card-footer">
        Created {new Date(binder.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}

BinderCard.propTypes = {
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
  }).isRequired,
  onClick: PropTypes.func,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func
};

export default BinderCard;
