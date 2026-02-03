/**
 * Search utility functions for kuya-comps React frontend
 * Ported from static/script.js for the React migration
 */

/**
 * Build search query with exclusions based on filter options
 * @param {string} query - Base search query
 * @param {Object} filters - { excludeLots, ungradedOnly, baseOnly }
 * @returns {string} - Query with exclusion terms appended
 */
export function buildSearchQuery(query, filters = {}) {
  const { excludeLots = false, ungradedOnly = false, baseOnly = false } = filters;
  
  let allExcludedPhrases = [];

  if (excludeLots) {
    const lotExclusions = [
      // Lot terms
      '-lot', '-"team lot"', '-"player lot"', '-"small lot"', '-"huge lot"', '-"mixed lot"',
      '-"random lot"', '-"mystery lot"', '-"assorted lot"', '-"lot of"', '-"lotof"',
      '-bulk', '-bundle',
      
      // Quantity indicators (parentheses)
      '-"(2)"', '-"(3)"', '-"(4)"', '-"(5)"', '-"(6)"', '-"(7)"', '-"(8)"', '-"(9)"',
      '-"(10)"', '-"(12)"', '-"(15)"', '-"(20)"',
      
      // Card count terms
      '-"2 cards"', '-"3 cards"', '-"4 cards"', '-"5 cards"', '-"6 cards"', '-"7 cards"',
      '-"8 cards"', '-"9 cards"', '-"10 cards"',
      '-"2 card"', '-"3 card"', '-"4 card"', '-"5 card"',
      
      // Multiplier terms
      '-"2x"', '-"3x"', '-"4x"', '-"5x"', '-"6x"', '-"10x"', '-"x cards"', '-"x card"',
      '-"count"', '-"ct"', '-"ct."',
      
      // Multi/duplicate terms
      '-multi', '-multiple', '-multiples', '-duplicate', '-duplicates', '-dupe', '-dupes',
      '-"group of"', '-"set of"'
    ];
    allExcludedPhrases = allExcludedPhrases.concat(lotExclusions);
  }

  if (ungradedOnly) {
    const rawOnlyExclusions = [
      // PSA related
      '-psa', '-"psa 10"', '-"psa10"', '-"psa 9"', '-"psa9"', '-"psa graded"', '-"psa slab"',
      '-"Professional Sports Authenticator"', '-"Professional Authenticator"',
      '-"Pro Sports Authenticator"', '-"Certified 10"', '-"Certified Gem"', '-"Certified Mint"',
      '-"Red Label"', '-lighthouse', '-"Gem Mint 10"', '-"Graded 10"',
      
      // BGS related
      '-bgs', '-"bgs 9"', '-"bgs9"', '-"bgs 9.5"', '-"bgs9.5"', '-beckett', '-"beckett graded"',
      '-"Gem 10"', '-"Black Label"', '-"Gold Label"', '-"Silver Label"',
      '-subgrades', '-"sub grades"', '-subs', '-"Quad 9.5"', '-"quad9"', '-"quad 9"',
      '-"True Gem"', '-"True Gem+"', '-"Gem+"', '-bvg',
      
      // SGC related
      '-sgc', '-"sgc 10"', '-"sgc 9"', '-"sgc graded"',
      '-"Tuxedo Slab"', '-"Black Slab"', '-"Green Label"', '-"SG LLC"',
      '-"SG Grading"', '-"Mint+ 9.5"', '-"10 Pristine"',
      
      // CGC/CSG related
      '-csg', '-cgc', '-"csg graded"', '-"cgc graded"',
      '-"Certified Collectibles Group"', '-"CGC Trading Cards"', '-"CSG Gem"',
      '-"Pristine 10"', '-"Perfect 10"', '-"Green Slab"',
      
      // GMA related
      '-gma', '-"gma graded"', '-"gma 10"',
      
      // HGA related
      '-hga', '-"hga graded"', '-"hybrid grading"',
      
      // KSA related
      '-ksa', '-"ksa graded"',
      
      // PCA/PGSC related
      '-pca', '-"pca graded"', '-pgsc',
      
      // Other grading companies
      '-fgs', '-pgi', '-pro', '-isa', '-mnt', '-"MNT Grading"',
      '-rcg', '-"TCG Grading"', '-bccg', '-tag', '-pgs', '-tga', '-ace', '-usg',
      '-kmgs', '-egs', '-agc', '-mgs',
      
      // General grading terms
      '-slab', '-slabbed', '-encased', '-encapsulated', '-holdered',
      '-graded', '-"grade"', '-authenticated', '-"authentic"', '-"auto grade"', '-verified',
      '-gem', '-"gem mint"', '-"gem10"', '-"gem 10"', '-"gem-mint"', '-gemmint',
      '-pristine', '-"Mint 10"', '-"mint10"', '-"Mint 9"', '-"mint9"',
      '-"mt 10"', '-"10 mt"', '-"Mint+"', '-"NM-MT"',
      '-"Slabbed Card"', '-"Third-Party Graded"', '-"Certified Authentic"', '-"Pro Graded"',
      '-"Slabbed up"', '-"In case"',
      '-"Graded Rookie"', '-"Graded RC"', '-"Gem Rookie"', '-"Gem RC"',
      
      // Population and authentication terms
      '-"population"', '-"pop report"', '-"pop 1"', '-"pop1"',
      
      // Card storage/holder terms
      '-"card saver"', '-cardsaver', '-"semi rigid"', '-"semi-rigid"',
      '-"one touch"', '-"one-touch"', '-mag', '-"mag case"'
    ];
    allExcludedPhrases = allExcludedPhrases.concat(rawOnlyExclusions);
  }

  if (baseOnly) {
    const baseOnlyExclusions = [
      // Existing exclusions
      '-refractors', '-red', '-aqua', '-blue', '-magenta', '-yellow', '-lot',
      '-x-fractors', '-xfractors', '-helix', '-superfractor', '-x-fractor',
      '-logofractor', '-stars', '-hyper', '-all', '-etch', '-silver', '-variation',
      '-variations', '-refractor', '-prism', '-prizm', '-xfractor', '-gilded',
      '-"buy-back"', '-buyback',
      '-SP', '-sp', '-"short print"', '-"Short Print"', '-ssp', '-SSP',
      '-"super short print"', '-"Super Short Print"',
      
      // Additional variant/parallel exclusions
      '-foil', '-shimmer', '-lava', '-wave', '-raywave', '-speckle', '-mojo',
      '-sapphire', '-ice', '-cracked', '-checker', '-optic', '-paper',
      '-sepia', '-"negative refractor"',
      
      // Additional color exclusions
      '-green', '-orange', '-gold', '-purple', '-pink', '-fuchsia', '-teal',
      '-sky', '-lime', '-bronze', '-copper', '-black', '-white'
    ];
    allExcludedPhrases = allExcludedPhrases.concat(baseOnlyExclusions);
  }

  let finalQuery = query;
  if (allExcludedPhrases.length > 0) {
    finalQuery = `${query} ${allExcludedPhrases.join(' ')}`;
  }
  
  return finalQuery;
}

