/**
 * Market Analysis Utilities for kuya-comps React frontend
 * Functions for calculating market metrics and getting display information
 */

import { filterOutliers, calculateStdDev, getItemPrice } from './searchUtils';

/**
 * Calculate market pressure from active listings vs FMV
 * Shows how much sellers are asking above/below fair market value
 * 
 * Formula: ((medianAskingPrice - FMV) / FMV) * 100
 * 
 * @param {Array} activeListings - Array of active listing objects
 * @param {number} fmv - Fair market value
 * @returns {Object} - { value: number, medianAsking: number }
 */
export function calculateMarketPressure(activeListings, fmv) {
  if (!activeListings || activeListings.length === 0 || !fmv || fmv <= 0) {
    return { value: null, medianAsking: null };
  }

  // Extract prices from active listings (Buy It Now only)
  const prices = activeListings
    .filter(item => {
      const buyingFormat = (item.buying_format || '').toLowerCase();
      return buyingFormat.includes('buy it now');
    })
    .map(item => getItemPrice(item))
    .filter(price => price > 0);

  if (prices.length === 0) {
    return { value: null, medianAsking: null };
  }

  // Filter outliers for more accurate median
  const filteredPrices = filterOutliers(prices);
  const pricesToUse = filteredPrices.length > 0 ? filteredPrices : prices;

  // Calculate median asking price
  const sorted = [...pricesToUse].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianAsking = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  // Calculate pressure: how much above FMV are sellers asking?
  const pressure = ((medianAsking - fmv) / fmv) * 100;

  return {
    value: Math.round(pressure * 10) / 10,  // Round to 1 decimal
    medianAsking: Math.round(medianAsking * 100) / 100
  };
}

/**
 * Calculate market confidence from price variance in sold listings
 * Higher score = more consistent prices = more reliable FMV
 * 
 * Formula: 100 / (1 + coefficientOfVariation / 100)
 * 
 * @param {Array} soldListings - Array of sold listing objects
 * @returns {Object} - { value: number, stdDev: number, mean: number }
 */
export function calculateMarketConfidence(soldListings) {
  if (!soldListings || soldListings.length === 0) {
    return { value: null, stdDev: null, mean: null };
  }

  // Extract prices from sold listings
  const prices = soldListings
    .map(item => getItemPrice(item))
    .filter(price => price > 0);

  if (prices.length < 2) {
    return { value: 100, stdDev: 0, mean: prices[0] || 0 };  // Single price = perfect confidence
  }

  // Filter outliers
  const filteredPrices = filterOutliers(prices);
  const pricesToUse = filteredPrices.length >= 2 ? filteredPrices : prices;

  // Calculate mean and standard deviation
  const mean = pricesToUse.reduce((sum, p) => sum + p, 0) / pricesToUse.length;
  const stdDev = calculateStdDev(pricesToUse);

  // Coefficient of Variation as percentage
  const coefficientOfVariation = mean > 0 ? (stdDev / mean) * 100 : 0;

  // Scale: CoV=0% → confidence=100, CoV=100% → confidence=50
  const confidence = Math.round(100 / (1 + coefficientOfVariation / 100));

  return {
    value: Math.min(100, Math.max(0, confidence)),
    stdDev: Math.round(stdDev * 100) / 100,
    mean: Math.round(mean * 100) / 100
  };
}

/**
 * Calculate liquidity score from sold/active ratio (absorption rate)
 * Shows how quickly cards are selling relative to supply
 * 
 * Formula: Absorption ratio = completedSales / activeListings
 * 
 * @param {number} soldCount - Number of recent sold listings
 * @param {number} activeCount - Number of active listings
 * @returns {Object} - { value: number, ratio: number, band: string }
 */
