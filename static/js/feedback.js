
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

    // 1. Create and inject the HTML for FAB, Annotation UI, and Modal
    const feedbackContainer = document.createElement('div');
    feedbackContainer.innerHTML = `
        <button class="feedback-fab">
            <div class="feedback-fab-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.416 2.62412C17.7607 2.39435 17.8538 1.9287 17.624 1.58405C17.3943 1.23941 16.9286 1.14628 16.584 1.37604L13.6687 3.31955C13.1527 3.11343 12.5897 3.00006 12.0001 3.00006C11.4105 3.00006 10.8474 3.11345 10.3314 3.31962L7.41603 1.37604C7.07138 1.14628 6.60573 1.23941 6.37596 1.58405C6.1462 1.9287 6.23933 2.39435 6.58397 2.62412L8.9437 4.19727C8.24831 4.84109 7.75664 5.70181 7.57617 6.6719C8.01128 6.55973 8.46749 6.50006 8.93763 6.50006H15.0626C15.5328 6.50006 15.989 6.55973 16.4241 6.6719C16.2436 5.70176 15.7519 4.841 15.0564 4.19717L17.416 2.62412Z" fill="white"/>
                    <path d="M1.25 14.0001C1.25 13.5859 1.58579 13.2501 2 13.2501H5V11.9376C5 11.1019 5.26034 10.327 5.70435 9.68959L3.22141 8.69624C2.83684 8.54238 2.6498 8.10589 2.80366 7.72131C2.95752 7.33673 3.39401 7.1497 3.77859 7.30356L6.91514 8.55841C7.50624 8.20388 8.19807 8.00006 8.9375 8.00006H15.0625C15.8019 8.00006 16.4938 8.20388 17.0849 8.55841L20.2214 7.30356C20.606 7.1497 21.0425 7.33673 21.1963 7.72131C21.3502 8.10589 21.1632 8.54238 20.7786 8.69624L18.2957 9.68959C18.7397 10.327 19 11.1019 19 11.9376V13.2501H22C22.4142 13.2501 22.75 13.5859 22.75 14.0001C22.75 14.4143 22.4142 14.7501 22 14.7501H19V15.0001C19 16.1808 18.7077 17.2932 18.1915 18.2689L20.7786 19.3039C21.1632 19.4578 21.3502 19.8943 21.1963 20.2789C21.0425 20.6634 20.606 20.8505 20.2214 20.6966L17.3288 19.5394C16.1974 20.8664 14.5789 21.7655 12.75 21.9604V15.0001C12.75 14.5858 12.4142 14.2501 12 14.2501C11.5858 14.2501 11.25 14.5858 11.25 15.0001V21.9604C9.42109 21.7655 7.80265 20.8664 6.67115 19.5394L3.77859 20.6966C3.39401 20.8505 2.95752 20.6634 2.80366 20.2789C2.6498 19.8943 2.83684 19.4578 3.22141 19.3039L5.80852 18.2689C5.29231 17.2932 5 16.1808 5 15.0001V14.7501H2C1.58579 14.7501 1.25 14.4143 1.25 14.0001Z" fill="white"/>
                </svg>
            </div>
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
    const annotationOverlay = document.querySelector('.feedback-annotation-overlay');
    const modalOverlay = document.querySelector('.feedback-modal-overlay');
    const cancelButton = document.getElementById('cancel-feedback');
    const skipAnnotationButton = document.getElementById('skip-annotation');
    const continueAnnotationButton = document.getElementById('continue-annotation');
    const feedbackForm = document.getElementById('feedback-form');
    const annotationCanvas = document.getElementById('feedback-annotation-canvas');
    const annotationCtx = annotationCanvas.getContext('2d');

    // 3. Screenshot capture function
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
            
            return canvas.toDataURL('image/png');
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

    // 6. Event Listeners
    fab.addEventListener('click', startFeedbackFlow);
    
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
                startFeedbackFlow();
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

        // For now, we'll just log the data to the console
        console.log('Feedback Submitted:', feedbackData);
        console.log('Screenshot size:', capturedScreenshot ? `${(capturedScreenshot.length / 1024).toFixed(2)} KB` : 'None');
        console.log('Annotation:', annotationCoords || 'None');
        console.log('Session ID:', clientSessionId);
        console.log('Last API Response:', category === 'Bug Report' ? (window.lastApiResponse || 'None captured') : 'Not included (not a bug report)');

        // Here you would typically send the data to a server
        // Example:
        // fetch('/api/feedback', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(feedbackData)
        // });

        alert('Thank you for your feedback!');
        closeModal();
        feedbackForm.reset();
    });
});
