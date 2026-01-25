/**
 * Reusable Modal Component
 * 
 * A unified modal system for the Kuya Comps application.
 * Provides consistent modal behavior across auth, subscription, and other modals.
 * 
 * Features:
 * - Overlay creation and management
 * - Open/close with CSS animations
 * - Focus trapping (using focusTrap.js)
 * - Escape key handling to close
 * - Click-outside-to-close functionality
 * - ARIA attributes for accessibility
 * - Callback hooks for open/close events
 * - Support for multiple modal sizes
 * 
 * Created: January 24, 2026
 * @version 1.0.0
 */

class Modal {
    /**
     * Create a new Modal instance
     * @param {Object} options - Modal configuration options
     * @param {string} options.id - Unique modal ID (required)
     * @param {string|HTMLElement} options.content - Modal content (HTML string or element)
     * @param {string} options.title - Modal title for accessibility (default: 'Modal')
     * @param {boolean} options.closeOnOverlayClick - Whether clicking overlay closes modal (default: true)
     * @param {boolean} options.closeOnEscape - Whether Escape key closes modal (default: true)
     * @param {boolean} options.showCloseButton - Whether to show the close button (default: true)
     * @param {Function} options.onOpen - Callback when modal opens
     * @param {Function} options.onClose - Callback when modal closes
     * @param {Function} options.onBeforeClose - Callback before modal closes, return false to prevent
     * @param {string} options.size - Modal size: 'small', 'medium', 'large' (default: 'medium')
     * @param {string} options.customClass - Additional CSS class for the modal container
     */
    constructor(options) {
        // Validate required options
        if (!options || !options.id) {
            throw new Error('Modal requires an "id" option');
        }
        
        // Set defaults
        this.id = options.id;
        this.title = options.title || 'Modal';
        this.closeOnOverlayClick = options.closeOnOverlayClick !== false;
        this.closeOnEscape = options.closeOnEscape !== false;
        this.showCloseButton = options.showCloseButton !== false;
        this.onOpen = options.onOpen || null;
        this.onClose = options.onClose || null;
        this.onBeforeClose = options.onBeforeClose || null;
        this.size = options.size || 'medium';
        this.customClass = options.customClass || '';
        
        // Internal state
        this.isOpen = false;
        this.overlay = null;
        this.container = null;
        this.previousActiveElement = null;
        this._boundEscapeHandler = this._handleEscape.bind(this);
        
        // Create the modal elements
        this._createModal(options.content);
        
        // Register this modal instance
        Modal._instances.set(this.id, this);
    }
    
    /**
     * Static registry of all modal instances
     * @private
     */
    static _instances = new Map();
    
    /**
     * Get a modal instance by ID
     * @param {string} id - Modal ID
     * @returns {Modal|undefined} Modal instance or undefined
     */
    static getInstance(id) {
        return Modal._instances.get(id);
    }
    
    /**
     * Close all open modals
     */
    static closeAll() {
        Modal._instances.forEach(modal => {
            if (modal.isOpen) {
                modal.close();
            }
        });
    }
    
    /**
     * Get size class based on size option
     * @private
     * @returns {string} CSS class for size
     */
    _getSizeClass() {
        const sizes = {
            small: 'modal-size-small',
            medium: 'modal-size-medium',
            large: 'modal-size-large'
        };
        return sizes[this.size] || sizes.medium;
    }
    
