
// Phase 3: Generate unique client session ID
const generateSessionId = () => {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
};

// Store or retrieve session ID from sessionStorage with error handling
let clientSessionId;
try {
    clientSessionId = sessionStorage.getItem('feedbackSessionId');
    if (!clientSessionId) {
        clientSessionId = generateSessionId();
        sessionStorage.setItem('feedbackSessionId', clientSessionId);
    }
} catch (e) {
    // sessionStorage might be disabled (private browsing, etc.)
    console.warn('sessionStorage not available, generating session ID without persistence:', e);
    clientSessionId = generateSessionId();
}

// Phase 3: State capture - store last API response
window.lastApiResponse = null;

// Intercept fetch calls to capture API responses (set up immediately, not in DOMContentLoaded)
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    
    // Clone the response so we can read it without consuming it
    const clonedResponse = response.clone();
    
    try {
        const data = await clonedResponse.json();
        // Get URL from either string or Request object
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        
        if (url && (url.includes('/comps') || url.includes('/active') || url.includes('/fmv'))) {
            window.lastApiResponse = {
                url: url,
                timestamp: new Date().toISOString(),
                data: data
            };
            // Only log in debug mode to avoid console spam
            if (window.DEBUG_FEEDBACK) {
                console.log('API Response captured:', window.lastApiResponse);
            }
        }
    } catch (e) {
        // Not JSON or error parsing, ignore
    }
    
    return response;
};