export function calculateLiquidityScore(soldCount, activeCount) {
  if (soldCount === null || soldCount === undefined || 
      activeCount === null || activeCount === undefined) {
    return { value: null, ratio: null, band: 'unknown' };
  }

  // Handle edge cases
  if (activeCount === 0 && soldCount === 0) {
    return { value: 50, ratio: 0, band: 'unknown' };  // No data
  }

  if (activeCount === 0) {
    return { value: 100, ratio: Infinity, band: 'high' };  // All sold, nothing active
  }

  // Calculate absorption ratio
  const ratio = soldCount / activeCount;

  // Convert ratio to 0-100 score using logarithmic scale
  // Ratio 1.0 = score 75, Ratio 0.5 = score 50, Ratio 2.0 = score 90
  let score;
  if (ratio >= 1.0) {
    // High liquidity: scale 75-100
    score = Math.min(100, 75 + (Math.log10(ratio + 1) * 25));
  } else if (ratio >= 0.5) {
    // Moderate liquidity: scale 50-75
    score = 50 + ((ratio - 0.5) * 50);
  } else if (ratio >= 0.2) {
    // Low liquidity: scale 25-50
    score = 25 + ((ratio - 0.2) / 0.3 * 25);
  } else {
    // Very low liquidity: scale 0-25
    score = (ratio / 0.2) * 25;
  }

  // Determine band
  let band;
  if (ratio >= 1.0) {
    band = 'high';
  } else if (ratio >= 0.5) {
    band = 'moderate';
  } else if (ratio >= 0.2) {
    band = 'low';
  } else {
    band = 'very-low';
  }

  return {
    value: Math.round(score),
    ratio: Math.round(ratio * 100) / 100,
    band
  };
}

/**
 * Get display information for a metric value (color, label, description)
 * 
 * @param {'pressure' | 'confidence' | 'liquidity'} metricType - Type of metric
 * @param {number} value - The metric value
 * @returns {Object} - { color, bgColor, label, description, icon }
 */
export function getMetricBand(metricType, value) {
  if (value === null || value === undefined) {
    return {
      color: 'var(--subtle-text-color)',
      bgColor: 'var(--background-color)',
      label: 'N/A',
      description: 'Insufficient data',
      icon: '❓'
    };
  }

  switch (metricType) {
    case 'pressure':
      return getMarketPressureBand(value);
    case 'confidence':
      return getMarketConfidenceBand(value);
    case 'liquidity':
      return getLiquidityBand(value);
    default:
      return {
        color: 'var(--subtle-text-color)',
        bgColor: 'var(--background-color)',
        label: 'Unknown',
        description: 'Unknown metric type',
        icon: '❓'
      };
  }
}

/**
 * Get band info for market pressure value
 * Bands: Below FMV (negative), Healthy (0-15%), Optimistic (15-30%), 
 *        Resistance (30-50%), Unrealistic (50%+)
 */
function getMarketPressureBand(value) {
  if (value < 0) {
    return {
      color: '#28a745',
      bgColor: 'rgba(40, 167, 69, 0.1)',
      label: 'Below FMV',
      description: 'Sellers asking below market value - potential deals available',
      icon: '💰'
    };
  } else if (value <= 15) {
    return {
      color: '#28a745',
      bgColor: 'rgba(40, 167, 69, 0.1)',
      label: 'Healthy',
      description: 'Asking prices align well with recent sales',
      icon: '✅'
    };
  } else if (value <= 30) {
    return {
      color: '#ffc107',
      bgColor: 'rgba(255, 193, 7, 0.1)',
      label: 'Optimistic',
      description: 'Sellers slightly optimistic - room for negotiation',
      icon: '💬'
    };
  } else if (value <= 50) {
    return {
      color: '#fd7e14',
      bgColor: 'rgba(253, 126, 20, 0.1)',
      label: 'Resistance',
      description: 'Significant gap between asking and sold prices',
      icon: '⚠️'
    };
  } else {
    return {
      color: '#dc3545',
      bgColor: 'rgba(220, 53, 69, 0.1)',
      label: 'Unrealistic',
      description: 'Sellers asking well above what market will bear',
      icon: '🚫'
    };
  }
}

/**
 * Get band info for market confidence value
 * Based on price consistency (coefficient of variation)
 */
function getMarketConfidenceBand(value) {
  if (value >= 80) {
    return {
      color: '#28a745',
      bgColor: 'rgba(40, 167, 69, 0.1)',
      label: 'High',
      description: 'Very consistent pricing - FMV is reliable',
      icon: '🎯'
    };
  } else if (value >= 60) {
    return {
      color: '#28a745',
      bgColor: 'rgba(40, 167, 69, 0.1)',
      label: 'Good',
      description: 'Reasonably consistent pricing',
      icon: '✅'
    };
  } else if (value >= 40) {
    return {
      color: '#ffc107',
      bgColor: 'rgba(255, 193, 7, 0.1)',
      label: 'Moderate',
      description: 'Some price variance - FMV is estimate',
      icon: '📊'
    };
  } else if (value >= 20) {
    return {
      color: '#fd7e14',
      bgColor: 'rgba(253, 126, 20, 0.1)',
      label: 'Low',
      description: 'High price variance - use FMV with caution',
      icon: '⚠️'
    };
  } else {
    return {
      color: '#dc3545',
      bgColor: 'rgba(220, 53, 69, 0.1)',
      label: 'Very Low',
      description: 'Prices vary widely - FMV unreliable',
      icon: '❗'
    };
  }
}

