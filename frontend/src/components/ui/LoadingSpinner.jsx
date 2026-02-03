import PropTypes from 'prop-types';

/**
 * Loading spinner component
 * 
 * @param {Object} props
 * @param {string} props.size - 'sm' | 'md' | 'lg'
 * @param {string} props.color - 'primary' | 'white'
 * @param {string} props.text - Optional loading text
 * @param {string} props.className - Additional CSS classes
 */
function LoadingSpinner({
  size = 'md',
  color = 'primary',
  text = '',
  className = ''
}) {
  const sizeClass = `spinner-${size}`;
  const colorClass = `spinner-${color}`;
  
  const spinnerClassName = [
    'spinner',
    sizeClass,
    colorClass,
    className
  ].filter(Boolean).join(' ');

  if (text) {
    return (
      <div className="spinner-container">
        <div className={spinnerClassName} role="status" aria-label="Loading">
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="spinner-text">{text}</span>
      </div>
    );
  }

  return (
    <div className={spinnerClassName} role="status" aria-label="Loading">
      <span className="visually-hidden">Loading...</span>
    </div>
  );
}

LoadingSpinner.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  color: PropTypes.oneOf(['primary', 'white']),
  text: PropTypes.string,
  className: PropTypes.string
};

export default LoadingSpinner;
