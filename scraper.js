// Node.js Instagram Scraper using Selenium
const { Builder, By, until } = require('selenium-webdriver');
require('chromedriver'); // Ensure chromedriver is installed and available
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon'); // For datetime handling
const readline = require('readline');
dotenv.config();

class InstagramScraper {
  constructor() {
    // Selenium WebDriver initialization
    this.driver = null;
    this.scrapedData = [];
    this.POST_SELECTORS = [
      'a[href*="/reel/"]',  // Direct reel links
      'div[role="tablist"] a[href*="/reel/"]',  // Reels in tablist
      'div[data-media-type="Reels"] a',  // Reels container
      'div[role="tabpanel"] a[href*="/reel/"]'  // Reels in tab panel
    ];
    // JavaScript to expand truncated content
    this.EXPAND_CONTENT_JS = `
        (async () => {
            // Find and click any "more" buttons in captions
            const moreButtonSelectors = [
                'div._a9zs button',
                'button._aacl._aaco._aacu',
                'button[role="button"]'
            ];
            for (const selector of moreButtonSelectors) {
                const buttons = document.querySelectorAll(selector);
                for (const button of buttons) {
                    const text = button.textContent || '';
                    if (text.includes('more') || text.includes('...')) {
                        console.log('Found more button:', text);
                        button.click();
                        // Wait longer after clicking to ensure expansion completes
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }
            // Wait for possible dynamic content loading
            await new Promise(r => setTimeout(r, 1500));
        })();
    `;
    this.MODAL_SELECTORS = {
      'grid_views': [
        'span[class*="videoViews"]',
        'span[class*="view-count"]',
        'span._ac2a',
        'span._aacl._aaco',
        'span:has(svg[aria-label*="view"])',
        'span:has(svg[aria-label="Play"]) + span'
      ],
      'views': [
        'span[class*="view-count"]',
        'span:has-text("views")',
        'span[role="button"]:has-text("views")',
        'section span:has-text("views")',
        'div[role="button"] span:has-text("views")'
      ],
      'likes': [
        'section span[role="button"]',
        'a[role="link"] span[role="button"]',
        'span[role="button"]',
        'div[role="button"] span',
        'section div span span:not([role])',
        'a[href*="/liked_by/"] span',
        'section > div > div > span',
        'div[role="presentation"] > div > div > span',
        'article div > span > span',
        'span[aria-label*="like"], span[aria-label*="view"]',
        'div > span > span:not([role])',
        'section div[role="button"]',
        'div[role="button"] div[dir="auto"]',
        'section span[aria-label*="like"], section span[aria-label*="view"]',
        'article > section span:not([role])'
      ],
      'caption': [
        'h1._aagv span[dir="auto"]',
        'h1[dir="auto"]',
        'div._a9zs span[dir="auto"]',
        'div._a9zs h1',
        'div[role="menuitem"] span',
        'article div._a9zs',
        'div.C4VMK > span'
      ],
      'more_button': [
        'div._a9zs button',
        'button._aacl._aaco._aacu',
        'button[role="button"]'
      ],
      'comments': [
        'span._aacl._aaco._aacw._aacz._aada',
        'section span[aria-label*="comment"]',
        'a[href*="/comments/"] span'
      ],
      'date': [
        'time._aaqe[datetime]',
        'time[datetime]'
      ]
    };
    this.userDataDir = './user_data';
  }

  async setupBrowser() {
    // Initialize Selenium WebDriver with Chrome and mobile emulation
    const chrome = require('selenium-webdriver/chrome');
    const options = new chrome.Options();
    // Mobile emulation
    options.addArguments(
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--window-size=390,844',
      '--disable-logging',
      '--log-level=3',
      '--silent',
      '--headless' // Always headless now
    );
    // Set user agent for mobile
    options.addArguments(
      `--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1`
    );
    // Suppress chromedriver logs
    const service = new chrome.ServiceBuilder()
      .loggingTo(process.platform === 'win32' ? 'NUL' : '/dev/null')
      .enableVerboseLogging(false);
    this.driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .setChromeService(service)
      .build();
    console.log("✅ Browser setup complete");
  }

