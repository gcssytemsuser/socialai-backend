const db = require('../database/db');
const { publishPost } = require('./publisher');

// Process scheduled posts
async function processScheduledPosts() {
  const now = new Date().toISOString();
  
  // Get posts that are scheduled and due
  const scheduledPosts = db.prepare(`
    SELECT p.*, u.id as owner_id
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.status = 'scheduled' 
      AND p.scheduled_at <= ?
    ORDER BY p.scheduled_at ASC
    LIMIT 10
  `).all(now);
  
  if (scheduledPosts.length === 0) {
    return { processed: 0 };
  }
  
  console.log(`Processing ${scheduledPosts.length} scheduled posts...`);
  
  const results = [];
  
  for (const post of scheduledPosts) {
    try {
      // Mark as processing to prevent duplicate processing
      db.prepare(`UPDATE posts SET status = 'processing' WHERE id = ?`).run(post.id);
      
      // Publish the post
      const publishResults = await publishPost(post, post.owner_id);
      
      // Check if all platforms succeeded
      const allSuccess = Object.values(publishResults).every(r => r.success);
      const anySuccess = Object.values(publishResults).some(r => r.success);
      
      // Update post status
      const finalStatus = allSuccess ? 'published' : (anySuccess ? 'partial' : 'failed');
      
      db.prepare(`
        UPDATE posts 
        SET status = ?, 
            published_at = CASE WHEN ? IN ('published', 'partial') THEN CURRENT_TIMESTAMP ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(finalStatus, finalStatus, post.id);
      
      results.push({
        postId: post.id,
        status: finalStatus,
        platforms: publishResults
      });
      
      console.log(`Post ${post.id} processed: ${finalStatus}`);
      
    } catch (error) {
      console.error(`Error processing post ${post.id}:`, error);
      
      db.prepare(`
        UPDATE posts SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(post.id);
      
      results.push({
        postId: post.id,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  return {
    processed: results.length,
    results
  };
}

// Get optimal posting times based on analytics
function getOptimalPostingTimes(userId, platform) {
  // In production, this would analyze past engagement data
  // For now, return industry-standard best times
  
  const optimalTimes = {
    facebook: {
      bestDays: ['Tuesday', 'Wednesday', 'Thursday'],
      bestHours: [9, 13, 16], // 9am, 1pm, 4pm
      timezone: 'UTC'
    },
    linkedin: {
      bestDays: ['Tuesday', 'Wednesday', 'Thursday'],
      bestHours: [8, 10, 12], // 8am, 10am, 12pm
      timezone: 'UTC'
    },
    twitter: {
      bestDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      bestHours: [8, 12, 17], // 8am, 12pm, 5pm
      timezone: 'UTC'
    },
    instagram: {
      bestDays: ['Monday', 'Wednesday', 'Friday'],
      bestHours: [11, 13, 19], // 11am, 1pm, 7pm
      timezone: 'UTC'
    }
  };
  
  return optimalTimes[platform] || optimalTimes.facebook;
}

// Get next optimal slot for posting
function getNextOptimalSlot(platform) {
  const optimal = getOptimalPostingTimes(null, platform);
  const now = new Date();
  
  // Find next available optimal time
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'long' });
    
    if (optimal.bestDays.includes(dayName)) {
      for (const hour of optimal.bestHours) {
        const slotTime = new Date(checkDate);
        slotTime.setHours(hour, 0, 0, 0);
        
        if (slotTime > now) {
          return slotTime.toISOString();
        }
      }
    }
  }
  
  // Fallback: tomorrow at first optimal hour
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(optimal.bestHours[0], 0, 0, 0);
  return tomorrow.toISOString();
}

// Schedule post for optimal time
function scheduleForOptimalTime(postId, platforms) {
  const slots = platforms.map(platform => ({
    platform,
    time: getNextOptimalSlot(platform)
  }));
  
  // Use the earliest optimal time across all platforms
  const earliestSlot = slots.reduce((earliest, current) => 
    new Date(current.time) < new Date(earliest.time) ? current : earliest
  );
  
  db.prepare(`
    UPDATE posts SET scheduled_at = ?, status = 'scheduled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(earliestSlot.time, postId);
  
  return {
    scheduledAt: earliestSlot.time,
    recommendations: slots
  };
}

module.exports = {
  processScheduledPosts,
  getOptimalPostingTimes,
  getNextOptimalSlot,
  scheduleForOptimalTime
};
