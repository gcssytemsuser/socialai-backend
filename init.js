const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'social_media.db');

async function initializeDatabase() {
  console.log('Initializing database...');
  
  // Remove existing database if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('Removed existing database');
  }
  
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');
  
  // Create tables
  console.log('Creating tables...');
  
  // Users table
  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      company TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Brand settings table
  db.run(`
    CREATE TABLE brand_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      brand_name TEXT,
      brand_voice TEXT,
      target_audience TEXT,
      industry TEXT,
      keywords TEXT,
      hashtag_strategy TEXT,
      tone TEXT DEFAULT 'professional',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  // Social accounts table
  db.run(`
    CREATE TABLE social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_id TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at DATETIME,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  // Posts table
  db.run(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      media_urls TEXT,
      platforms TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      scheduled_at DATETIME,
      published_at DATETIME,
      hashtags TEXT,
      ai_generated INTEGER DEFAULT 0,
      ai_prompt TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  // Platform-specific posts table
  db.run(`
    CREATE TABLE platform_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      content TEXT,
      media_urls TEXT,
      platform_post_id TEXT,
      status TEXT DEFAULT 'pending',
      published_at DATETIME,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
  `);
  
  // Analytics table
  db.run(`
    CREATE TABLE analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_post_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      reach INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      engagement_rate REAL DEFAULT 0,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (platform_post_id) REFERENCES platform_posts(id) ON DELETE CASCADE
    )
  `);
  
  // Content templates table
  db.run(`
    CREATE TABLE content_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      template TEXT NOT NULL,
      platform TEXT,
      category TEXT,
      is_public INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  // AI generations history table
  db.run(`
    CREATE TABLE ai_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      generated_content TEXT NOT NULL,
      platform TEXT,
      model TEXT,
      tokens_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  // Create indexes for better performance
  console.log('Creating indexes...');
  db.run('CREATE INDEX idx_posts_user ON posts(user_id)');
  db.run('CREATE INDEX idx_posts_status ON posts(status)');
  db.run('CREATE INDEX idx_posts_scheduled ON posts(scheduled_at)');
  db.run('CREATE INDEX idx_platform_posts_post ON platform_posts(post_id)');
  db.run('CREATE INDEX idx_analytics_platform_post ON analytics(platform_post_id)');
  db.run('CREATE INDEX idx_social_accounts_user ON social_accounts(user_id)');
  
  // Create demo user
  console.log('Creating demo user...');
  const hashedPassword = await bcrypt.hash('demo123', 10);
  
  db.run(`
    INSERT INTO users (email, password, name, company)
    VALUES ('demo@example.com', '${hashedPassword}', 'Demo User', 'Demo Company')
  `);
  
  // Create brand settings for demo user
  db.run(`
    INSERT INTO brand_settings (user_id, brand_name, brand_voice, target_audience, industry, tone)
    VALUES (1, 'Demo Brand', 'Friendly and professional', 'Small business owners', 'Technology', 'professional')
  `);
  
  // Add some demo social accounts
  db.run(`
    INSERT INTO social_accounts (user_id, platform, account_name, account_id, access_token, is_active)
    VALUES 
      (1, 'facebook', 'Demo Facebook Page', 'demo-fb-123', 'demo-token', 1),
      (1, 'twitter', '@DemoAccount', 'demo-tw-456', 'demo-token', 1),
      (1, 'linkedin', 'Demo LinkedIn', 'demo-li-789', 'demo-token', 1),
      (1, 'instagram', '@demo_insta', 'demo-ig-012', 'demo-token', 1)
  `);
  
  // Add some demo posts
  const demoPosts = [
    {
      title: 'Exciting Product Launch',
      content: '🚀 We are thrilled to announce our latest product! After months of development, we are finally ready to share it with the world. Stay tuned for more updates! #innovation #newproduct #launch',
      platforms: '["facebook","linkedin","twitter"]',
      status: 'published',
      ai_generated: 1
    },
    {
      title: 'Industry Insights',
      content: '📊 Did you know that 75% of businesses are now using AI-powered tools? Here are 5 ways AI can transform your workflow and boost productivity. Thread 🧵',
      platforms: '["twitter","linkedin"]',
      status: 'published',
      ai_generated: 1
    },
    {
      title: 'Behind the Scenes',
      content: 'A peek behind the curtain! 👀 Here is what a typical day looks like at our office. We believe in work-life balance and creating a space where creativity thrives. #companyculture #teamwork',
      platforms: '["instagram","facebook"]',
      status: 'scheduled',
      ai_generated: 0
    },
    {
      title: 'Customer Success Story',
      content: '⭐ Meet Sarah from TechStart Inc. - she increased her social media engagement by 300% using our platform. Read her full story on our blog!',
      platforms: '["facebook","linkedin"]',
      status: 'draft',
      ai_generated: 1
    }
  ];
  
  const now = new Date();
  const scheduled = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
  
  demoPosts.forEach((post, index) => {
    const publishedAt = post.status === 'published' ? new Date(now.getTime() - (index + 1) * 24 * 60 * 60 * 1000).toISOString() : null;
    const scheduledAt = post.status === 'scheduled' ? scheduled.toISOString() : null;
    
    db.run(`
      INSERT INTO posts (user_id, title, content, platforms, status, scheduled_at, published_at, ai_generated, hashtags)
      VALUES (1, '${post.title}', '${post.content}', '${post.platforms}', '${post.status}', ${scheduledAt ? `'${scheduledAt}'` : 'NULL'}, ${publishedAt ? `'${publishedAt}'` : 'NULL'}, ${post.ai_generated}, '[]')
    `);
  });
  
  // Create platform posts for each demo post
  console.log('Creating platform posts...');
  for (let postId = 1; postId <= 4; postId++) {
    const post = demoPosts[postId - 1];
    const platforms = JSON.parse(post.platforms);
    
    platforms.forEach(platform => {
      const status = post.status === 'published' ? 'published' : 'pending';
      db.run(`
        INSERT INTO platform_posts (post_id, platform, content, status)
        VALUES (${postId}, '${platform}', '${post.content}', '${status}')
      `);
    });
  }
  
  // Generate demo analytics for published posts
  console.log('Creating demo analytics...');
  const platformPostsResult = db.exec(`
    SELECT pp.id, pp.platform FROM platform_posts pp
    JOIN posts p ON pp.post_id = p.id
    WHERE pp.status = 'published'
  `);
  
  if (platformPostsResult.length > 0) {
    const platformPosts = platformPostsResult[0].values;
    
    platformPosts.forEach(([ppId, platform]) => {
      // Generate random analytics
      const likes = Math.floor(Math.random() * 500) + 50;
      const comments = Math.floor(Math.random() * 50) + 5;
      const shares = Math.floor(Math.random() * 100) + 10;
      const impressions = Math.floor(Math.random() * 5000) + 500;
      const reach = Math.floor(impressions * 0.8);
      const clicks = Math.floor(Math.random() * 200) + 20;
      const engagementRate = ((likes + comments + shares) / impressions) * 100;
      
      // Add multiple data points over the past 7 days
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        db.run(`
          INSERT INTO analytics (platform_post_id, platform, likes, comments, shares, impressions, reach, clicks, engagement_rate, recorded_at)
          VALUES (${ppId}, '${platform}', ${Math.floor(likes / (i + 1))}, ${Math.floor(comments / (i + 1))}, ${Math.floor(shares / (i + 1))}, ${Math.floor(impressions / (i + 1))}, ${Math.floor(reach / (i + 1))}, ${Math.floor(clicks / (i + 1))}, ${engagementRate.toFixed(2)}, '${date.toISOString()}')
        `);
      }
    });
  }
  
  // Add some demo AI generation history
  console.log('Creating AI generation history...');
  const aiGenerations = [
    { prompt: 'Write a product launch announcement', content: 'We are thrilled to announce...', platform: 'facebook' },
    { prompt: 'Create an industry insights thread', content: 'Did you know that 75%...', platform: 'twitter' },
    { prompt: 'Generate a behind-the-scenes post', content: 'A peek behind the curtain...', platform: 'instagram' }
  ];
  
  aiGenerations.forEach(gen => {
    db.run(`
      INSERT INTO ai_generations (user_id, prompt, generated_content, platform, model, tokens_used)
      VALUES (1, '${gen.prompt}', '${gen.content}', '${gen.platform}', 'gpt-4', ${Math.floor(Math.random() * 500) + 100})
    `);
  });
  
  // Save database to file
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  
  console.log('Database initialized successfully!');
  console.log('Demo user created: demo@example.com / demo123');
  console.log(`Database saved to: ${dbPath}`);
  
  db.close();
}

initializeDatabase().catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
