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
async function scrapeInstagramBulk(usernames, post_links, maxRetries) {
  const InstagramScraper = scraperModule.InstagramScraper || scraperModule.default || scraperModule;
  const results = [];
  
  console.log(`🎯 Starting bulk scrape for ${usernames.length} items with ${maxRetries} retries...`);
  
  // Process each username and post_link pair with fresh browser session
  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i];
    const post_link = post_links[i];
    
    console.log(`\n[${i + 1}/${usernames.length}] Processing: ${username} for post: ${post_link}`);
    
    // Retry logic for each request
    let success = false;
    let lastError = null;
    
    for (let retryAttempt = 0; retryAttempt <= maxRetries && !success; retryAttempt++) {
      let scraper = null;
      
      if (retryAttempt > 0) {
        console.log(`🔄 Retry attempt ${retryAttempt}/${maxRetries} for ${username}`);
        // Add longer delay between retries
        const retryDelay = 5 + (retryAttempt * 2); // 5s, 7s, 9s, etc.
        console.log(`⏳ Waiting ${retryDelay} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * 1000));
      }
      
      try {
        // Create fresh scraper instance for each request
        scraper = new InstagramScraper();
        console.log("🔄 Setting up fresh browser session...");
        await scraper.setupBrowser();
        
        // Try to login using cookies.json
        let cookiesLoaded = false;
        const cookiesPath = path.join(__dirname, 'cookies.json');
        
        if (fs.existsSync(cookiesPath)) {
          console.log("🍪 Found cookies.json, attempting to load...");
          try {
            await scraper.driver.get('https://www.instagram.com/');
            await scraper.driver.sleep(3000);
            
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
            await scraper.driver.sleep(3000);
            
            cookiesLoaded = await scraper.checkLoginStatus();
            
            if (cookiesLoaded) {
              console.log('✅ Successfully logged in using cookies!');
              await scraper.dismissSaveLoginInfoPopup();
              await scraper.dismissAutomatedBehaviorPopup();
            } else {
              throw new Error('Instagram cookies.json is invalid or expired.');
            }
          } catch (e) {
            console.error(`❌ Error loading cookies: ${e.message}`);
            throw new Error(`Failed to load cookies: ${e.message}`);
          }
        } else {
          throw new Error('Instagram cookies.json not found.');
        }
        
        // Scrape the specific reel/post
        const reelsUrl = `https://www.instagram.com/${username}/reels/`;
        const postData = await scraper.scrapeSpecificReelFromReelsTab(reelsUrl, post_link);
        
        if (!postData) {
          throw new Error('No data found for the specified reel');
        }
        
        results.push({
          username,
          platform: 'Instagram',
          fetched: 'Yes',
          ...postData
        });
        
        console.log(`✅ Successfully processed ${username}${retryAttempt > 0 ? ` (after ${retryAttempt} retries)` : ''}`);
        success = true;
        
      } catch (e) {
        lastError = e.message;
        console.error(`❌ Error processing ${username}${retryAttempt > 0 ? ` (attempt ${retryAttempt + 1})` : ''}: ${e.message}`);
        
        if (retryAttempt === maxRetries) {
          // Final failure - add error result
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
            error: e.message,
            retries: retryAttempt
          });
          console.log(`❌ Failed to process ${username} after ${maxRetries} retries`);
        }
      } finally {
        // Clean up browser after each request
        if (scraper && scraper.cleanup) {
          try {
            await scraper.cleanup();
            console.log(`🧹 Browser cleanup complete for ${username}`);
          } catch (e) {
            console.log(`⚠️ Error during cleanup for ${username}: ${e.message}`);
          }
        }
      }
    }
    
    // Add delay between requests (except for last request)
    if (i < usernames.length - 1) {
      const delay = 3;
      console.log(`⏳ Waiting ${delay} seconds before next request...`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }
  }
  
  console.log(`\n✅ Bulk scraping complete! Processed ${results.length} items`);
  return results;
}

app.post('/scrape', async (req, res) => {
  const { usernames, post_links, retry = 3 } = req.body;
  
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
  
  // Validate retry parameter
  const maxRetries = parseInt(retry);
  if (isNaN(maxRetries) || maxRetries < 0 || maxRetries > 10) {
    return res.status(400).json({ error: 'retry must be a number between 0 and 10' });
  }
  
  console.log(`[API] Received bulk scrape request for ${usernames.length} items with ${maxRetries} retries`);
  const results = await scrapeInstagramBulk(usernames, post_links, maxRetries);
  res.json(results);
});

app.get('/', (req, res) => {
  res.send(`
    Instagram Scraper API is running.
    
    <h3>Bulk Request Format:</h3>
    POST to /scrape with { 
      "usernames": ["user1", "user2", "user3"], 
      "post_links": ["link1", "link2", "link3"],
      "retry": 3
    }
    
    <h3>Parameters:</h3>
    <ul>
      <li><strong>usernames</strong> (required): Array of Instagram usernames</li>
      <li><strong>post_links</strong> (required): Array of Instagram reel/post URLs</li>
      <li><strong>retry</strong> (optional): Number of retry attempts for failed requests (0-10, default: 3)</li>
    </ul>
    
    <h3>Single Request:</h3>
    Use arrays with one item: { 
      "usernames": ["user1"], 
      "post_links": ["link1"],
      "retry": 5
    }
    
    <h3>Response Format:</h3>
    <p>Returns an array of objects with scraped data. Failed requests include error details and retry count.</p>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 API server listening on port ${PORT}`);
}); 
