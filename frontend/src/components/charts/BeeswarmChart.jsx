/**
 * BeeswarmChart - Canvas-based beeswarm chart showing price distribution
 * Shows FMV range band and individual price points with collision detection
 * Interactive crosshair with price display
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import useSearchStore from '../../stores/searchStore';
import {
  formatMoney,
  filterOutliers,
  beeswarmLayout,
  drawTooltip,
  CHART_COLORS,
  DEFAULT_MARGINS
} from '../../utils/chartUtils';

const BeeswarmChart = () => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [crosshairX, setCrosshairX] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 250 });
  
  // Get data from search store (using actual store property names)
  const soldListings = useSearchStore((state) => state.soldListings);
  const fmv = useSearchStore((state) => state.fmv);
  
  // Extract prices from sold listings
  const prices = soldListings?.map(item => item.total_price).filter(p => p > 0) || [];
  
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
  
  // Draw the chart
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;
    
    const ctx = canvas.getContext('2d');
    const { width, height } = dimensions;
    const margin = { ...DEFAULT_MARGINS };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Set canvas size
    canvas.width = width;
    canvas.height = height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);
    
    // Filter and validate prices
    const validPrices = prices.filter(p => p != null && !isNaN(p) && p > 0);
    
    if (validPrices.length === 0) {
      ctx.fillStyle = CHART_COLORS.labelColor;
      ctx.font = '16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No price data available', width / 2, height / 2);
      ctx.fillText('Run a search to see results', width / 2, height / 2 + 25);
      return;
    }
    
    // Filter outliers
    const filteredPrices = filterOutliers(validPrices);
    
    if (filteredPrices.length === 0) {
      ctx.fillStyle = CHART_COLORS.labelColor;
      ctx.font = '16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data after filtering', width / 2, height / 2);
      return;
    }
    
    const minPrice = Math.min(...filteredPrices);
    const maxPrice = Math.max(...filteredPrices);
    const priceRange = maxPrice - minPrice;
    
    // X scale function
    const xScale = (price) => {
      if (priceRange === 0) {
        return width / 2;
      }
      return margin.left + ((price - minPrice) / priceRange) * innerWidth;
    };
    
    // Draw FMV band if available
    const expectLow = fmv?.quickSale || fmv?.expectedLow;
    const expectHigh = fmv?.patientSale || fmv?.expectedHigh;
    const marketValue = fmv?.marketValue || expectHigh;
    
    if (expectLow && expectHigh && priceRange > 0) {
      const x1 = xScale(expectLow);
      const x2 = xScale(expectHigh);
      
      // Create gradient for FMV band
      const gradient = ctx.createLinearGradient(x1, margin.top, x2, height - margin.bottom);
      gradient.addColorStop(0, CHART_COLORS.fmvGreen);
      gradient.addColorStop(0.5, CHART_COLORS.fmvGreenLight);
      gradient.addColorStop(1, 'rgba(52, 199, 89, 0.1)');
      
      // Draw gradient band
      ctx.shadowColor = 'rgba(52, 199, 89, 0.3)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = gradient;
      ctx.fillRect(x1, margin.top, x2 - x1, innerHeight);
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      
      // Draw FMV range border lines
      const lineGradient = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom);
      lineGradient.addColorStop(0, 'rgba(0, 122, 255, 0.8)');
      lineGradient.addColorStop(0.5, 'rgba(52, 199, 89, 0.9)');
      lineGradient.addColorStop(1, 'rgba(0, 122, 255, 0.6)');
      
      ctx.strokeStyle = lineGradient;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      
      // Draw FMV lines with glow
      ctx.shadowColor = 'rgba(0, 122, 255, 0.5)';
      ctx.shadowBlur = 6;
      
      ctx.beginPath();
      ctx.moveTo(x1, margin.top);
      ctx.lineTo(x1, height - margin.bottom);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x2, margin.top);
      ctx.lineTo(x2, height - margin.bottom);
      ctx.stroke();
      
      ctx.setLineDash([]);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      
      // FMV dollar value labels
      ctx.fillStyle = CHART_COLORS.success;
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatMoney(expectLow), x1, margin.top - 8);
      ctx.fillText(formatMoney(expectHigh), x2, margin.top - 8);
    }
    
    // Calculate beeswarm layout for points
    const centerY = height / 2;
    const maxYOffset = Math.min(innerHeight / 2 - 10, 60);
    const points = beeswarmLayout(filteredPrices, xScale, centerY, 4, maxYOffset);
    
    // Keep points within vertical bounds
    const drawablePoints = points.map(point => ({
      ...point,
      y: Math.max(margin.top + 4, Math.min(height - margin.bottom - 4, point.y))
    }));
    
    // Draw points
    drawablePoints.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.r, 0, 2 * Math.PI);
      ctx.fillStyle = CHART_COLORS.soldBlue;
      ctx.fill();
      ctx.strokeStyle = CHART_COLORS.soldBlueBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    
    // Draw X-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.strokeStyle = CHART_COLORS.axisColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // X-axis labels
    ctx.fillStyle = CHART_COLORS.labelColor;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    
    if (priceRange > 0) {
      // Min price
      ctx.fillText('Min', margin.left, height - margin.bottom + 15);
      ctx.fillStyle = CHART_COLORS.textColor;
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(formatMoney(minPrice), margin.left, height - margin.bottom + 30);
      
      // Max price
      ctx.fillStyle = CHART_COLORS.labelColor;
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.fillText('Max', width - margin.right, height - margin.bottom + 15);
      ctx.fillStyle = CHART_COLORS.textColor;
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(formatMoney(maxPrice), width - margin.right, height - margin.bottom + 30);
      
      // FMV marker
      if (marketValue && marketValue >= minPrice && marketValue <= maxPrice) {
        const fmvX = xScale(marketValue);
        
        ctx.beginPath();
        ctx.moveTo(fmvX, height - margin.bottom);
        ctx.lineTo(fmvX, height - margin.bottom + 5);
        ctx.strokeStyle = CHART_COLORS.warning;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = CHART_COLORS.labelColor;
        ctx.font = '11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FMV', fmvX, height - margin.bottom + 15);
        ctx.fillStyle = CHART_COLORS.warning;
        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
        ctx.fillText(formatMoney(marketValue), fmvX, height - margin.bottom + 30);
      }
    } else {
      ctx.fillText(formatMoney(minPrice), width / 2, height - margin.bottom + 20);
      ctx.fillText('(All prices identical)', width / 2, height - margin.bottom + 35);
    }
    
    // Draw legend
    const legendY = height - 15;
    const legendText = 'FMV Range';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    const textWidth = ctx.measureText(legendText).width;
    const rectWidth = 30;
    const spacing = 5;
    const totalLegendWidth = rectWidth + spacing + textWidth;
    const legendX = (width - totalLegendWidth) / 2;
    
    // Legend color box
    const legendGradient = ctx.createLinearGradient(legendX, legendY - 8, legendX + rectWidth, legendY - 8);
    legendGradient.addColorStop(0, 'rgba(52, 199, 89, 0.3)');
    legendGradient.addColorStop(1, 'rgba(52, 199, 89, 0.5)');
    ctx.fillStyle = legendGradient;
    ctx.fillRect(legendX, legendY - 12, rectWidth, 12);
    ctx.strokeStyle = 'rgba(52, 199, 89, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY - 12, rectWidth, 12);
    
    // Legend text
    ctx.fillStyle = CHART_COLORS.textColor;
    ctx.textAlign = 'left';
    ctx.fillText(legendText, legendX + rectWidth + spacing, legendY - 3);
    
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
    
  }, [dimensions, prices, fmv, crosshairX]);
  
  // Draw chart when data or dimensions change
  useEffect(() => {
    drawChart();
  }, [drawChart]);
  
  // Handle mouse/touch interactions
  const handleInteraction = useCallback((clientX) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const marginLeft = parseFloat(canvas.dataset.marginLeft) || DEFAULT_MARGINS.left;
    const marginRight = parseFloat(canvas.dataset.marginRight) || DEFAULT_MARGINS.right;
    
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
  
  const handleClick = useCallback((e) => {
    // Toggle crosshair persistence
    handleInteraction(e.clientX);
  }, [handleInteraction]);
  
  return (
    <div className="chart-canvas-wrapper" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="chart-canvas"
        style={{ cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onTouchMove={handleTouchMove}
      />
    </div>
  );
};

export default BeeswarmChart;
