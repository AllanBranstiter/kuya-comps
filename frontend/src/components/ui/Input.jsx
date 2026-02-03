import { forwardRef, useId } from 'react';
import PropTypes from 'prop-types';

/**
 * Input component with label, error support, and optional icons
 *
 * @param {Object} props
 * @param {string} props.type - Input type: 'text' | 'password' | 'email' | 'number'
 * @param {string} props.label - Label text
 * @param {string} props.error - Error message
 * @param {React.ReactNode} props.iconLeft - Icon to display on the left
 * @param {React.ReactNode} props.iconRight - Icon to display on the right
 * @param {string} props.className - Additional CSS classes for the wrapper
 * @param {string} props.inputClassName - Additional CSS classes for the input
 */
const Input = forwardRef(function Input({
  type = 'text',
  label,
  error,
  iconLeft,
  iconRight,
  className = '',
  inputClassName = '',
  id,
  ...rest
}, ref) {
  // Generate a stable unique ID using React 18's useId hook
  const generatedId = useId();
  const inputId = id || `input${generatedId}`;
  
  const wrapperClassName = [
    'input-wrapper',
    className
  ].filter(Boolean).join(' ');
  
  const containerClassName = [
    'input-container',
    iconLeft ? 'input-with-icon-left' : '',
    iconRight ? 'input-with-icon-right' : ''
  ].filter(Boolean).join(' ');
  
  const fieldClassName = [
    'input-field',
    error ? 'input-error' : '',
    inputClassName
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
        </label>
      )}
      
      <div className={containerClassName}>
        {iconLeft && (
          <span className="input-icon input-icon-left" aria-hidden="true">
            {iconLeft}
          </span>
        )}
        
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={fieldClassName}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...rest}
        />
        
        {iconRight && (
          <span className="input-icon input-icon-right" aria-hidden="true">
            {iconRight}
          </span>
        )}
      </div>
      
      {error && (
        <span id={`${inputId}-error`} className="input-error-message" role="alert">
          <span aria-hidden="true">⚠️</span>
          {error}
        </span>
      )}
    </div>
  );
});

Input.propTypes = {
  type: PropTypes.oneOf(['text', 'password', 'email', 'number']),
  label: PropTypes.string,
  error: PropTypes.string,
  iconLeft: PropTypes.node,
  iconRight: PropTypes.node,
  className: PropTypes.string,
  inputClassName: PropTypes.string,
  id: PropTypes.string,
  placeholder: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func,
  onBlur: PropTypes.func,
  disabled: PropTypes.bool,
  required: PropTypes.bool,
  autoComplete: PropTypes.string,
  name: PropTypes.string
};

export default Input;
