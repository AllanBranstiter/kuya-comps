/**
 * Focus Trap Utility for Modals
 * Traps focus within a modal when opened
 * 
 * Created: January 24, 2026
 * Purpose: Accessibility improvement - ensures keyboard users stay within modals
 */
const FocusTrap = {
    trapElement: null,
    previousActiveElement: null,
    
    /**
     * Activate focus trap on an element
     * @param {HTMLElement} element - The element to trap focus within
     */
    activate(element) {
        // Store the previously focused element
        this.previousActiveElement = document.activeElement;
        this.trapElement = element;
        
        // Add event listener for tab key
        document.addEventListener('keydown', this.handleKeyDown);
        
        // Focus the first focusable element
        const focusableElements = this.getFocusableElements();
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    },
    
    /**
     * Deactivate focus trap
     */
    deactivate() {
        document.removeEventListener('keydown', this.handleKeyDown);
        
        // Restore focus to the previously focused element
        if (this.previousActiveElement) {
            this.previousActiveElement.focus();
        }
        
        this.trapElement = null;
        this.previousActiveElement = null;
    },
    
    /**
     * Get all focusable elements within the trap element
     * @returns {Array} Array of focusable elements
     */
    getFocusableElements() {
        if (!this.trapElement) return [];
        
        const focusableSelectors = [
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            'a[href]',
            '[tabindex]:not([tabindex="-1"])'
        ].join(',');
        
        return Array.from(this.trapElement.querySelectorAll(focusableSelectors));
    },
    
    /**
     * Handle keydown events for focus trapping
     * @param {KeyboardEvent} e - The keyboard event
     */
    handleKeyDown: function(e) {
        if (e.key !== 'Tab') return;
        
        const focusableElements = FocusTrap.getFocusableElements();
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            // Tab
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }
};

// Export for use in other modules
window.FocusTrap = FocusTrap;
