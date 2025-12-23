const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../database/db');
const { getOptimalPostingTimes, getNextOptimalSlot, scheduleForOptimalTime } = require('../services/scheduler');

// Get scheduled posts
router.get('/', authMiddleware, (req, res) => {
  try {
    const { status = 'scheduled', limit = 50, offset = 0 } = req.query;
    
    const posts = db.prepare(`
      SELECT * FROM posts 
      WHERE user_id = ? AND status = ?
      ORDER BY scheduled_at ASC
      LIMIT ? OFFSET ?
    `).all(req.user.id, status, parseInt(limit), parseInt(offset));
    
    const parsedPosts = posts.map(post => ({
      ...post,
      platforms: JSON.parse(post.platforms || '[]'),
      media_urls: JSON.parse(post.media_urls || '[]')
    }));
    
    res.json({ posts: parsedPosts });
  } catch (error) {
    console.error('Fetch schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Schedule a post
router.post('/:postId', authMiddleware, (req, res) => {
  try {
    const { postId } = req.params;
    const { scheduled_at, use_optimal_time } = req.body;
    
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?')
      .get(postId, req.user.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (post.status === 'published') {
      return res.status(400).json({ error: 'Cannot schedule published posts' });
    }
    
    if (use_optimal_time) {
      const platforms = JSON.parse(post.platforms || '[]');
      const result = scheduleForOptimalTime(postId, platforms);
      return res.json({
        message: 'Post scheduled for optimal time',
        ...result
      });
    }
    
    if (!scheduled_at) {
      return res.status(400).json({ error: 'Scheduled time is required' });
    }
    
    // Validate scheduled time is in the future
    if (new Date(scheduled_at) <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }
    
    db.prepare(`
      UPDATE posts SET scheduled_at = ?, status = 'scheduled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(scheduled_at, postId);
    
    res.json({ 
      message: 'Post scheduled successfully',
      scheduledAt: scheduled_at
    });
  } catch (error) {
    console.error('Schedule post error:', error);
    res.status(500).json({ error: 'Failed to schedule post' });
  }
});

// Unschedule a post (move back to draft)
router.delete('/:postId', authMiddleware, (req, res) => {
  try {
    const { postId } = req.params;
    
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?')
      .get(postId, req.user.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (post.status !== 'scheduled') {
      return res.status(400).json({ error: 'Post is not scheduled' });
    }
    
    db.prepare(`
      UPDATE posts SET scheduled_at = NULL, status = 'draft', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(postId);
    
    res.json({ message: 'Post unscheduled successfully' });
  } catch (error) {
    console.error('Unschedule post error:', error);
    res.status(500).json({ error: 'Failed to unschedule post' });
  }
});

// Get optimal posting times
router.get('/optimal-times', authMiddleware, (req, res) => {
  try {
    const { platform } = req.query;
    
    if (platform) {
      const times = getOptimalPostingTimes(req.user.id, platform);
      const nextSlot = getNextOptimalSlot(platform);
      return res.json({ 
        platform,
        optimalTimes: times,
        nextOptimalSlot: nextSlot
      });
    }
    
    // Return for all platforms
    const platforms = ['facebook', 'linkedin', 'twitter', 'instagram'];
    const allTimes = {};
    
    platforms.forEach(p => {
      allTimes[p] = {
        optimalTimes: getOptimalPostingTimes(req.user.id, p),
        nextOptimalSlot: getNextOptimalSlot(p)
      };
    });
    
    res.json({ platforms: allTimes });
  } catch (error) {
    console.error('Optimal times error:', error);
    res.status(500).json({ error: 'Failed to get optimal times' });
  }
});

// Get posting queue
router.get('/queue', authMiddleware, (req, res) => {
  try {
    const posts = db.prepare(`
      SELECT * FROM posts 
      WHERE user_id = ? AND status IN ('scheduled', 'processing')
      ORDER BY scheduled_at ASC
      LIMIT 20
    `).all(req.user.id);
    
    const queue = posts.map(post => ({
      ...post,
      platforms: JSON.parse(post.platforms || '[]'),
      timeUntilPost: post.scheduled_at ? 
        Math.max(0, new Date(post.scheduled_at) - new Date()) : null
    }));
    
    res.json({ queue });
  } catch (error) {
    console.error('Queue fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// Reschedule post
router.put('/:postId', authMiddleware, (req, res) => {
  try {
    const { postId } = req.params;
    const { scheduled_at } = req.body;
    
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?')
      .get(postId, req.user.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (!['draft', 'scheduled'].includes(post.status)) {
      return res.status(400).json({ error: 'Cannot reschedule this post' });
    }
    
    if (new Date(scheduled_at) <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }
    
    db.prepare(`
      UPDATE posts SET scheduled_at = ?, status = 'scheduled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(scheduled_at, postId);
    
    res.json({ 
      message: 'Post rescheduled successfully',
      scheduledAt: scheduled_at
    });
  } catch (error) {
    console.error('Reschedule error:', error);
    res.status(500).json({ error: 'Failed to reschedule post' });
  }
});

module.exports = router;
