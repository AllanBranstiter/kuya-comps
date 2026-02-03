import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import { ErrorBoundary, LoadingSpinner } from './components/ui';
import './styles/components.css';

// Lazy load pages for code splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const CollectionPage = lazy(() => import('./pages/CollectionPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

/**
 * Custom fallback component for route-level errors
 */
function RouteFallback({ error, retry }) {
  return (
    <div className="error-boundary-fallback">
      <h2>Page Error</h2>
      <p>{error?.message || 'This page encountered an error. Please try again.'}</p>
      <button onClick={retry}>Reload Page</button>
    </div>
  );
}

/**
 * Loading fallback for Suspense while lazy components load
 */
function PageLoadingFallback() {
  return (
    <div className="page-loading">
      <LoadingSpinner size="lg" />
      <p>Loading page...</p>
    </div>
  );
}

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content" id="main-content">
        <ErrorBoundary fallback={RouteFallback}>
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/collection" element={<CollectionPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
