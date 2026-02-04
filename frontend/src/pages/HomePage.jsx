import { SearchForm, SoldListingsTable, ActiveListingsTable, StatsGrid, FMVDisplay } from '../components/search';
import { BeeswarmChart, VolumeProfileChart } from '../components/charts';
import { AnalysisDashboard } from '../components/analysis';
import useSearchStore from '../stores/searchStore';
import styles from './HomePage.module.css';

/**
 * Home Page - Comps & Analysis (main search page)
 * Full search interface with sold listings, active listings, FMV calculations,
 * and comprehensive market analysis dashboard.
 */
function HomePage() {
  const { loading, error, hasResults, clearError } = useSearchStore(state => ({
    loading: state.loading,
    error: state.error,
    hasResults: state.hasResults(),
    clearError: state.clearError
  }));

  return (
    <div className="home-page">
      {/* Max-width container for wide monitors */}
      <div className={styles.pageContainer}>
        <section className="search-section">
          <SearchForm />
        </section>
        
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={clearError}>Dismiss</button>
          </div>
        )}
        
        {hasResults && (
          <>
            <section className={styles.statsSection}>
              <StatsGrid />
              <FMVDisplay />
            </section>
            
            <section className={styles.chartsSection}>
              <div className={styles.chartContainer}>
                <h3>Price Distribution</h3>
                <div className={styles.chartWrapper}>
                  <BeeswarmChart />
                </div>
              </div>
              <div className={styles.chartContainer}>
                <h3>Volume Profile</h3>
                <div className={styles.chartWrapper}>
                  <VolumeProfileChart />
                </div>
              </div>
            </section>
            
            {/* Market Analysis Dashboard - Phase 5 */}
            <AnalysisDashboard />
            
            <section className={styles.resultsSection}>
              <div className="sold-listings-section">
                <h3>Sold Listings (Comps)</h3>
                <SoldListingsTable />
              </div>
              
              <div className="active-listings-section">
                <h3>Active Listings</h3>
                <ActiveListingsTable />
              </div>
            </section>
          </>
        )}
        
        {!hasResults && !loading && (
          <div className="search-placeholder">
            <h2>Search for Sports Cards</h2>
            <p>Enter a card name to find sold comps and active listings</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default HomePage;
