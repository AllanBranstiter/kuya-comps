# eBay Baseball Card Comps Tool

This is a simple web application to scrape and display sold listings for baseball cards from eBay.

## Features

*   Web UI to enter a search query and a `SearchAPI.io` API key.
*   Scrapes multiple pages of eBay's sold listings.
*   Displays results in a table.
*   Allows downloading the raw data as a CSV file from the browser.
*   Automatically saves the results to a CSV file on the server in the `results_library` directory.

## Tech Stack

*   **Backend**: Python with [FastAPI](https://fastapi.tiangolo.com/)
*   **Frontend**: Vanilla HTML, CSS, and JavaScript
*   **Scraping**: Uses [SearchAPI.io](https://www.searchapi.io/) to fetch eBay data.

## Setup and Running

1.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

2.  **Run the application:**
    ```bash
    uvicorn main:app --reload
    ```

3.  **Open your browser:**
    Navigate to [http://127.0.0.1:8000](http://127.0.0.1:8000) to use the application.

## API

The application exposes a single API endpoint:

*   `GET /comps`

    **Query Parameters:**
    *   `query` (string, required): The search term for the card.
    *   `api_key` (string, required): Your `SearchAPI.io` API key.
    *   `pages` (integer, optional, default: 3): Number of pages to scrape (1-10).
    *   `delay` (float, optional, default: 2.0): Delay in seconds between page fetches.
    *   `ungraded_only` (boolean, optional, default: False): If true, filters out graded cards.
