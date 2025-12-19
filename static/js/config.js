/**
 * Frontend Configuration Constants
 * Centralized configuration for API endpoints, timeouts, and UI constants
 */

// API Configuration
const API_ENDPOINTS = {
    COMPS: '/comps',
    ACTIVE: '/active',
    FMV: '/fmv',
    HEALTH: '/health'
};

// Timeout values (milliseconds)
const TIMEOUTS = {
    API_REQUEST: 30000,  // 30 seconds
    CHART_DRAW_DELAY: 100,
    CHART_REDRAW_DELAY: 50,
    LOADING_STAGE_DELAY: 300
};

// UI Constants
const UI_CONSTANTS = {
    MAX_QUERY_LENGTH: 500,
    MIN_QUERY_LENGTH: 1,
    MAX_PAGES: 10,
    MIN_PAGES: 1,
    DEFAULT_PAGES: 1,
    DEFAULT_DELAY: 2,
    
    // Chart dimensions
    CHART_HEIGHT: 250,
    CHART_HEIGHT_MOBILE: 180,
    CHART_MIN_WIDTH: 300,
    
    // Beeswarm chart settings
    BEESWARM_MARGIN: { top: 60, right: 40, bottom: 70, left: 40 },
    BEESWARM_POINT_RADIUS: 4,
    BEESWARM_MAX_Y_OFFSET: 60,
    BEESWARM_MAX_ATTEMPTS: 200,
    
    // Price distribution chart settings
    PRICE_DIST_MARGIN: { top: 40, right: 40, bottom: 60, left: 60 },
    PRICE_DIST_HEIGHT: 300,
    PRICE_DIST_NUM_BINS: 10,
    
    // Table settings
    TABLE_MAX_HEIGHT: 400,
    
    // Animation durations
    ANIMATION_DURATION_SHORT: 200,
    ANIMATION_DURATION_MEDIUM: 300,
    ANIMATION_DURATION_LONG: 600,
    
    // Error message display duration
    ERROR_MESSAGE_DURATION: 5000
};

// Color schemes
const COLORS = {
    PRIMARY_BLUE: '#007aff',
    PRIMARY_BLUE_HOVER: '#0056b3',
    ACCENT_PURPLE: '#5856d6',
    ACCENT_GREEN: '#34c759',
    ACCENT_ORANGE: '#ff9500',
    ACCENT_RED: '#ff3b30',
    
    TEXT_COLOR: '#1d1d1f',
    SUBTLE_TEXT_COLOR: '#6e6e73',
    BORDER_COLOR: '#d2d2d7',
    
    // Chart colors
    SOLD_LISTINGS_FILL: 'rgba(0, 122, 255, 0.6)',
    SOLD_LISTINGS_STROKE: 'rgba(0, 122, 255, 0.9)',
    ACTIVE_LISTINGS_FILL: 'rgba(255, 59, 48, 0.6)',
    ACTIVE_LISTINGS_STROKE: 'rgba(255, 59, 48, 0.9)',
    
    // FMV band colors
    FMV_BAND_GRADIENT_START: 'rgba(52, 199, 89, 0.2)',
    FMV_BAND_GRADIENT_MID: 'rgba(48, 209, 88, 0.15)',
    FMV_BAND_GRADIENT_END: 'rgba(52, 199, 89, 0.1)',
    FMV_LINE_COLOR: 'rgba(52, 199, 89, 0.9)'
};

// Device detection
const DEVICE = {
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isIOS: /iPhone|iPad|iPod/i.test(navigator.userAgent)
};

// Default values
const DEFAULTS = {
    API_KEY: 'backend-handled'
};
