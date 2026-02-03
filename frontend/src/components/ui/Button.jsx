import PropTypes from 'prop-types';
import LoadingSpinner from './LoadingSpinner';

/**
 * Button component with variants, sizes, and loading state
 * 
 * @param {Object} props
 * @param {string} props.variant - 'primary' | 'secondary' | 'danger' | 'ghost'
 * @param {string} props.size - 'sm' | 'md' | 'lg'
 * @param {boolean} props.loading - Shows loading spinner when true
 * @param {boolean} props.disabled - Disables the button
 * @param {string} props.type - Button type: 'button' | 'submit' | 'reset'
 * @param {React.ReactNode} props.children - Button content
 * @param {function} props.onClick - Click handler
 * @param {string} props.className - Additional CSS classes
 */
function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  children,
  onClick,
  className = '',
  ...rest
}) {
  const baseClass = 'btn';
  const variantClass = `btn-${variant}`;
  const sizeClass = `btn-${size}`;
  const loadingClass = loading ? 'btn-loading' : '';
  
  const combinedClassName = [
    baseClass,
    variantClass,
    sizeClass,
    loadingClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={combinedClassName}
      disabled={disabled || loading}
      onClick={onClick}
      {...rest}
    >
      {loading && (
        <LoadingSpinner 
          size="sm" 
          color={variant === 'secondary' || variant === 'ghost' ? 'primary' : 'white'} 
          className="btn-spinner"
        />
      )}
      <span className="btn-text">{children}</span>
    </button>
  );
}

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'secondary', 'danger', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  className: PropTypes.string
};

export default Button;
