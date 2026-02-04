import { create } from 'zustand';
import { buildSearchQuery, getItemPrice } from '../utils/searchUtils';
import { supabase } from '../utils/supabase';
import {
  calculateMarketPressure,
  calculateMarketConfidence,
  calculateLiquidityScore,
  determineMarketTier,
  generatePersonaAdvice,
  getPricingRecommendations
} from '../utils/marketAnalysisUtils';

/**
 * Search Store - Zustand store for managing card search functionality
 * 
 * Handles:
 * - Search query and filters
 * - Sold listings (comps)
 * - Active listings
 * - FMV calculations
 * - Loading and error states
 */

/**
 * Helper to get auth headers for authenticated users
 * Uses Supabase session token if available
 * @returns {Promise<Object>} - Headers object with Authorization if logged in
 */
const getAuthHeaders = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { 'Authorization': `Bearer ${session.access_token}` };
    }
  } catch (e) {
    console.warn('[searchStore] Failed to get auth session:', e);
  }
  return {};
};

const useSearchStore = create((set, get) => ({
  // ============================================================================
  // STATE
  // ============================================================================
  
  // Query state
  query: '',
  filters: {
    excludeLots: false,
    ungradedOnly: false,
    baseOnly: false
  },
  
  // Results state
  soldListings: [],
  activeListings: [],
  
  // Statistics from sold listings
  stats: null,  // { min_price, max_price, avg_price, count }
  
  // Fair Market Value data
  fmv: null,    // { market_value, quick_sale, patient_sale, expected_low, expected_high, count }
  
  // Loading states
  loading: false,
  loadingComps: false,
  loadingActive: false,
  loadingFmv: false,
  loadingMarketAnalysis: false,
  
  // Error state
  error: null,
  
  // UI state
  showAllActive: false,  // Toggle for "See All" active listings (vs only below FMV)
  
  // Market Analysis state
  marketMetrics: null,   // { pressure, confidence, liquidity }
  marketTier: null,      // { tier, label, color, icon, description }
  marketAdvice: null,    // { collector, seller, flipper }
  pricingRecommendations: null,  // { quickSale, target, patientSale, rangeMin, rangeMax }
  marketMessage: null,   // API response from /market-message endpoint
  
  // ============================================================================
  // SIMPLE SETTERS
  // ============================================================================
  
  /**
   * Set the search query
   */
  setQuery: (query) => set({ query }),
  
  /**
   * Update filter options (merges with existing)
   */
  setFilters: (filters) => set((state) => ({ 
    filters: { ...state.filters, ...filters } 
  })),
  
  /**
   * Toggle a specific filter
   */
  toggleFilter: (filterName) => set((state) => ({
    filters: { ...state.filters, [filterName]: !state.filters[filterName] }
  })),
  
  /**
   * Set showAllActive toggle
   */
  setShowAllActive: (show) => set({ showAllActive: show }),
  
  /**
   * Toggle showAllActive
   */
  toggleShowAllActive: () => set((state) => ({ showAllActive: !state.showAllActive })),
  
  // ============================================================================
  // MAIN SEARCH ACTION
  // ============================================================================
  
  /**
   * Execute search - fetches sold listings, calculates FMV, then fetches active listings
   * This mirrors the flow from the original script.js runSearchInternal()
   */
  search: async () => {
    const { query, filters } = get();
    
    // Validate query
    if (!query.trim()) {
      set({ error: 'Please enter a search query' });
      return;
    }
    
    // Reset state for new search
    set({
      loading: true,
      error: null,
      soldListings: [],
      activeListings: [],
      stats: null,
      fmv: null,
      showAllActive: false,
      marketMetrics: null,
      marketTier: null,
      marketAdvice: null,
      pricingRecommendations: null,
      marketMessage: null
    });
    
    // Build full query with exclusion terms
    const fullQuery = buildSearchQuery(query, filters);
    
    try {
      // Get auth headers for authenticated requests
      const authHeaders = await getAuthHeaders();
      
      // ========================================
      // STEP 1: Fetch sold listings (comps)
      // ========================================
      set({ loadingComps: true });
      console.log('[searchStore] Fetching sold listings...');
      
      const compsParams = new URLSearchParams({
        query: fullQuery,
        pages: '1',
        delay: '2',
        ungraded_only: String(filters.ungradedOnly)
      });
      
      const compsResponse = await fetch(`/comps?${compsParams}`, {
        headers: authHeaders
      });
      
      if (!compsResponse.ok) {
        const errorText = await compsResponse.text();
        
        // Handle specific error codes
        if (compsResponse.status === 429) {
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error?.code === 'SEARCH_LIMIT_EXCEEDED') {
              throw new Error(`Search limit exceeded. Upgrade your plan for more searches.`);
            }
          } catch (e) {
            if (e.message.includes('Search limit')) throw e;
          }
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        
        if (compsResponse.status === 422) {
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.detail?.[0]?.type === 'string_too_long') {
              throw new Error('Search query is too long. Try using fewer filters or a shorter search term.');
            }
          } catch (e) {
            if (e.message.includes('too long')) throw e;
          }
        }
        
        throw new Error(`Failed to fetch sold listings: ${compsResponse.status}`);
      }
      
      const compsData = await compsResponse.json();
      
      set({
        soldListings: compsData.items || [],
        stats: {
          min: compsData.min_price,
          max: compsData.max_price,
          avg: compsData.avg_price,
          count: compsData.items?.length || 0
        },
        loadingComps: false
      });
      
      console.log('[searchStore] Fetched', compsData.items?.length || 0, 'sold listings');
      // 🔍 DEBUG: Log the stats object structure
      console.log('[searchStore DEBUG] Stats stored in state:', {
        min: compsData.min_price,
        max: compsData.max_price,
        avg: compsData.avg_price,
        count: compsData.items?.length || 0
      });
      
      // ========================================
      // STEP 2: Calculate FMV
      // ========================================
      set({ loadingFmv: true });
      console.log('[searchStore] Calculating FMV...');
      
      const fmvResponse = await fetch('/fmv', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ items: compsData.items || [] })
      });
      
      if (!fmvResponse.ok) {
        console.warn('[searchStore] FMV calculation failed:', fmvResponse.status);
        // Don't throw - FMV failure shouldn't stop the search
        set({ fmv: null, loadingFmv: false });
      } else {
        const fmvData = await fmvResponse.json();
        set({
          fmv: {
            marketValue: fmvData.market_value || fmvData.expected_high,
            quickSale: fmvData.quick_sale || fmvData.expected_low,
            patientSale: fmvData.patient_sale || fmvData.expected_high,
            expectedLow: fmvData.expected_low,
            expectedHigh: fmvData.expected_high,
            count: fmvData.count
          },
          loadingFmv: false
        });
        console.log('[searchStore] FMV calculated:', fmvData.market_value || fmvData.expected_high);
        // 🔍 DEBUG: Log the FMV object structure
        console.log('[searchStore DEBUG] FMV stored in state:', {
          marketValue: fmvData.market_value || fmvData.expected_high,
          quickSale: fmvData.quick_sale || fmvData.expected_low,
          patientSale: fmvData.patient_sale || fmvData.expected_high,
          expectedLow: fmvData.expected_low,
          expectedHigh: fmvData.expected_high,
          count: fmvData.count
        });
      }
      
      // ========================================
      // STEP 3: Fetch active listings
      // ========================================
      set({ loadingActive: true });
      console.log('[searchStore] Fetching active listings...');
      
      const activeParams = new URLSearchParams({
        query: fullQuery,
        pages: '1',
        delay: '2'
      });
      
      try {
        const activeResponse = await fetch(`/active?${activeParams}`, {
          headers: authHeaders
        });
        
        if (!activeResponse.ok) {
          console.warn('[searchStore] Active listings fetch failed:', activeResponse.status);
          set({ activeListings: [], loadingActive: false });
        } else {
          const activeData = await activeResponse.json();
          set({ 
            activeListings: activeData.items || [],
            loadingActive: false
          });
          console.log('[searchStore] Fetched', activeData.items?.length || 0, 'active listings');
        }
      } catch (activeError) {
        // Active listings failure shouldn't break the whole search
        console.warn('[searchStore] Active listings error:', activeError);
        set({ activeListings: [], loadingActive: false });
      }
      
    } catch (error) {
      console.error('[searchStore] Search error:', error);
      set({ error: error.message });
    } finally {
      set({ 
        loading: false, 
        loadingComps: false, 
        loadingFmv: false, 
        loadingActive: false 
      });
    }
  },
  
  // ============================================================================
  // COMPUTED / DERIVED VALUES
  // ============================================================================
  
  /**
   * Get filtered active listings based on showAllActive toggle and FMV
   * Returns only Buy It Now listings, optionally filtered to at/below FMV
   * @returns {Array} - Filtered and sorted active listings
   */
  getFilteredActiveListings: () => {
    const { activeListings, fmv, showAllActive } = get();
    
    if (!activeListings || activeListings.length === 0) return [];
    
    // Filter for Buy It Now only
    let filtered = activeListings.filter(item => {
      const buyingFormat = (item.buying_format || '').toLowerCase();
      const hasBuyItNow = buyingFormat.includes('buy it now');
      const price = getItemPrice(item);
      return hasBuyItNow && price > 0;
    });
    
    // If not showing all AND we have FMV, filter to items at or below FMV
    if (!showAllActive && fmv?.marketValue) {
      filtered = filtered.filter(item => {
        const price = getItemPrice(item);
        return price <= fmv.marketValue;
      });
    }
    
    // Sort by price (lowest to highest)
    filtered.sort((a, b) => getItemPrice(a) - getItemPrice(b));
    
    return filtered;
  },
  
  /**
   * Get count of deals (listings below FMV)
   * @returns {number} - Count of listings below FMV
   */
  getDealsCount: () => {
    const { activeListings, fmv } = get();
    
    if (!activeListings || !fmv?.marketValue) return 0;
    
    return activeListings.filter(item => {
      const buyingFormat = (item.buying_format || '').toLowerCase();
      const hasBuyItNow = buyingFormat.includes('buy it now');
      const price = getItemPrice(item);
      return hasBuyItNow && price > 0 && price <= fmv.marketValue;
    }).length;
  },
  
  /**
   * Check if search has results
   * @returns {boolean}
   */
  hasResults: () => {
    const { soldListings } = get();
    return soldListings && soldListings.length > 0;
  },
  
  /**
   * Check if we have valid FMV data
   * @returns {boolean}
   */
  hasFmv: () => {
    const { fmv } = get();
    return fmv && (fmv.marketValue || fmv.expectedHigh);
  },
  
  /**
   * Check if we have calculated market metrics
   * @returns {boolean}
   */
  hasMarketMetrics: () => {
    const { marketMetrics } = get();
    return marketMetrics !== null;
  },
  
  // ============================================================================
  // MARKET ANALYSIS ACTIONS
  // ============================================================================
  
  /**
   * Calculate market metrics from current sold/active listings and FMV
   * Call this after search completes to populate market analysis data
   */
  calculateMarketMetrics: () => {
    const { soldListings, activeListings, fmv } = get();
    
    if (!soldListings || soldListings.length === 0) {
      console.log('[searchStore] Cannot calculate market metrics - no sold listings');
      return;
    }
    
    set({ loadingMarketAnalysis: true });
    
    try {
      const fmvValue = fmv?.marketValue || fmv?.expectedHigh;
      
      // Calculate individual metrics
      const pressure = calculateMarketPressure(activeListings, fmvValue);
      const confidence = calculateMarketConfidence(soldListings);
      const liquidity = calculateLiquidityScore(
        soldListings.length,
        activeListings?.length || 0
      );
      
      const metrics = { pressure, confidence, liquidity };
      
      // Determine market tier and generate advice
      const tier = determineMarketTier(metrics);
      const advice = generatePersonaAdvice(tier, metrics);
      
      // Calculate pricing recommendations
      const pricing = fmvValue
        ? getPricingRecommendations(fmvValue, pressure, liquidity)
        : null;
      
      set({
        marketMetrics: metrics,
        marketTier: tier,
        marketAdvice: advice,
        pricingRecommendations: pricing,
        loadingMarketAnalysis: false
      });
      
      console.log('[searchStore] Market metrics calculated:', {
        pressure: pressure.value,
        confidence: confidence.value,
        liquidity: liquidity.value,
        tier: tier.label
      });
      
    } catch (error) {
      console.error('[searchStore] Error calculating market metrics:', error);
      set({ loadingMarketAnalysis: false });
    }
  },
  
  /**
   * Fetch market message from /market-message API endpoint
   * Provides tier-specific advice based on market conditions
   */
  fetchMarketMessage: async () => {
    const { marketTier, fmv, soldListings, activeListings } = get();
    
    if (!marketTier || !fmv) {
      console.log('[searchStore] Cannot fetch market message - missing tier or FMV');
      return;
    }
    
    try {
      const authHeaders = await getAuthHeaders();
      
      const response = await fetch('/market-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          // REQUIRED fields from marketMetrics
          market_pressure: get().marketMetrics.pressure.value,
          liquidity_score: get().marketMetrics.liquidity.value,
          market_confidence: get().marketMetrics.confidence.value,
          
          // Optional field
          fmv: fmv.marketValue || fmv.expectedHigh
        })
      });
      
      if (response.ok) {
        const messageData = await response.json();
        set({ marketMessage: messageData });
        console.log('[searchStore] Market message fetched:', messageData);
      } else {
        console.warn('[searchStore] Market message fetch failed:', response.status);
      }
    } catch (error) {
      console.warn('[searchStore] Error fetching market message:', error);
    }
  },
  
  // ============================================================================
  // CLEAR / RESET
  // ============================================================================
  
  /**
   * Clear search state (reset everything)
   */
  clearSearch: () => set({
    query: '',
    soldListings: [],
    activeListings: [],
    stats: null,
    fmv: null,
    error: null,
    showAllActive: false,
    loading: false,
    loadingComps: false,
    loadingActive: false,
    loadingFmv: false,
    loadingMarketAnalysis: false,
    marketMetrics: null,
    marketTier: null,
    marketAdvice: null,
    pricingRecommendations: null,
    marketMessage: null
  }),
  
  /**
   * Clear just the results (keep query and filters)
   */
  clearResults: () => set({
    soldListings: [],
    activeListings: [],
    stats: null,
    fmv: null,
    error: null,
    showAllActive: false,
    marketMetrics: null,
    marketTier: null,
    marketAdvice: null,
    pricingRecommendations: null,
    marketMessage: null
  }),
  
  /**
   * Clear error state
   */
  clearError: () => set({ error: null })
}));

export default useSearchStore;