/**
 * Format currency for display
 * @param {number} amount - The amount to format
 * @returns {string} - Formatted currency string
 */
export function formatMoney(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$-.--';
  }
  return '$' + amount.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
}

/**
 * Calculate price with fallback (for active listings)
 * Handles total_price vs extracted_price + extracted_shipping
 * @param {Object} item - Listing item from API
 * @returns {number} - Calculated price
 */
export function getItemPrice(item) {
  if (!item) return 0;
  return item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
}

/**
 * Filter outliers using IQR (Interquartile Range) method
 * Standard 1.5 * IQR threshold for outlier detection
 * @param {number[]} prices - Array of prices to filter
 * @returns {number[]} - Filtered array with outliers removed
 */
export function filterOutliers(prices) {
  if (!prices || prices.length === 0) return [];
  
  if (prices.length < 4) {
    // Need at least 4 data points for meaningful outlier detection
    return [...prices];
  }
  
  // Sort prices to find quartiles
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  
  // Calculate Q1, Q3, and IQR
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;
  
  // Define outlier bounds (1.5 * IQR is the standard threshold)
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  
  // Filter out outliers
  const filtered = prices.filter(price => price >= lowerBound && price <= upperBound);
  
  return filtered;
}

/**
 * Escape HTML for safe display (XSS prevention)
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML string
 */
