/**
 * Social Media Share Module for FMV Results
 * 
 * Generates shareable images of Fair Market Value search results
 * for posting on Instagram, TikTok, and other social media platforms.
 * 
 * Created: February 2, 2026
 * @version 1.0.0
 */

(function() {
    'use strict';

    // Layout configurations for different aspect ratios
    const LAYOUTS = {
        '1:1': {
            withChart: { 
                canvas: { w: 1080, h: 1080 }, 
                header: 60, 
                chart: 400, 
                cards: 160,
                padding: 40
            },
            withoutChart: { 
                canvas: { w: 1080, h: 1080 }, 
                header: 80, 
                chart: 0, 
                cards: 250,
                padding: 40
            }
        },
        '4:5': {
            withChart: { 
                canvas: { w: 1080, h: 1350 }, 
                header: 60, 
                chart: 450, 
                cards: 120,
                padding: 40
            },
            withoutChart: { 
                canvas: { w: 1080, h: 1350 }, 
                header: 80, 
                chart: 0, 
                cards: 200,
                padding: 40
            }
        },
        '9:16': {
            withChart: { 
                canvas: { w: 1080, h: 1920 }, 
                header: 80, 
                chart: 600, 
                cards: 150,
                padding: 50
            },
            withoutChart: { 
                canvas: { w: 1080, h: 1920 }, 
                header: 100, 
                chart: 0, 
                cards: 250,
                padding: 50
            }
        }
    };

    // Store modal instance
    let shareModal = null;
    let previewCanvas = null;
    let currentFmvData = null;

    /**
     * Open the share modal with FMV data
     * @param {Object} fmvData - FMV data {quickSale, marketValue, patientSale, count}
     */
    function openShareModal(fmvData) {
        console.log('[SHARE] Opening share modal with data:', fmvData);
        
        // Store FMV data
        currentFmvData = fmvData;

        // Get the current search query for the card name
        const cardName = document.getElementById('query')?.value || 'Baseball Card';

        // Create modal content
        const modalContent = createModalContent(cardName);

        // Create or update modal
        if (!shareModal) {
            shareModal = new Modal({
                id: 'share-modal',
                title: '📤 Share Results',
                content: modalContent,
                size: 'large',
                customClass: 'share-modal',
                onOpen: () => {
                    initializeShareModal(cardName);
                },
                onClose: () => {
                    // Clean up
                    previewCanvas = null;
                }
            });
        } else {
            shareModal.setContent(modalContent);
        }

        shareModal.open();
    }

    /**
     * Create the modal HTML content
     * @param {string} cardName - Default card name
     * @returns {string} HTML content
     */
    function createModalContent(cardName) {
        return `
            <div class="share-modal-body">
                <div class="share-form">
                    <div class="form-group">
                        <label for="share-card-name">Card Name:</label>
                        <input type="text" id="share-card-name" value="${escapeHtml(cardName)}" 
                               placeholder="Enter card name" />
                    </div>
                    
                    <div class="form-group">
                        <label for="share-aspect-ratio">Aspect Ratio:</label>
                        <select id="share-aspect-ratio">
                            <option value="1:1">1:1 (Instagram Post)</option>
                            <option value="4:5" selected>4:5 (Instagram Portrait)</option>
                            <option value="9:16">9:16 (Instagram Story/TikTok)</option>
                        </select>
                    </div>
                    
                    <div class="form-group checkbox-group">
                        <label>
                            <input type="checkbox" id="share-include-chart" checked />
                            Include Price Distribution Chart
                        </label>
                    </div>
                </div>
                
                <div class="share-preview">
                    <h3>Preview:</h3>
                    <div class="preview-container">
                        <canvas id="share-preview-canvas"></canvas>
                    </div>
                    <p class="preview-hint">Changes update automatically</p>
                </div>
                
                <div class="share-actions">
                    <button class="btn btn-primary" id="share-download-btn">
                        💾 Download Image
                    </button>
                    <button class="btn btn-secondary" onclick="Modal.getInstance('share-modal').close()">
                        Cancel
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Initialize the share modal after it opens
     * @param {string} cardName - Card name
     */
    function initializeShareModal(cardName) {
        previewCanvas = document.getElementById('share-preview-canvas');
        
        // Set up event listeners
        document.getElementById('share-card-name').addEventListener('input', updatePreview);
        document.getElementById('share-aspect-ratio').addEventListener('change', updatePreview);
        document.getElementById('share-include-chart').addEventListener('change', updatePreview);
        document.getElementById('share-download-btn').addEventListener('click', downloadImage);

        // Generate initial preview
        updatePreview();
    }

    /**
     * Update the preview when form changes
     */
    function updatePreview() {
        const cardName = document.getElementById('share-card-name').value;
        const aspectRatio = document.getElementById('share-aspect-ratio').value;
        const includeChart = document.getElementById('share-include-chart').checked;

        try {
            generateShareImage(cardName, aspectRatio, includeChart, true);
        } catch (error) {
            console.error('[SHARE] Error generating preview:', error);
        }
    }

    /**
     * Generate the share image on canvas
     * @param {string} cardName - Card name to display
     * @param {string} aspectRatio - Aspect ratio (1:1, 4:5, 9:16)
     * @param {boolean} includeChart - Whether to include the beeswarm chart
     * @param {boolean} isPreview - Whether this is a preview (smaller canvas)
     */
    function generateShareImage(cardName, aspectRatio, includeChart, isPreview = false) {
        const layout = LAYOUTS[aspectRatio][includeChart ? 'withChart' : 'withoutChart'];
        const canvas = previewCanvas;
        const ctx = canvas.getContext('2d');

        // Set canvas size (scale down for preview)
        const scale = isPreview ? 0.5 : 1;
        canvas.width = layout.canvas.w * scale;
        canvas.height = layout.canvas.h * scale;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Apply scaling
        ctx.scale(scale, scale);

        // Draw background gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, layout.canvas.h);
        gradient.addColorStop(0, '#f5f5f7');
        gradient.addColorStop(1, '#fafafa');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, layout.canvas.w, layout.canvas.h);

        // Draw header with card name
        renderHeader(ctx, layout, cardName);

        // Calculate vertical positions
        let yPos = layout.header + layout.padding;

        // Draw FMV cards
        renderFMVCards(ctx, layout, yPos);
        yPos += layout.cards + layout.padding;

        // Draw beeswarm chart if included
        if (includeChart && window.currentBeeswarmPrices && window.currentBeeswarmPrices.length > 0) {
            renderBeeswarmChart(ctx, layout, yPos);
        }

        // Add watermark
        addWatermark(ctx, layout.canvas.w, layout.canvas.h);

        // Reset transform
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /**
     * Render the header with card name
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} layout - Layout configuration
     * @param {string} cardName - Card name to display
     */
    function renderHeader(ctx, layout, cardName) {
        ctx.fillStyle = '#1d1d1f';
        ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        
        // Truncate card name if too long
        let displayName = cardName;
        const maxWidth = layout.canvas.w - (layout.padding * 2);
        let textWidth = ctx.measureText(displayName).width;
        
        if (textWidth > maxWidth) {
            while (textWidth > maxWidth && displayName.length > 0) {
                displayName = displayName.slice(0, -1);
                textWidth = ctx.measureText(displayName + '...').width;
            }
            displayName += '...';
        }
        
        ctx.fillText(displayName, layout.canvas.w / 2, layout.header / 2 + 16);
    }

    /**
     * Render the three FMV cards (Quick Sale, Market Value, Patient Sale)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} layout - Layout configuration
     * @param {number} yPos - Y position to start rendering
     */
    function renderFMVCards(ctx, layout) {
        if (!currentFmvData) return;

        const cardWidth = (layout.canvas.w - (layout.padding * 4)) / 3;
        const cardHeight = layout.cards;
        const startX = layout.padding;
        const startY = layout.header + layout.padding;

        const cards = [
            { label: '🏃‍♂️ Quick Sale', value: currentFmvData.quickSale, color: '#007aff' },
            { label: '⚖️ Market Value', value: currentFmvData.marketValue, color: '#34c759' },
            { label: '🕰️ Patient Sale', value: currentFmvData.patientSale, color: '#5856d6' }
        ];

        cards.forEach((card, index) => {
            const x = startX + (index * (cardWidth + layout.padding));
            
            // Draw card background with shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
            ctx.shadowBlur = 20;
            ctx.shadowOffsetY = 10;
            
            ctx.fillStyle = '#ffffff';
            roundRect(ctx, x, startY, cardWidth, cardHeight, 16);
            ctx.fill();
            
            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            // Draw label
            ctx.fillStyle = '#6e6e73';
            ctx.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(card.label, x + cardWidth / 2, startY + 50);

            // Draw value
            ctx.fillStyle = card.color;
            ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.fillText(formatMoney(card.value), x + cardWidth / 2, startY + cardHeight / 2 + 20);
        });
    }

    /**
     * Render a simplified beeswarm chart
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} layout - Layout configuration
     * @param {number} yPos - Y position to start rendering
     */
    function renderBeeswarmChart(ctx, layout, yPos) {
        const prices = window.currentBeeswarmPrices || [];
        if (prices.length === 0) return;

        const chartWidth = layout.canvas.w - (layout.padding * 2);
        const chartHeight = layout.chart;
        const chartX = layout.padding;
        const chartY = yPos;

        // Draw chart background
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 8;
        roundRect(ctx, chartX, chartY, chartWidth, chartHeight, 16);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Chart title
        ctx.fillStyle = '#1d1d1f';
        ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Price Distribution', chartX + chartWidth / 2, chartY + 50);

        // Calculate chart area
        const margin = { top: 80, right: 40, bottom: 80, left: 40 };
        const innerWidth = chartWidth - margin.left - margin.right;
        const innerHeight = chartHeight - margin.top - margin.bottom;
        const innerX = chartX + margin.left;
        const innerY = chartY + margin.top;

        // Get min/max prices
        const validPrices = prices.filter(p => p > 0);
        if (validPrices.length === 0) return;

        const minPrice = Math.min(...validPrices);
        const maxPrice = Math.max(...validPrices);
        const priceRange = maxPrice - minPrice;

        // Scale function
        const xScale = (price) => {
            if (priceRange === 0) return innerX + innerWidth / 2;
            return innerX + ((price - minPrice) / priceRange) * innerWidth;
        };

        // Draw FMV band if available
        if (window.expectLowGlobal !== null && window.expectHighGlobal !== null && priceRange > 0) {
            const x1 = xScale(window.expectLowGlobal);
            const x2 = xScale(window.expectHighGlobal);
            
            ctx.fillStyle = 'rgba(52, 199, 89, 0.15)';
            ctx.fillRect(x1, innerY, x2 - x1, innerHeight);
            
            // FMV band borders
            ctx.strokeStyle = 'rgba(52, 199, 89, 0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.moveTo(x1, innerY);
            ctx.lineTo(x1, innerY + innerHeight);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x2, innerY);
            ctx.lineTo(x2, innerY + innerHeight);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw price points (simplified - just dots without collision detection)
        const centerY = innerY + innerHeight / 2;
        const pointRadius = 6;

        validPrices.forEach(price => {
            const x = xScale(price);
            
            ctx.beginPath();
            ctx.arc(x, centerY, pointRadius, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0, 122, 255, 0.7)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 122, 255, 0.9)';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Draw axis
        ctx.strokeStyle = '#d2d2d7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(innerX, innerY + innerHeight);
        ctx.lineTo(innerX + innerWidth, innerY + innerHeight);
        ctx.stroke();

        // Draw min/max labels
        ctx.fillStyle = '#6e6e73';
        ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(formatMoney(minPrice), innerX, innerY + innerHeight + 35);
        ctx.textAlign = 'right';
        ctx.fillText(formatMoney(maxPrice), innerX + innerWidth, innerY + innerHeight + 35);
    }

    /**
     * Add watermark to the canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     */
    function addWatermark(ctx, width, height) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.font = '28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('KuyaComps.com ⚾', width - 30, height - 30);
    }

    /**
     * Download the generated image
     */
    function downloadImage() {
        const cardName = document.getElementById('share-card-name').value;
        const aspectRatio = document.getElementById('share-aspect-ratio').value;
        const includeChart = document.getElementById('share-include-chart').checked;

        // Create a full-resolution canvas
        const downloadCanvas = document.createElement('canvas');
        const layout = LAYOUTS[aspectRatio][includeChart ? 'withChart' : 'withoutChart'];
        downloadCanvas.width = layout.canvas.w;
        downloadCanvas.height = layout.canvas.h;

        const ctx = downloadCanvas.getContext('2d');

        // Generate full-resolution image
        try {
            // Temporarily swap canvas
            const originalCanvas = previewCanvas;
            previewCanvas = downloadCanvas;
            generateShareImage(cardName, aspectRatio, includeChart, false);
            previewCanvas = originalCanvas;

            // Trigger download
            const filename = `kuya-comps-${cardName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${aspectRatio.replace(':', 'x')}.png`;
            
            downloadCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
                URL.revokeObjectURL(url);
                
                console.log('[SHARE] Image downloaded:', filename);
            }, 'image/png');

        } catch (error) {
            console.error('[SHARE] Error downloading image:', error);
            alert('Failed to download image. Please try again.');
        }
    }

    /**
     * Helper function to draw rounded rectangle
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {number} radius - Border radius
     */
    function roundRect(ctx, x, y, width, height, radius) {
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
     * Format money value (using the global formatMoney if available)
     * @param {number} value - Value to format
     * @returns {string} Formatted money string
     */
    function formatMoney(value) {
        if (typeof window.formatMoney === 'function') {
            return window.formatMoney(value);
        }
        if (value == null || isNaN(value)) return 'N/A';
        return '$' + value.toFixed(2);
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} unsafe - Unsafe string
     * @returns {string} Safe HTML string
     */
    function escapeHtml(unsafe) {
        if (unsafe == null) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Export public API
    window.ShareModule = {
        openShareModal: openShareModal
    };

    console.log('[SHARE] Share module loaded successfully');
})();
