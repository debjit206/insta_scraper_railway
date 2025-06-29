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

// Helper to create a new scraper instance and run bulk scrape
async function scrapeInstagramBulk(usernames, post_links) {
  const InstagramScraper = scraperModule.InstagramScraper || scraperModule.default || scraperModule;
  const scraper = new InstagramScraper();
  const results = [];
  
  try {
    console.log("🔄 Setting up browser for bulk processing...");
    await scraper.setupBrowser();
    
    // Try to login using cookies.json (no manual login in API mode)
    let cookiesLoaded = false;
    const cookiesPath = path.join(__dirname, 'cookies.json');
    
    if (fs.existsSync(cookiesPath)) {
      console.log("🍪 Found cookies.json, attempting to load...");
      try {
        await scraper.driver.get('https://www.instagram.com/');
        await scraper.driver.sleep(3000); // Give more time for initial load
        
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
        console.log(`📦 Loading ${cookies.length} cookies...`);
        
        for (const cookie of cookies) {
          const { sameSite, ...rest } = cookie;
          try {
            await scraper.driver.manage().addCookie(rest);
          } catch (e) {
            console.log(`⚠️ Could not set cookie ${cookie.name}: ${e.message}`);
          }
        }
        
        console.log("🔄 Refreshing page after loading cookies...");
        await scraper.driver.navigate().refresh();
        await scraper.driver.sleep(3000); // Give more time for refresh
        
        // Use the improved login detection
        cookiesLoaded = await scraper.checkLoginStatus();
        
        if (cookiesLoaded) {
          console.log('✅ Successfully logged in using cookies!');
          // Dismiss any popups that might appear
          await scraper.dismissSaveLoginInfoPopup();
          await scraper.dismissAutomatedBehaviorPopup();
        } else {
          console.log('⚠️ Cookies appear to be invalid or expired.');
          throw new Error('Instagram cookies.json is invalid or expired. Please generate new cookies using generate_cookies.js');
        }
      } catch (e) {
        console.error(`❌ Error loading cookies: ${e.message}`);
        throw new Error(`Failed to load cookies: ${e.message}`);
      }
    } else {
      console.log("📝 No cookies.json found");
      throw new Error('Instagram cookies.json not found. Please generate cookies using generate_cookies.js');
    }
    
    // Process each username and post_link pair
    console.log(`🎯 Starting bulk scrape for ${usernames.length} items...`);
    
    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];
      const post_link = post_links[i];
      
      console.log(`\n[${i + 1}/${usernames.length}] Processing: ${username} for post: ${post_link}`);
      
      try {
        // Scrape the specific reel/post
        const reelsUrl = `https://www.instagram.com/${username}/reels/`;
        const postData = await scraper.scrapeSpecificReelFromReelsTab(reelsUrl, post_link);
        
        if (!postData) {
          results.push({
            username,
            platform: 'Instagram',
            fetched: 'No',
            url: post_link,
            caption: 'nan',
            likesCount: 0,
            commentsCount: 0,
            viewCount: 0,
            timestamp: 'nan'
          });
        } else {
          results.push({
            username,
            platform: 'Instagram',
            fetched: 'Yes',
            ...postData
          });
        }
        
        console.log(`✅ Successfully processed ${username}`);
        
        // Add delay between requests to avoid rate limiting (except for last request)
        if (i < usernames.length - 1) {
          const delay = 5; // 5 seconds delay
          console.log(`⏳ Waiting ${delay} seconds before next request...`);
          await scraper.driver.sleep(delay * 1000);
        }
        
      } catch (e) {
        console.error(`❌ Error processing ${username}: ${e.message}`);
        results.push({
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
        });
      }
    }
    
    console.log(`\n✅ Bulk scraping complete! Processed ${results.length} items`);
    return results;
    
  } catch (e) {
    console.error(`❌ Error in scrapeInstagramBulk: ${e.message}`);
    // Return error results for all items
    for (let i = 0; i < usernames.length; i++) {
      results.push({
        username: usernames[i],
        platform: 'Instagram',
        fetched: 'No',
        url: post_links[i],
        caption: 'nan',
        likesCount: 0,
        commentsCount: 0,
        viewCount: 0,
        timestamp: 'nan',
        error: e.message
      });
    }
    return results;
  } finally {
    // Clean up browser after all requests
    if (scraper && scraper.cleanup) {
      await scraper.cleanup();
      console.log("🧹 Browser cleanup complete");
    }
  }
}

app.post('/scrape', async (req, res) => {
  const { usernames, post_links } = req.body;
  
  // Validate bulk request format
  if (!usernames || !post_links) {
    return res.status(400).json({ error: 'usernames and post_links arrays are required' });
  }
  
  if (!Array.isArray(usernames) || !Array.isArray(post_links)) {
    return res.status(400).json({ error: 'usernames and post_links must be arrays' });
  }
  
  if (usernames.length === 0 || post_links.length === 0) {
    return res.status(400).json({ error: 'usernames and post_links arrays cannot be empty' });
  }
  
  if (usernames.length !== post_links.length) {
    return res.status(400).json({ error: 'usernames and post_links arrays must have the same length' });
  }
  
  console.log(`[API] Received bulk scrape request for ${usernames.length} items`);
  const results = await scrapeInstagramBulk(usernames, post_links);
  res.json(results);
});

app.get('/', (req, res) => {
  res.send(`
    Instagram Scraper API is running.
    
    <h3>Bulk Request Format:</h3>
    POST to /scrape with { 
      "usernames": ["user1", "user2", "user3"], 
      "post_links": ["link1", "link2", "link3"] 
    }
    
    <h3>Single Request:</h3>
    Use arrays with one item: { 
      "usernames": ["user1"], 
      "post_links": ["link1"] 
    }
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 API server listening on port ${PORT}`);
}); 
