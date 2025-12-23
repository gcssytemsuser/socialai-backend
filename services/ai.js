const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'demo-key'
});

// Platform-specific configurations
const platformConfigs = {
  twitter: {
    maxLength: 280,
    name: 'Twitter/X',
    style: 'concise, punchy, conversational with relevant hashtags'
  },
  linkedin: {
    maxLength: 3000,
    name: 'LinkedIn',
    style: 'professional, insightful, value-driven with industry relevance'
  },
  facebook: {
    maxLength: 63206,
    name: 'Facebook',
    style: 'engaging, conversational, community-focused'
  },
  instagram: {
    maxLength: 2200,
    name: 'Instagram',
    style: 'visual-first, trendy, emoji-friendly with strategic hashtags'
  },
  general: {
    maxLength: 1000,
    name: 'General',
    style: 'versatile and adaptable'
  }
};

// Tone descriptions
const toneDescriptions = {
  professional: 'formal, authoritative, and business-appropriate',
  casual: 'friendly, relaxed, and approachable',
  humorous: 'witty, fun, and entertaining while remaining appropriate',
  inspirational: 'motivating, uplifting, and encouraging',
  educational: 'informative, clear, and instructive',
  promotional: 'persuasive, exciting, and action-oriented'
};

// Generate content using AI
async function generateContent(options) {
  const {
    topic,
    platform = 'general',
    tone = 'professional',
    length = 'medium',
    includeHashtags = true,
    includeEmoji = false,
    customInstructions = '',
    brandContext = {}
  } = options;

  const platformConfig = platformConfigs[platform] || platformConfigs.general;
  const toneDesc = toneDescriptions[tone] || toneDescriptions.professional;

  // Build the prompt
  const systemPrompt = `You are an expert social media content creator specializing in ${platformConfig.name} content.
Your writing style should be ${platformConfig.style}.
The tone should be ${toneDesc}.

${brandContext.brand_voice ? `Brand Voice: ${brandContext.brand_voice}` : ''}
${brandContext.target_audience ? `Target Audience: ${brandContext.target_audience}` : ''}
${brandContext.industry ? `Industry: ${brandContext.industry}` : ''}

Guidelines:
- Keep content under ${platformConfig.maxLength} characters
- ${includeHashtags ? 'Include relevant hashtags at the end' : 'Do not include hashtags'}
- ${includeEmoji ? 'Use appropriate emojis to enhance engagement' : 'Minimize emoji usage'}
- Make content engaging and shareable
- Include a clear call-to-action when appropriate
${customInstructions ? `\nAdditional Instructions: ${customInstructions}` : ''}`;

  const lengthGuide = {
    short: 'Keep it very brief, 1-2 sentences max.',
    medium: 'Moderate length, 2-4 sentences.',
    long: 'Comprehensive post, 4-6 sentences with detail.'
  };

  try {
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'demo-key') {
      // Return demo content if no API key
      return generateDemoContent(topic, platform, includeHashtags);
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: `Create a ${platform} post about: ${topic}\n\nLength preference: ${lengthGuide[length] || lengthGuide.medium}` 
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const content = response.choices[0].message.content;
    
    // Extract hashtags if present
    const hashtagMatch = content.match(/#\w+/g);
    const hashtags = hashtagMatch || [];

    return {
      content,
      hashtags,
      model: 'gpt-4',
      tokensUsed: response.usage?.total_tokens || 0
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    // Fall back to demo content
    return generateDemoContent(topic, platform, includeHashtags);
  }
}

// Generate demo content when API is not available
function generateDemoContent(topic, platform, includeHashtags) {
  const templates = {
    twitter: [
      `🚀 ${topic} is changing the game! Here's what you need to know...`,
      `Hot take: ${topic} is more important than ever. Here's why 👇`,
      `The future of ${topic} is here, and it's exciting! 💡`
    ],
    linkedin: [
      `I've been thinking a lot about ${topic} lately, and here's what I've learned:\n\nThe landscape is evolving rapidly, and businesses need to adapt. Here are 3 key insights:\n\n1️⃣ Innovation drives growth\n2️⃣ Customer focus remains paramount\n3️⃣ Data-driven decisions win\n\nWhat's your take on ${topic}?`,
      `${topic} - A topic that's reshaping our industry.\n\nAfter years of experience, I've noticed that the most successful companies embrace change and innovation.\n\nHere's my perspective on what's working now and what's coming next...`
    ],
    facebook: [
      `Hey everyone! 👋\n\nLet's talk about ${topic} today.\n\nWe've been working on some exciting developments, and we can't wait to share them with you!\n\nDrop a comment below and let us know what you think! ⬇️`,
      `Big news about ${topic}! 🎉\n\nWe're thrilled to share this update with our amazing community. Your support means everything to us!\n\nStay tuned for more updates coming soon! 💪`
    ],
    instagram: [
      `✨ ${topic} ✨\n\nSwipe to see why this matters 👉\n\nDouble tap if you agree! ❤️`,
      `POV: You just discovered ${topic} 🤯\n\nSave this for later! 📌`
    ],
    general: [
      `Exploring ${topic} - here's what matters most:\n\n• Innovation and growth\n• Customer-centric approach\n• Future-ready strategies\n\nWhat would you add to this list?`
    ]
  };

  const platformTemplates = templates[platform] || templates.general;
  const content = platformTemplates[Math.floor(Math.random() * platformTemplates.length)];
  
  const hashtags = includeHashtags ? generateDemoHashtags(topic) : [];
  const finalContent = includeHashtags ? `${content}\n\n${hashtags.join(' ')}` : content;

  return {
    content: finalContent,
    hashtags,
    model: 'demo',
    tokensUsed: 0
  };
}

// Generate demo hashtags
function generateDemoHashtags(topic) {
  const words = topic.toLowerCase().split(' ').filter(w => w.length > 3);
  const baseHashtags = words.slice(0, 3).map(w => `#${w.replace(/[^a-z0-9]/g, '')}`);
  const commonHashtags = ['#innovation', '#business', '#growth', '#trending', '#insights'];
  
  return [...baseHashtags, ...commonHashtags.slice(0, 3 - baseHashtags.length)];
}

// Generate hashtags for content
async function generateHashtags(content, platform = 'general', count = 10) {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'demo-key') {
      return generateDemoHashtags(content);
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a social media expert. Generate ${count} relevant hashtags for ${platform} based on the content. Return only hashtags separated by spaces.`
        },
        { role: 'user', content: content }
      ],
      max_tokens: 100
    });

    const hashtagText = response.choices[0].message.content;
    return hashtagText.match(/#\w+/g) || [];
  } catch (error) {
    console.error('Hashtag generation error:', error);
    return generateDemoHashtags(content);
  }
}

// Improve existing content
async function improveContent(content, improvements = [], platform = 'general') {
  const improvementTypes = {
    engagement: 'Make it more engaging with questions or calls-to-action',
    clarity: 'Improve clarity and readability',
    seo: 'Optimize for better reach and discoverability',
    tone: 'Adjust tone to be more professional/casual as needed',
    length: 'Optimize length for the platform'
  };

  const improvementInstructions = improvements
    .map(imp => improvementTypes[imp] || imp)
    .join('. ');

  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'demo-key') {
      return {
        content: content + '\n\n[Improved version - Add your API key for AI-powered improvements]',
        changes: ['Demo mode - no actual improvements made']
      };
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a social media content optimizer. Improve the given content based on these requirements: ${improvementInstructions}. Maintain the original message while enhancing it.`
        },
        { role: 'user', content: content }
      ],
      max_tokens: 500
    });

    return {
      content: response.choices[0].message.content,
      changes: improvements
    };
  } catch (error) {
    console.error('Content improvement error:', error);
    return {
      content,
      changes: ['Error occurred during improvement']
    };
  }
}

module.exports = {
  generateContent,
  generateHashtags,
  improveContent,
  platformConfigs
};
