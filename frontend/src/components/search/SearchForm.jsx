import { useCallback } from 'react';
import PropTypes from 'prop-types';
import useSearchStore from '../../stores/searchStore';
import { Button, Input } from '../ui';

/**
 * Search form component with query input and filter checkboxes
 * 
 * Features:
 * - Text input for search query
 * - Three filter checkboxes: excludeLots, ungradedOnly, baseOnly
 * - Search button with loading state
 * - Clear button
 * - Submit on Enter key or button click
 */
function SearchForm({ className = '' }) {
  const { 
    query, 
    setQuery, 
    filters, 
    toggleFilter, 
    search, 
    clearSearch, 
    loading 
  } = useSearchStore();

  // Handle form submission
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (query.trim()) {
      search();
    }
  }, [query, search]);

  // Handle Enter key in input
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  }, [handleSubmit]);

  // Handle input change
  const handleQueryChange = useCallback((e) => {
    setQuery(e.target.value);
  }, [setQuery]);

  return (
    <form 
      className={`search-form ${className}`} 
      onSubmit={handleSubmit}
      role="search"
    >
      {/* Search Input */}
      <div className="search-input-container">
        <Input
          type="text"
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Search for a card (e.g., 2020 Topps Chrome Luis Robert RC)"
          className="search-input"
          aria-label="Search query"
          iconLeft={
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          }
        />
      </div>

      {/* Filter Checkboxes */}
      <div className="search-filters" role="group" aria-label="Search filters">
        <label className="search-filter-checkbox" title="Exclude listings that contain multiple cards (lots, bundles, 2x, 3x, etc.)">
          <input
            type="checkbox"
            checked={filters.excludeLots}
            onChange={() => toggleFilter('excludeLots')}
          />
          <span className="checkbox-label">Exclude Lots</span>
          <span className="tooltip-icon" aria-hidden="true">ⓘ</span>
          <span className="tooltip-text">Filter out multi-card listings, bundles, and lots</span>
        </label>

        <label className="search-filter-checkbox" title="Only show raw/ungraded cards (excludes PSA, BGS, SGC, etc.)">
          <input
            type="checkbox"
            checked={filters.ungradedOnly}
            onChange={() => toggleFilter('ungradedOnly')}
          />
          <span className="checkbox-label">Raw Only</span>
          <span className="tooltip-icon" aria-hidden="true">ⓘ</span>
          <span className="tooltip-text">Exclude all graded cards (PSA, BGS, SGC, etc.)</span>
        </label>

        <label className="search-filter-checkbox" title="Exclude parallels, refractors, variations, and short prints">
          <input
            type="checkbox"
            checked={filters.baseOnly}
            onChange={() => toggleFilter('baseOnly')}
          />
          <span className="checkbox-label">Base Only</span>
          <span className="tooltip-icon" aria-hidden="true">ⓘ</span>
          <span className="tooltip-text">Exclude parallels, refractors, and variations</span>
        </label>
      </div>

      {/* Action Buttons */}
      <div className="search-actions">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          disabled={!query.trim()}
          className="search-button"
        >
          {loading ? 'Searching...' : 'Search'}
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={clearSearch}
          disabled={loading}
          className="search-clear-button"
        >
          Clear
        </Button>
      </div>
    </form>
  );
}

SearchForm.propTypes = {
  className: PropTypes.string
};

export default SearchForm;
