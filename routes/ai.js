const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../database/db');
const { generateContent, generateHashtags, improveContent } = require('../services/ai');

// Generate content using AI
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { 
      topic, 
      platform, 
      tone, 
      length,
      includeHashtags,
      includeEmoji,
      customInstructions 
    } = req.body;
    
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }
    
    // Get brand settings for context
    const brandSettings = db.prepare('SELECT * FROM brand_settings WHERE user_id = ?').get(req.user.id);
    
    // Generate content
    const result = await generateContent({
      topic,
      platform: platform || 'general',
      tone: tone || brandSettings?.tone || 'professional',
      length: length || 'medium',
      includeHashtags: includeHashtags !== false,
      includeEmoji: includeEmoji || false,
      customInstructions,
      brandContext: brandSettings
    });
    
    // Save to generation history
    db.prepare(`
      INSERT INTO ai_generations (user_id, prompt, generated_content, platform, model, tokens_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      topic,
      result.content,
      platform || 'general',
      result.model || 'gpt-4',
      result.tokensUsed || 0
    );
    
    res.json({
      content: result.content,
      hashtags: result.hashtags || [],
      platform: platform || 'general',
      characterCount: result.content.length
    });
  } catch (error) {
    console.error('AI generation error:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

// Generate content for multiple platforms at once
router.post('/generate-multi', authMiddleware, async (req, res) => {
  try {
    const { topic, platforms, tone, customInstructions } = req.body;
    
    if (!topic || !platforms || platforms.length === 0) {
      return res.status(400).json({ error: 'Topic and platforms are required' });
    }
    
    // Get brand settings
    const brandSettings = db.prepare('SELECT * FROM brand_settings WHERE user_id = ?').get(req.user.id);
    
    // Generate content for each platform
    const results = {};
    
    for (const platform of platforms) {
      const result = await generateContent({
        topic,
        platform,
        tone: tone || brandSettings?.tone || 'professional',
        customInstructions,
        brandContext: brandSettings
      });
      
      results[platform] = {
        content: result.content,
        hashtags: result.hashtags || [],
        characterCount: result.content.length
      };
      
      // Save to generation history
      db.prepare(`
        INSERT INTO ai_generations (user_id, prompt, generated_content, platform, model)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.user.id, topic, result.content, platform, result.model || 'gpt-4');
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Multi-platform generation error:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

// Generate hashtags for content
router.post('/hashtags', authMiddleware, async (req, res) => {
  try {
    const { content, platform, count } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    const hashtags = await generateHashtags(content, platform, count || 10);
    
    res.json({ hashtags });
  } catch (error) {
    console.error('Hashtag generation error:', error);
    res.status(500).json({ error: 'Failed to generate hashtags' });
  }
});

// Improve existing content
router.post('/improve', authMiddleware, async (req, res) => {
  try {
    const { content, improvements, platform } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    const improved = await improveContent(content, improvements, platform);
    
    res.json({ 
      original: content,
      improved: improved.content,
      changes: improved.changes
    });
  } catch (error) {
    console.error('Content improvement error:', error);
    res.status(500).json({ error: 'Failed to improve content' });
  }
});

// Get AI generation history
router.get('/history', authMiddleware, (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const history = db.prepare(`
      SELECT * FROM ai_generations 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), parseInt(offset));
    
    const total = db.prepare('SELECT COUNT(*) as count FROM ai_generations WHERE user_id = ?').get(req.user.id);
    
    res.json({ 
      history, 
      total: total.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get content suggestions based on trending topics
router.get('/suggestions', authMiddleware, async (req, res) => {
  try {
    const brandSettings = db.prepare('SELECT * FROM brand_settings WHERE user_id = ?').get(req.user.id);
    
    // Generate topic suggestions based on brand/industry
    const suggestions = await generateContent({
      topic: `Generate 5 trending content ideas for a ${brandSettings?.industry || 'business'} company`,
      platform: 'general',
      tone: 'professional',
      customInstructions: 'Return only a JSON array of objects with "topic" and "description" fields'
    });
    
    res.json({ suggestions: suggestions.content });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

module.exports = router;
