/**
 * Content Loader Module
 * Loads and caches market message content from JSON
 */

class ContentLoader {
    constructor() {
        this.cache = null;
        this.loading = null;
        this.fallbackContent = null; // Set during initialization
    }

    /**
     * Load content from JSON file
     * @returns {Promise<Object>} Content object
     */
    async load() {
        // Return cached content if available
        if (this.cache) {
            return this.cache;
        }

        // Return in-flight promise if already loading
        if (this.loading) {
            return this.loading;
        }

        // Fetch content
        this.loading = fetch('/market_messages_content.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                this.cache = data;
                this.loading = null;
                console.log('[ContentLoader] Loaded message content v' + data.version);
                return data;
            })
            .catch(error => {
                console.error('[ContentLoader] Failed to load content:', error);
                this.loading = null;
                
                // Return fallback if available
                if (this.fallbackContent) {
                    console.warn('[ContentLoader] Using fallback content');
                    return this.fallbackContent;
                }
                
                throw error;
            });

        return this.loading;
    }

    /**
     * Get message content by scenario key
     * @param {string} scenarioKey - Scenario identifier
     * @returns {Promise<Object>} Message object
     */
    async getMessage(scenarioKey) {
        const content = await this.load();
        return content.messages[scenarioKey];
    }

    /**
     * Get popup content by type
     * @param {string} popupType - Popup identifier
     * @returns {Promise<Object>} Popup object
     */
    async getPopup(popupType) {
        const content = await this.load();
        return content.popups[popupType];
    }

    /**
     * Set fallback content for offline/error scenarios
     * @param {Object} fallback - Fallback content object
     */
    setFallback(fallback) {
        this.fallbackContent = fallback;
    }

    /**
     * Clear cache (useful for testing)
     */
    clearCache() {
        this.cache = null;
        this.loading = null;
    }
}

// Export singleton instance
const contentLoader = new ContentLoader();

// Make available globally for other scripts
if (typeof window !== 'undefined') {
    window.contentLoader = contentLoader;
}
