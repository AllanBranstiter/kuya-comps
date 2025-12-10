# eBay Baseball Card Comps Tool v0.3

This is a simple web application to scrape and display sold listings for baseball cards from eBay.

## Features

*   **Dual Search Display**: Automatically shows both sold listings and active listings below FMV
*   **Advanced Filtering**: Raw Only, Base Only, Exclude Autographs, and Buy It Now Only filters
*   **Smart Deal Finding**: Active listings filtered to show only items priced at or below Fair Market Value
*   **Discount Indicators**: Red percentage showing how much below FMV each active listing is priced
*   **Market Analysis**: Fair Market Value calculations with Quick Sale/Patient Sale ranges
*   **Interactive Visualization**: Beeswarm chart showing price distribution
*   **PSA Grade Intelligence**: Compare prices across different PSA grades
*   **Password Protection**: Secure access with session management
*   **Clean UI**: Modern interface with responsive design
*   **Production Ready**: Environment-based configuration and deployment support

## Tech Stack

*   **Backend**: Python with [FastAPI](https://fastapi.tiangolo.com/)
*   **Frontend**: Vanilla HTML, CSS, and JavaScript
*   **Scraping**: Uses [SearchAPI.io](https://www.searchapi.io/) to fetch eBay data.

## Setup and Running

### Local Development

1.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

2.  **Set up Environment Variables:**
    ```bash
    cp .env.example .env
    # Edit .env and add your SearchAPI.io API key
    ```

3.  **Run the application:**
    ```bash
    uvicorn main:app --reload
    ```

4.  **Open your browser:**
    Navigate to [http://127.0.0.1:8000](http://127.0.0.1:8000) to use the application.

### Production Deployment (Railway)

1.  **Push to GitHub:**
    - Ensure `.env` is in `.gitignore` (already configured)
    - Push your code to a GitHub repository

2.  **Deploy on Railway:**
    - Connect your GitHub repository to Railway
    - Set environment variable: `SEARCH_API_KEY=your_searchapi_io_key`
    - Railway will automatically detect the Python app and deploy using the Procfile

3.  **Environment Variables Required:**
    - `SEARCH_API_KEY`: Your SearchAPI.io API key
    - `PORT`: Automatically set by Railway

## API

The application exposes two main API endpoints:

*   `GET /comps` - Search sold listings for market analysis
*   `GET /active` - Search active listings (all current market listings)

Both endpoints support comprehensive filtering and modern analytics.

## Security

- API keys are handled securely on the backend via environment variables
- The `.env` file is excluded from version control via `.gitignore`
- Password protection prevents unauthorized access to the application
- All API calls are routed through the secure backend, never exposing keys to the frontend

## Version History

### Version 0.3.0 (Current)
- **Major UI Redesign**: Replaced single "Find Deals" button with automatic dual-search display
- **New Active Listings Table**:
  - Automatically searches and displays active listings below Fair Market Value
  - Shows discount percentage in red (e.g., -25%, -50%)
  - Displays listing type (Auction or Buy It Now)
  - Sorted by price (lowest to highest)
  - Sticky table headers for easy navigation
- **Buy It Now Only Filter**: Checkbox to filter out auctions from active listings
- **Improved Auction Detection**: Enhanced logic to detect auctions using "bid", "bids", or "auction" in buying format
- **Expanded Year Support**: Validation now accepts years from 1800-2099 (vintage to modern cards)
- **Better Search Validation**: Improved handling of quoted search terms
- **Cleaner Labels**: Simplified table headers for better user experience
- **Backend Enhancement**: New `/active` endpoint for active listing searches
- **Code Cleanup**: Removed ~320 lines of deprecated Find Deals code

### Version 0.2.1
- **Bug Fix**: Ensured "Find Deals" functionality correctly applies exclusion filters (Raw Only, Base Only, Exclude Autographs) to search queries.

### Version 0.2.0 (Previous)
- **Find Deals Functionality**: Added ability to search for current active listings below market value
- **New /deals API Endpoint**: Backend support for active listing searches vs. sold listings
- **Advanced Filtering System**:
  - "Base Only" filter excludes parallels, refractors, and special variants
  - "Exclude Autographs" filter removes auto/signed cards
  - Combined filtering support when multiple filters selected
- **Combined Search Workflow**: New "Find Deals" button that runs both comps + deals searches automatically
- **UI/UX Improvements**:
  - Larger, more prominent filter checkboxes
  - Separate deals results section preserving sold listings visibility
  - Deals sorted by largest discount percentage first
  - Removed technical "Volume-Weighted" references for better user understanding
- **Code Cleanup**:
  - Removed Test Mode functionality (always production)
  - Removed CSV export feature
  - Simplified Smart Market Insights in Grading Intelligence tab
  - Clean API parameter handling without test mode complexity

### Version 0.1.0 (Initial Release)
- Basic eBay sold listings scraping functionality
- Simple web UI for search queries
- Basic price statistics (min, max, average)
- CSV export capability
- Basic API endpoint for comps retrieval
- Support for SearchAPI.io integration

