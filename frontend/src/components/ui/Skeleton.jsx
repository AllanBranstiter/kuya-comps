import PropTypes from 'prop-types';

/**
 * Reusable skeleton components for loading states
 * - SkeletonText - For text placeholders
 * - SkeletonCard - For card placeholders
 * - SkeletonTable - For table placeholders
 */

/**
 * Base skeleton component with shimmer animation
 */
function Skeleton({ className = '', width, height, style = {}, ...props }) {
  const combinedStyle = {
    width,
    height,
    ...style,
  };

  return (
    <div
      className={`skeleton ${className}`}
      style={combinedStyle}
      aria-hidden="true"
      {...props}
    />
  );
}

Skeleton.propTypes = {
  className: PropTypes.string,
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  style: PropTypes.object,
};

/**
 * Text skeleton for single line placeholders
 */
function SkeletonText({ width = '100%', height = '1rem', lines = 1, gap = '0.5rem' }) {
  if (lines === 1) {
    return <Skeleton className="skeleton-text" width={width} height={height} />;
  }

  return (
    <div className="skeleton-text-group" style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className="skeleton-text"
          width={index === lines - 1 ? '70%' : width}
          height={height}
        />
      ))}
    </div>
  );
}

SkeletonText.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  lines: PropTypes.number,
  gap: PropTypes.string,
};

/**
 * Card skeleton for card-shaped placeholders
 */
function SkeletonCard({ width = '100%', height = '200px', className = '' }) {
  return (
    <Skeleton
      className={`skeleton-card ${className}`}
      width={width}
      height={height}
    />
  );
}

SkeletonCard.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
};

/**
 * Table skeleton for table row placeholders
 */
function SkeletonTable({ rows = 5, columns = 3 }) {
  return (
    <div className="skeleton-table" aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="skeleton-table-row">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className="skeleton-text"
              height="1rem"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

SkeletonTable.propTypes = {
  rows: PropTypes.number,
  columns: PropTypes.number,
};

/**
 * Avatar skeleton for circular placeholders
 */
function SkeletonAvatar({ size = '40px' }) {
  return (
    <Skeleton
      className="skeleton-avatar"
      width={size}
      height={size}
      style={{ borderRadius: '50%' }}
    />
  );
}

SkeletonAvatar.propTypes = {
  size: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

/**
 * Binder skeleton for collection binder card placeholders
 */
function SkeletonBinder() {
  return (
    <div className="skeleton-binder">
      <SkeletonText width="60%" height="1.5rem" />
      <div className="skeleton-binder-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1rem' }}>
        <Skeleton height="60px" style={{ borderRadius: 'var(--radius-md)' }} />
        <Skeleton height="60px" style={{ borderRadius: 'var(--radius-md)' }} />
      </div>
      <SkeletonText width="40%" style={{ marginTop: '1rem' }} />
    </div>
  );
}

// Export all skeleton components
export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable, SkeletonAvatar, SkeletonBinder };
export default Skeleton;
