# Instagram Scraper 

An Instagram Reel scraper API built with Node.js, Express, Selenium, and Chrome.
---

## 🚀 Features
- Scrapes Instagram Reel data (caption, likes, comments, views, timestamp) for a given username and post link.
- Exposes a simple HTTP API endpoint (`/scrape`) for integration.
- Uses cookies.json for Instagram login (no manual login required).

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
  "username": "beingsalmankhan",
  "post_link": "https://www.instagram.com/reel/DJ-IpMVokFU/"
}
```

### Example Response
```json
{
  "username": "beingsalmankhan",
  "platform": "Instagram",
  "fetched": "Yes",
  "url": "https://www.instagram.com/beingsalmankhan/reel/DJ-IpMVokFU/",
  "caption": "Abhi raat hai, subah Sooraj chamkega",
  "likesCount": 2114256,
  "commentsCount": 21000,
  "viewCount": 35300000,
  "timestamp": "2025-05-22T21:27:38.000Z"
}
```

---

---

## 🧪 Testing the API (with `test.js`)

1. **Install dependencies:**
   ```sh
   npm install
   ```
2. **Edit `test.js`** to set your deployed URL (or localhost if running locally):

```js
// Test script for Instagram Scraper API
// Make sure to install axios: npm install axios

const axios = require('axios');

const API_URL = 'YOUR_API_URL';


// Test bulk request
async function testBulkRequest() {
  console.log('\n=== Testing Bulk Request ===');
  const bulkPayload = {
    usernames: ['cristiano', 'virat.kohli'],
    post_links: [
      'https://www.instagram.com/reel/DJq5DRiM1QR/',
      'https://www.instagram.com/reel/DAVB2YZP9IQ/'    ]
  };
  
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

// Run the test
if (require.main === module) {
  testBulkRequest();
}     
```
3. **Run the test script:**
   ```sh
   node test.js
   ```
4. **You should see output like:**
   ```json
   {
     "username": "beingsalmankhan",
     "platform": "Instagram",
     "fetched": "Yes",
     "url": "https://www.instagram.com/beingsalmankhan/reel/DJ-IpMVokFU/",
     "caption": "Abhi raat hai, subah Sooraj chamkega",
     "likesCount": 2114256,
     "commentsCount": 21000,
     "viewCount": 35300000,
     "timestamp": "2025-05-22T21:27:38.000Z"
   }
   ```

---

## ⚠️ Notes
- Make sure your `cookies.json` is valid and up-to-date for Instagram login.
---
