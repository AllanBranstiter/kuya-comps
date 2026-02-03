/**
 * Chart utility functions for canvas-based visualizations
 * Extracted from static/script.js for React migration
 */

/**
 * Format a numeric value as currency
 * @param {number} value - Price value
 * @returns {string} Formatted price string (e.g., "$12.34")
 */
export function formatMoney(value) {
  if (value == null || isNaN(value)) return "N/A";
  return "$" + value.toFixed(2);
}

/**
 * Filter outliers from price array using IQR method
 * @param {number[]} prices - Array of price values
 * @returns {number[]} Filtered prices with outliers removed
 */
export function filterOutliers(prices) {
  if (!prices || prices.length === 0) return [];
  
  if (prices.length < 4) {
    // Need at least 4 data points for meaningful outlier detection
    return prices;
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
  return prices.filter(price => price >= lowerBound && price <= upperBound);
}

/**
 * Calculate bins for histogram from price data
 * @param {number[]} prices - Array of price values
 * @param {number} numBins - Number of bins to create
 * @param {number} minPrice - Minimum price in range
 * @param {number} maxPrice - Maximum price in range
 * @returns {number[]} Array of bin counts
 */
export function calculateBins(prices, numBins, minPrice, maxPrice) {
  const bins = new Array(numBins).fill(0);
  const priceRange = maxPrice - minPrice;
  const binWidth = priceRange / numBins;
  
  prices.forEach(price => {
    let binIndex = Math.floor((price - minPrice) / binWidth);
    if (binIndex >= numBins) binIndex = numBins - 1;
    if (binIndex < 0) binIndex = 0;
    bins[binIndex]++;
  });
  
  return bins;
}

/**
 * Simple beeswarm layout with collision detection
 * Positions dots to avoid overlap vertically
 * @param {number[]} prices - Array of price values
 * @param {Function} xScale - Function to convert price to x coordinate
 * @param {number} centerY - Vertical center of the chart
 * @param {number} radius - Radius of each dot
 * @param {number} maxYOffset - Maximum vertical displacement
 * @returns {Array<{x: number, y: number, price: number}>} Array of positioned points
 */
export function beeswarmLayout(prices, xScale, centerY, radius = 4, maxYOffset = 60) {
  const points = prices.map(price => ({
    x: xScale(price),
    y: centerY,
    price,
    r: radius,
    originalY: centerY
  }));
  
  const placedPoints = [];
  
  for (const point of points) {
    let y = point.originalY;
    let collided = true;
    let attempts = 0;
    let yOffset = 0;

    while (collided && attempts < 200) {
      collided = false;
      
      // Check collision with previously placed points
      for (const placed of placedPoints) {
        const dx = point.x - placed.x;
        const dy = y - placed.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = point.r + placed.r + 1;
        
        if (distance < minDistance) {
          collided = true;
          break;
        }
      }
      
      if (collided) {
        attempts++;
        // Use systematic offset instead of random
        yOffset = Math.ceil(attempts / 2) * (point.r * 2 + 1);
        const direction = attempts % 2 === 1 ? 1 : -1;
        y = centerY + (direction * yOffset);
        
        // If we've exceeded max offset, force placement
        if (yOffset > maxYOffset) {
          break;
        }
      }
    }
    
    placedPoints.push({
      x: point.x,
      y,
      price: point.price,
      r: point.r
    });
  }
  
  return placedPoints;
}

/**
 * Get canvas scale factor for high-DPI displays
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {number} Device pixel ratio
 */
export function getCanvasScale(ctx) {
  const dpr = window.devicePixelRatio || 1;
  const bsr = ctx.webkitBackingStorePixelRatio ||
              ctx.mozBackingStorePixelRatio ||
              ctx.msBackingStorePixelRatio ||
              ctx.oBackingStorePixelRatio ||
              ctx.backingStorePixelRatio || 1;
  return dpr / bsr;
}

/**
 * Set up canvas for high-DPI displays
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {number} width - Desired display width
 * @param {number} height - Desired display height
 */
export function setupHiDPICanvas(canvas, width, height) {
  const ctx = canvas.getContext('2d');
  const ratio = getCanvasScale(ctx);
  
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  
  ctx.scale(ratio, ratio);
  
  return ctx;
}

/**
 * Calculate standard deviation of values
 * @param {number[]} values - Array of numeric values
 * @returns {number} Standard deviation
 */
export function calculateStdDev(values) {
  if (values.length === 0) return 0;
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Draw a rounded rectangle path on canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Rectangle width
 * @param {number} height - Rectangle height
 * @param {number} radius - Corner radius
 */
export function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw a tooltip with price value
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to display
 * @param {number} x - X position (center of tooltip)
 * @param {number} y - Y position (bottom of tooltip)
 * @param {string} bgColor - Background color
 * @param {string} textColor - Text color
 */
export function drawTooltip(ctx, text, x, y, bgColor = 'rgba(255, 149, 0, 0.95)', textColor = '#ffffff') {
  ctx.font = 'bold 14px sans-serif';
  const textWidth = ctx.measureText(text).width;
  const padding = 8;
  const tooltipWidth = textWidth + (padding * 2);
  const tooltipHeight = 28;
  const radius = 4;
  
  // Position tooltip
  let tooltipX = x - (tooltipWidth / 2);
  const tooltipY = y - tooltipHeight;
  
  // Draw background with rounded corners
  ctx.fillStyle = bgColor;
  roundedRect(ctx, tooltipX, tooltipY, tooltipWidth, tooltipHeight, radius);
  ctx.fill();
  
  // Draw text
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y - 8);
}

/**
 * Default chart margins
 */
export const DEFAULT_MARGINS = {
  top: 60,
  right: 40,
  bottom: 70,
  left: 40
};

/**
 * Chart color palette
 */
export const CHART_COLORS = {
  // Primary colors
  soldBlue: 'rgba(0, 122, 255, 0.7)',
  soldBlueBorder: 'rgba(0, 122, 255, 0.9)',
  activeRed: 'rgba(255, 59, 48, 0.6)',
  activeRedBorder: 'rgba(255, 59, 48, 0.9)',
  
  // FMV band colors
  fmvGreen: 'rgba(52, 199, 89, 0.2)',
  fmvGreenLight: 'rgba(48, 209, 88, 0.15)',
  fmvGreenBorder: 'rgba(52, 199, 89, 0.8)',
  
  // UI colors
  axisColor: '#d2d2d7',
  labelColor: '#6e6e73',
  textColor: '#1d1d1f',
  gridColor: '#e5e5ea',
  crosshairColor: 'rgba(255, 149, 0, 0.9)',
  
  // Status colors
  success: '#34c759',
  warning: '#ff9500',
  error: '#ff3b30'
};
