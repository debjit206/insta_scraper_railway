# Instagram Scraper Railway API

A Instagram Reel scraper API built with Node.js, Express, Selenium, and Chrome, designed for easy deployment on Railway using Docker.

---

## 🚀 Features
- Scrapes Instagram Reel data (caption, likes, comments, views, timestamp) for a given username and post link.
- Exposes a simple HTTP API endpoint (`/scrape`) for integration.
- Uses cookies.json for Instagram login/session (no manual login required).
- Ready for deployment on Railway (or any Docker-compatible platform).

---

## 📦 Project Structure
```
insta_scraper_railway/
├── api_server.js      # Express API server
├── scraper.js         # Instagram scraping logic (Selenium)
├── test.js            # Test script for API
├── cookies.json       # Instagram session cookies
├── package.json       # Node.js dependencies
├── package-lock.json  # Dependency lock file
├── Dockerfile         # Docker build instructions
└── README.md          # (this file)
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
  "commentsCount": 21,
  "viewCount": 35300000,
  "timestamp": "2025-05-22T21:27:38.000Z"
}
```

---

## 🚢 Deployment (Railway or Docker)

1. **Clone or fork this repo.**
2. **Add your `cookies.json`** (Instagram session cookies) to the project root.
3. **Deploy to Railway:**
   - Connect your GitHub repo to Railway.
   - Railway will auto-detect the Dockerfile and build your app with Chrome included.
   - No extra configuration needed!
4. **Or run locally with Docker:**
   ```sh
   docker build -t insta-scraper .
   docker run -p 3000:3000 insta-scraper
   ```

---

## 🧪 Testing the API (with `test.js`)

1. **Install dependencies:**
   ```sh
   npm install
   ```
2. **Edit `test.js`** to set your deployed Railway URL (or localhost if running locally):
   ```js
   const API_URL = 'https://instascraperrailway-production.up.railway.app/scrape';
   // or
   // const API_URL = 'http://localhost:3000/scrape';
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
     "commentsCount": 21,
     "viewCount": 35300000,
     "timestamp": "2025-05-22T21:27:38.000Z"
   }
   ```

---

## ⚠️ Notes
- Make sure your `cookies.json` is valid and up-to-date for Instagram login.
- This project is for educational and research purposes. Use responsibly and respect Instagram's terms of service.

---
