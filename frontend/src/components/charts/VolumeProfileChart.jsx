/**
 * VolumeProfileChart - Canvas-based volume profile (histogram) chart
 * Shows price distribution with horizontal bars for sold vs active listings
 * Includes FMV markers and interactive crosshair
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import useSearchStore from '../../stores/searchStore';
import {
  formatMoney,
  filterOutliers,
  calculateBins,
  drawTooltip,
  CHART_COLORS
} from '../../utils/chartUtils';

const VolumeProfileChart = ({ defaultBins = 25 }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [crosshairX, setCrosshairX] = useState(null);
  const [numBins, setNumBins] = useState(defaultBins);
  const [dimensions, setDimensions] = useState({ width: 0, height: 300 });
  
  // Get data from search store (using actual store property names)
  const soldListings = useSearchStore((state) => state.soldListings);
  const activeListings = useSearchStore((state) => state.activeListings);
  const fmv = useSearchStore((state) => state.fmv);
  
  // Set up resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          setDimensions(prev => ({ ...prev, width }));
        }
      }
    });
    
    resizeObserver.observe(containerRef.current);
    
    // Initial measurement
    const initialWidth = containerRef.current.offsetWidth;
    if (initialWidth > 0) {
      setDimensions(prev => ({ ...prev, width: initialWidth }));
    }
    
    return () => resizeObserver.disconnect();
  }, []);
  
  // Adjust mobile defaults
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile && numBins === defaultBins) {
      setNumBins(10);
    }
  }, [defaultBins, numBins]);
  
  // Draw the chart
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;
    
    const ctx = canvas.getContext('2d');
    const { width, height } = dimensions;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Set canvas size
    canvas.width = width;
    canvas.height = height;
    
    // Clear and draw background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);
    
    // Extract and filter sold prices
    let soldPrices = soldListings?.map(item => item.total_price).filter(p => p > 0) || [];
    
    // Extract and filter active prices (Buy It Now only)
    let activePrices = activeListings?.filter(item => {
      const buyingFormat = (item.buying_format || '').toLowerCase();
      return buyingFormat.includes('buy it now');
    }).map(item => {
      return item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
    }).filter(p => p > 0) || [];
    
    // Show empty state if no data
    if (soldPrices.length === 0 && activePrices.length === 0) {
      ctx.fillStyle = CHART_COLORS.textColor;
      ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data available for price distribution', width / 2, height / 2);
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = CHART_COLORS.labelColor;
      ctx.fillText('Run a search to see results', width / 2, height / 2 + 25);
      return;
    }
    
    // Filter outliers
    if (soldPrices.length >= 4) {
      soldPrices = filterOutliers(soldPrices);
    }
    if (activePrices.length >= 4) {
      activePrices = filterOutliers(activePrices);
    }
    
    // Find global min/max
    const allPrices = [...soldPrices, ...activePrices];
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice;
    
    // Calculate bins
    const soldBins = calculateBins(soldPrices, numBins, minPrice, maxPrice);
    const activeBins = calculateBins(activePrices, numBins, minPrice, maxPrice);
    
    // Find max count for scaling
    const maxCount = Math.max(...soldBins, ...activeBins, 1);
    
    // Draw Y-axis
    ctx.strokeStyle = CHART_COLORS.axisColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.stroke();
    
    // Draw X-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.stroke();
    
    // Y-axis label
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = CHART_COLORS.textColor;
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Number of Sales/Listings', 0, 0);
    ctx.restore();
    
    // X-axis label
    ctx.fillStyle = CHART_COLORS.textColor;
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Price', width / 2, height - 10);
    
    // Y-axis ticks and grid lines
    const yTicks = 5;
    ctx.fillStyle = CHART_COLORS.labelColor;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= yTicks; i++) {
      const y = height - margin.bottom - (i / yTicks) * innerHeight;
      const value = Math.round((i / yTicks) * maxCount);
      
      // Grid line
      ctx.strokeStyle = CHART_COLORS.gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
      
      // Label
      ctx.fillStyle = CHART_COLORS.labelColor;
      ctx.fillText(value.toString(), margin.left - 10, y + 4);
    }
    
    // Calculate bar dimensions
    const barAreaWidth = innerWidth / numBins;
    const barWidth = barAreaWidth * 0.8;
    const barOffset = barAreaWidth * 0.1;
    
    // Draw bars
    for (let i = 0; i < numBins; i++) {
      const x = margin.left + (i * barAreaWidth) + barOffset;
      
      // Sold bars (blue) - behind
      if (soldBins[i] > 0) {
        const barHeight = (soldBins[i] / maxCount) * innerHeight;
        const y = height - margin.bottom - barHeight;
        
        ctx.fillStyle = CHART_COLORS.soldBlue;
        ctx.fillRect(x, y, barWidth, barHeight);
        
        ctx.strokeStyle = CHART_COLORS.soldBlueBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, barWidth, barHeight);
      }
      
      // Active bars (red) - front with offset
      if (activeBins[i] > 0) {
        const barHeight = (activeBins[i] / maxCount) * innerHeight;
        const y = height - margin.bottom - barHeight;
        const offsetX = barWidth * 0.15;
        
        ctx.fillStyle = CHART_COLORS.activeRed;
        ctx.fillRect(x + offsetX, y, barWidth, barHeight);
        
        ctx.strokeStyle = CHART_COLORS.activeRedBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + offsetX, y, barWidth, barHeight);
      }
    }
    
    // Draw FMV markers if available
    const marketValue = fmv?.market_value || fmv?.expected_high;
    if (marketValue && priceRange > 0) {
      const fmvX = margin.left + ((marketValue - minPrice) / priceRange) * innerWidth;
      
      ctx.strokeStyle = CHART_COLORS.warning;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(fmvX, margin.top);
      ctx.lineTo(fmvX, height - margin.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // FMV label at bottom
      ctx.fillStyle = CHART_COLORS.warning;
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FMV', fmvX, height - margin.bottom + 15);
      ctx.fillText(formatMoney(marketValue), fmvX, height - margin.bottom + 28);
    }
    
    // Draw crosshair if active
    if (crosshairX !== null && crosshairX >= margin.left && crosshairX <= width - margin.right) {
      const relativeX = crosshairX - margin.left;
      const price = minPrice + (relativeX / innerWidth) * priceRange;
      
      // Crosshair line
      ctx.strokeStyle = CHART_COLORS.crosshairColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(crosshairX, margin.top);
      ctx.lineTo(crosshairX, height - margin.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Price tooltip
      drawTooltip(ctx, formatMoney(price), crosshairX, margin.top - 5);
    }
    
    // Store metadata for interactions
    canvas.dataset.minPrice = minPrice;
    canvas.dataset.maxPrice = maxPrice;
    canvas.dataset.marginLeft = margin.left;
    canvas.dataset.marginRight = margin.right;
    canvas.dataset.innerWidth = innerWidth;
    
  }, [dimensions, soldListings, activeListings, fmv, numBins, crosshairX]);
  
  // Draw chart when data or dimensions change
  useEffect(() => {
    drawChart();
  }, [drawChart]);
  
  // Handle interactions
  const handleInteraction = useCallback((clientX) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const marginLeft = parseFloat(canvas.dataset.marginLeft) || 60;
    const marginRight = parseFloat(canvas.dataset.marginRight) || 40;
    
    if (x >= marginLeft && x <= canvas.width - marginRight) {
      setCrosshairX(x);
    }
  }, []);
  
  const handleMouseMove = useCallback((e) => {
    handleInteraction(e.clientX);
  }, [handleInteraction]);
  
  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      handleInteraction(e.touches[0].clientX);
    }
  }, [handleInteraction]);
  
  const handleMouseLeave = useCallback(() => {
    setCrosshairX(null);
  }, []);
  
  // Bin adjustment handlers
  const adjustBins = useCallback((delta) => {
    setNumBins(prev => {
      const newValue = prev + delta;
      return Math.min(50, Math.max(5, newValue));
    });
  }, []);
  
  const resetBins = useCallback(() => {
    const isMobile = window.innerWidth < 768;
    setNumBins(isMobile ? 10 : defaultBins);
  }, [defaultBins]);
  
  return (
    <div className="volume-profile-chart">
      {/* Bin controls */}
      <div className="chart-controls">
        <span className="chart-controls-label">Bars:</span>
        <button 
          className="chart-control-btn"
          onClick={() => adjustBins(-5)}
          aria-label="Decrease bins"
        >
          −
        </button>
        <span className="chart-bin-count">{numBins}</span>
        <button 
          className="chart-control-btn"
          onClick={() => adjustBins(5)}
          aria-label="Increase bins"
        >
          +
        </button>
        <button 
          className="chart-control-btn chart-control-reset"
          onClick={resetBins}
        >
          Reset
        </button>
      </div>
      
      {/* Canvas wrapper */}
      <div className="chart-canvas-wrapper" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="chart-canvas"
          style={{ cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchMove={handleTouchMove}
        />
      </div>
      
      {/* Legend */}
      <div className="chart-legend">
        <div className="chart-legend-item">
          <div 
            className="chart-legend-color" 
            style={{ 
              background: CHART_COLORS.soldBlue,
              borderColor: CHART_COLORS.soldBlueBorder 
            }} 
          />
          <span>Sold Listings</span>
        </div>
        <div className="chart-legend-item">
          <div 
            className="chart-legend-color" 
            style={{ 
              background: CHART_COLORS.activeRed,
              borderColor: CHART_COLORS.activeRedBorder 
            }} 
          />
          <span>Active Listings</span>
        </div>
      </div>
    </div>
  );
};

VolumeProfileChart.propTypes = {
  defaultBins: PropTypes.number
};

export default VolumeProfileChart;