    /**
     * Create the modal DOM structure
     * @private
     * @param {string|HTMLElement} content - Modal content
     */
    _createModal(content) {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.id = `${this.id}-overlay`;
        this.overlay.className = 'modal-overlay';
        this.overlay.setAttribute('aria-hidden', 'true');
        
        // Create container
        this.container = document.createElement('div');
        this.container.id = this.id;
        this.container.className = `modal-container ${this._getSizeClass()} ${this.customClass}`.trim();
        this.container.setAttribute('role', 'dialog');
        this.container.setAttribute('aria-modal', 'true');
        this.container.setAttribute('aria-labelledby', `${this.id}-title`);
        this.container.setAttribute('tabindex', '-1');
        
        // Create header with title and close button
        const header = document.createElement('div');
        header.className = 'modal-header';
        
        const titleElement = document.createElement('h2');
        titleElement.id = `${this.id}-title`;
        titleElement.className = 'modal-title';
        titleElement.textContent = this.title;
        header.appendChild(titleElement);
        
        if (this.showCloseButton) {
            const closeButton = document.createElement('button');
            closeButton.className = 'modal-close-btn';
            closeButton.setAttribute('type', 'button');
            closeButton.setAttribute('aria-label', 'Close modal');
            closeButton.innerHTML = '&times;';
            closeButton.addEventListener('click', () => this.close());
            header.appendChild(closeButton);
        }
        
        // Create content wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'modal-content';
        
        // Set content
        if (typeof content === 'string') {
            contentWrapper.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            contentWrapper.appendChild(content);
        }
        
        // Assemble container
        this.container.appendChild(header);
        this.container.appendChild(contentWrapper);
        
        // Add overlay click handler
        if (this.closeOnOverlayClick) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.close();
                }
            });
        }
        
        // Add to DOM (initially hidden)
        this.overlay.appendChild(this.container);
        document.body.appendChild(this.overlay);
    }
    
    /**
     * Handle Escape key press
     * @private
     * @param {KeyboardEvent} e - Keyboard event
     */
    _handleEscape(e) {
        if (e.key === 'Escape' && this.isOpen && this.closeOnEscape) {
            e.preventDefault();
            e.stopPropagation();
            this.close();
        }
    }
    
    /**
     * Open the modal
     * @returns {Modal} This modal instance for chaining
     */
    open() {
        if (this.isOpen) return this;
        
        // Store the currently focused element
        this.previousActiveElement = document.activeElement;
        
        // Show the overlay and container
        this.overlay.style.display = 'flex';
        this.overlay.setAttribute('aria-hidden', 'false');
        
        // Trigger animations on next frame
        requestAnimationFrame(() => {
            this.overlay.classList.add('active');
            this.container.classList.add('active');
        });
        
        // Prevent body scrolling
        document.body.style.overflow = 'hidden';
        
        // Add escape key handler
        document.addEventListener('keydown', this._boundEscapeHandler);
        
        // Activate focus trap
        if (window.FocusTrap) {
            FocusTrap.activate(this.container);
        } else {
            // Fallback: focus the container or first focusable element
            this.container.focus();
        }
        
        this.isOpen = true;
        
        // Announce to screen readers
        this._announceToScreenReader('Dialog opened');
        
        // Call onOpen callback
        if (typeof this.onOpen === 'function') {
            this.onOpen(this);
        }
        
        return this;
    }
    
    /**
     * Close the modal
     * @returns {Modal} This modal instance for chaining
     */
    close() {
        if (!this.isOpen) return this;
        
        // Call onBeforeClose callback - can prevent close by returning false
        if (typeof this.onBeforeClose === 'function') {
            if (this.onBeforeClose(this) === false) {
                return this;
            }
        }
        
        // Deactivate focus trap
        if (window.FocusTrap) {
            FocusTrap.deactivate();
        }
        
        // Remove escape key handler
        document.removeEventListener('keydown', this._boundEscapeHandler);
        
        // Start close animation
        this.overlay.classList.remove('active');
        this.container.classList.remove('active');
        
        // Wait for animation to complete before hiding
        setTimeout(() => {
            if (!this.isOpen) { // Check if still closed
                this.overlay.style.display = 'none';
                this.overlay.setAttribute('aria-hidden', 'true');
            }
        }, 200); // Match CSS transition duration
        
        // Restore body scrolling (only if no other modals are open)
        const hasOtherOpenModals = Array.from(Modal._instances.values())
            .some(modal => modal !== this && modal.isOpen);
        if (!hasOtherOpenModals) {
            document.body.style.overflow = '';
        }
        
        // Restore focus to the previously focused element
        if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
            this.previousActiveElement.focus();
        }
        
        this.isOpen = false;
        
        // Announce to screen readers
        this._announceToScreenReader('Dialog closed');
        
        // Call onClose callback
        if (typeof this.onClose === 'function') {
            this.onClose(this);
        }
        
        return this;
    }
    
    /**
     * Toggle the modal open/closed
     * @returns {Modal} This modal instance for chaining
     */
    toggle() {
        return this.isOpen ? this.close() : this.open();
    }
    
    /**
     * Update the modal content
     * @param {string|HTMLElement} content - New content
     * @returns {Modal} This modal instance for chaining
     */
    setContent(content) {
        const contentWrapper = this.container.querySelector('.modal-content');
        if (contentWrapper) {
            if (typeof content === 'string') {
                contentWrapper.innerHTML = content;
            } else if (content instanceof HTMLElement) {
                contentWrapper.innerHTML = '';
                contentWrapper.appendChild(content);
            }
        }
        return this;
    }
    
    /**
     * Update the modal title
     * @param {string} title - New title
     * @returns {Modal} This modal instance for chaining
     */
    setTitle(title) {
        this.title = title;
        const titleElement = this.container.querySelector('.modal-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
        return this;
    }
    
    /**
     * Get the modal content element
     * @returns {HTMLElement|null} Content wrapper element
     */
    getContentElement() {
        return this.container.querySelector('.modal-content');
    }
    
    /**
     * Get the modal container element
     * @returns {HTMLElement} Modal container element
     */
    getContainerElement() {
        return this.container;
    }
    
    /**
     * Get the modal overlay element
     * @returns {HTMLElement} Modal overlay element
     */
    getOverlayElement() {
        return this.overlay;
    }
    
    /**
     * Destroy the modal and remove from DOM
     */
    destroy() {
        // Close if open
        if (this.isOpen) {
            this.close();
        }
        
        // Remove from DOM
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        
        // Remove from registry
        Modal._instances.delete(this.id);
        
        // Clean up references
        this.overlay = null;
        this.container = null;
        this.previousActiveElement = null;
    }
    
    /**
     * Announce a message to screen readers
     * @private
     * @param {string} message - Message to announce
     */
    _announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        // Remove after announcement
        setTimeout(() => {
            if (announcement.parentNode) {
                announcement.parentNode.removeChild(announcement);
            }
        }, 1000);
    }
}

