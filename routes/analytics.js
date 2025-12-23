const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../database/db');

// Get analytics overview
router.get('/overview', authMiddleware, (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get post counts by status
    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM posts 
      WHERE user_id = ? AND created_at >= ?
      GROUP BY status
    `).all(req.user.id, startDate.toISOString());
    
    // Get posts per platform
    const platformCounts = db.prepare(`
      SELECT pp.platform, COUNT(*) as count, 
             SUM(CASE WHEN pp.status = 'published' THEN 1 ELSE 0 END) as published
      FROM platform_posts pp
      JOIN posts p ON pp.post_id = p.id
      WHERE p.user_id = ? AND p.created_at >= ?
      GROUP BY pp.platform
    `).all(req.user.id, startDate.toISOString());
    
    // Get total engagement (demo data if no real analytics)
    const engagement = db.prepare(`
      SELECT 
        SUM(a.likes) as total_likes,
        SUM(a.comments) as total_comments,
        SUM(a.shares) as total_shares,
        SUM(a.impressions) as total_impressions,
        AVG(a.engagement_rate) as avg_engagement_rate
      FROM analytics a
      JOIN platform_posts pp ON a.platform_post_id = pp.id
      JOIN posts p ON pp.post_id = p.id
      WHERE p.user_id = ? AND a.recorded_at >= ?
    `).get(req.user.id, startDate.toISOString());
    
    // Get AI usage stats
    const aiUsage = db.prepare(`
      SELECT COUNT(*) as generations, SUM(tokens_used) as total_tokens
      FROM ai_generations
      WHERE user_id = ? AND created_at >= ?
    `).get(req.user.id, startDate.toISOString());
    
    res.json({
      period: `${days} days`,
      statusCounts: statusCounts.reduce((acc, curr) => {
        acc[curr.status] = curr.count;
        return acc;
      }, {}),
      platformCounts,
      engagement: {
        likes: engagement?.total_likes || 0,
        comments: engagement?.total_comments || 0,
        shares: engagement?.total_shares || 0,
        impressions: engagement?.total_impressions || 0,
        engagementRate: engagement?.avg_engagement_rate || 0
      },
      aiUsage: {
        generations: aiUsage?.generations || 0,
        tokensUsed: aiUsage?.total_tokens || 0
      }
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get post performance
router.get('/posts', authMiddleware, (req, res) => {
  try {
    const { limit = 20, sort = 'engagement' } = req.query;
    
    // Get posts with their analytics
    const posts = db.prepare(`
      SELECT 
        p.id, p.title, p.content, p.platforms, p.status, p.published_at,
        pp.platform,
        COALESCE(a.likes, 0) as likes,
        COALESCE(a.comments, 0) as comments,
        COALESCE(a.shares, 0) as shares,
        COALESCE(a.impressions, 0) as impressions,
        COALESCE(a.engagement_rate, 0) as engagement_rate
      FROM posts p
      LEFT JOIN platform_posts pp ON p.id = pp.post_id
      LEFT JOIN analytics a ON pp.id = a.platform_post_id
      WHERE p.user_id = ? AND p.status = 'published'
      ORDER BY (COALESCE(a.likes, 0) + COALESCE(a.comments, 0) + COALESCE(a.shares, 0)) DESC
      LIMIT ?
    `).all(req.user.id, parseInt(limit));
    
    res.json({ posts });
  } catch (error) {
    console.error('Post analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch post analytics' });
  }
});

// Get platform-specific analytics
router.get('/platform/:platform', authMiddleware, (req, res) => {
  try {
    const { platform } = req.params;
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get platform metrics over time
    const metrics = db.prepare(`
      SELECT 
        DATE(a.recorded_at) as date,
        SUM(a.likes) as likes,
        SUM(a.comments) as comments,
        SUM(a.shares) as shares,
        SUM(a.impressions) as impressions,
        AVG(a.engagement_rate) as engagement_rate
      FROM analytics a
      JOIN platform_posts pp ON a.platform_post_id = pp.id
      JOIN posts p ON pp.post_id = p.id
      WHERE p.user_id = ? AND pp.platform = ? AND a.recorded_at >= ?
      GROUP BY DATE(a.recorded_at)
      ORDER BY date
    `).all(req.user.id, platform, startDate.toISOString());
    
    // Get best performing posts for this platform
    const topPosts = db.prepare(`
      SELECT 
        p.id, p.title, p.content, p.published_at,
        a.likes, a.comments, a.shares, a.impressions, a.engagement_rate
      FROM posts p
      JOIN platform_posts pp ON p.id = pp.post_id
      JOIN analytics a ON pp.id = a.platform_post_id
      WHERE p.user_id = ? AND pp.platform = ?
      ORDER BY (a.likes + a.comments + a.shares) DESC
      LIMIT 5
    `).all(req.user.id, platform);
    
    res.json({
      platform,
      period: `${days} days`,
      metrics,
      topPosts
    });
  } catch (error) {
    console.error('Platform analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch platform analytics' });
  }
});

// Record analytics (for webhook callbacks from platforms)
router.post('/record', authMiddleware, (req, res) => {
  try {
    const { platform_post_id, platform, likes, comments, shares, impressions, reach, clicks } = req.body;
    
    // Calculate engagement rate
    const totalEngagement = (likes || 0) + (comments || 0) + (shares || 0);
    const engagementRate = impressions > 0 ? (totalEngagement / impressions) * 100 : 0;
    
    db.prepare(`
      INSERT INTO analytics (platform_post_id, platform, likes, comments, shares, impressions, reach, clicks, engagement_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(platform_post_id, platform, likes || 0, comments || 0, shares || 0, impressions || 0, reach || 0, clicks || 0, engagementRate);
    
    res.json({ message: 'Analytics recorded successfully' });
  } catch (error) {
    console.error('Record analytics error:', error);
    res.status(500).json({ error: 'Failed to record analytics' });
  }
});