export function escapeHtml(text) {
  if (text == null) return '';
  
  // Use textContent/innerHTML trick for efficient escaping
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Calculate standard deviation for a set of values
 * Used for market confidence calculations
 * @param {number[]} values - Array of numeric values
 * @returns {number} - Standard deviation
 */
export function calculateStdDev(values) {
  if (!values || values.length === 0) return 0;
  
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  
  return Math.sqrt(avgSquareDiff);
}

/**
 * Calculate market confidence based on price consistency
 * Higher score = more consistent prices = more reliable FMV
 * @param {number[]} prices - Array of sale prices
 * @returns {number} - Confidence score 0-100
 */
export function calculateMarketConfidence(prices) {
  if (!prices || prices.length === 0) return 0;
  
  const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const stdDev = calculateStdDev(prices);
  
  // Coefficient of Variation as percentage
  const coefficientOfVariation = (stdDev / avg) * 100;
  
  // Scale: CoV=0% → confidence=100, CoV=100% → confidence=50, CoV=200% → confidence=33
  const confidence = Math.round(100 / (1 + coefficientOfVariation / 100));
  
  return Math.min(100, Math.max(0, confidence));
}

/**
 * Calculate weighted median based on price clustering
 * Prices that appear more frequently get higher weight
 * @param {number[]} prices - Array of prices
 * @returns {number|null} - Weighted median price
 */
export function calculateWeightedMedian(prices) {
  if (!prices || prices.length === 0) return null;
  if (prices.length === 1) return prices[0];
  
  // Group prices by value and count occurrences
  const priceCounts = {};
  prices.forEach(price => {
    // Round to nearest cent to group similar prices
    const roundedPrice = Math.round(price * 100) / 100;
    priceCounts[roundedPrice] = (priceCounts[roundedPrice] || 0) + 1;
  });
  
  // Sort unique prices
  const uniquePrices = Object.keys(priceCounts)
    .map(p => parseFloat(p))
    .sort((a, b) => a - b);
  
  // Calculate total count
  const totalCount = prices.length;
  const targetCount = totalCount / 2;
  
  // Find weighted median
  let cumulativeCount = 0;
  for (const price of uniquePrices) {
    cumulativeCount += priceCounts[price];
    if (cumulativeCount >= targetCount) {
      return price;
    }
  }
  
  // Fallback to last price
  return uniquePrices[uniquePrices.length - 1];
}

/**
 * Format a price to .99 style list price
 * Useful for pricing recommendations
 * @param {number} value - The price to convert
 * @returns {number|null} - Price ending in .99
 */
export function toNinetyNine(value) {
  if (value == null || isNaN(value)) return null;
  const ceil = Math.ceil(value);
  const base = Math.max(ceil, 1);
  return base - 0.01;
}

/**
 * Calculate data quality score based on sample sizes
 * @param {number} soldCount - Number of sold items
 * @param {number} activeCount - Number of active listings
 * @param {number} confidence - Market confidence score
 * @returns {number} - Data quality score 0-100
 */
export function calculateDataQuality(soldCount, activeCount, confidence) {
  // Sample size component (60% weight)
  let sampleScore = 0;
  if (soldCount >= 20 && activeCount >= 10) {
    sampleScore = 100;
  } else if (soldCount >= 10 && activeCount >= 5) {
    sampleScore = 70;
  } else if (soldCount >= 5 && activeCount >= 3) {
    sampleScore = 40;
  } else {
    sampleScore = 20;
  }
  
  // Confidence component (40% weight)
  const confidenceScore = confidence || 0;
  
  // Weighted average
  return Math.round(sampleScore * 0.6 + confidenceScore * 0.4);
}

/**
 * Debounce helper function to prevent rapid-fire function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait before executing
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Check if running on a mobile device
 * @returns {boolean}
 */
export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Check if running on iOS device
 * @returns {boolean}
 */
export function isIOSDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
