const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, company } = req.body;
    
    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    // Check if user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user
    const result = db.prepare(`
      INSERT INTO users (email, password, name, company)
      VALUES (?, ?, ?, ?)
    `).run(email, hashedPassword, name, company || null);
    
    // Create default brand settings
    db.prepare(`
      INSERT INTO brand_settings (user_id, brand_name, tone)
      VALUES (?, ?, ?)
    `).run(result.lastInsertRowid, company || name, 'professional');
    
    // Generate token
    const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: result.lastInsertRowid,
        email,
        name,
        company
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, company } = req.body;
    
    db.prepare(`
      UPDATE users SET name = ?, company = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, company, req.user.id);
    
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get brand settings
router.get('/brand-settings', authMiddleware, (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM brand_settings WHERE user_id = ?').get(req.user.id);
    res.json({ settings: settings || {} });
  } catch (error) {
    console.error('Brand settings error:', error);
    res.status(500).json({ error: 'Failed to get brand settings' });
  }
});

// Update brand settings
router.put('/brand-settings', authMiddleware, (req, res) => {
  try {
    const {
      brand_name,
      brand_voice,
      target_audience,
      industry,
      keywords,
      hashtag_strategy,
      tone
    } = req.body;
    
    // Check if settings exist
    const existing = db.prepare('SELECT id FROM brand_settings WHERE user_id = ?').get(req.user.id);
    
    if (existing) {
      db.prepare(`
        UPDATE brand_settings SET
          brand_name = ?,
          brand_voice = ?,
          target_audience = ?,
          industry = ?,
          keywords = ?,
          hashtag_strategy = ?,
          tone = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(brand_name, brand_voice, target_audience, industry, keywords, hashtag_strategy, tone, req.user.id);
    } else {
      db.prepare(`
        INSERT INTO brand_settings (user_id, brand_name, brand_voice, target_audience, industry, keywords, hashtag_strategy, tone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.user.id, brand_name, brand_voice, target_audience, industry, keywords, hashtag_strategy, tone);
    }
    
    res.json({ message: 'Brand settings updated successfully' });
  } catch (error) {
    console.error('Brand settings update error:', error);
    res.status(500).json({ error: 'Failed to update brand settings' });
  }
});

module.exports = router;
