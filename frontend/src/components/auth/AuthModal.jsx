import { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Input } from '../ui';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Authentication Modal with Login and Signup forms
 */
function AuthModal({ isOpen, onClose }) {
  const { signIn, signUp, resetPassword, loading, error, clearError } = useAuth();
  
  const [activeTab, setActiveTab] = useState('login');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Form state
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  });
  
  const [signupForm, setSignupForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  
  const [formErrors, setFormErrors] = useState({});

  // Clear messages when switching tabs
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    setSuccessMessage('');
    setFormErrors({});
    clearError();
  }, [clearError]);

  // Handle login form changes
  const handleLoginChange = useCallback((e) => {
    const { name, value } = e.target;
    setLoginForm(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  }, [formErrors]);

  // Handle signup form changes
  const handleSignupChange = useCallback((e) => {
    const { name, value } = e.target;
    setSignupForm(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  }, [formErrors]);

  // Validate login form
  const validateLoginForm = () => {
    const errors = {};
    
    if (!loginForm.email) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(loginForm.email)) {
      errors.email = 'Please enter a valid email';
    }
    
    if (!loginForm.password) {
      errors.password = 'Password is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Validate signup form
  const validateSignupForm = () => {
    const errors = {};
    
    if (!signupForm.firstName) {
      errors.firstName = 'First name is required';
    }
    
    if (!signupForm.lastName) {
      errors.lastName = 'Last name is required';
    }
    
    if (!signupForm.email) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(signupForm.email)) {
      errors.email = 'Please enter a valid email';
    }
    
    if (!signupForm.password) {
      errors.password = 'Password is required';
    } else if (signupForm.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    if (!signupForm.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (signupForm.password !== signupForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle login submit
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateLoginForm()) return;
    
    setSuccessMessage('');
    
    const result = await signIn(loginForm.email, loginForm.password);
    
    if (!result.error) {
      setSuccessMessage('Login successful! Welcome back.');
      setTimeout(() => {
        onClose();
        setLoginForm({ email: '', password: '' });
        setSuccessMessage('');
      }, 1500);
    }
  };

  // Handle signup submit
  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateSignupForm()) return;
    
    setSuccessMessage('');
    
    const metadata = {
      first_name: signupForm.firstName,
      last_name: signupForm.lastName,
      full_name: `${signupForm.firstName} ${signupForm.lastName}`
    };
    
    const result = await signUp(signupForm.email, signupForm.password, metadata);
    
    if (!result.error) {
      setSuccessMessage('Account created! Please check your email to verify your account.');
      // Clear form and switch to login after delay
      setTimeout(() => {
        setSignupForm({
          firstName: '',
          lastName: '',
          email: '',
          password: '',
          confirmPassword: ''
        });
        handleTabChange('login');
      }, 3000);
    }
  };

  // Handle forgot password
  const handleForgotPassword = async () => {
    if (!loginForm.email) {
      setFormErrors({ email: 'Please enter your email first' });
      return;
    }
    
    const result = await resetPassword(loginForm.email);
    
    if (!result.error) {
      setSuccessMessage('Password reset email sent! Check your inbox.');
    }
  };

  // Handle modal close
  const handleClose = useCallback(() => {
    setLoginForm({ email: '', password: '' });
    setSignupForm({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: ''
    });
    setFormErrors({});
    setSuccessMessage('');
    clearError();
    onClose();
  }, [clearError, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={activeTab === 'login' ? 'Welcome Back' : 'Create Account'}
      size="md"
    >
      {/* Auth Tabs */}
      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
          onClick={() => handleTabChange('login')}
        >
          Login
        </button>
        <button
          type="button"
          className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
          onClick={() => handleTabChange('signup')}
        >
          Sign Up
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="auth-message auth-message-error">
          <span aria-hidden="true">❌</span>
          {error}
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="auth-message auth-message-success">
          <span aria-hidden="true">✅</span>
          {successMessage}
        </div>
      )}

      {/* Login Form */}
      <form
        className={`auth-form ${activeTab === 'login' ? 'active' : ''}`}
        onSubmit={handleLoginSubmit}
      >
        <div className="auth-form-group">
          <Input
            type="email"
            name="email"
            label="Email"
            placeholder="Enter your email"
            value={loginForm.email}
            onChange={handleLoginChange}
            error={formErrors.email}
            autoComplete="email"
            required
          />
        </div>

        <div className="auth-form-group">
          <Input
            type="password"
            name="password"
            label="Password"
            placeholder="Enter your password"
            value={loginForm.password}
            onChange={handleLoginChange}
            error={formErrors.password}
            autoComplete="current-password"
            required
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          className="auth-submit-btn"
          style={{ width: '100%' }}
        >
          Login
        </Button>

        <div className="auth-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleForgotPassword}
            disabled={loading}
            style={{ fontSize: '0.9rem' }}
          >
            Forgot your password?
          </button>
        </div>
      </form>

      {/* Signup Form */}
      <form
        className={`auth-form ${activeTab === 'signup' ? 'active' : ''}`}
        onSubmit={handleSignupSubmit}
      >
        <div className="auth-form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Input
            type="text"
            name="firstName"
            label="First Name"
            placeholder="John"
            value={signupForm.firstName}
            onChange={handleSignupChange}
            error={formErrors.firstName}
            autoComplete="given-name"
            required
          />
          <Input
            type="text"
            name="lastName"
            label="Last Name"
            placeholder="Doe"
            value={signupForm.lastName}
            onChange={handleSignupChange}
            error={formErrors.lastName}
            autoComplete="family-name"
            required
          />
        </div>

        <div className="auth-form-group">
          <Input
            type="email"
            name="email"
            label="Email"
            placeholder="john@example.com"
            value={signupForm.email}
            onChange={handleSignupChange}
            error={formErrors.email}
            autoComplete="email"
            required
          />
        </div>

        <div className="auth-form-group">
          <Input
            type="password"
            name="password"
            label="Password"
            placeholder="At least 6 characters"
            value={signupForm.password}
            onChange={handleSignupChange}
            error={formErrors.password}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="auth-form-group">
          <Input
            type="password"
            name="confirmPassword"
            label="Confirm Password"
            placeholder="Confirm your password"
            value={signupForm.confirmPassword}
            onChange={handleSignupChange}
            error={formErrors.confirmPassword}
            autoComplete="new-password"
            required
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          className="auth-submit-btn"
          style={{ width: '100%' }}
        >
          Create Account
        </Button>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <a
              href="#login"
              onClick={(e) => {
                e.preventDefault();
                handleTabChange('login');
              }}
            >
              Login here
            </a>
          </p>
        </div>
      </form>
    </Modal>
  );
}

AuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export default AuthModal;