document.addEventListener('DOMContentLoaded', () => {
    
    // Phase 2: Screenshot and annotation state
    let capturedScreenshot = null;
    let annotationCoords = null;
// 1. Create and inject the HTML for FAB, Export FAB, Annotation UI, and Modal
const feedbackContainer = document.createElement('div');
feedbackContainer.innerHTML = `
    <button class="feedback-fab">
        <span class="feedback-fab-icon">💬</span>
        <span class="feedback-fab-text">Leave Feedback</span>
    </button>
    
    <button class="export-fab">
        <span class="export-fab-icon">📤</span>
        <span class="export-fab-text">Export Search Data</span>
    </button>
    
        
        <!-- Annotation Overlay -->
        <div class="feedback-annotation-overlay">
            <div class="feedback-annotation-container">
                <div class="feedback-annotation-header">
                    <h3>Highlight the Issue</h3>
                    <p>Use your mouse to draw a box around the area you want to highlight</p>
                </div>
                <div class="feedback-annotation-canvas-wrapper">
                    <canvas id="feedback-annotation-canvas"></canvas>
                </div>
                <div class="feedback-annotation-buttons">
                    <button type="button" class="feedback-modal-button feedback-modal-button-secondary" id="skip-annotation">Skip</button>
                    <button type="button" class="feedback-modal-button feedback-modal-button-primary" id="continue-annotation">Continue</button>
                </div>
            </div>
        </div>
        
        <!-- Feedback Modal -->
        <div class="feedback-modal-overlay">
            <div class="feedback-modal">
                <h2>Submit Feedback</h2>
                <form id="feedback-form">
                    <div class="feedback-modal-form-group">
                        <label for="feedback-category">Category</label>
                        <select id="feedback-category" name="category">
                            <option>Bug Report</option>
                            <option>Comment</option>
                            <option>Feature Request</option>
                            <option>UI/UX Suggestion</option>
                            <option>Other</option>
                        </select>
                    </div>
                    <div class="feedback-modal-form-group">
                        <label for="feedback-description">Description</label>
                        <textarea id="feedback-description" name="description" rows="5" required></textarea>
                    </div>
                    <div class="feedback-modal-buttons">
                        <button type="button" class="feedback-modal-button feedback-modal-button-secondary" id="cancel-feedback">Cancel</button>
                        <button type="submit" class="feedback-modal-button feedback-modal-button-primary">Send Feedback</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(feedbackContainer);

    // 2. Get references to the elements
    const fab = document.querySelector('.feedback-fab');
    const exportFab = document.querySelector('.export-fab');
    const annotationOverlay = document.querySelector('.feedback-annotation-overlay');
    const modalOverlay = document.querySelector('.feedback-modal-overlay');
    const cancelButton = document.getElementById('cancel-feedback');
    const skipAnnotationButton = document.getElementById('skip-annotation');
    const continueAnnotationButton = document.getElementById('continue-annotation');
    const feedbackForm = document.getElementById('feedback-form');
    const annotationCanvas = document.getElementById('feedback-annotation-canvas');
    const annotationCtx = annotationCanvas.getContext('2d');

    // 3. Screenshot capture and compression function
    const compressScreenshot = (canvas, maxWidth = 1920, quality = 0.8) => {
        // Phase 2: Optimize screenshot size
        let compressedCanvas = canvas;
        
        // Resize if too large
        if (canvas.width > maxWidth) {
            const scale = maxWidth / canvas.width;
            const newHeight = canvas.height * scale;
            
            compressedCanvas = document.createElement('canvas');
            compressedCanvas.width = maxWidth;
            compressedCanvas.height = newHeight;
            
            const ctx = compressedCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, 0, maxWidth, newHeight);
        }
        
        // Convert to JPEG with compression for better file size
        // JPEG is better for screenshots without transparency
        return compressedCanvas.toDataURL('image/jpeg', quality);
    };
    
    const captureScreenshot = async () => {
        try {
            // Hide the FAB before capturing
            fab.style.display = 'none';
            
            // Capture the page content
            const canvas = await html2canvas(document.body, {
                useCORS: true,
                allowTaint: true,
                scrollY: -window.scrollY,
                scrollX: -window.scrollX,
                windowWidth: document.documentElement.scrollWidth,
                windowHeight: document.documentElement.scrollHeight
            });
            
            // Show the FAB again
            fab.style.display = 'flex';
            
            // Phase 2: Compress screenshot before returning
            const compressedScreenshot = compressScreenshot(canvas, 1920, 0.8);
            
            if (window.DEBUG_FEEDBACK) {
                const originalSize = canvas.toDataURL('image/png').length / 1024;
                const compressedSize = compressedScreenshot.length / 1024;
                console.log(`Screenshot compressed: ${originalSize.toFixed(2)} KB → ${compressedSize.toFixed(2)} KB (${((1 - compressedSize/originalSize) * 100).toFixed(1)}% reduction)`);
            }
            
            return compressedScreenshot;
        } catch (error) {
            console.error('Screenshot capture failed:', error);
            // Show the FAB again even if error
            fab.style.display = 'flex';
            return null;
        }
    };

    // 4. Annotation UI functions
    let isDrawing = false;
    let startX, startY, currentX, currentY;

    const initAnnotationCanvas = (screenshotDataUrl) => {
        const img = new Image();
        img.onload = () => {
            // Set canvas dimensions to match the screenshot
            const maxWidth = window.innerWidth * 0.9;
            const maxHeight = window.innerHeight * 0.7;
            
            let canvasWidth = img.width;
            let canvasHeight = img.height;
            
            // Scale down if too large
            if (canvasWidth > maxWidth || canvasHeight > maxHeight) {
                const scale = Math.min(maxWidth / canvasWidth, maxHeight / canvasHeight);
                canvasWidth = canvasWidth * scale;
                canvasHeight = canvasHeight * scale;
            }
            
            annotationCanvas.width = canvasWidth;
            annotationCanvas.height = canvasHeight;
            
            // Draw the screenshot
            annotationCtx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
        };
        img.src = screenshotDataUrl;
    };

    const drawRect = () => {
        // Redraw the screenshot first
        const img = new Image();
        img.onload = () => {
            annotationCtx.drawImage(img, 0, 0, annotationCanvas.width, annotationCanvas.height);
            
            // Draw the rectangle
            if (isDrawing) {
                const width = currentX - startX;
                const height = currentY - startY;
                
                // Semi-transparent overlay
                annotationCtx.fillStyle = 'rgba(0, 122, 255, 0.2)';
                annotationCtx.fillRect(startX, startY, width, height);
                
                // Border
                annotationCtx.strokeStyle = '#007aff';
                annotationCtx.lineWidth = 2;
                annotationCtx.strokeRect(startX, startY, width, height);
            }
        };
        img.src = capturedScreenshot;
    };

    // Mouse event handlers for annotation
    annotationCanvas.addEventListener('mousedown', (e) => {
        const rect = annotationCanvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        isDrawing = true;
    });

    annotationCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        
        const rect = annotationCanvas.getBoundingClientRect();
        currentX = e.clientX - rect.left;
        currentY = e.clientY - rect.top;
        
        drawRect();
    });

    annotationCanvas.addEventListener('mouseup', (e) => {
        if (!isDrawing) return;
        
        const rect = annotationCanvas.getBoundingClientRect();
        currentX = e.clientX - rect.left;
        currentY = e.clientY - rect.top;
        
        isDrawing = false;
        
        // Store annotation coordinates
        annotationCoords = {
            x: Math.min(startX, currentX),
            y: Math.min(startY, currentY),
            width: Math.abs(currentX - startX),
            height: Math.abs(currentY - startY)
        };
        
        drawRect();
    });

    // 5. Flow control functions
    const showAnnotationUI = () => {
        annotationOverlay.style.display = 'flex';
    };

    const hideAnnotationUI = () => {
        annotationOverlay.style.display = 'none';
    };

    const showModal = () => {
        modalOverlay.style.display = 'flex';
    };

    const closeModal = () => {
        modalOverlay.style.display = 'none';
        // Reset state
        capturedScreenshot = null;
        annotationCoords = null;
    };

    const startFeedbackFlow = async () => {
        // Capture screenshot
        const screenshot = await captureScreenshot();
        
        if (!screenshot) {
            // If screenshot failed, go directly to modal
            showModal();
            return;
        }
        
        capturedScreenshot = screenshot;
        
        // Initialize and show annotation UI
        initAnnotationCanvas(screenshot);
        showAnnotationUI();
    };

    // 6. Expandable FAB behavior
    let isExpanded = false;
    let expandTimeout = null;

    const expandFAB = () => {
        fab.classList.add('expanded');
        isExpanded = true;
    };

    const collapseFAB = () => {
        fab.classList.remove('expanded');
        isExpanded = false;
        if (expandTimeout) {
            clearTimeout(expandTimeout);
            expandTimeout = null;
        }
    };

    // Handle FAB click/tap
    fab.addEventListener('click', (e) => {
        if (!isExpanded) {
            e.preventDefault();
            e.stopPropagation();
            expandFAB();
            
            // Auto-collapse after 3 seconds on mobile
            if (window.innerWidth <= 768) {
                expandTimeout = setTimeout(collapseFAB, 3000);
            }
        } else {
            // If already expanded, proceed with feedback flow
            startFeedbackFlow();
        }
    });

    // Collapse on scroll
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        if (isExpanded) {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(collapseFAB, 100);
        }
    });

    // Collapse when clicking outside
    document.addEventListener('click', (e) => {
        if (isExpanded && !fab.contains(e.target)) {
            collapseFAB();
        }
    });

    // 7. Original Event Listeners
    
    skipAnnotationButton.addEventListener('click', () => {
        hideAnnotationUI();
        annotationCoords = null;
        showModal();
    });
    
    continueAnnotationButton.addEventListener('click', () => {
        hideAnnotationUI();
        showModal();
    });
    
    cancelButton.addEventListener('click', closeModal);
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    // Keyboard shortcut (Ctrl/Cmd + B)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            if (modalOverlay.style.display === 'flex') {
                closeModal();
            } else if (annotationOverlay.style.display === 'flex') {
                hideAnnotationUI();
                closeModal();
            } else {
                // Expand button and start feedback flow
                expandFAB();
                setTimeout(() => {
                    startFeedbackFlow();
                }, 300); // Wait for expand animation
            }
        }
    });

    // Handle form submission
    feedbackForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(feedbackForm);
        const category = formData.get('category');
        
        const feedbackData = {
            category: category,
            description: formData.get('description'),
            // Automated data collection
            browser: navigator.userAgent,
            os: navigator.platform,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            viewportSize: `${window.innerWidth}x${window.innerHeight}`,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            // Phase 2: Screenshot and annotation data
            screenshot: capturedScreenshot,
            annotation: annotationCoords,
            // Phase 3: Session ID (always included)
            clientSessionId: clientSessionId
        };
        
        // Phase 3: Conditionally include API state for Bug Reports
        if (category === 'Bug Report' && window.lastApiResponse) {
            feedbackData.lastApiResponse = window.lastApiResponse;
        }

        // Log feedback data for debugging (in development)
        if (window.DEBUG_FEEDBACK) {
            console.log('Feedback Submitted:', feedbackData);
            console.log('Screenshot size:', capturedScreenshot ? `${(capturedScreenshot.length / 1024).toFixed(2)} KB` : 'None');
            console.log('Annotation:', annotationCoords || 'None');
            console.log('Session ID:', clientSessionId);
            console.log('Last API Response:', category === 'Bug Report' ? (window.lastApiResponse || 'None captured') : 'Not included (not a bug report)');
        }

        // Send feedback to backend
        fetch('/api/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(feedbackData)
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.detail || 'Failed to submit feedback');
                });
            }
            return response.json();
        })
        .then(data => {
            console.log('Feedback submitted successfully:', data);
            
            // Show success message
            const submitButton = feedbackForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.textContent = '✓ Submitted!';
            submitButton.style.backgroundColor = '#28a745';
            
            // Close modal after a brief delay
            setTimeout(() => {
                closeModal();
                feedbackForm.reset();
                submitButton.textContent = originalText;
                submitButton.style.backgroundColor = '';
            }, 1500);
        })
        .catch(error => {
            console.error('Error submitting feedback:', error);
            
            // Show error message
            const errorMessage = document.createElement('div');
            errorMessage.style.cssText = 'color: #dc3545; margin-top: 10px; padding: 10px; background: #f8d7da; border-radius: 4px; font-size: 14px;';
            errorMessage.textContent = `Error: ${error.message}. Please try again.`;
            
            const existingError = feedbackForm.querySelector('.error-message');
            if (existingError) {
                existingError.remove();
            }
            
            errorMessage.className = 'error-message';
            feedbackForm.appendChild(errorMessage);
            
            // Remove error message after 5 seconds
            setTimeout(() => errorMessage.remove(), 5000);
        });
    });
    
    // ============================================================================
    // EXPORT BUTTON FUNCTIONALITY
    // ============================================================================
    
    // Export FAB expandable behavior
    let isExportExpanded = false;
    let exportExpandTimeout = null;

    const expandExportFAB = () => {
        exportFab.classList.add('expanded');
        isExportExpanded = true;
    };

    const collapseExportFAB = () => {
        exportFab.classList.remove('expanded');
        isExportExpanded = false;
        if (exportExpandTimeout) {
            clearTimeout(exportExpandTimeout);
            exportExpandTimeout = null;
        }
    };

    // Handle Export FAB click/tap
    exportFab.addEventListener('click', (e) => {
        if (!isExportExpanded) {
            e.preventDefault();
            e.stopPropagation();
            expandExportFAB();
            
            // Auto-collapse after 3 seconds on mobile
            if (window.innerWidth <= 768) {
                exportExpandTimeout = setTimeout(collapseExportFAB, 3000);
            }
        } else {
            // If already expanded, proceed with export
            exportSearchData();
        }
    });

    // Collapse export button on scroll
    let exportScrollTimeout;
    window.addEventListener('scroll', () => {
        if (isExportExpanded) {
            clearTimeout(exportScrollTimeout);
            exportScrollTimeout = setTimeout(collapseExportFAB, 100);
        }
    });

    // Collapse when clicking outside
    document.addEventListener('click', (e) => {
        if (isExportExpanded && !exportFab.contains(e.target)) {
            collapseExportFAB();
        }
    });
    
    // Export search data function
    function exportSearchData() {
        try {
            // DIAGNOSTIC: Check what's actually available
            console.log('[EXPORT DEBUG] Checking data availability:', {
                'window.lastData exists': !!window.lastData,
                'window.lastActiveData exists': !!window.lastActiveData,
                'window.marketValueGlobal exists': !!window.marketValueGlobal,
                'window.expectLowGlobal exists': !!window.expectLowGlobal,
                'window.expectHighGlobal exists': !!window.expectHighGlobal,
                'window.currentPriceTier exists': !!window.currentPriceTier,
                'typeof window.lastData': typeof window.lastData,
                'typeof window.lastActiveData': typeof window.lastActiveData
            });
            
            // Check if we have data to export
            if (!window.lastData && !window.lastActiveData) {
                console.error('[EXPORT ERROR] No search data found on window object');
                alert('No search data available to export. Please run a search first.');
                return;
            }
            
            // Gather all available data
            const exportData = {
                metadata: {
                    timestamp: new Date().toISOString(),
                    searchQuery: window.lastData?.query || 'N/A',
                    exportedBy: 'Kuya Comps Export Tool',
                    version: '1.0.0'
                },
                soldListings: {
                    raw: window.lastData?.items || [],
                    count: window.lastData?.items?.length || 0,
                    statistics: {
                        min_price: window.lastData?.min_price,
                        max_price: window.lastData?.max_price,
                        avg_price: window.lastData?.avg_price
                    }
                },
                activeListings: {
                    raw: window.lastActiveData?.items || [],
                    count: window.lastActiveData?.items?.length || 0,
                    statistics: {
                        min_price: window.lastActiveData?.min_price,
                        max_price: window.lastActiveData?.max_price,
                        avg_price: window.lastActiveData?.avg_price
                    }
                },
                analytics: {
                    fmv: {
                        market_value: window.marketValueGlobal,
                        quick_sale: window.expectLowGlobal,
                        patient_sale: window.expectHighGlobal
                    },
                    price_tier: window.currentPriceTier || null
                }
            };
            
            // Convert to JSON string with formatting
            const jsonString = JSON.stringify(exportData, null, 2);
            
            // Create blob and download
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Create download link
            const a = document.createElement('a');
            a.href = url;
            
            // Generate filename with timestamp and sanitized query
            const timestamp = new Date().toISOString().split('T')[0];
            const querySlug = (exportData.metadata.searchQuery || 'search')
                .substring(0, 50)
                .replace(/[^a-z0-9]/gi, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
                .toLowerCase();
            a.download = `kuya-export-${querySlug}-${timestamp}.json`;
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            // Show success feedback
            const originalIcon = exportFab.querySelector('.export-fab-icon').textContent;
            exportFab.querySelector('.export-fab-icon').textContent = '✓';
            exportFab.style.backgroundColor = '#34c759';
            
            setTimeout(() => {
                exportFab.querySelector('.export-fab-icon').textContent = originalIcon;
                exportFab.style.backgroundColor = '';
                collapseExportFAB();
            }, 2000);
            
            console.log('[EXPORT] Data exported successfully:', {
                soldCount: exportData.soldListings.count,
                activeCount: exportData.activeListings.count,
                filename: a.download
            });
            
        } catch (error) {
            console.error('[EXPORT] Error exporting data:', error);
            alert('Error exporting data. Please try again.');
        }
    }
});
