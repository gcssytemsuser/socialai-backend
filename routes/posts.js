const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const db = require('../database/db');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images and videos are allowed'));
  }
});

// Get all posts for user
router.get('/', authMiddleware, (req, res) => {
  try {
    const { status, platform, limit = 50, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM posts WHERE user_id = ?';
    const params = [req.user.id];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    if (platform) {
      query += ' AND platforms LIKE ?';
      params.push(`%${platform}%`);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const posts = db.prepare(query).all(...params);
    
    // Parse JSON fields
    const parsedPosts = posts.map(post => ({
      ...post,
      media_urls: post.media_urls ? JSON.parse(post.media_urls) : [],
      platforms: post.platforms ? JSON.parse(post.platforms) : [],
      hashtags: post.hashtags ? JSON.parse(post.hashtags) : []
    }));
    
    const total = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(req.user.id);
    
    res.json({ 
      posts: parsedPosts, 
      total: total.count 
    });
  } catch (error) {
    console.error('Fetch posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get single post
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Get platform-specific posts
    const platformPosts = db.prepare('SELECT * FROM platform_posts WHERE post_id = ?')
      .all(post.id);
    
    res.json({
      post: {
        ...post,
        media_urls: post.media_urls ? JSON.parse(post.media_urls) : [],
        platforms: post.platforms ? JSON.parse(post.platforms) : [],
        hashtags: post.hashtags ? JSON.parse(post.hashtags) : []
      },
      platformPosts
    });
  } catch (error) {
    console.error('Fetch post error:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Create new post
router.post('/', authMiddleware, (req, res) => {
  try {
    const {
      title,
      content,
      platforms,
      status = 'draft',
      scheduled_at,
      hashtags,
      ai_generated,
      ai_prompt
    } = req.body;
    
    if (!content || !platforms || platforms.length === 0) {
      return res.status(400).json({ error: 'Content and platforms are required' });
    }
    
    const result = db.prepare(`
      INSERT INTO posts (user_id, title, content, platforms, status, scheduled_at, hashtags, ai_generated, ai_prompt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      title || null,
      content,
      JSON.stringify(platforms),
      status,
      scheduled_at || null,
      JSON.stringify(hashtags || []),
      ai_generated ? 1 : 0,
      ai_prompt || null
    );
    
    // Create platform-specific posts
    const insertPlatformPost = db.prepare(`
      INSERT INTO platform_posts (post_id, platform, content, status)
      VALUES (?, ?, ?, ?)
    `);
    
    platforms.forEach(platform => {
      insertPlatformPost.run(result.lastInsertRowid, platform, content, 'pending');
    });
    
    res.status(201).json({
      message: 'Post created successfully',
      postId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update post
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (post.status === 'published') {
      return res.status(400).json({ error: 'Cannot edit published posts' });
    }
    
    const {
      title,
      content,
      platforms,
      status,
      scheduled_at,
      hashtags
    } = req.body;
    
    db.prepare(`
      UPDATE posts SET
        title = COALESCE(?, title),
        content = COALESCE(?, content),
        platforms = COALESCE(?, platforms),
        status = COALESCE(?, status),
        scheduled_at = ?,
        hashtags = COALESCE(?, hashtags),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title,
      content,
      platforms ? JSON.stringify(platforms) : null,
      status,
      scheduled_at,
      hashtags ? JSON.stringify(hashtags) : null,
      req.params.id
    );
    
    // Update platform posts if content changed
    if (content) {
      db.prepare('UPDATE platform_posts SET content = ? WHERE post_id = ?')
        .run(content, req.params.id);
    }
    
    res.json({ message: 'Post updated successfully' });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete post
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Delete platform posts first (cascade should handle this, but just in case)
    db.prepare('DELETE FROM platform_posts WHERE post_id = ?').run(req.params.id);
    db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
    
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Upload media for post
router.post('/:id/media', authMiddleware, upload.array('media', 10), (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const mediaUrls = req.files.map(file => `/uploads/${file.filename}`);
    const existingMedia = post.media_urls ? JSON.parse(post.media_urls) : [];
    const allMedia = [...existingMedia, ...mediaUrls];
    
    db.prepare('UPDATE posts SET media_urls = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(allMedia), req.params.id);
    
    // Update platform posts
    db.prepare('UPDATE platform_posts SET media_urls = ? WHERE post_id = ?')
      .run(JSON.stringify(allMedia), req.params.id);
    
    res.json({ 
      message: 'Media uploaded successfully',
      mediaUrls: allMedia
    });
  } catch (error) {
    console.error('Media upload error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

// Publish post immediately
router.post('/:id/publish', authMiddleware, async (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (post.status === 'published') {
      return res.status(400).json({ error: 'Post already published' });
    }
    
    // In a real app, this would call the social media APIs
    // For now, we'll just update the status
    const { publishPost } = require('../services/publisher');
    const results = await publishPost(post, req.user.id);
    
    // Update post status
    db.prepare(`
      UPDATE posts SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.params.id);
    
    res.json({ 
      message: 'Post published successfully',
      results
    });
  } catch (error) {
    console.error('Publish error:', error);
    res.status(500).json({ error: 'Failed to publish post' });
  }
});

// Get posts calendar view
router.get('/calendar/:year/:month', authMiddleware, (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = `${year}-${month.padStart(2, '0')}-31`;
    
    const posts = db.prepare(`
      SELECT id, title, content, platforms, status, scheduled_at, published_at
      FROM posts 
      WHERE user_id = ? 
        AND (
          (scheduled_at >= ? AND scheduled_at <= ?)
          OR (published_at >= ? AND published_at <= ?)
        )
      ORDER BY COALESCE(scheduled_at, published_at)
    `).all(req.user.id, startDate, endDate, startDate, endDate);
    
    const parsedPosts = posts.map(post => ({
      ...post,
      platforms: JSON.parse(post.platforms || '[]')
    }));
    
    res.json({ posts: parsedPosts });
  } catch (error) {
    console.error('Calendar fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

module.exports = router;
