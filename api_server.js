// Express API server for Instagram scraping
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

// Import the InstagramScraper class from scraper.js
const { Builder, By, until } = require('selenium-webdriver');
const scraperModule = require('./scraper.js');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(bodyParser.json());

// Helper to create a new scraper instance and run the scrape
async function scrapeInstagram(username, post_link) {
  const InstagramScraper = scraperModule.InstagramScraper || scraperModule.default || scraperModule;
  const scraper = new InstagramScraper();
  try {
    await scraper.setupBrowser();
    // Try to login using cookies.json (no manual login in API mode)
    let cookiesLoaded = false;
    if (fs.existsSync(path.join(__dirname, 'cookies.json'))) {
      await scraper.driver.get('https://www.instagram.com/');
      const cookies = JSON.parse(fs.readFileSync(path.join(__dirname, 'cookies.json'), 'utf8'));
      for (const cookie of cookies) {
        const { sameSite, ...rest } = cookie;
        try { await scraper.driver.manage().addCookie(rest); } catch (e) {}
      }
      await scraper.driver.navigate().refresh();
      await scraper.driver.sleep(2000);
      cookiesLoaded = await scraper.checkLoginStatus();
    }
    if (!cookiesLoaded) {
      throw new Error('Instagram cookies.json missing or invalid. Please upload a valid cookies.json.');
    }
    // Scrape the specific reel/post
    const reelsUrl = `https://www.instagram.com/${username}/reels/`;
    const postData = await scraper.scrapeSpecificReelFromReelsTab(reelsUrl, post_link);
    await scraper.cleanup();
    if (!postData) {
      return {
        username,
        platform: 'Instagram',
        fetched: 'No',
        url: post_link,
        caption: 'nan',
        likesCount: 0,
        commentsCount: 0,
        viewCount: 0,
        timestamp: 'nan'
      };
    }
    return {
      username,
      platform: 'Instagram',
      fetched: 'Yes',
      ...postData
    };
  } catch (e) {
    if (scraper && scraper.cleanup) await scraper.cleanup();
    return {
      username,
      platform: 'Instagram',
      fetched: 'No',
      url: post_link,
      caption: 'nan',
      likesCount: 0,
      commentsCount: 0,
      viewCount: 0,
      timestamp: 'nan',
      error: e.message
    };
  }
}

app.post('/scrape', async (req, res) => {
  const { username, post_link } = req.body;
  if (!username || !post_link) {
    return res.status(400).json({ error: 'username and post_link are required' });
  }
  console.log(`[API] Received scrape request for username: ${username}, post_link: ${post_link}`);
  const result = await scrapeInstagram(username, post_link);
  res.json(result);
});

app.get('/', (req, res) => {
  res.send('Instagram Scraper API is running. POST to /scrape with { username, post_link }');
});

app.listen(PORT, () => {
  console.log(`🚀 API server listening on port ${PORT}`);
}); 