/**
 * Get band info for liquidity score
 * Based on absorption ratio (sold/active)
 */
function getLiquidityBand(value) {
  if (value >= 75) {
    return {
      color: '#28a745',
      bgColor: 'rgba(40, 167, 69, 0.1)',
      label: 'High',
      description: 'Cards selling faster than being listed',
      icon: '🔥'
    };
  } else if (value >= 50) {
    return {
      color: '#28a745',
      bgColor: 'rgba(40, 167, 69, 0.1)',
      label: 'Moderate',
      description: 'Balanced market activity',
      icon: '⚖️'
    };
  } else if (value >= 25) {
    return {
      color: '#ffc107',
      bgColor: 'rgba(255, 193, 7, 0.1)',
      label: 'Low',
      description: 'More supply than demand',
      icon: '📉'
    };
  } else {
    return {
      color: '#dc3545',
      bgColor: 'rgba(220, 53, 69, 0.1)',
      label: 'Very Low',
      description: 'Oversupplied market - slow sales expected',
      icon: '🐢'
    };
  }
}

/**
 * Calculate pricing recommendations based on market conditions
 * 
 * @param {number} fmv - Fair market value
 * @param {Object} pressure - Market pressure object
 * @param {Object} liquidity - Liquidity object
 * @returns {Object} - { quickSale, target, patientSale, rangeMin, rangeMax }
 */
export function getPricingRecommendations(fmv, pressure, liquidity) {
  if (!fmv || fmv <= 0) {
    return null;
  }

  // Base adjustments
  let quickDiscount = 0.15;  // 15% below FMV
  let patientPremium = 0.15; // 15% above FMV

  // Adjust based on market pressure
  if (pressure?.value !== null) {
    if (pressure.value < 0) {
      // Below FMV market - can price more aggressively
      quickDiscount = 0.10;
      patientPremium = 0.05;
    } else if (pressure.value > 30) {
      // High pressure market - need to be more competitive
      quickDiscount = 0.20;
      patientPremium = 0.10;
    }
  }

  // Adjust based on liquidity
  if (liquidity?.value !== null) {
    if (liquidity.value >= 75) {
      // High liquidity - can price higher
      quickDiscount = Math.max(quickDiscount - 0.05, 0.05);
      patientPremium = Math.min(patientPremium + 0.05, 0.25);
    } else if (liquidity.value < 25) {
      // Low liquidity - need competitive pricing
      quickDiscount = Math.min(quickDiscount + 0.05, 0.30);
      patientPremium = Math.max(patientPremium - 0.05, 0.05);
    }
  }

  // Calculate prices
  const quickSale = fmv * (1 - quickDiscount);
  const patientSale = fmv * (1 + patientPremium);

  // Format to .99 style prices for better marketability
  const formatToNinetyNine = (value) => {
    const ceil = Math.ceil(value);
    return Math.max(ceil, 1) - 0.01;
  };

  return {
    quickSale: formatToNinetyNine(quickSale),
    target: Math.round(fmv * 100) / 100,
    patientSale: formatToNinetyNine(patientSale),
    rangeMin: Math.round(quickSale * 100) / 100,
    rangeMax: Math.round(patientSale * 100) / 100,
    quickDiscount: Math.round(quickDiscount * 100),
    patientPremium: Math.round(patientPremium * 100)
  };
}

/**
 * Determine market tier based on metrics
 * Used for market assessment messaging
 * 
 * @param {Object} metrics - { pressure, confidence, liquidity }
 * @returns {Object} - { tier, label, color, icon }
 */
