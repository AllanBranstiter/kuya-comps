import { useState, useCallback } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Button } from '../ui';
import AuthModal from '../auth/AuthModal';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Header component with navigation and auth status
 */
function Header() {
  const { isAuthenticated, user, signOut, loading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await signOut();
    }
  }, [signOut]);

  const openAuthModal = useCallback(() => {
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  // Get user display name
  const getUserDisplayName = () => {
    if (!user) return '';
    
    const metadata = user.user_metadata;
    if (metadata?.first_name) {
      return metadata.first_name;
    }
    if (metadata?.full_name) {
      return metadata.full_name.split(' ')[0];
    }
    return user.email?.split('@')[0] || 'User';
  };

  return (
    <>
      <header className="header">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        
        <div className="header-container">
          {/* Logo */}
          <Link to="/" className="header-logo">
            <span className="header-logo-text">Kuya Comps</span>
          </Link>

          {/* Navigation */}
          <nav className="header-nav" aria-label="Main navigation">
            <NavLink 
              to="/" 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              end
            >
              Comps & Analysis
            </NavLink>
            
            {isAuthenticated && (
              <>
                <NavLink
                  to="/collection"
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  Collection
                </NavLink>
                <NavLink
                  to="/settings"
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  Settings
                </NavLink>
              </>
            )}
          </nav>

          {/* Auth Actions */}
          <div className="header-actions">
            {isAuthenticated ? (
              <>
                <span className="user-info">
                  <span aria-hidden="true">👤</span>
                  {getUserDisplayName()}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleLogout}
                  disabled={loading}
                >
                  Logout
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={openAuthModal}
                disabled={loading}
              >
                Login
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={closeAuthModal} 
      />
    </>
  );
}

export default Header;
