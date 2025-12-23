const axios = require('axios');
const db = require('../database/db');

// Platform API clients (in production, use official SDKs)
const platformClients = {
  facebook: {
    post: async (account, content, mediaUrls = []) => {
      // In production, use Facebook Graph API
      // POST https://graph.facebook.com/v18.0/{page-id}/feed
      console.log(`[Facebook] Posting to ${account.account_name}:`, content.substring(0, 50));
      
      if (process.env.FACEBOOK_APP_ID && account.access_token !== 'demo-token') {
        try {
          const response = await axios.post(
            `https://graph.facebook.com/v18.0/${account.account_id}/feed`,
            {
              message: content,
              access_token: account.access_token
            }
          );
          return { success: true, postId: response.data.id };
        } catch (error) {
          console.error('Facebook API error:', error.response?.data || error.message);
          throw error;
        }
      }
      
      // Demo mode
      return { 
        success: true, 
        postId: `fb_demo_${Date.now()}`,
        demo: true 
      };
    }
  },
  
  linkedin: {
    post: async (account, content, mediaUrls = []) => {
      // In production, use LinkedIn API
      // POST https://api.linkedin.com/v2/ugcPosts
      console.log(`[LinkedIn] Posting to ${account.account_name}:`, content.substring(0, 50));
      
      if (process.env.LINKEDIN_CLIENT_ID && account.access_token !== 'demo-token') {
        try {
          const response = await axios.post(
            'https://api.linkedin.com/v2/ugcPosts',
            {
              author: `urn:li:person:${account.account_id}`,
              lifecycleState: 'PUBLISHED',
              specificContent: {
                'com.linkedin.ugc.ShareContent': {
                  shareCommentary: { text: content },
                  shareMediaCategory: 'NONE'
                }
              },
              visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          return { success: true, postId: response.data.id };
        } catch (error) {
          console.error('LinkedIn API error:', error.response?.data || error.message);
          throw error;
        }
      }
      
      // Demo mode
      return { 
        success: true, 
        postId: `li_demo_${Date.now()}`,
        demo: true 
      };
    }
  },
  
  twitter: {
    post: async (account, content, mediaUrls = []) => {
      // In production, use Twitter API v2
      // POST https://api.twitter.com/2/tweets
      console.log(`[Twitter] Posting to ${account.account_name}:`, content.substring(0, 50));
      
      if (process.env.TWITTER_BEARER_TOKEN && account.access_token !== 'demo-token') {
        try {
          const response = await axios.post(
            'https://api.twitter.com/2/tweets',
            { text: content },
            {
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          return { success: true, postId: response.data.data.id };
        } catch (error) {
          console.error('Twitter API error:', error.response?.data || error.message);
          throw error;
        }
      }
      
      // Demo mode
      return { 
        success: true, 
        postId: `tw_demo_${Date.now()}`,
        demo: true 
      };
    }
  },
  
  instagram: {
    post: async (account, content, mediaUrls = []) => {
      // In production, use Instagram Graph API (requires Facebook Business)
      // POST https://graph.facebook.com/v18.0/{ig-user-id}/media
      console.log(`[Instagram] Posting to ${account.account_name}:`, content.substring(0, 50));
      
      // Instagram requires an image - skip if no media
      if (!mediaUrls || mediaUrls.length === 0) {
        console.log('[Instagram] Skipping - no media provided');
        return { 
          success: false, 
          error: 'Instagram requires at least one image',
          skipped: true 
        };
      }
      
      if (process.env.INSTAGRAM_APP_ID && account.access_token !== 'demo-token') {
        try {
          // First, create media container
          const createResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${account.account_id}/media`,
            {
              image_url: mediaUrls[0],
              caption: content,
              access_token: account.access_token
            }
          );
          
          // Then publish it
          const publishResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${account.account_id}/media_publish`,
            {
              creation_id: createResponse.data.id,
              access_token: account.access_token
            }
          );
          
          return { success: true, postId: publishResponse.data.id };
        } catch (error) {
          console.error('Instagram API error:', error.response?.data || error.message);
          throw error;
        }
      }
      
      // Demo mode
      return { 
        success: true, 
        postId: `ig_demo_${Date.now()}`,
        demo: true 
      };
    }
  }
};

// Publish post to all selected platforms
async function publishPost(post, userId) {
  const platforms = JSON.parse(post.platforms || '[]');
  const mediaUrls = JSON.parse(post.media_urls || '[]');
  const results = {};
  
  for (const platform of platforms) {
    try {
      // Get connected account for this platform
      const account = db.prepare(`
        SELECT * FROM social_accounts 
        WHERE user_id = ? AND platform = ? AND is_active = 1
        LIMIT 1
      `).get(userId, platform);
      
      if (!account) {
        results[platform] = {
          success: false,
          error: `No connected ${platform} account found`
        };
        
        // Update platform post status
        db.prepare(`
          UPDATE platform_posts SET status = 'failed', error_message = ?
          WHERE post_id = ? AND platform = ?
        `).run(`No connected account`, post.id, platform);
        
        continue;
      }
      
      // Get platform client
      const client = platformClients[platform];
      if (!client) {
        results[platform] = {
          success: false,
          error: `Unsupported platform: ${platform}`
        };
        continue;
      }
      
      // Get platform-specific content
      const platformPost = db.prepare(`
        SELECT * FROM platform_posts WHERE post_id = ? AND platform = ?
      `).get(post.id, platform);
      
      const content = platformPost?.content || post.content;
      
      // Post to platform
      const result = await client.post(account, content, mediaUrls);
      results[platform] = result;
      
      // Update platform post record
      if (result.success) {
        db.prepare(`
          UPDATE platform_posts 
          SET status = 'published', platform_post_id = ?, published_at = CURRENT_TIMESTAMP
          WHERE post_id = ? AND platform = ?
        `).run(result.postId, post.id, platform);
      } else {
        db.prepare(`
          UPDATE platform_posts SET status = 'failed', error_message = ?
          WHERE post_id = ? AND platform = ?
        `).run(result.error || 'Unknown error', post.id, platform);
      }
      
    } catch (error) {
      console.error(`Error posting to ${platform}:`, error);
      results[platform] = {
        success: false,
        error: error.message
      };
      
      db.prepare(`
        UPDATE platform_posts SET status = 'failed', error_message = ?
        WHERE post_id = ? AND platform = ?
      `).run(error.message, post.id, platform);
    }
  }
  
  return results;
}

// Validate content for platform
function validateContent(content, platform) {
  const limits = {
    twitter: 280,
    facebook: 63206,
    linkedin: 3000,
    instagram: 2200
  };
  
  const maxLength = limits[platform] || 1000;
  
  if (content.length > maxLength) {
    return {
      valid: false,
      error: `Content exceeds ${platform} limit of ${maxLength} characters`
    };
  }
  
  return { valid: true };
}

// Adapt content for specific platform
function adaptContentForPlatform(content, platform) {
  const limits = {
    twitter: 280,
    facebook: 63206,
    linkedin: 3000,
    instagram: 2200
  };
  
  const maxLength = limits[platform] || 1000;
  
  if (content.length <= maxLength) {
    return content;
  }
  
  // Truncate and add ellipsis
  return content.substring(0, maxLength - 3) + '...';
}

module.exports = {
  publishPost,
  validateContent,
  adaptContentForPlatform,
  platformClients
};