  async loginInstagram() {
    try {
      console.log("🔄 Checking Instagram login status...");
      await this.setupBrowser();
      await this.driver.get('https://www.instagram.com/');
      await this.driver.sleep(3000); // Give more time for initial load

      // Try to load cookies if cookies.json exists
      let cookiesLoaded = false;
      if (fs.existsSync('cookies.json')) {
        console.log("🍪 Found cookies.json, attempting to load...");
        try {
          const cookies = JSON.parse(fs.readFileSync('cookies.json', 'utf8'));
          console.log(`📦 Loading ${cookies.length} cookies...`);
          
          for (const cookie of cookies) {
            // Remove 'sameSite' if it causes issues
            const { sameSite, ...rest } = cookie;
            try {
              await this.driver.manage().addCookie(rest);
            } catch (e) {
              console.log(`⚠️ Could not set cookie ${cookie.name}: ${e.message}`);
            }
          }
          
          console.log("🔄 Refreshing page after loading cookies...");
          await this.driver.navigate().refresh();
          await this.driver.sleep(3000); // Give more time for refresh
          
          // Check if cookies worked
          const loggedIn = await this.checkLoginStatus();
          if (loggedIn) {
            console.log('✅ Successfully logged in using cookies!');
            // Dismiss any popups that might appear
            await this.dismissSaveLoginInfoPopup();
            await this.dismissAutomatedBehaviorPopup();
            return true;
          } else {
            console.log('⚠️ Cookies appear to be invalid or expired.');
            console.log('🔄 Will proceed with manual login...');
          }
        } catch (e) {
          console.error(`❌ Error loading cookies: ${e.message}`);
          console.log('🔄 Will proceed with manual login...');
        }
      } else {
        console.log("📝 No cookies.json found, will need manual login");
      }

      // Wait for manual login and user confirmation
      while (true) {
        console.log("📱 Please log in manually in the browser window.");
        const answer = await new Promise(resolve => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          rl.question("Are you logged in to Instagram? (yes/no): ", ans => {
            rl.close();
            resolve(ans.trim().toLowerCase());
          });
        });
        if (answer === 'yes' || answer === 'y') {
          // Verify login status
          const isLoggedIn = await this.checkLoginStatus();
          if (!isLoggedIn) {
            console.log("⚠️ Login detection failed. Please try logging in again or check the screenshot.");
            continue;
          }
          
          // Dismiss any popups that might appear after login
          await this.dismissSaveLoginInfoPopup();
          await this.dismissAutomatedBehaviorPopup();
          
          // Save cookies
          console.log("💾 Saving cookies...");
          const cookies = await this.driver.manage().getCookies();
          fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));
          console.log(`✅ Saved ${cookies.length} cookies to cookies.json`);
          console.log("✅ Proceeding with scraping...");
          return true;
        } else {
          console.log("⏳ Waiting 30 seconds for you to log in...");
          await this.driver.sleep(30000);
        }
      }
    } catch (e) {
      console.error(`❌ Error during login process: ${e.message}`);
      return false;
    }
  }

  async checkLoginStatus() {
    // Check if we're logged into Instagram by looking for multiple indicators
    try {
      await this.driver.sleep(3000); // Give more time for page to load
      
      // First, check if we're redirected to login page
      const currentUrl = await this.driver.getCurrentUrl();
      if (currentUrl.includes('/accounts/login') || currentUrl.includes('/login')) {
        console.log("⚠️ Redirected to login page - not logged in");
        return false;
      }

      // Check for login-required elements
      let loginElements = [];
      try {
        loginElements = await this.driver.findElements(By.css('form[action*="login"]'));
      } catch (e) {
        // ignore
      }
      if (loginElements.length > 0) {
        console.log("⚠️ Login form detected - not logged in");
        return false;
      }

      // More comprehensive logged-in indicators
      const loggedInIndicators = [
        // Navigation elements
        'nav a[href="/"]', // Home link in nav
        'nav a[href="/explore/"]', // Explore link
        'nav a[href="/reels/"]', // Reels link
        'nav a[href="/direct/inbox/"]', // Messages link
        'nav a[href="/accounts/activity/"]', // Activity link
        
        // User-specific elements
        'img[data-testid="user-avatar"]', // User avatar
        'a[href*="/accounts/activity/"]', // Activity link
        'button[aria-label*="Profile"]', // Profile button
        
        // Content elements that only appear when logged in
        'a[href*="/p/"]', // Post links
        'button[aria-label*="Like"]', // Like buttons
        'button[aria-label*="Comment"]', // Comment buttons
        
        // Search elements
        'input[placeholder*="Search"]', // Search input
        'a[href="/explore/"]', // Explore link
        
        // More general indicators
        'svg[aria-label="Home"]', // Home icon
        'svg[aria-label="Search"]', // Search icon
        'svg[aria-label="New post"]', // New post icon
        'svg[aria-label="Activity Feed"]', // Activity icon
        'svg[aria-label="Direct messaging"]' // Messages icon
      ];

      console.log("🔍 Checking for logged-in indicators...");
      
      for (const selector of loggedInIndicators) {
        try {
          const elements = await this.driver.findElements(By.css(selector));
          if (elements.length > 0) {
            console.log(`✅ Found logged-in indicator: ${selector}`);
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      // Additional check - look for any navigation menu
      try {
        const navElements = await this.driver.findElements(By.css('nav, [role="navigation"]'));
        if (navElements.length > 0) {
          console.log("✅ Found navigation menu - likely logged in");
          return true;
        }
      } catch (e) {
        // ignore
      }

      // Check if we can access user-specific content
      try {
        const userSpecificElements = await this.driver.findElements(By.css('[data-testid*="user"], [aria-label*="user"]'));
        if (userSpecificElements.length > 0) {
          console.log("✅ Found user-specific elements - likely logged in");
          return true;
        }
      } catch (e) {
        // ignore
      }

      console.log("⚠️ No logged-in indicators found");
      
      // Take a screenshot for debugging
      try {
        await this.driver.takeScreenshot().then(data => {
          fs.writeFileSync('login_debug.png', data, 'base64');
          console.log("📸 Screenshot saved as login_debug.png for debugging");
        });
      } catch (e) {
        console.log("⚠️ Could not take screenshot for debugging");
      }
      
      return false;
    } catch (e) {
      console.error(`❌ Error checking login status: ${e.message}`);
      return false;
    }
  }

  async scrapeProfile(profileUrl, targetPostLink = null) {
    // Scrape individual Instagram profile
    try {
      console.log(`🔄 Scraping: ${profileUrl}`);
      await this.driver.get(profileUrl);
      await this.driver.sleep(3000);
      // data structure
      const profileData = {
        username: '',
        platform: 'Instagram',
        posts: [],
        fetched: 'No'
      };
      // username from URL
      const usernameMatch = profileUrl.match(/instagram\.com\/([^/?]+)/);
      if (usernameMatch) {
        profileData.username = usernameMatch[1];
      }
      // Remove all code that scrapes Name, Description, Followers, Avatar URL, and Total Posts
      // ... existing code ...
      return profileData;
    } catch (e) {
      console.log(`❌ Error scraping ${profileUrl}: ${e.message}`);
      return null;
    }
  }

  async extractSpecificPostData(profileData, targetPostLink) {
    // Extract data from a specific post/reel URL in the profile
    const posts = [];
    try {
      // reels tab
      console.log("🎬 Switching to reels tab...");
      try {
        const reelsTabs = await this.driver.findElements(By.css('a[href*="/reels/"]'));
        if (reelsTabs.length > 0) {
          await this.driver.executeScript("arguments[0].scrollIntoView({block: 'center'});", reelsTabs[0]);
          await this.driver.sleep(500);
          try {
            await reelsTabs[0].click();
          } catch (e) {
            console.log('⚠️ Click intercepted, retrying after 1s...');
            await this.driver.sleep(1000);
            await reelsTabs[0].click();
          }
          await this.driver.sleep(3000);
          console.log("✅ Switched to reels tab");
        } else {
          console.log("⚠️ Could not find reels tab");
          return profileData;
        }
        // reels to be visible
        console.log("🔍 Looking for reels...");
        await this.driver.wait(until.elementLocated(By.css('a[href*="/reel/"]')), 5000);
      } catch (e) {
        console.log(`⚠️ Error switching to reels tab: ${e.message}`);
      }
      // reel ID from targetPostLink
      let targetReelId = null;
      if (targetPostLink) {
        // reel ID from various URL formats (now supports /reel/ and /p/)
        const reelPatterns = [
          /\/reel\/([^/?]+)/,
          /reel\/([^/?]+)/,
          /instagram\\.com\/reel\/([^/?]+)/,
          /\/p\/([^/?]+)/,
          /p\/([^/?]+)/,
          /instagram\\.com\/p\/([^/?]+)/
        ];
        for (const pattern of reelPatterns) {
          const match = targetPostLink.match(pattern);
          if (match) {
            targetReelId = match[1];
            console.log(`🎯 Looking for reel/post ID: ${targetReelId}`);
            break;
          }
        }
      }
      if (!targetReelId) {
        console.log("❌ Could not extract reel/post ID from targetPostLink");
        return profileData;
      }
      // all reel elements
      let postElements = [];
      for (const selector of this.POST_SELECTORS) {
        try {
          const elements = await this.driver.findElements(By.css(selector));
          if (elements && elements.length > 0) {
            postElements = postElements.concat(elements);
            console.log(`✅ Found ${elements.length} post elements using selector: ${selector}`);
          }
        } catch (e) {
          console.log(`⚠️ Error trying selector '${selector}': ${e.message}`);
          continue;
        }
      }
      if (!postElements.length) {
        console.log("⚠️ No post elements found using any selector");
        return profileData;
      }
      // Find the element matching the target reel ID, with scrolling if not found
      let targetElement = null;
      const maxScrolls = 3;
      for (let scrollAttempt = 0; scrollAttempt < maxScrolls && !targetElement; scrollAttempt++) {
        for (const postElement of postElements) {
          try {
            const href = await postElement.getAttribute('href');
            if (href && href.includes(targetReelId)) {
              targetElement = postElement;
              break;
            }
          } catch (e) {
            continue;
          }
        }
        if (!targetElement && scrollAttempt < maxScrolls - 1) {
          // Scroll down and wait for more reels to load
          await this.driver.executeScript('window.scrollBy(0, 1000);');
          await this.driver.sleep(2000);
          // Re-fetch post elements after scroll
          postElements = [];
          for (const selector of this.POST_SELECTORS) {
            try {
              const elements = await this.driver.findElements(By.css(selector));
              if (elements && elements.length > 0) {
                postElements = postElements.concat(elements);
              }
            } catch (e) {
              continue;
            }
          }
        }
      }
      if (!targetElement) {
        console.log(`❌ Target reel ${targetReelId} not found in reels tab after scrolling`);
        return profileData;
      }
      // Scrape the reel data (extract view count from grid, then open in new tab for rest)
      const postData = {
        url: '',
        caption: '',
        likesCount: 0,
        commentsCount: 0,
        viewCount: 0,
        timestamp: '',
      };
      try {
        // 1. Extract view count from grid element BEFORE opening the post
        postData.viewCount = await this.extractGridViewCount(targetElement);
        // 2. Now open the post in new tab and extract the rest
        const postUrl = await targetElement.getAttribute('href');
        if (!postUrl) return null;
        postData.url = postUrl.startsWith('http') ? postUrl : `https://www.instagram.com${postUrl}`;
        await this.driver.executeScript('window.open(arguments[0], "_blank");', postData.url);
        const handles = await this.driver.getAllWindowHandles();
        const newTab = handles[handles.length - 1];
        await this.driver.switchTo().window(newTab);
        await this.driver.sleep(2000);
        await this.driver.executeScript(this.EXPAND_CONTENT_JS);
        await this.driver.sleep(2000);
        // Caption
        let captionFound = false;
        let retryCount = 0;
        while (!captionFound && retryCount < 3) {
          for (const selector of this.MODAL_SELECTORS.caption) {
            try {
              const captionElements = await this.driver.findElements(By.css(selector));
              for (const captionElement of captionElements) {
                const captionText = await captionElement.getText();
                if (captionText) {
                  let cleanCaption = captionText;
                  if (captionText.includes(':') && !captionText.startsWith('http')) {
                    cleanCaption = captionText.split(':').slice(1).join(':').trim();
                  }
                  cleanCaption = cleanCaption.replace('... more', '').trim();
                  postData.caption = cleanCaption;
                  captionFound = true;
                  break;
                }
              }
              if (captionFound) break;
            } catch (e) {
              continue;
            }
          }
          if (!captionFound) {
            retryCount++;
            await this.driver.sleep(1000);
          }
        }
        // timestamp
        for (const selector of this.MODAL_SELECTORS.date) {
          try {
            const dateElements = await this.driver.findElements(By.css(selector));
            for (const dateElement of dateElements) {
              const timestamp = await dateElement.getAttribute('datetime');
              if (timestamp) {
                postData.timestamp = timestamp;
                break;
              }
            }
            if (postData.timestamp) break;
          } catch (e) {
            continue;
          }
        }
        // likes count
        postData.likesCount = await this.extractLikesCount(this.driver);
        // comments count
        let commentsFound = false;
        retryCount = 0;
        while (!commentsFound && retryCount < 3) {
          for (const selector of this.MODAL_SELECTORS.comments) {
            try {
              const commentsElements = await this.driver.findElements(By.css(selector));
              for (const commentsElement of commentsElements) {
                const commentsText = await commentsElement.getText();
                if (commentsText) {
                  postData.commentsCount = this.parseCount(commentsText);
                  commentsFound = true;
                  break;
                }
              }
              if (commentsFound) break;
            } catch (e) {
              continue;
            }
          }
          if (!commentsFound) {
            retryCount++;
            await this.driver.sleep(1000);
          }
        }
        // close the new tab
        try {
          await this.driver.close();
          const handles = await this.driver.getAllWindowHandles();
          await this.driver.switchTo().window(handles[0]);
          await this.driver.sleep(1000);
        } catch (e) {
          console.log(`⚠️ Error closing tab: ${e.message}`);
        }
      } catch (e) {
        console.log(`⚠️ Error processing target reel: ${e.message}`);
        return null;
      }
      posts.push(postData);
      // update profile data
      profileData.posts = posts;
    } catch (e) {
      console.log(`❌ Error in specific post extraction: ${e.message}`);
    }
    return profileData;
  }

  async extractPostData(profileData) {
    // Extract data from top 5 posts of a profile
    const posts = [];
    try {
      console.log("🎬 Switching to reels tab...");
      try {
        const reelsTabs = await this.driver.findElements(By.css('a[href*="/reels/"]'));
        if (reelsTabs.length > 0) {
          await this.driver.executeScript("arguments[0].scrollIntoView({block: 'center'});", reelsTabs[0]);
          await this.driver.sleep(500);
          try {
            await reelsTabs[0].click();
          } catch (e) {
            console.log('⚠️ Click intercepted, retrying after 1s...');
            await this.driver.sleep(1000);
            await reelsTabs[0].click();
          }
          await this.driver.sleep(3000);
          console.log("✅ Switched to reels tab");
        } else {
          console.log("⚠️ Could not find reels tab");
          return profileData;
        }
        console.log("🔍 Looking for reels...");
        await this.driver.wait(until.elementLocated(By.css('a[href*="/reel/"]')), 5000);
      } catch (e) {
        console.log(`⚠️ Error switching to reels tab: ${e.message}`);
      }
      // Get page content for debugging
      const pageContent = await this.driver.getPageSource();
      let postElements = [];
      for (const selector of this.POST_SELECTORS) {
        try {
          const elements = await this.driver.findElements(By.css(selector));
          if (elements && elements.length > 0) {
            console.log(`✅ Found ${elements.length} post elements using selector: ${selector}`);
            // Debug first post element
            const firstPost = elements[0];
            const href = await firstPost.getAttribute('href');
            console.log(`🔗 First post href: ${href}`);
            postElements = elements;
            break;
          } else {
            console.log(`⚠️ No posts found with selector: ${selector}`);
          }
        } catch (e) {
          console.log(`⚠️ Error trying selector '${selector}': ${e.message}`);
          continue;
        }
      }
      // Check if we found any posts
      if (!postElements || postElements.length === 0) {
        console.log("⚠️ No post elements found using any selector");
        return profileData;
      }
      // Enhanced grid-based sorting
      console.log("📊 Analyzing post grid layout...");
      const gridPosts = [];
      for (const postElement of postElements) {
        try {
          // Selenium does not have boundingBox, so skip grid sorting or use order as-is
          const href = await postElement.getAttribute('href');
          if (href && (href.includes('/p/') || href.includes('/reel/'))) {
            gridPosts.push({
              element: postElement,
              href: href
            });
          }
        } catch (e) {
          console.log(`⚠️ Error processing grid item: ${e.message}`);
          continue;
        }
      }
      // Use order as-is (Selenium cannot get x/y positions easily)
      const sortedElements = gridPosts.map(post => post.element);
      // Change number of posts to scrape here
      for (let i = 0; i < Math.min(sortedElements.length, 3); i++) {
        const postElement = sortedElements[i];
        const postData = {
          type: "reel",
          caption: "",
          ownerFullName: profileData.name || '',
          ownerUsername: profileData.username || '',
          url: "",
          commentsCount: 0,
          likesCount: 0,
          viewCount: 0,
          timestamp: "",
          sharesCount: ""
        };
        try {
          console.log("🔍 Extracting view count from grid...");
          const gridViews = await this.extractGridViewCount(postElement);
          if (gridViews > 0) {
            postData.viewCount = gridViews;
            console.log(`✅ Found grid view count: ${gridViews}`);
          } else {
            console.log("⚠️ No view count found in grid");
          }
          // post URL
          const postUrl = await postElement.getAttribute('href');
          if (!postUrl) {
            console.log("⚠️ Could not extract post URL");
            continue;
          }
          if (postUrl.startsWith('http')) {
            postData.url = postUrl;
          } else {
            postData.url = `https://www.instagram.com${postUrl}`;
          }
          console.log(`🔗 Processing post ${i + 1}/3: ${postData.url}`);
          // Open post in new tab
          await this.driver.executeScript('window.open(arguments[0], "_blank");', postData.url);
          const handles = await this.driver.getAllWindowHandles();
          const newTab = handles[handles.length - 1];
          await this.driver.switchTo().window(newTab);
          await this.driver.sleep(2000);
          // Expand truncated content
          await this.driver.executeScript(this.EXPAND_CONTENT_JS);
          await this.driver.sleep(2000);
          // Extract caption with retries
          let captionFound = false;
          let retryCount = 0;
          while (!captionFound && retryCount < 3) {
            for (const selector of this.MODAL_SELECTORS.caption) {
              try {
                const captionElements = await this.driver.findElements(By.css(selector));
                for (const captionElement of captionElements) {
                  const captionText = await captionElement.getText();
                  if (captionText) {
                    // Clean up caption
                    let cleanCaption = captionText;
                    if (captionText.includes(':') && !captionText.startsWith('http')) {
                      cleanCaption = captionText.split(':').slice(1).join(':').trim();
                    }
                    cleanCaption = cleanCaption.replace('... more', '').trim();
                    postData.caption = cleanCaption;
                    console.log(`📝 Found caption: ${cleanCaption.substring(0, 100)}...`);
                    captionFound = true;
                    break;
                  }
                }
                if (captionFound) break;
              } catch (e) {
                continue;
              }
            }
            if (!captionFound) {
              retryCount++;
              await this.driver.sleep(1000);
            }
          }
          // timestamp
          for (const selector of this.MODAL_SELECTORS.date) {
            try {
              const dateElements = await this.driver.findElements(By.css(selector));
              for (const dateElement of dateElements) {
                const timestamp = await dateElement.getAttribute('datetime');
                if (timestamp) {
                  postData.timestamp = timestamp;
                  console.log(`📅 Found timestamp: ${timestamp}`);
                  break;
                }
              }
              if (postData.timestamp) break;
            } catch (e) {
              continue;
            }
          }
          // likes count
          postData.likesCount = await this.extractLikesCount(this.driver);
          // comments count
          retryCount = 0;
          while (postData.commentsCount === 0 && retryCount < 3) {
            for (const selector of this.MODAL_SELECTORS.comments) {
              try {
                const commentsElements = await this.driver.findElements(By.css(selector));
                for (const commentsElement of commentsElements) {
                  const commentsText = await commentsElement.getText();
                  if (commentsText) {
                    if (commentsText.toLowerCase().includes('view all')) {
                      const match = commentsText.toLowerCase().match(/view all (\d+)/);
                      if (match) {
                        postData.commentsCount = this.parseCount(commentsText);
                      }
                    } else {
                      postData.commentsCount = this.parseCount(commentsText);
                    }
                    if (postData.commentsCount > 0) {
                      console.log(`💬 Found ${postData.commentsCount} comments`);
                      break;
                    }
                  }
                }
                if (postData.commentsCount > 0) break;
              } catch (e) {
                continue;
              }
            }
            if (postData.commentsCount === 0) {
              retryCount++;
              await this.driver.sleep(1000);
            }
          }
          posts.push(postData);
          console.log(`✅ Successfully extracted post ${i + 1}/3`);
          // close the new tab
          try {
            await this.driver.close();
            const handles = await this.driver.getAllWindowHandles();
            await this.driver.switchTo().window(handles[0]);
            await this.driver.sleep(1000);
          } catch (e) {
            console.log(`⚠️ Error closing tab: ${e.message}`);
          }
        } catch (e) {
          console.log(`⚠️ Error processing post: ${e.message}`);
          continue;
        }
      }
      // update profile data
      profileData.posts = posts;
      console.log(`✅ Successfully extracted ${posts.length} posts`);
    } catch (e) {
      console.log(`❌ Error in post extraction: ${e.message}`);
    }
    return profileData;
  }

  async scrapeFromSheet() {
    // profile URLs and post links from Google Sheet and scrape them
    try {
      // Dismiss the 'Save your login info?' popup if present
      await this.dismissSaveLoginInfoPopup();
      // Dismiss the 'automated behavior' popup if present
      await this.dismissAutomatedBehaviorPopup();
      // Get all records
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.sheetId,
        range: this.sheetName,
      });
      const rows = res.data.values;
      if (!rows || rows.length < 2) {
        console.log('❌ No data found in sheet');
        return;
      }
      const headers = rows[0];
      const data = rows.slice(1);
      let usernameColIdx = headers.indexOf('username');
      let postLinkColIdx = headers.indexOf('post_link');
      if (usernameColIdx === -1 || postLinkColIdx === -1) {
        console.log('❌ Required columns "username" or "post_link" not found in sheet');
        console.log(`Available columns: ${headers}`);
        return;
      }
      const results = [];
      for (let i = 0; i < data.length; i++) {
        const username = data[i][usernameColIdx];
        const postLink = data[i][postLinkColIdx];
        if (!username || !postLink) continue;
        const reelsUrl = `https://www.instagram.com/${username}/reels/`;
        console.log(`\n[${i + 1}/${data.length}] Processing: ${reelsUrl} for post: ${postLink}`);
        const postData = await this.scrapeSpecificReelFromReelsTab(reelsUrl, postLink);
        if (postData) {
          const profileData = {
            username: username,
            platform: 'Instagram',
            fetched: 'Yes',
            ...postData // Merge postData fields into the result
          };
          results.push(profileData);
        } else {
          // Add a result with fetched: 'No' and default values
          const failUrl = `${reelsUrl}${postLink.split('/reel/')[1] ? 'reel/' + postLink.split('/reel/')[1].replace(/\/$/, '') + '/' : ''}`;
          results.push({
            username: username,
            platform: 'Instagram',
            fetched: 'No',
            url: failUrl,
            caption: 'nan',
            likesCount: 0,
            commentsCount: 0,
            viewCount: 0,
            timestamp: 'nan'
          });
        }
        if (i < data.length - 1) {
          const delay = 5;
          console.log(`⏳ Waiting ${delay} seconds before next username...`);
          await this.driver.sleep(delay * 1000);
        }
      }
      console.log(`\n✅ Scraping complete!`);
      // Print the results as JSON
      console.log('\n===== JSON OUTPUT =====');
      console.log(JSON.stringify(results, null, 2));
      console.log('=======================\n');
    } catch (e) {
      console.log(`❌ Error reading from sheet: ${e.message}`);
    }
  }

  async scrapeFromExcel(excelFilePath) {
    // Read Excel file and scrape all profiles
    try {
      // Note: For Excel reading, you'll need to install 'xlsx' package
      // npm install xlsx
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(excelFilePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      console.log(`📊 Found ${data.length} profiles to scrape`);
      const urlColumns = ['url', 'link', 'profile_url', 'instagram_url'];
      let urlColumn = null;
      for (const col of urlColumns) {
        if (data.length > 0 && col in data[0]) {
          urlColumn = col;
          break;
        }
      }
      if (!urlColumn) {
        console.log("❌ Could not find URL column in Excel file");
        console.log(`Available columns: ${Object.keys(data[0] || {})}`);
        return;
      }
      const profileUrls = data.map(row => row[urlColumn]).filter(url => url);
      console.log(`🎯 Starting to scrape ${profileUrls.length} profiles...`);
      for (let i = 0; i < profileUrls.length; i++) {
        const url = profileUrls[i];
        console.log(`\n[${i + 1}/${profileUrls.length}] Processing: ${url}`);
        const profileData = await this.scrapeProfile(url);
        if (profileData) {
          this.scrapedData.push(profileData);
        }
        // Add delay between requests to avoid rate limiting
        if (i < profileUrls.length - 1) {
          const delay = 5;  // 5 seconds delay
          console.log(`⏳ Waiting ${delay} seconds before next profile...`);
          await this.driver.sleep(delay * 1000);
        }
      }
      console.log(`\n✅ Scraping complete! Successfully scraped ${this.scrapedData.length} profiles`);
    } catch (e) {
      console.log(`❌ Error reading Excel file: ${e.message}`);
    }
  }

  saveResults() {
    // Print scraping summary
    try {
      if (!this.scrapedData || this.scrapedData.length === 0) {
        console.log("❌ No data to save");
        return;
      }
      console.log(`\n📊 Scraping Summary:`);
      console.log(`Total profiles scraped: ${this.scrapedData.length}`);
      console.log(`Profiles with followers data: ${this.scrapedData.filter(item => item.followers).length}`);
      console.log(`Profiles with fetched reels: ${this.scrapedData.filter(item => item.fetched === 'Yes').length}`);
    } catch (e) {
      console.log(`❌ Error saving results: ${e.message}`);
    }
  }

  async cleanup() {
    // Close browser but keep session data
    if (this.driver) {
      await this.driver.quit();
    }
    console.log("🧹 Cleanup complete - Session data preserved");
  }

  parseCount(text) {
    // Parse number from Instagram text that contains numbers
    if (!text) {
      return 0;
    }
    text = String(text).trim().toLowerCase();
    try {
      // numbers in the text
      const numbers = text.match(/\d+(?:,\d+)*(?:\.\d+)?/g);
      if (!numbers) {
        return 0;
      }
      // first number found and remove commas
      const numberStr = numbers[0].replace(/,/g, '');
      // where the number appears in the text
      const numberPos = text.indexOf(numberStr);
      if (numberPos === -1) {
        return parseInt(parseFloat(numberStr));
      }
      // text after the number
      const textAfterNumber = text.substring(numberPos + numberStr.length).trim();
      const baseNumber = parseFloat(numberStr);
      // K/M/B suffixes
      if (textAfterNumber.startsWith('k')) {
        return parseInt(baseNumber * 1000);
      } else if (textAfterNumber.startsWith('m')) {
        return parseInt(baseNumber * 1000000);
      } else if (textAfterNumber.startsWith('b')) {
        return parseInt(baseNumber * 1000000000);
      }
      // No suffix or suffix is something else (like "likes")
      return parseInt(baseNumber);
    } catch (e) {
      console.log(`⚠️ Error parsing count from '${text}': ${e.message}`);
      return 0;
    }
  }

  isStatsText(text) {
    // Check if text is stats-related (posts, followers, following counts)
    if (!text) {
      return false;
    }
    text = text.trim().toLowerCase();
    // stats keywords
    const statsKeywords = ['posts', 'followers', 'following', 'followed by'];
    if (statsKeywords.some(keyword => text.includes(keyword))) {
      return true;
    }
    // numbers with K, M, B suffixes
    if (/^[\d,.]+(k|m|b)?$/.test(text.replace(/\s/g, ''))) {
      return true;
    }
    return false;
  }

  async extractLikesCount(driver) {
    // likes count with proper selectors for mobile Instagram
    let likesCount = 0;
    try {
      // Wait for the section containing likes
      await driver.wait(until.elementLocated(By.css('section')), 10000);
      await driver.sleep(3000);
      // visible likes count
      const visibleLikesSelectors = [
        'section > div:nth-child(2) > div > div > span',  // Most common location
        'section > div > div > span',   // Contains "likes" text
        'section span',                // Generic likes text
        'section div > span',          // Nested likes text
      ];
      for (const selector of visibleLikesSelectors) {
        try {
          const likesElements = await driver.findElements(By.css(selector));
          for (const likesElement of likesElements) {
            const likesText = await likesElement.getText();
            if (likesText && likesText.toLowerCase().includes('likes')) {
              likesCount = this.parseCount(likesText);
              if (likesCount > 0) {
                console.log(`✅ Found visible likes: ${likesText} = ${likesCount}`);
                return likesCount;
              }
            }
          }
        } catch (e) {
          continue;
        }
      }
      // "Liked by X and others" format
      const likedBySelectors = [
        'section span',
        'section div',
      ];
      for (const selector of likedBySelectors) {
        try {
          const likedElements = await driver.findElements(By.css(selector));
          for (const likedElement of likedElements) {
            const likedText = await likedElement.getText();
            if (likedText && likedText.toLowerCase().includes('liked by')) {
              // from "Liked by username and X others"
              const match = likedText.toLowerCase().match(/and\s+(\d+(?:,\d+)*)\s+others?/);
              if (match) {
                const othersCount = parseInt(match[1].replace(/,/g, ''));
                likesCount = othersCount + 1;  // +1 for the named user
                console.log(`✅ Found 'liked by' format: ${likedText} = ${likesCount}`);
                return likesCount;
              } else {
                // "Liked by username and others" without count
                console.log(`⚠️ Hidden likes detected: ${likedText}`);
                return 0;  // Hidden likes count
              }
            }
          }
        } catch (e) {
          continue;
        }
      }
      // Fallback - look for any element with numbers near the heart button
      try {
        // Get all spans in the section
        const allSpans = await driver.findElements(By.css('section span'));
        for (const span of allSpans) {
          const spanText = await span.getText();
          if (spanText && /\d+.*likes?/i.test(spanText)) {
            likesCount = this.parseCount(spanText);
            if (likesCount > 0) {
              console.log(`✅ Found likes via fallback: ${spanText} = ${likesCount}`);
              return likesCount;
            }
          }
        }
      } catch (e) {
        console.log(`⚠️ Fallback method failed: ${e.message}`);
      }
      console.log("⚠️ No likes count found - may be hidden");
      return 0;
    } catch (e) {
      console.log(`❌ Error extracting likes: ${e.message}`);
      return 0;
    }
  }

  async extractGridViewCount(element) {
    // Extract view count from a reel in the grid view using JS
    try {
      // Use JS to find a span with a number and "view"/"views"/"K"/"M"
      const jsResult = await element.getDriver().executeScript(function(el) {
        // Look for all spans inside the element
        const spans = el.querySelectorAll('span');
        const allTexts = [];
        for (const span of spans) {
          const text = span.textContent.trim();
          allTexts.push(text);
          if (
            text &&
            /\d/.test(text)
          ) {
            // Accept if it contains 'view', 'k', 'm', or is just a number with commas
            if (
              text.toLowerCase().includes('view') ||
              text.toLowerCase().includes('k') ||
              text.toLowerCase().includes('m') ||
              /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(text)
            ) {
              return { found: text, all: allTexts };
            }
          }
        }
        return { found: null, all: allTexts };
      }, element);

      if (jsResult) {
        if (jsResult.all) {
          console.log('🔍 All span texts in grid:', jsResult.all);
        }
        if (jsResult.found) {
          const count = this.parseCount(jsResult.found);
          if (count > 0) {
            return count;
          }
        }
      }
      return 0;
    } catch (e) {
      console.log(`❌ Error extracting grid view count: ${e.message}`);
      return 0;
    }
  }

  async scrapeReelsTab(reelsUrl) {
    // Directly scrape all reels from a /reels/ URL
    try {
      console.log(`🔄 Scraping reels tab: ${reelsUrl}`);
      await this.driver.get(reelsUrl);
      await this.driver.sleep(3000);
      // Find all reel elements
      let postElements = [];
      for (const selector of this.POST_SELECTORS) {
        try {
          const elements = await this.driver.findElements(By.css(selector));
          if (elements && elements.length > 0) {
            postElements = postElements.concat(elements);
            console.log(`✅ Found ${elements.length} post elements using selector: ${selector}`);
          }
        } catch (e) {
          console.log(`⚠️ Error trying selector '${selector}': ${e.message}`);
          continue;
        }
      }
      if (!postElements.length) {
        console.log("⚠️ No post elements found using any selector");
        return [];
      }
      // For each reel, extract data
      const reelsData = [];
      for (let i = 0; i < postElements.length; i++) {
        const postElement = postElements[i];
        const postData = {
          url: '',
          caption: '',
          likesCount: 0,
          commentsCount: 0,
          viewCount: 0,
          timestamp: '',
        };
        try {
          // post URL
          const postUrl = await postElement.getAttribute('href');
          if (!postUrl) continue;
          postData.url = postUrl.startsWith('http') ? postUrl : `https://www.instagram.com${postUrl}`;
          // Open post in new tab
          await this.driver.executeScript('window.open(arguments[0], "_blank");', postData.url);
          const handles = await this.driver.getAllWindowHandles();
          const newTab = handles[handles.length - 1];
          await this.driver.switchTo().window(newTab);
          await this.driver.sleep(2000);
          // Expand truncated content
          await this.driver.executeScript(this.EXPAND_CONTENT_JS);
          await this.driver.sleep(2000);
          // Caption
          let captionFound = false;
          let retryCount = 0;
          while (!captionFound && retryCount < 3) {
            for (const selector of this.MODAL_SELECTORS.caption) {
              try {
                const captionElements = await this.driver.findElements(By.css(selector));
                for (const captionElement of captionElements) {
                  const captionText = await captionElement.getText();
                  if (captionText) {
                    let cleanCaption = captionText;
                    if (captionText.includes(':') && !captionText.startsWith('http')) {
                      cleanCaption = captionText.split(':').slice(1).join(':').trim();
                    }
                    cleanCaption = cleanCaption.replace('... more', '').trim();
                    postData.caption = cleanCaption;
                    captionFound = true;
                    break;
                  }
                }
                if (captionFound) break;
              } catch (e) {
                continue;
              }
            }
            if (!captionFound) {
              retryCount++;
              await this.driver.sleep(1000);
            }
          }
          // timestamp
          for (const selector of this.MODAL_SELECTORS.date) {
            try {
              const dateElements = await this.driver.findElements(By.css(selector));
              for (const dateElement of dateElements) {
                const timestamp = await dateElement.getAttribute('datetime');
                if (timestamp) {
                  postData.timestamp = timestamp;
                  break;
                }
              }
              if (postData.timestamp) break;
            } catch (e) {
              continue;
            }
          }
          // likes count
          postData.likesCount = await this.extractLikesCount(this.driver);
          // comments count
          let commentsFound = false;
          retryCount = 0;
          while (!commentsFound && retryCount < 3) {
            for (const selector of this.MODAL_SELECTORS.comments) {
              try {
                const commentsElements = await this.driver.findElements(By.css(selector));
                for (const commentsElement of commentsElements) {
                  const commentsText = await commentsElement.getText();
                  if (commentsText) {
                    postData.commentsCount = this.parseCount(commentsText);
                    commentsFound = true;
                    break;
                  }
                }
                if (commentsFound) break;
              } catch (e) {
                continue;
              }
            }
            if (!commentsFound) {
              retryCount++;
              await this.driver.sleep(1000);
            }
          }
          // view count from grid
          postData.viewCount = await this.extractGridViewCount(postElement);
          reelsData.push(postData);
          // close the new tab
          try {
            await this.driver.close();
            const handles = await this.driver.getAllWindowHandles();
            await this.driver.switchTo().window(handles[0]);
            await this.driver.sleep(1000);
          } catch (e) {
            console.log(`⚠️ Error closing tab: ${e.message}`);
          }
        } catch (e) {
          console.log(`⚠️ Error processing reel: ${e.message}`);
          continue;
        }
      }
      return reelsData;
    } catch (e) {
      console.log(`❌ Error scraping reels tab: ${e.message}`);
      return [];
    }
  }

  async scrapeSpecificReelFromReelsTab(reelsUrl, postLink) {
    // Open reels tab, find the reel matching postLink, and scrape its data
    try {
      console.log(`🔄 Scraping specific reel from: ${reelsUrl} for post: ${postLink}`);
      await this.driver.get(reelsUrl);
      await this.driver.sleep(3000);
      // Extract reel ID from postLink
      let targetReelId = null;
      const reelPatterns = [
        /\/reel\/([^/?]+)/,
        /reel\/([^/?]+)/,
        /instagram\\.com\/reel\/([^/?]+)/,
        /\/p\/([^/?]+)/,
        /p\/([^/?]+)/,
        /instagram\\.com\/p\/([^/?]+)/
      ];
      for (const pattern of reelPatterns) {
        const match = postLink.match(pattern);
        if (match) {
          targetReelId = match[1];
          break;
        }
      }
      if (!targetReelId) {
        console.log("❌ Could not extract reel/post ID from postLink");
        return null;
      }
      // Find all reel elements
      let postElements = [];
      for (const selector of this.POST_SELECTORS) {
        try {
          const elements = await this.driver.findElements(By.css(selector));
          if (elements && elements.length > 0) {
            postElements = postElements.concat(elements);
          }
        } catch (e) {
          continue;
        }
      }
      if (!postElements.length) {
        console.log("⚠️ No post elements found using any selector");
        return null;
      }
      // Find the element matching the target reel ID, with scrolling if not found
      let targetElement = null;
      const maxScrolls = 3;
      for (let scrollAttempt = 0; scrollAttempt < maxScrolls && !targetElement; scrollAttempt++) {
        for (const postElement of postElements) {
          try {
            const href = await postElement.getAttribute('href');
            if (href && href.includes(targetReelId)) {
              targetElement = postElement;
              break;
            }
          } catch (e) {
            continue;
          }
        }
        if (!targetElement && scrollAttempt < maxScrolls - 1) {
          // Scroll down and wait for more reels to load
          await this.driver.executeScript('window.scrollBy(0, 1000);');
          await this.driver.sleep(2000);
          // Re-fetch post elements after scroll
          postElements = [];
          for (const selector of this.POST_SELECTORS) {
            try {
              const elements = await this.driver.findElements(By.css(selector));
              if (elements && elements.length > 0) {
                postElements = postElements.concat(elements);
              }
            } catch (e) {
              continue;
            }
          }
        }
      }
      if (!targetElement) {
        console.log(`❌ Target reel ${targetReelId} not found in reels tab after scrolling`);
        return null;
      }
      // Scrape the reel data (extract view count from grid, then open in new tab for rest)
      const postData = {
        url: '',
        caption: '',
        likesCount: 0,
        commentsCount: 0,
        viewCount: 0,
        timestamp: '',
      };
      try {
        // 1. Extract view count from grid element BEFORE opening the post
        postData.viewCount = await this.extractGridViewCount(targetElement);
        // 2. Now open the post in new tab and extract the rest
        const postUrl = await targetElement.getAttribute('href');
        if (!postUrl) return null;
        postData.url = postUrl.startsWith('http') ? postUrl : `https://www.instagram.com${postUrl}`;
        await this.driver.executeScript('window.open(arguments[0], "_blank");', postData.url);
        const handles = await this.driver.getAllWindowHandles();
        const newTab = handles[handles.length - 1];
        await this.driver.switchTo().window(newTab);
        await this.driver.sleep(2000);
        await this.driver.executeScript(this.EXPAND_CONTENT_JS);
        await this.driver.sleep(2000);
        // Caption
        let captionFound = false;
        let retryCount = 0;
        while (!captionFound && retryCount < 3) {
          for (const selector of this.MODAL_SELECTORS.caption) {
            try {
              const captionElements = await this.driver.findElements(By.css(selector));
              for (const captionElement of captionElements) {
                const captionText = await captionElement.getText();
                if (captionText) {
                  let cleanCaption = captionText;
                  if (captionText.includes(':') && !captionText.startsWith('http')) {
                    cleanCaption = captionText.split(':').slice(1).join(':').trim();
                  }
                  cleanCaption = cleanCaption.replace('... more', '').trim();
                  postData.caption = cleanCaption;
                  captionFound = true;
                  break;
                }
              }
              if (captionFound) break;
            } catch (e) {
              continue;
            }
          }
          if (!captionFound) {
            retryCount++;
            await this.driver.sleep(1000);
          }
        }
        // timestamp
        for (const selector of this.MODAL_SELECTORS.date) {
          try {
            const dateElements = await this.driver.findElements(By.css(selector));
            for (const dateElement of dateElements) {
              const timestamp = await dateElement.getAttribute('datetime');
              if (timestamp) {
                postData.timestamp = timestamp;
                break;
              }
            }
            if (postData.timestamp) break;
          } catch (e) {
            continue;
          }
        }
        // likes count
        postData.likesCount = await this.extractLikesCount(this.driver);
        // comments count
        let commentsFound = false;
        retryCount = 0;
        while (!commentsFound && retryCount < 3) {
          for (const selector of this.MODAL_SELECTORS.comments) {
            try {
              const commentsElements = await this.driver.findElements(By.css(selector));
              for (const commentsElement of commentsElements) {
                const commentsText = await commentsElement.getText();
                if (commentsText) {
                  postData.commentsCount = this.parseCount(commentsText);
                  commentsFound = true;
                  break;
                }
              }
              if (commentsFound) break;
            } catch (e) {
              continue;
            }
          }
          if (!commentsFound) {
            retryCount++;
            await this.driver.sleep(1000);
          }
        }
        // close the new tab
        try {
          await this.driver.close();
          const handles = await this.driver.getAllWindowHandles();
          await this.driver.switchTo().window(handles[0]);
          await this.driver.sleep(1000);
        } catch (e) {
          console.log(`⚠️ Error closing tab: ${e.message}`);
        }
      } catch (e) {
        console.log(`⚠️ Error processing target reel: ${e.message}`);
        return null;
      }
      return postData;
    } catch (e) {
      console.log(`❌ Error scraping specific reel from reels tab: ${e.message}`);
      return null;
    }
  }

  async dismissSaveLoginInfoPopup() {
    try {
      await this.driver.sleep(2000);

      // 1. Try <button> with text
      const buttons = await this.driver.findElements(By.xpath(
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'not now')]"
      ));
      if (buttons.length > 0) {
        await buttons[0].click();
        console.log('✅ Dismissed "Save your login info?" popup (button selector)');
        await this.driver.sleep(1000);
        return;
      }

      // 2. Try <span> with text
      const notNowSpans = await this.driver.findElements(By.xpath(
        "//span[text()='Not now' or text()='NOT NOW' or text()='Not Now' or text()='not now']"
      ));
      if (notNowSpans.length > 0) {
        await notNowSpans[0].click();
        console.log('✅ Dismissed "Save your login info?" popup (span selector)');
        await this.driver.sleep(1000);
        return;
      }

      // 3. Fallback: any button with 'not now' in text
      const fallbackButtons = await this.driver.findElements(By.css('button'));
      for (const btn of fallbackButtons) {
        const text = (await btn.getText()).toLowerCase();
        if (text.includes('not now')) {
          await btn.click();
          console.log('✅ Dismissed "Save your login info?" popup (fallback)');
          await this.driver.sleep(1000);
          break;
        }
      }
    } catch (e) {
      // Ignore errors if popup is not present
    }
  }

  async dismissAutomatedBehaviorPopup() {
    try {
      await this.driver.sleep(2000);

      // Look for the "Dismiss" button in the automated behavior popup
      // Using the specific selectors from the HTML you provided
      const dismissSelectors = [
        // Primary selector based on the HTML structure
        'div[role="button"][aria-label="Dismiss"]',
        // Alternative selectors
        'div[data-bloks-name="bk.components.Flexbox"][role="button"][aria-label="Dismiss"]',
        // Text-based selectors
        'div[role="button"] span:contains("Dismiss")',
        'button span:contains("Dismiss")',
        // XPath for more specific targeting
        '//div[@role="button" and @aria-label="Dismiss"]',
        '//span[text()="Dismiss"]/ancestor::div[@role="button"]',
        // Fallback: any clickable element with "Dismiss" text
        '//*[contains(text(), "Dismiss") and (@role="button" or @tabindex="0")]'
      ];

      for (const selector of dismissSelectors) {
        try {
          let elements;
          if (selector.startsWith('//')) {
            // XPath selector
            elements = await this.driver.findElements(By.xpath(selector));
          } else {
            // CSS selector
            elements = await this.driver.findElements(By.css(selector));
          }
          
          if (elements.length > 0) {
            // Try to click the first matching element
            await elements[0].click();
            console.log('✅ Dismissed "automated behavior" popup');
            await this.driver.sleep(1000);
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      // Additional fallback: look for any element with "Dismiss" text that's clickable
      try {
        const allElements = await this.driver.findElements(By.xpath('//*[contains(text(), "Dismiss")]'));
        for (const element of allElements) {
          try {
            const tagName = await element.getTagName();
            const role = await element.getAttribute('role');
            const tabIndex = await element.getAttribute('tabindex');
            
            // Check if it's clickable
            if (tagName === 'button' || role === 'button' || tabIndex === '0') {
              await element.click();
              console.log('✅ Dismissed "automated behavior" popup (fallback)');
              await this.driver.sleep(1000);
              return true;
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        // Ignore errors
      }

      console.log('ℹ️ No "automated behavior" popup found to dismiss');
      return false;
    } catch (e) {
      console.log(`⚠️ Error dismissing automated behavior popup: ${e.message}`);
      return false;
    }
  }
}

module.exports = { InstagramScraper };