export function determineMarketTier(metrics) {
  const { pressure, confidence, liquidity } = metrics;

  // Score each metric
  let score = 0;

  // Pressure score (negative/low is good for buyers)
  if (pressure?.value !== null) {
    if (pressure.value < 0) score += 3;
    else if (pressure.value <= 15) score += 2;
    else if (pressure.value <= 30) score += 1;
    // Higher pressure = 0 points
  }

  // Confidence score (higher is better)
  if (confidence?.value !== null) {
    if (confidence.value >= 70) score += 3;
    else if (confidence.value >= 50) score += 2;
    else if (confidence.value >= 30) score += 1;
  }

  // Liquidity score (higher is better)
  if (liquidity?.value !== null) {
    if (liquidity.value >= 75) score += 3;
    else if (liquidity.value >= 50) score += 2;
    else if (liquidity.value >= 25) score += 1;
  }

  // Determine tier based on total score
  if (score >= 7) {
    return {
      tier: 1,
      label: 'Excellent',
      color: '#28a745',
      bgColor: 'rgba(40, 167, 69, 0.1)',
      icon: '🌟',
      description: 'Great market conditions for both buyers and sellers'
    };
  } else if (score >= 5) {
    return {
      tier: 2,
      label: 'Good',
      color: '#28a745',
      bgColor: 'rgba(40, 167, 69, 0.1)',
      icon: '✅',
      description: 'Favorable market conditions'
    };
  } else if (score >= 3) {
    return {
      tier: 3,
      label: 'Fair',
      color: '#ffc107',
      bgColor: 'rgba(255, 193, 7, 0.1)',
      icon: '⚖️',
      description: 'Mixed market signals - proceed with analysis'
    };
  } else if (score >= 1) {
    return {
      tier: 4,
      label: 'Challenging',
      color: '#fd7e14',
      bgColor: 'rgba(253, 126, 20, 0.1)',
      icon: '⚠️',
      description: 'Difficult market conditions - be cautious'
    };
  } else {
    return {
      tier: 5,
      label: 'Poor',
      color: '#dc3545',
      bgColor: 'rgba(220, 53, 69, 0.1)',
      icon: '⛔',
      description: 'Unfavorable market conditions'
    };
  }
}

/**
 * Generate persona-specific advice based on market conditions
 * 
 * @param {Object} tier - Market tier object
 * @param {Object} metrics - { pressure, confidence, liquidity }
 * @returns {Object} - { collector, seller, flipper }
 */
export function generatePersonaAdvice(tier, metrics) {
  const { pressure, confidence, liquidity } = metrics;

  // Default advice
  const advice = {
    collector: '',
    seller: '',
    flipper: ''
  };

  // Collector advice - focused on fair buying
  if (pressure?.value !== null) {
    if (pressure.value < 0) {
      advice.collector = 'Good time to add to your collection - sellers are pricing competitively.';
    } else if (pressure.value <= 15) {
      advice.collector = 'Fair pricing available. Look for listings near FMV.';
    } else if (pressure.value <= 30) {
      advice.collector = 'Many listings overpriced. Make offers below asking price.';
    } else {
      advice.collector = 'Sellers asking too much. Wait for better deals or make low offers.';
    }
  } else {
    advice.collector = 'Review individual listings to find fair deals.';
  }

  // Seller advice - focused on realistic pricing
  if (liquidity?.value !== null && pressure?.value !== null) {
    if (liquidity.value >= 75) {
      if (pressure.value <= 15) {
        advice.seller = 'Strong demand! Price at FMV for quick sales, slightly above for max value.';
      } else {
        advice.seller = 'Despite high demand, price competitively - market is saturated with high asks.';
      }
    } else if (liquidity.value >= 50) {
      advice.seller = 'Moderate demand. Price at or slightly below FMV for best results.';
    } else {
      advice.seller = 'Slow market. Price 10-15% below FMV for realistic sale timeframe.';
    }
  } else {
    advice.seller = 'Price near FMV and monitor market response.';
  }

  // Flipper advice - focused on profit potential
  if (confidence?.value !== null && pressure?.value !== null) {
    if (pressure.value < 0 && confidence.value >= 60) {
      advice.flipper = 'Potential flip opportunity! Underpriced listings available with reliable FMV.';
    } else if (confidence.value < 40) {
      advice.flipper = 'Risky flip - wide price variance makes profit estimation difficult.';
    } else if (pressure.value > 30) {
      advice.flipper = 'Limited flip potential - asking prices already above what buyers will pay.';
    } else if (liquidity?.value !== null && liquidity.value < 25) {
      advice.flipper = 'Slow turnover - capital may be tied up for extended period.';
    } else {
      advice.flipper = 'Modest flip potential. Focus on listings 15%+ below FMV.';
    }
  } else {
    advice.flipper = 'Gather more market data before committing capital.';
  }

  return advice;
}
