const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../database/db');

// Get all connected social accounts
router.get('/accounts', authMiddleware, (req, res) => {
  try {
    const accounts = db.prepare(`
      SELECT id, platform, account_name, account_id, is_active, created_at
      FROM social_accounts 
      WHERE user_id = ?
      ORDER BY platform
    `).all(req.user.id);
    
    res.json({ accounts });
  } catch (error) {
    console.error('Fetch accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Connect new social account (simulated - in production, use OAuth)
router.post('/accounts/connect', authMiddleware, (req, res) => {
  try {
    const { platform, account_name, access_token, account_id } = req.body;
    
    if (!platform || !account_name) {
      return res.status(400).json({ error: 'Platform and account name are required' });
    }
    
    // Check if account already exists
    const existing = db.prepare(`
      SELECT id FROM social_accounts 
      WHERE user_id = ? AND platform = ? AND account_id = ?
    `).get(req.user.id, platform, account_id || account_name);
    
    if (existing) {
      // Update existing account
      db.prepare(`
        UPDATE social_accounts SET 
          access_token = ?,
          account_name = ?,
          is_active = 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(access_token || 'demo-token', account_name, existing.id);
      
      return res.json({ message: 'Account reconnected successfully' });
    }
    
    // Insert new account
    const result = db.prepare(`
      INSERT INTO social_accounts (user_id, platform, account_name, account_id, access_token, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(
      req.user.id,
      platform,
      account_name,
      account_id || account_name,
      access_token || 'demo-token'
    );
    
    res.status(201).json({
      message: 'Account connected successfully',
      accountId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Connect account error:', error);
    res.status(500).json({ error: 'Failed to connect account' });
  }
});

// Disconnect social account
router.delete('/accounts/:id', authMiddleware, (req, res) => {
  try {
    const account = db.prepare(`
      SELECT id FROM social_accounts WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    db.prepare('DELETE FROM social_accounts WHERE id = ?').run(req.params.id);
    
    res.json({ message: 'Account disconnected successfully' });
  } catch (error) {
    console.error('Disconnect account error:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

// Toggle account active status
router.patch('/accounts/:id/toggle', authMiddleware, (req, res) => {
  try {
    const account = db.prepare(`
      SELECT id, is_active FROM social_accounts WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    const newStatus = account.is_active ? 0 : 1;
    db.prepare('UPDATE social_accounts SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStatus, req.params.id);
    
    res.json({ 
      message: `Account ${newStatus ? 'activated' : 'deactivated'} successfully`,
      is_active: newStatus
    });
  } catch (error) {
    console.error('Toggle account error:', error);
    res.status(500).json({ error: 'Failed to toggle account' });
  }
});

// Get OAuth URL for platform (in production, implement actual OAuth)
router.get('/oauth/:platform', authMiddleware, (req, res) => {
  const { platform } = req.params;
  const redirectUri = `${req.protocol}://${req.get('host')}/api/social/oauth/${platform}/callback`;
  
  // In production, these would be actual OAuth URLs
  const oauthUrls = {
    facebook: `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${redirectUri}&scope=pages_manage_posts,pages_read_engagement`,
    linkedin: `https://www.linkedin.com/oauth/v2/authorization?client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${redirectUri}&scope=w_member_social`,
    twitter: `https://twitter.com/i/oauth2/authorize?client_id=${process.env.TWITTER_API_KEY}&redirect_uri=${redirectUri}&scope=tweet.write`,
    instagram: `https://api.instagram.com/oauth/authorize?client_id=${process.env.INSTAGRAM_APP_ID}&redirect_uri=${redirectUri}&scope=user_profile,user_media`
  };
  
  if (!oauthUrls[platform]) {
    return res.status(400).json({ error: 'Unsupported platform' });
  }
  
  res.json({ 
    url: oauthUrls[platform],
    note: 'Demo mode - OAuth not fully implemented. Use /accounts/connect for testing.'
  });
});

// OAuth callback handler (placeholder)
router.get('/oauth/:platform/callback', authMiddleware, (req, res) => {
  const { platform } = req.params;
  const { code, error } = req.query;
  
  if (error) {
    return res.redirect(`/settings?error=${error}`);
  }
  
  // In production, exchange code for access token
  // For now, redirect with success
  res.redirect(`/settings?connected=${platform}`);
});

// Get platform limits and info
router.get('/platforms', (req, res) => {
  const platforms = {
    facebook: {
      name: 'Facebook',
      icon: 'facebook',
      color: '#1877f2',
      maxTextLength: 63206,
      maxImages: 10,
      maxVideoLength: 240, // minutes
      features: ['text', 'images', 'videos', 'links', 'polls']
    },
    linkedin: {
      name: 'LinkedIn',
      icon: 'linkedin',
      color: '#0077b5',
      maxTextLength: 3000,
      maxImages: 9,
      maxVideoLength: 10,
      features: ['text', 'images', 'videos', 'articles', 'documents']
    },
    twitter: {
      name: 'Twitter/X',
      icon: 'twitter',
      color: '#1da1f2',
      maxTextLength: 280,
      maxImages: 4,
      maxVideoLength: 2.33,
      features: ['text', 'images', 'videos', 'polls', 'threads']
    },
    instagram: {
      name: 'Instagram',
      icon: 'instagram',
      color: '#e4405f',
      maxTextLength: 2200,
      maxImages: 10,
      maxVideoLength: 60,
      features: ['images', 'videos', 'stories', 'reels', 'carousels']
    }
  };
  
  res.json({ platforms });
});

module.exports = router;