// Get engagement trends
router.get('/trends', authMiddleware, (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get daily posting activity
    const postingTrend = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as posts
      FROM posts
      WHERE user_id = ? AND created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY date
    `).all(req.user.id, startDate.toISOString());
    
    // Get content type breakdown
    const contentTypes = db.prepare(`
      SELECT 
        CASE 
          WHEN media_urls IS NOT NULL AND media_urls != '[]' THEN 'with_media'
          ELSE 'text_only'
        END as type,
        COUNT(*) as count
      FROM posts
      WHERE user_id = ? AND created_at >= ?
      GROUP BY type
    `).all(req.user.id, startDate.toISOString());
    
    // Get AI vs manual content
    const aiVsManual = db.prepare(`
      SELECT 
        CASE WHEN ai_generated = 1 THEN 'ai_generated' ELSE 'manual' END as source,
        COUNT(*) as count
      FROM posts
      WHERE user_id = ? AND created_at >= ?
      GROUP BY ai_generated
    `).all(req.user.id, startDate.toISOString());
    
    res.json({
      period: `${days} days`,
      postingTrend,
      contentTypes,
      aiVsManual
    });
  } catch (error) {
    console.error('Trends error:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// Generate demo analytics data
router.post('/generate-demo', authMiddleware, (req, res) => {
  try {
    // Get published platform posts
    const platformPosts = db.prepare(`
      SELECT pp.id, pp.platform
      FROM platform_posts pp
      JOIN posts p ON pp.post_id = p.id
      WHERE p.user_id = ? AND pp.status = 'published'
    `).all(req.user.id);
    
    if (platformPosts.length === 0) {
      return res.status(400).json({ error: 'No published posts found' });
    }
    
    // Generate random analytics for each
    const insertAnalytics = db.prepare(`
      INSERT INTO analytics (platform_post_id, platform, likes, comments, shares, impressions, reach, clicks, engagement_rate, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    platformPosts.forEach(pp => {
      const likes = Math.floor(Math.random() * 500);
      const comments = Math.floor(Math.random() * 50);
      const shares = Math.floor(Math.random() * 100);
      const impressions = Math.floor(Math.random() * 5000) + 100;
      const reach = Math.floor(impressions * 0.8);
      const clicks = Math.floor(Math.random() * 200);
      const engagementRate = ((likes + comments + shares) / impressions) * 100;
      
      // Add multiple data points over the past 7 days
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        insertAnalytics.run(
          pp.id, 
          pp.platform,
          Math.floor(likes / (i + 1)),
          Math.floor(comments / (i + 1)),
          Math.floor(shares / (i + 1)),
          Math.floor(impressions / (i + 1)),
          Math.floor(reach / (i + 1)),
          Math.floor(clicks / (i + 1)),
          engagementRate,
          date.toISOString()
        );
      }
    });
    
    res.json({ 
      message: 'Demo analytics generated',
      postsUpdated: platformPosts.length
    });
  } catch (error) {
    console.error('Generate demo error:', error);
    res.status(500).json({ error: 'Failed to generate demo analytics' });
  }
});

module.exports = router;
