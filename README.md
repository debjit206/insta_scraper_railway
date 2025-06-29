# Instagram Scraper 

An Instagram Reel scraper API built with Node.js, Express, Selenium, and Chrome.
---

## 🚀 Features
- Scrapes Instagram Reel data (caption, likes, comments, views, timestamp) for a given username and post link.
- Exposes a simple HTTP API endpoint (`/scrape`) for integration.
- Uses cookies.json for Instagram login (no manual login required).
- Uses retry logic for failed outputs
- Processes in bulk
- Fresh browser sessions for each request to prevent crashes
---

## 📦 Project Structure
```
insta_scraper_railway/
├── api_server.js      # Express API server
├── scraper.js         # Instagram scraping logic (Selenium)
├── cookies.json       # Instagram session cookies
├── package.json       # Node.js dependencies
├── package-lock.json  # Dependency lock file
├── Dockerfile         # Docker build instructions
├── test.js           # Test script for API
```

---

## 🛠️ Setup & Installation

1. **Install dependencies:**
   ```sh
   npm install
   ```

2. **Start the API server:**
   ```sh
   node api_server.js
   ```
   The server will start on port 3000 (or PORT environment variable).

3. **Run the test script:**
   ```sh
   node test.js
   ```

---

## 🛠️ API Usage

### Endpoint
```
POST /scrape
Content-Type: application/json
```

### Request Body
```json
{
  "usernames": ["cristiano", "virat.kohli"],
  "post_links": [
    "https://www.instagram.com/reel/DJq5DRiM1QR/",
    "https://www.instagram.com/reel/DAVB2YZP9IQ/"
  ],
  "retry": 3
}
```

### Parameters
- **usernames** (required): Array of Instagram usernames
- **post_links** (required): Array of Instagram reel/post URLs
- **retry** (optional): Number of retry attempts for failed requests (0-10, default: 3)

---

## 🧪 Testing the API (with `test.js`)

1. **Edit `test.js`** to set your API URL:

```js
// Test script for Instagram Scraper API
// Make sure to install axios: npm install axios

const axios = require('axios');

const API_URL = 'http://localhost:3000/scrape'; // Change to your API URL

const RETRY_ATTEMPTS = 3; // Number of retries for failed requests

// Test bulk request
async function testBulkRequest() {
  console.log('\n=== Testing Bulk Request ===');
  const bulkPayload = {
    usernames: ['cristiano', 'virat.kohli'],
    post_links: [
      'https://www.instagram.com/reel/DJq5DRiM1QR/',
      'https://www.instagram.com/reel/DAVB2YZP9IQ/'
    ],
    retry: RETRY_ATTEMPTS
  };
  
  console.log(`🔄 Testing with ${RETRY_ATTEMPTS} retry attempts...`);
  
  try {
    const response = await axios.post(API_URL, bulkPayload);
    console.log('Bulk Request Response:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response) {
      console.error('Bulk Request Error:', error.response.status, error.response.data);
    } else {
      console.error('Bulk Request Error:', error.message);
    }
  }
}

if (require.main === module) {
  testBulkRequest();
}
```

2. **Run the test script:**
   ```sh
   node test.js
   ```

3. **You should see output like:**

```json
[
  {
    "username": "cristiano",
    "platform": "Instagram",
    "fetched": "Yes",
    "url": "https://www.instagram.com/cristiano/reel/DJq5DRiM1QR/",
    "caption": "Have you heard the news? @uflgame got a big update recently! Season 2 is on! Go and play for free! UFL is available on",
    "likesCount": 5384743,
    "commentsCount": 447410,
    "viewCount": 76300000,
    "timestamp": "2025-05-15T10:04:14.000Z"
  },
  {
    "username": "virat.kohli",
    "platform": "Instagram",
    "fetched": "Yes",
    "url": "https://www.instagram.com/virat.kohli/reel/DAVB2YZP9IQ/",
    "caption": "Ab se life insurance matlab, Digit Life Insurance. That's it. 😎",
    "likesCount": 1793549,
    "commentsCount": 13561,
    "viewCount": 28700000,
    "timestamp": "2024-09-25T05:38:16.000Z"
  }
]
```

---

## ⚠️ Notes
- Make sure your `cookies.json` is valid and up-to-date for Instagram login.
- The API uses fresh browser sessions for each request to prevent crashes.
- Failed requests are automatically retried up to the specified retry limit.
- Each retry attempt uses a new browser session for maximum reliability.
---
