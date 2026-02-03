import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../components/ui';

/**
 * Settings Page - User settings placeholder
 * This is a placeholder for Phase 1
 * Requires authentication
 */
function SettingsPage() {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, loading, navigate]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="page-container animate-fade-in">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="page-container animate-fade-in-up">
      <div className="page-placeholder">
        <div className="page-placeholder-icon">⚙️</div>
        <h1 className="page-placeholder-title">Settings</h1>
        <p className="page-placeholder-description">
          Manage your account settings, preferences, and subscription.
        </p>

        <p className="text-subtle" style={{ marginTop: '1.5rem' }}>
          User settings page coming in a future phase.
        </p>

        {/* Settings preview cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginTop: '2rem',
          maxWidth: '800px',
          margin: '2rem auto 0'
        }}>
          <div className="card" style={{ textAlign: 'left', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>👤</span> Profile
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
              <li className="text-subtle" style={{ marginBottom: '0.5rem' }}>
                Email: {user?.email}
              </li>
              <li className="text-subtle" style={{ marginBottom: '0.5rem' }}>
                Name: {user?.user_metadata?.full_name || 'Not set'}
              </li>
              <li className="text-subtle">
                Member since: {new Date(user?.created_at).toLocaleDateString()}
              </li>
            </ul>
          </div>

          <div className="card" style={{ textAlign: 'left', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>💳</span> Subscription
            </h3>
            <p className="text-subtle" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              Current Plan: <strong>Free</strong>
            </p>
            <button className="btn btn-secondary btn-sm" disabled style={{ opacity: 0.5 }}>
              Upgrade Plan
            </button>
          </div>

          <div className="card" style={{ textAlign: 'left', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🔔</span> Notifications
            </h3>
            <p className="text-subtle" style={{ fontSize: '0.9rem', marginBottom: 0 }}>
              Email notifications and alerts settings coming soon.
            </p>
          </div>

          <div className="card" style={{ textAlign: 'left', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🔐</span> Security
            </h3>
            <p className="text-subtle" style={{ fontSize: '0.9rem', marginBottom: 0 }}>
              Password change and 2FA settings coming soon.
            </p>
          </div>
        </div>

        <p className="text-subtle" style={{ fontSize: '0.8rem', marginTop: '2rem' }}>
          🚧 Full settings functionality coming in a future phase
        </p>
      </div>
    </div>
  );
}

export default SettingsPage;
