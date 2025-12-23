const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'demo-key'
});

// Platform-specific configurations
const platformConfigs = {
  twitter: { maxLength: 280, name: 'Twitter/X', style: 'concise, punchy, conversational' },
  linkedin: { maxLength: 3000, name: 'LinkedIn', style: 'professional, insightful, value-driven' },
  facebook: { maxLength: 63206, name: 'Facebook', style: 'engaging, conversational, community-focused' },
  instagram: { maxLength: 2200, name: 'Instagram', style: 'visual-first, trendy, emoji-friendly' },
  general: { maxLength: 1000, name: 'General', style: 'versatile and adaptable' }
};

// Tone descriptions
const toneDescriptions = {
  professional: 'formal, authoritative, and business-appropriate',
  casual: 'friendly, relaxed, and approachable',
  humorous: 'witty, fun, and entertaining',
  inspirational: 'motivating, uplifting, and encouraging',
  educational: 'informative, clear, and instructive',
  promotional: 'persuasive, exciting, and action-oriented'
};

// Generate text content
async function generateContent(options) {
  const {
    topic, platform = 'general', tone = 'professional', length = 'medium',
    includeHashtags = true, includeEmoji = false, customInstructions = '', brandContext = {}
  } = options;

  const platformConfig = platformConfigs[platform] || platformConfigs.general;
  const toneDesc = toneDescriptions[tone] || toneDescriptions.professional;

  const systemPrompt = `You are an expert social media content creator for ${platformConfig.name}.
Style: ${platformConfig.style}. Tone: ${toneDesc}.
${brandContext.brand_name ? `Brand: ${brandContext.brand_name}` : ''}
${brandContext.industry ? `Industry: ${brandContext.industry}` : ''}
${brandContext.target_audience ? `Audience: ${brandContext.target_audience}` : ''}
Keep under ${platformConfig.maxLength} chars. ${includeHashtags ? 'Include hashtags.' : ''} ${includeEmoji ? 'Use emojis.' : ''}
${customInstructions}`;

  const lengthGuide = { short: '1-2 sentences', medium: '2-4 sentences', long: '4-6 sentences' };

  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'demo-key') {
      return generateDemoContent(topic, platform, includeHashtags, includeEmoji);
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Create a ${platform} post about: ${topic}. Length: ${lengthGuide[length]}` }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const content = response.choices[0].message.content;
    return {
      content,
      hashtags: content.match(/#\w+/g) || [],
      model: 'gpt-4',
      tokensUsed: response.usage?.total_tokens || 0
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    return generateDemoContent(topic, platform, includeHashtags, includeEmoji);
  }
}

// ============================================
// AI IMAGE GENERATION (DALL-E 3)
// ============================================
async function generateImage(options) {
  const { topic, style = 'professional', platform = 'general', brandName = '', industry = '' } = options;

  const stylePrompts = {
    professional: 'professional corporate design, clean modern aesthetic, high-quality',
    creative: 'creative artistic design, vibrant colors, unique eye-catching composition',
    minimal: 'minimalist design, clean lines, elegant simplicity, white space',
    bold: 'bold impactful design, strong colors, high contrast',
    tech: 'futuristic technology aesthetic, digital cyber style, neon accents, modern',
    cybersecurity: 'cybersecurity theme, digital locks and shields, blue-green matrix style, dark background with glowing elements, futuristic protection imagery'
  };

  // Auto-detect cybersecurity topics
  const isCyber = /cyber|security|hack|protect|firewall|encrypt|threat|malware|phishing/i.test(topic + ' ' + industry);
  const selectedStyle = isCyber ? 'cybersecurity' : (stylePrompts[style] ? style : 'professional');

  const imagePrompt = `Create a professional social media marketing graphic.
Topic: ${topic}
Style: ${stylePrompts[selectedStyle]}
${brandName ? `Brand: ${brandName}` : ''}
${industry ? `Industry: ${industry}` : ''}
Requirements: High quality, visually striking, NO TEXT in image, clean composition, engaging visual for social media.`;

  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'demo-key') {
      return generateDemoImage(topic, style, industry);
    }

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: imagePrompt,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
      style: 'vivid'
    });

    return {
      success: true,
      imageUrl: response.data[0].url,
      revisedPrompt: response.data[0].revised_prompt,
      model: 'dall-e-3'
    };
  } catch (error) {
    console.error('Image generation error:', error);
    return generateDemoImage(topic, style, industry);
  }
}

// Demo image (when no API key)
function generateDemoImage(topic, style, industry) {
  const images = {
    cybersecurity: [
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1024&h=1024&fit=crop',
      'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1024&h=1024&fit=crop',
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1024&h=1024&fit=crop'
    ],
    technology: [
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1024&h=1024&fit=crop',
      'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1024&h=1024&fit=crop'
    ],
    business: [
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1024&h=1024&fit=crop',
      'https://images.unsplash.com/photo-1553484771-371a605b060b?w=1024&h=1024&fit=crop'
    ],
    default: [
      'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1024&h=1024&fit=crop'
    ]
  };

  const topicLower = (topic + ' ' + (industry || '')).toLowerCase();
  let category = 'default';
  if (/cyber|security|hack|protect/.test(topicLower)) category = 'cybersecurity';
  else if (/tech|software|digital|computer/.test(topicLower)) category = 'technology';
  else if (/business|corporate|office|company/.test(topicLower)) category = 'business';

  const categoryImages = images[category];
  return {
    success: true,
    imageUrl: categoryImages[Math.floor(Math.random() * categoryImages.length)],
    model: 'demo',
    note: 'Add OPENAI_API_KEY for custom AI images with DALL-E 3'
  };
}

// ============================================
// COMPLETE POST (Text + Image)
// ============================================
async function generateCompletePost(options) {
  const { topic, platform, tone, includeImage = true, imageStyle = 'professional', brandContext = {} } = options;

  const textResult = await generateContent({
    topic, platform, tone, includeHashtags: true, includeEmoji: true, brandContext
  });

  let result = { ...textResult };

  if (includeImage) {
    result.image = await generateImage({
      topic, style: imageStyle, platform,
      brandName: brandContext?.brand_name,
      industry: brandContext?.industry
    });
  }

  return result;
}

// Demo content generator
function generateDemoContent(topic, platform, includeHashtags, includeEmoji) {
  const emoji = includeEmoji ? '🚀 ' : '';
  const templates = {
    twitter: `${emoji}${topic} is changing everything! Here's what you need to know... Thread 🧵`,
    linkedin: `${emoji}I've been analyzing ${topic} and here's what I've learned:\n\n• Innovation drives growth\n• Adaptation is essential\n• Data informs decisions\n\nWhat's your perspective on ${topic}?`,
    facebook: `${emoji}Hey everyone! Let's talk about ${topic}!\n\nWe've got some exciting insights to share. Drop your thoughts below! ⬇️`,
    instagram: `✨ ${topic} ✨\n\n${emoji}This changes everything.\n\nDouble tap if you agree! ❤️`,
    general: `${emoji}Exploring ${topic} - here's what matters most for success in this space.`
  };

  const content = templates[platform] || templates.general;
  const hashtags = includeHashtags ? ['#Innovation', '#Business', '#Growth', '#Tech', '#Trending'] : [];
  
  return {
    content: includeHashtags ? `${content}\n\n${hashtags.join(' ')}` : content,
    hashtags,
    model: 'demo',
    tokensUsed: 0
  };
}

// Generate hashtags
async function generateHashtags(content, platform = 'general', count = 10) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'demo-key') {
    return ['#Tech', '#Innovation', '#Business', '#Growth', '#Success', '#Digital', '#Trending'];
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: `Generate ${count} relevant hashtags for ${platform}. Return only hashtags.` },
        { role: 'user', content }
      ],
      max_tokens: 100
    });
    return response.choices[0].message.content.match(/#\w+/g) || [];
  } catch (error) {
    return ['#Tech', '#Innovation', '#Business', '#Growth', '#Success'];
  }
}

// Improve content
async function improveContent(content, improvements = [], platform = 'general') {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'demo-key') {
    return { content: content + '\n\n✨ [Add API key for AI improvements]', changes: ['Demo mode'] };
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: `Improve this ${platform} content. Make it more engaging and effective.` },
        { role: 'user', content }
      ],
      max_tokens: 500
    });
    return { content: response.choices[0].message.content, changes: improvements };
  } catch (error) {
    return { content, changes: ['Error occurred'] };
  }
}

module.exports = {
  generateContent,
  generateImage,
  generateCompletePost,
  generateHashtags,
  improveContent,
  platformConfigs
};