/**
 * Factory function for creating simple modals
 * @param {Object} options - Modal options (same as Modal constructor)
 * @returns {Modal} New Modal instance
 */
function createModal(options) {
    return new Modal(options);
}

/**
 * Show a simple alert-style modal
 * @param {string} title - Modal title
 * @param {string} message - Message to display
 * @param {Object} options - Additional options
 * @returns {Modal} Modal instance
 */
function showAlertModal(title, message, options = {}) {
    const modalId = options.id || `alert-modal-${Date.now()}`;
    
    // Remove existing modal with same ID
    const existing = Modal.getInstance(modalId);
    if (existing) {
        existing.destroy();
    }
    
    const content = `
        <div style="text-align: center; padding: 1rem 0;">
            ${options.icon ? `<div style="font-size: 3rem; margin-bottom: 1rem;">${options.icon}</div>` : ''}
            <p style="margin: 0 0 1.5rem 0; font-size: 1rem; color: var(--text-color);">${message}</p>
            <button class="modal-btn modal-btn-primary" onclick="Modal.getInstance('${modalId}').close()">
                ${options.buttonText || 'OK'}
            </button>
        </div>
    `;
    
    const modal = new Modal({
        id: modalId,
        title: title,
        content: content,
        size: options.size || 'small',
        onClose: options.onClose,
        ...options
    });
    
    return modal.open();
}

/**
 * Show a confirmation modal
 * @param {string} title - Modal title
 * @param {string} message - Message to display
 * @param {Object} options - Additional options
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
 */
function showConfirmModal(title, message, options = {}) {
    return new Promise((resolve) => {
        const modalId = options.id || `confirm-modal-${Date.now()}`;
        
        // Remove existing modal with same ID
        const existing = Modal.getInstance(modalId);
        if (existing) {
            existing.destroy();
        }
        
        const content = `
            <div style="text-align: center; padding: 1rem 0;">
                ${options.icon ? `<div style="font-size: 3rem; margin-bottom: 1rem;">${options.icon}</div>` : ''}
                <p style="margin: 0 0 1.5rem 0; font-size: 1rem; color: var(--text-color);">${message}</p>
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <button class="modal-btn modal-btn-secondary" id="${modalId}-cancel">
                        ${options.cancelText || 'Cancel'}
                    </button>
                    <button class="modal-btn modal-btn-primary" id="${modalId}-confirm">
                        ${options.confirmText || 'Confirm'}
                    </button>
                </div>
            </div>
        `;
        
        const modal = new Modal({
            id: modalId,
            title: title,
            content: content,
            size: options.size || 'small',
            closeOnEscape: options.closeOnEscape !== false,
            closeOnOverlayClick: options.closeOnOverlayClick !== false,
            onClose: () => {
                resolve(false);
                if (options.onClose) options.onClose();
            },
            ...options
        });
        
        modal.open();
        
        // Add button handlers
        document.getElementById(`${modalId}-cancel`).addEventListener('click', () => {
            modal.close();
            // resolve(false) handled by onClose
        });
        
        document.getElementById(`${modalId}-confirm`).addEventListener('click', () => {
            // Prevent the onClose resolve(false)
            modal.onClose = options.onClose || null;
            modal.close();
            resolve(true);
        });
    });
}

// Export for use in other modules
window.Modal = Modal;
window.createModal = createModal;
window.showAlertModal = showAlertModal;
window.showConfirmModal = showConfirmModal;

console.log('[MODAL] Modal component loaded successfully');
