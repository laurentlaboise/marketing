const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');
const RateLimit = require('express-rate-limit');

const router = express.Router();
router.use(ensureAuthenticated);

const socialRateLimiter = RateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
});
router.use(socialRateLimiter);

// Platform definitions with metadata
const PLATFORMS = [
  { id: 'Facebook', icon: 'fab fa-facebook', color: '#1877f2', charLimit: 63206, hashtagLimit: 30 },
  { id: 'Instagram', icon: 'fab fa-instagram', color: '#e4405f', charLimit: 2200, hashtagLimit: 30 },
  { id: 'Twitter/X', icon: 'fab fa-x-twitter', color: '#000000', charLimit: 280, hashtagLimit: 5 },
  { id: 'LinkedIn', icon: 'fab fa-linkedin', color: '#0a66c2', charLimit: 3000, hashtagLimit: 10 },
  { id: 'TikTok', icon: 'fab fa-tiktok', color: '#000000', charLimit: 2200, hashtagLimit: 20 },
  { id: 'YouTube', icon: 'fab fa-youtube', color: '#ff0000', charLimit: 5000, hashtagLimit: 15 },
  { id: 'Pinterest', icon: 'fab fa-pinterest', color: '#e60023', charLimit: 500, hashtagLimit: 20 },
  { id: 'Google Business', icon: 'fab fa-google', color: '#4285f4', charLimit: 1500, hashtagLimit: 0 },
  { id: 'Threads', icon: 'fas fa-at', color: '#000000', charLimit: 500, hashtagLimit: 10 },
  { id: 'Snapchat', icon: 'fab fa-snapchat', color: '#fffc00', charLimit: 250, hashtagLimit: 0 },
];

const CONTENT_TYPES = [
  { id: 'text', label: 'Text Post', icon: 'fas fa-align-left' },
  { id: 'image', label: 'Image Post', icon: 'fas fa-image' },
  { id: 'video', label: 'Video Post', icon: 'fas fa-video' },
  { id: 'carousel', label: 'Carousel', icon: 'fas fa-images' },
  { id: 'story', label: 'Story', icon: 'fas fa-mobile-alt' },
  { id: 'reel', label: 'Reel/Short', icon: 'fas fa-film' },
  { id: 'article', label: 'Article/Blog', icon: 'fas fa-newspaper' },
  { id: 'poll', label: 'Poll', icon: 'fas fa-poll' },
  { id: 'live', label: 'Live Stream', icon: 'fas fa-broadcast-tower' },
  { id: 'link', label: 'Link Share', icon: 'fas fa-link' },
];

const CAMPAIGN_OBJECTIVES = [
  'Brand Awareness', 'Reach', 'Traffic', 'Engagement', 'Lead Generation',
  'Conversions', 'App Installs', 'Video Views', 'Store Visits', 'Community Growth',
];

const LABEL_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Gray', value: '#6b7280' },
];

// ==================== CONTENT HUB ====================

const SERVICES = [
  { id: 'content-creation', title: 'Content Creation', excerpt: 'Professional content creation services including blog posts, articles, and copywriting for your business.', slug: 'content-creation' },
  { id: 'web-development', title: 'Web Development', excerpt: 'Custom web development services from landing pages to full-scale business websites.', slug: 'web-development' },
  { id: 'social-media-management', title: 'Social Media Management', excerpt: 'End-to-end social media management to grow your brand presence across all platforms.', slug: 'social-media-management' },
  { id: 'business-tools', title: 'Business Tools', excerpt: 'AI-powered business tools and automation solutions to streamline your operations.', slug: 'business-tools' },
];

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'lo', name: 'Lao', native: 'ພາສາລາວ' },
  { code: 'th', name: 'Thai', native: 'ภาษาไทย' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'km', name: 'Khmer', native: 'ខ្មែរ' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
];

const SOURCE_URL_MAP = {
  article: '/en/articles/',
  glossary: '/en/resources/glossary/',
  ai_tool: '/en/resources/ai-tools/',
  guide: '/en/resources/guides/',
  service: '/en/digital-marketing-services/',
};

router.get('/content-hub', async (req, res) => {
  try {
    const [articles, glossary, aiTools, guides, postCounts] = await Promise.all([
      db.query("SELECT id, title, slug, excerpt, category, featured_image, created_at FROM articles WHERE status = 'published' ORDER BY created_at DESC"),
      db.query("SELECT id, term, slug, definition, category, featured_image, created_at FROM glossary ORDER BY term ASC"),
      db.query("SELECT id, name, description, category, logo_url, created_at FROM ai_tools WHERE status = 'active' ORDER BY name ASC"),
      db.query("SELECT id, title, slug, short_description, category, image_url, created_at FROM guides WHERE status = 'published' ORDER BY created_at DESC"),
      db.query("SELECT source_type, source_id, COUNT(*) as cnt FROM social_posts WHERE source_id IS NOT NULL GROUP BY source_type, source_id"),
    ]);

    // Build post count lookup
    const postCountMap = {};
    postCounts.rows.forEach(function(r) { postCountMap[r.source_id] = parseInt(r.cnt); });

    // Normalize all content into a unified array
    const content = [];

    articles.rows.forEach(function(a) {
      content.push({ id: a.id, type: 'article', type_label: 'Article', title: a.title, excerpt: a.excerpt || '', slug: a.slug, date: a.created_at, image: a.featured_image, post_count: postCountMap[a.id] || 0 });
    });
    glossary.rows.forEach(function(g) {
      content.push({ id: g.id, type: 'glossary', type_label: 'Glossary', title: g.term, excerpt: g.definition ? g.definition.substring(0, 200) : '', slug: g.slug, date: g.created_at, image: g.featured_image, post_count: postCountMap[g.id] || 0 });
    });
    aiTools.rows.forEach(function(t) {
      content.push({ id: t.id, type: 'ai_tool', type_label: 'AI Tool', title: t.name, excerpt: t.description ? t.description.substring(0, 200) : '', slug: null, date: t.created_at, image: t.logo_url, post_count: postCountMap[t.id] || 0 });
    });
    guides.rows.forEach(function(g) {
      content.push({ id: g.id, type: 'guide', type_label: 'Guide', title: g.title, excerpt: g.short_description || '', slug: g.slug, date: g.created_at, image: g.image_url, post_count: postCountMap[g.id] || 0 });
    });
    SERVICES.forEach(function(s) {
      content.push({ id: s.id, type: 'service', type_label: 'Service', title: s.title, excerpt: s.excerpt, slug: s.slug, date: null, image: null, post_count: 0 });
    });

    const stats = {
      total: content.length,
      articles: articles.rows.length,
      glossary: glossary.rows.length,
      ai_tools: aiTools.rows.length,
      guides: guides.rows.length,
      services: SERVICES.length,
    };

    res.render('social/content-hub', {
      title: 'Content Hub - WTS Admin',
      content,
      stats,
      currentPage: 'content-hub',
    });
  } catch (error) {
    console.error('Content Hub error:', error);
    res.render('social/content-hub', {
      title: 'Content Hub - WTS Admin',
      content: [],
      stats: { total: 0, articles: 0, glossary: 0, ai_tools: 0, guides: 0, services: 0 },
      currentPage: 'content-hub',
      error: 'Failed to load content',
    });
  }
});

// ==================== AI POST GENERATION ====================

// AI Provider API call wrappers
async function callClaude(modelId, systemPrompt, userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: modelId, max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
  });
  if (!resp.ok) { const err = await resp.text(); throw new Error('Claude API error: ' + err); }
  const data = await resp.json();
  return data.content[0].text;
}

async function callDeepSeek(userPrompt, systemPrompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 1024 }),
  });
  if (!resp.ok) { const err = await resp.text(); throw new Error('DeepSeek API error: ' + err); }
  const data = await resp.json();
  return data.choices[0].message.content;
}

async function callGemini(userPrompt, systemPrompt) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GEMINI_API_KEY not configured');

  const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ parts: [{ text: userPrompt }] }], generationConfig: { maxOutputTokens: 1024 } }),
  });
  if (!resp.ok) { const err = await resp.text(); throw new Error('Gemini API error: ' + err); }
  const data = await resp.json();
  return data.candidates[0].content.parts[0].text;
}

async function callPerplexity(userPrompt, systemPrompt) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY not configured');

  const resp = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model: 'sonar', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 1024 }),
  });
  if (!resp.ok) { const err = await resp.text(); throw new Error('Perplexity API error: ' + err); }
  const data = await resp.json();
  return data.choices[0].message.content;
}

// Auto-select best AI for the task
function autoSelectProvider(platforms, language, contentType) {
  if (language && language !== 'en') return 'gemini';
  const hasTwitterOnly = platforms.length === 1 && platforms[0] === 'Twitter/X';
  if (hasTwitterOnly) return 'deepseek';
  if (contentType === 'article' || platforms.includes('LinkedIn')) return 'claude_haiku';
  return 'deepseek';
}

// Fetch source content from DB
async function fetchSourceContent(sourceType, sourceId) {
  let result;
  switch (sourceType) {
    case 'article':
      result = await db.query('SELECT id, title, slug, excerpt, content, category, seo_keywords, featured_image FROM articles WHERE id = $1', [sourceId]);
      if (result.rows.length === 0) return null;
      return { ...result.rows[0], url: 'https://wordsthatsells.website' + SOURCE_URL_MAP.article + result.rows[0].slug };
    case 'glossary':
      result = await db.query('SELECT id, term AS title, slug, definition, category, related_terms, bullets, featured_image FROM glossary WHERE id = $1', [sourceId]);
      if (result.rows.length === 0) return null;
      return { ...result.rows[0], excerpt: result.rows[0].definition, url: 'https://wordsthatsells.website' + SOURCE_URL_MAP.glossary + result.rows[0].slug };
    case 'ai_tool':
      result = await db.query('SELECT id, name AS title, description, category, website_url, pricing_model, features, pros, cons, rating, logo_url FROM ai_tools WHERE id = $1', [sourceId]);
      if (result.rows.length === 0) return null;
      return { ...result.rows[0], excerpt: result.rows[0].description, url: 'https://wordsthatsells.website/en/resources/ai-tools/' };
    case 'guide':
      result = await db.query('SELECT id, title, slug, short_description, category, image_url FROM guides WHERE id = $1', [sourceId]);
      if (result.rows.length === 0) return null;
      return { ...result.rows[0], excerpt: result.rows[0].short_description, url: 'https://wordsthatsells.website' + SOURCE_URL_MAP.guide + result.rows[0].slug };
    case 'service':
      const service = SERVICES.find(s => s.id === sourceId);
      if (!service) return null;
      return { id: service.id, title: service.title, excerpt: service.excerpt, slug: service.slug, url: 'https://wordsthatsells.website' + SOURCE_URL_MAP.service + service.slug };
    default:
      return null;
  }
}

router.post('/generate-post', async (req, res) => {
  try {
    const { source_type, source_id, platforms, tone, style, cta, language, ai_provider, custom_prompt } = req.body;

    // Fetch source content
    let sourceContent = null;
    if (source_type && source_id) {
      sourceContent = await fetchSourceContent(source_type, source_id);
    }

    // Select AI provider
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : ['Twitter/X']);
    const provider = ai_provider === 'auto' ? autoSelectProvider(platformsArray, language, source_type) : ai_provider;

    // Build platform context
    const platformInfo = platformsArray.map(function(p) {
      const pDef = PLATFORMS.find(x => x.id === p);
      return pDef ? p + ' (' + pDef.charLimit + ' chars, ' + pDef.hashtagLimit + ' hashtags max)' : p;
    }).join(', ');

    // Build system prompt
    const systemPrompt = `You are a social media copywriter for Words That Sells, a digital marketing agency based in Laos specializing in SEO, AI-powered marketing, and content creation for Southeast Asian markets.

Generate exactly 3 variations of a social media post. Each should take a DIFFERENT angle.

RULES:
- Tone: ${tone || 'professional'}
- Style: ${style || 'key takeaway'}
- Call to action: ${cta || 'Read more'}
- Target platforms: ${platformInfo}
- Language: ${language === 'en' ? 'English' : language}
- Keep each post within the platform character limits
- Include 3-5 relevant hashtags per variation
- DO NOT use emojis unless the tone is "casual"
- Each variation must take a different angle/hook

Return ONLY valid JSON in this exact format, no other text:
{"variations":[{"text":"post text here","hashtags":["#Tag1","#Tag2"]},{"text":"second variation","hashtags":["#Tag1","#Tag3"]},{"text":"third variation","hashtags":["#Tag2","#Tag4"]}]}`;

    // Build user prompt
    let userPrompt;
    if (custom_prompt) {
      userPrompt = custom_prompt;
      if (sourceContent) {
        userPrompt += '\n\nContent to promote:\nTitle: ' + sourceContent.title + '\nSummary: ' + (sourceContent.excerpt || '').substring(0, 500) + '\nURL: ' + sourceContent.url;
      }
    } else if (sourceContent) {
      userPrompt = 'Create 3 social media post variations promoting this content:\n\n';
      userPrompt += 'CONTENT TYPE: ' + source_type + '\n';
      userPrompt += 'TITLE: ' + sourceContent.title + '\n';
      if (sourceContent.excerpt) userPrompt += 'SUMMARY: ' + sourceContent.excerpt.substring(0, 500) + '\n';
      if (sourceContent.category) userPrompt += 'CATEGORY: ' + sourceContent.category + '\n';
      if (sourceContent.url) userPrompt += 'URL: ' + sourceContent.url + '\n';
    } else {
      userPrompt = 'Create 3 engaging social media post variations for a digital marketing agency. Topic: general engagement and brand awareness.';
    }

    // Call AI
    let rawResponse;
    switch (provider) {
      case 'claude_haiku':
        rawResponse = await callClaude('claude-haiku-4-5-20251001', systemPrompt, userPrompt);
        break;
      case 'claude_sonnet':
        rawResponse = await callClaude('claude-sonnet-4-5-20250929', systemPrompt, userPrompt);
        break;
      case 'gemini':
        rawResponse = await callGemini(userPrompt, systemPrompt);
        break;
      case 'perplexity':
        rawResponse = await callPerplexity(userPrompt, systemPrompt);
        break;
      case 'deepseek':
      default:
        rawResponse = await callDeepSeek(userPrompt, systemPrompt);
        break;
    }

    // Parse JSON from response (handle markdown code fences)
    let jsonStr = rawResponse;
    const fenceMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1];
    jsonStr = jsonStr.trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      // Try to find JSON object in the response
      const jsonMatch = jsonStr.match(/\{[\s\S]*"variations"[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    res.json({
      success: true,
      provider: provider,
      variations: parsed.variations || [],
      prompt_used: systemPrompt + '\n\n' + userPrompt,
      source: sourceContent ? { title: sourceContent.title, url: sourceContent.url, type: source_type } : null,
    });
  } catch (error) {
    console.error('AI generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== TRANSLATE POST ====================

router.post('/translate-post', async (req, res) => {
  try {
    const { text, target_language, tone } = req.body;

    const langName = LANGUAGES.find(l => l.code === target_language);
    if (!langName) return res.status(400).json({ success: false, error: 'Unsupported language' });

    const systemPrompt = 'You are a professional social media translator. Translate the following social media post accurately while maintaining the original tone and intent. Preserve all hashtags in English. Adapt cultural references where appropriate.';
    const userPrompt = `Translate this social media post to ${langName.name} (${langName.native}). Tone: ${tone || 'professional'}.\n\nPost:\n${text}\n\nReturn ONLY the translated text, nothing else.`;

    // Use Gemini for translations (free tier, best multilingual)
    let translated;
    if (process.env.GOOGLE_GEMINI_API_KEY) {
      translated = await callGemini(userPrompt, systemPrompt);
    } else if (process.env.DEEPSEEK_API_KEY) {
      translated = await callDeepSeek(userPrompt, systemPrompt);
    } else if (process.env.ANTHROPIC_API_KEY) {
      translated = await callClaude('claude-haiku-4-5-20251001', systemPrompt, userPrompt);
    } else {
      return res.status(500).json({ success: false, error: 'No AI provider configured for translation' });
    }

    res.json({ success: true, translated_text: translated.trim(), language: target_language });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ANALYTICS PLACEHOLDER ====================

router.get('/analytics', async (req, res) => {
  try {
    const [postsResult, campaignsResult] = await Promise.all([
      db.query(`SELECT source_type, COUNT(*) as count, SUM(COALESCE(bitly_clicks, 0)) as clicks FROM social_posts WHERE status = 'published' GROUP BY source_type`),
      db.query("SELECT sp.platforms, COUNT(*) as count FROM social_posts sp WHERE sp.status = 'published' GROUP BY sp.platforms"),
    ]);
    res.render('social/analytics', {
      title: 'Social Analytics - WTS Admin',
      currentPage: 'social-analytics',
      contentStats: postsResult.rows,
      platformStats: campaignsResult.rows,
    });
  } catch (error) {
    res.render('social/analytics', {
      title: 'Social Analytics - WTS Admin',
      currentPage: 'social-analytics',
      contentStats: [],
      platformStats: [],
      error: 'Failed to load analytics',
    });
  }
});

// ==================== CONTENT HUB API (for modal selector) ====================

router.get('/content-hub/api/content', async (req, res) => {
  try {
    const type = req.query.type || 'all';
    const search = req.query.search || '';
    const results = [];

    if (type === 'all' || type === 'article') {
      let q = "SELECT id, title, slug, excerpt, created_at FROM articles WHERE status = 'published'";
      const params = [];
      if (search) { q += " AND (title ILIKE $1 OR excerpt ILIKE $1)"; params.push('%' + search + '%'); }
      q += " ORDER BY created_at DESC LIMIT 50";
      const r = await db.query(q, params);
      r.rows.forEach(row => results.push({ ...row, type: 'article', type_label: 'Article' }));
    }
    if (type === 'all' || type === 'glossary') {
      let q = "SELECT id, term AS title, slug, definition AS excerpt, created_at FROM glossary";
      const params = [];
      if (search) { q += " WHERE term ILIKE $1 OR definition ILIKE $1"; params.push('%' + search + '%'); }
      q += " ORDER BY term ASC LIMIT 50";
      const r = await db.query(q, params);
      r.rows.forEach(row => results.push({ ...row, type: 'glossary', type_label: 'Glossary', excerpt: (row.excerpt || '').substring(0, 200) }));
    }
    if (type === 'all' || type === 'ai_tool') {
      let q = "SELECT id, name AS title, description AS excerpt, created_at FROM ai_tools WHERE status = 'active'";
      const params = [];
      if (search) { q += " AND (name ILIKE $1 OR description ILIKE $1)"; params.push('%' + search + '%'); }
      q += " ORDER BY name ASC LIMIT 50";
      const r = await db.query(q, params);
      r.rows.forEach(row => results.push({ ...row, type: 'ai_tool', type_label: 'AI Tool', excerpt: (row.excerpt || '').substring(0, 200) }));
    }
    if (type === 'all' || type === 'guide') {
      let q = "SELECT id, title, slug, short_description AS excerpt, created_at FROM guides WHERE status = 'published'";
      const params = [];
      if (search) { q += " AND (title ILIKE $1 OR short_description ILIKE $1)"; params.push('%' + search + '%'); }
      q += " ORDER BY created_at DESC LIMIT 50";
      const r = await db.query(q, params);
      r.rows.forEach(row => results.push({ ...row, type: 'guide', type_label: 'Guide' }));
    }
    if (type === 'all' || type === 'service') {
      SERVICES.forEach(s => {
        if (!search || s.title.toLowerCase().includes(search.toLowerCase())) {
          results.push({ id: s.id, type: 'service', type_label: 'Service', title: s.title, excerpt: s.excerpt, slug: s.slug });
        }
      });
    }

    res.json({ success: true, content: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CAMPAIGNS ====================

router.get('/campaigns', async (req, res) => {
  try {
    const status = req.query.status || '';
    let query = `
      SELECT sc.*,
        (SELECT COUNT(*) FROM social_posts sp WHERE sp.campaign_id = sc.id) as post_count
      FROM social_campaigns sc
    `;
    const params = [];
    if (status) {
      query += ' WHERE sc.status = $1';
      params.push(status);
    }
    query += ' ORDER BY sc.created_at DESC';

    const result = await db.query(query, params);
    res.render('social/campaigns/list', {
      title: 'Campaigns - WTS Admin',
      campaigns: result.rows,
      currentPage: 'social-campaigns',
      filter: { status },
    });
  } catch (error) {
    console.error('Campaigns list error:', error);
    res.render('social/campaigns/list', {
      title: 'Campaigns - WTS Admin',
      campaigns: [],
      currentPage: 'social-campaigns',
      filter: { status: '' },
      error: 'Failed to load campaigns',
    });
  }
});

router.get('/campaigns/new', (req, res) => {
  res.render('social/campaigns/form', {
    title: 'New Campaign - WTS Admin',
    campaign: null,
    currentPage: 'social-campaigns',
    objectives: CAMPAIGN_OBJECTIVES,
    labelColors: LABEL_COLORS,
    platforms: PLATFORMS,
  });
});

router.post('/campaigns', async (req, res) => {
  try {
    const {
      name, description, objective, status, labels, color,
      budget, budget_currency, start_date, end_date,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      targeting_age_min, targeting_age_max, targeting_gender, targeting_locations, targeting_languages, targeting_interests,
    } = req.body;

    const labelsArray = labels ? labels.split(',').map(l => l.trim()).filter(Boolean) : [];
    const targeting = {
      age_min: targeting_age_min || null, age_max: targeting_age_max || null,
      gender: targeting_gender || 'all',
      locations: targeting_locations ? targeting_locations.split(',').map(l => l.trim()).filter(Boolean) : [],
      languages: targeting_languages ? targeting_languages.split(',').map(l => l.trim()).filter(Boolean) : [],
      interests: targeting_interests ? targeting_interests.split(',').map(i => i.trim()).filter(Boolean) : [],
    };

    await db.query(
      `INSERT INTO social_campaigns (name, description, objective, status, labels, color, budget, budget_currency, start_date, end_date, utm_source, utm_medium, utm_campaign, utm_term, utm_content, targeting, author_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [name, description, objective, status || 'draft', labelsArray, color || '#667eea',
       budget || null, budget_currency || 'USD', start_date || null, end_date || null,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       JSON.stringify(targeting), req.user.id]
    );
    req.session.successMessage = 'Campaign created successfully';
    res.redirect('/social/campaigns');
  } catch (error) {
    console.error('Create campaign error:', error);
    req.session.errorMessage = 'Failed to create campaign';
    res.redirect('/social/campaigns/new');
  }
});

router.get('/campaigns/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_campaigns WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/social/campaigns');
    res.render('social/campaigns/form', {
      title: 'Edit Campaign - WTS Admin',
      campaign: result.rows[0],
      currentPage: 'social-campaigns',
      objectives: CAMPAIGN_OBJECTIVES,
      labelColors: LABEL_COLORS,
      platforms: PLATFORMS,
    });
  } catch (error) {
    res.redirect('/social/campaigns');
  }
});

router.post('/campaigns/:id', async (req, res) => {
  try {
    const {
      name, description, objective, status, labels, color,
      budget, budget_currency, start_date, end_date,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      targeting_age_min, targeting_age_max, targeting_gender, targeting_locations, targeting_languages, targeting_interests,
    } = req.body;

    const labelsArray = labels ? labels.split(',').map(l => l.trim()).filter(Boolean) : [];
    const targeting = {
      age_min: targeting_age_min || null, age_max: targeting_age_max || null,
      gender: targeting_gender || 'all',
      locations: targeting_locations ? targeting_locations.split(',').map(l => l.trim()).filter(Boolean) : [],
      languages: targeting_languages ? targeting_languages.split(',').map(l => l.trim()).filter(Boolean) : [],
      interests: targeting_interests ? targeting_interests.split(',').map(i => i.trim()).filter(Boolean) : [],
    };

    await db.query(
      `UPDATE social_campaigns SET name=$1, description=$2, objective=$3, status=$4, labels=$5, color=$6, budget=$7, budget_currency=$8, start_date=$9, end_date=$10, utm_source=$11, utm_medium=$12, utm_campaign=$13, utm_term=$14, utm_content=$15, targeting=$16, updated_at=CURRENT_TIMESTAMP WHERE id=$17`,
      [name, description, objective, status, labelsArray, color || '#667eea',
       budget || null, budget_currency || 'USD', start_date || null, end_date || null,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       JSON.stringify(targeting), req.params.id]
    );
    req.session.successMessage = 'Campaign updated';
    res.redirect('/social/campaigns');
  } catch (error) {
    req.session.errorMessage = 'Failed to update campaign';
    res.redirect('/social/campaigns/' + req.params.id + '/edit');
  }
});

router.post('/campaigns/:id/duplicate', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_campaigns WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/social/campaigns');
    const c = result.rows[0];
    await db.query(
      `INSERT INTO social_campaigns (name, description, objective, status, labels, color, budget, budget_currency, targeting, utm_source, utm_medium, utm_campaign, utm_term, utm_content, author_id)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [c.name + ' (Copy)', c.description, c.objective, c.labels, c.color, c.budget, c.budget_currency, JSON.stringify(c.targeting || {}), c.utm_source, c.utm_medium, c.utm_campaign, c.utm_term, c.utm_content, req.user.id]
    );
    req.session.successMessage = 'Campaign duplicated';
    res.redirect('/social/campaigns');
  } catch (error) {
    req.session.errorMessage = 'Failed to duplicate campaign';
    res.redirect('/social/campaigns');
  }
});

router.post('/campaigns/:id/delete', async (req, res) => {
  try {
    await db.query('UPDATE social_posts SET campaign_id = NULL WHERE campaign_id = $1', [req.params.id]);
    await db.query('DELETE FROM social_campaigns WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Campaign deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete campaign';
  }
  res.redirect('/social/campaigns');
});

// ==================== SOCIAL POSTS ====================

router.get('/posts', async (req, res) => {
  try {
    const status = req.query.status || '';
    const campaign = req.query.campaign || '';
    const contentType = req.query.content_type || '';
    const source = req.query.source || '';
    let query = `
      SELECT sp.*, u.first_name, u.last_name, sc.name as campaign_name, sc.color as campaign_color
      FROM social_posts sp
      LEFT JOIN users u ON sp.author_id = u.id
      LEFT JOIN social_campaigns sc ON sp.campaign_id = sc.id
    `;
    const params = [];
    const conditions = [];

    if (status) { conditions.push(`sp.status = $${params.length + 1}`); params.push(status); }
    if (campaign) { conditions.push(`sp.campaign_id = $${params.length + 1}`); params.push(campaign); }
    if (contentType) { conditions.push(`sp.content_type = $${params.length + 1}`); params.push(contentType); }
    if (source === 'standalone') { conditions.push(`sp.source_type IS NULL`); }
    else if (source) { conditions.push(`sp.source_type = $${params.length + 1}`); params.push(source); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY sp.created_at DESC';

    const [postsResult, campaignsResult] = await Promise.all([
      db.query(query, params),
      db.query("SELECT id, name, color FROM social_campaigns ORDER BY name ASC"),
    ]);

    res.render('social/posts/list', {
      title: 'Social Posts - WTS Admin',
      posts: postsResult.rows,
      campaigns: campaignsResult.rows,
      currentPage: 'social-posts',
      filter: { status, campaign, content_type: contentType, source },
      contentTypes: CONTENT_TYPES,
    });
  } catch (error) {
    console.error('Posts list error:', error);
    res.render('social/posts/list', {
      title: 'Social Posts - WTS Admin',
      posts: [], campaigns: [],
      currentPage: 'social-posts',
      filter: { status: '', campaign: '', content_type: '', source: '' },
      contentTypes: CONTENT_TYPES,
      error: 'Failed to load social posts',
    });
  }
});

router.get('/posts/new', async (req, res) => {
  try {
    const [channels, campaigns, hashtagSets, aiProviders] = await Promise.all([
      db.query("SELECT * FROM social_channels WHERE status = 'active' ORDER BY platform ASC"),
      db.query("SELECT id, name, color, utm_source, utm_medium, utm_campaign, utm_term, utm_content FROM social_campaigns WHERE status != 'completed' ORDER BY name ASC"),
      db.query("SELECT * FROM hashtag_sets ORDER BY name ASC"),
      db.query("SELECT * FROM ai_providers WHERE is_active = true ORDER BY cost_per_1m_input ASC"),
    ]);

    // Fetch source content if promoting from Content Hub
    let sourceData = null;
    if (req.query.source_type && req.query.source_id) {
      sourceData = await fetchSourceContent(req.query.source_type, req.query.source_id);
      if (sourceData) {
        sourceData.type = req.query.source_type;
      }
    }

    res.render('social/posts/form', {
      title: sourceData ? 'Promote: ' + sourceData.title + ' - WTS Admin' : 'New Social Post - WTS Admin',
      post: null,
      channels: channels.rows,
      campaigns: campaigns.rows,
      hashtagSets: hashtagSets.rows,
      aiProviders: aiProviders.rows,
      currentPage: 'social-posts',
      platforms: PLATFORMS,
      contentTypes: CONTENT_TYPES,
      languages: LANGUAGES,
      preselectedCampaign: req.query.campaign || null,
      sourceData,
    });
  } catch (error) {
    console.error('New post form error:', error);
    res.render('social/posts/form', {
      title: 'New Social Post - WTS Admin',
      post: null, channels: [], campaigns: [], hashtagSets: [], aiProviders: [],
      currentPage: 'social-posts', platforms: PLATFORMS, contentTypes: CONTENT_TYPES,
      languages: LANGUAGES, preselectedCampaign: null, sourceData: null,
      error: 'Failed to load form data',
    });
  }
});

router.post('/posts', async (req, res) => {
  try {
    const { content, platforms, scheduled_at, status, media_urls, campaign_id, content_type, hashtags, labels, notes, link_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content, targeting_age_min, targeting_age_max, targeting_gender, targeting_locations, targeting_interests, source_type, source_id, source_title, source_url, ai_provider, ai_generated, ai_prompt_used, language } = req.body;
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    const mediaArray = media_urls ? media_urls.split('\n').map(u => u.trim()).filter(u => u) : [];
    const hashtagsArray = hashtags ? hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean).map(h => '#' + h) : [];
    const labelsArray = labels ? labels.split(',').map(l => l.trim()).filter(Boolean) : [];
    const utmParams = { source: utm_source, medium: utm_medium, campaign: utm_campaign, term: utm_term, content: utm_content };
    const targeting = { age_min: targeting_age_min || null, age_max: targeting_age_max || null, gender: targeting_gender || 'all', locations: targeting_locations ? targeting_locations.split(',').map(l => l.trim()).filter(Boolean) : [], interests: targeting_interests ? targeting_interests.split(',').map(i => i.trim()).filter(Boolean) : [] };

    await db.query(
      `INSERT INTO social_posts (content, platforms, scheduled_at, status, media_urls, author_id, campaign_id, content_type, hashtags, labels, notes, link_url, utm_params, targeting, source_type, source_id, source_title, source_url, ai_provider, ai_generated, ai_prompt_used, language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [content, platformsArray, scheduled_at || null, status || 'draft', mediaArray, req.user.id, campaign_id || null, content_type || 'text', hashtagsArray, labelsArray, notes, link_url, JSON.stringify(utmParams), JSON.stringify(targeting),
       source_type || null, source_id || null, source_title || null, source_url || null, ai_provider || null, ai_generated === 'true' || ai_generated === true, ai_prompt_used || null, language || 'en']
    );
    req.session.successMessage = 'Post created';
    res.redirect('/social/posts');
  } catch (error) {
    console.error('Create post error:', error);
    req.session.errorMessage = 'Failed to create post: ' + error.message;
    res.redirect('/social/posts/new');
  }
});

router.get('/posts/:id/edit', async (req, res) => {
  try {
    const [postResult, channels, campaigns, hashtagSets, aiProviders] = await Promise.all([
      db.query('SELECT * FROM social_posts WHERE id = $1', [req.params.id]),
      db.query("SELECT * FROM social_channels WHERE status = 'active' ORDER BY platform ASC"),
      db.query("SELECT id, name, color, utm_source, utm_medium, utm_campaign, utm_term, utm_content FROM social_campaigns WHERE status != 'completed' ORDER BY name ASC"),
      db.query("SELECT * FROM hashtag_sets ORDER BY name ASC"),
      db.query("SELECT * FROM ai_providers WHERE is_active = true ORDER BY cost_per_1m_input ASC"),
    ]);
    if (postResult.rows.length === 0) return res.redirect('/social/posts');
    const post = postResult.rows[0];

    // Reconstruct source data from post if it has source info
    let sourceData = null;
    if (post.source_type && post.source_id) {
      sourceData = await fetchSourceContent(post.source_type, post.source_id);
      if (sourceData) sourceData.type = post.source_type;
    }

    res.render('social/posts/form', {
      title: 'Edit Post - WTS Admin',
      post,
      channels: channels.rows, campaigns: campaigns.rows, hashtagSets: hashtagSets.rows,
      aiProviders: aiProviders.rows,
      currentPage: 'social-posts', platforms: PLATFORMS, contentTypes: CONTENT_TYPES,
      languages: LANGUAGES, preselectedCampaign: null, sourceData,
    });
  } catch (error) {
    res.redirect('/social/posts');
  }
});

router.post('/posts/:id', async (req, res) => {
  try {
    const { content, platforms, scheduled_at, status, media_urls, campaign_id, content_type, hashtags, labels, notes, link_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content, targeting_age_min, targeting_age_max, targeting_gender, targeting_locations, targeting_interests, source_type, source_id, source_title, source_url, ai_provider, ai_generated, ai_prompt_used, language } = req.body;
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    const mediaArray = media_urls ? media_urls.split('\n').map(u => u.trim()).filter(u => u) : [];
    const hashtagsArray = hashtags ? hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean).map(h => '#' + h) : [];
    const labelsArray = labels ? labels.split(',').map(l => l.trim()).filter(Boolean) : [];
    const utmParams = { source: utm_source, medium: utm_medium, campaign: utm_campaign, term: utm_term, content: utm_content };
    const targeting = { age_min: targeting_age_min || null, age_max: targeting_age_max || null, gender: targeting_gender || 'all', locations: targeting_locations ? targeting_locations.split(',').map(l => l.trim()).filter(Boolean) : [], interests: targeting_interests ? targeting_interests.split(',').map(i => i.trim()).filter(Boolean) : [] };

    await db.query(
      `UPDATE social_posts SET content=$1, platforms=$2, scheduled_at=$3, status=$4::VARCHAR, media_urls=$5, campaign_id=$6, content_type=$7, hashtags=$8, labels=$9, notes=$10, link_url=$11, utm_params=$12, targeting=$13, updated_at=CURRENT_TIMESTAMP,
       source_type=$15, source_id=$16, source_title=$17, source_url=$18, ai_provider=$19, ai_generated=$20, ai_prompt_used=$21, language=$22,
       published_at = CASE WHEN $4::VARCHAR = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END WHERE id=$14`,
      [content, platformsArray, scheduled_at || null, status, mediaArray, campaign_id || null, content_type || 'text', hashtagsArray, labelsArray, notes, link_url, JSON.stringify(utmParams), JSON.stringify(targeting), req.params.id,
       source_type || null, source_id || null, source_title || null, source_url || null, ai_provider || null, ai_generated === 'true' || ai_generated === true, ai_prompt_used || null, language || 'en']
    );
    req.session.successMessage = 'Post updated';
    res.redirect('/social/posts');
  } catch (error) {
    req.session.errorMessage = 'Failed to update post';
    res.redirect('/social/posts/' + req.params.id + '/edit');
  }
});

router.post('/posts/:id/clone', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_posts WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/social/posts');
    const p = result.rows[0];
    await db.query(
      `INSERT INTO social_posts (content, platforms, status, media_urls, author_id, campaign_id, content_type, hashtags, labels, notes, link_url, utm_params, targeting, source_type, source_id, source_title, source_url, ai_provider, ai_generated, language)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [p.content, p.platforms, p.media_urls, req.user.id, p.campaign_id, p.content_type, p.hashtags, p.labels, p.notes, p.link_url, JSON.stringify(p.utm_params || {}), JSON.stringify(p.targeting || {}),
       p.source_type, p.source_id, p.source_title, p.source_url, p.ai_provider, p.ai_generated || false, p.language || 'en']
    );
    req.session.successMessage = 'Post cloned as draft';
    res.redirect('/social/posts');
  } catch (error) {
    req.session.errorMessage = 'Failed to clone post';
    res.redirect('/social/posts');
  }
});

router.post('/posts/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM social_posts WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Post deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete post';
  }
  res.redirect('/social/posts');
});

// ==================== SOCIAL CHANNELS ====================

router.get('/channels', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_channels ORDER BY platform ASC');
    res.render('social/channels/list', {
      title: 'Social Channels - WTS Admin',
      channels: result.rows,
      currentPage: 'social-channels',
    });
  } catch (error) {
    res.render('social/channels/list', { title: 'Social Channels - WTS Admin', channels: [], currentPage: 'social-channels', error: 'Failed to load channels' });
  }
});

router.get('/channels/new', (req, res) => {
  res.render('social/channels/form', { title: 'New Channel - WTS Admin', channel: null, currentPage: 'social-channels', platformOptions: PLATFORMS });
});

router.post('/channels', async (req, res) => {
  try {
    const { platform, account_name, account_id, status } = req.body;
    await db.query('INSERT INTO social_channels (platform, account_name, account_id, status) VALUES ($1,$2,$3,$4)', [platform, account_name, account_id, status || 'active']);
    req.session.successMessage = 'Channel added';
    res.redirect('/social/channels');
  } catch (error) {
    res.render('social/channels/form', { title: 'New Channel - WTS Admin', channel: req.body, currentPage: 'social-channels', platformOptions: PLATFORMS, error: 'Failed to create channel' });
  }
});

router.get('/channels/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_channels WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/social/channels');
    res.render('social/channels/form', { title: 'Edit Channel - WTS Admin', channel: result.rows[0], currentPage: 'social-channels', platformOptions: PLATFORMS });
  } catch (error) {
    res.redirect('/social/channels');
  }
});

router.post('/channels/:id', async (req, res) => {
  try {
    const { platform, account_name, account_id, status } = req.body;
    await db.query('UPDATE social_channels SET platform=$1, account_name=$2, account_id=$3, status=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5', [platform, account_name, account_id, status, req.params.id]);
    req.session.successMessage = 'Channel updated';
    res.redirect('/social/channels');
  } catch (error) {
    req.session.errorMessage = 'Failed to update channel';
    res.redirect('/social/channels/' + req.params.id + '/edit');
  }
});

router.post('/channels/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM social_channels WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Channel deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete channel';
  }
  res.redirect('/social/channels');
});

// ==================== HASHTAG SETS ====================

router.get('/hashtags', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM hashtag_sets ORDER BY name ASC');
    res.render('social/hashtags/list', { title: 'Hashtag Manager - WTS Admin', hashtagSets: result.rows, currentPage: 'social-hashtags' });
  } catch (error) {
    res.render('social/hashtags/list', { title: 'Hashtag Manager - WTS Admin', hashtagSets: [], currentPage: 'social-hashtags', error: 'Failed to load hashtag sets' });
  }
});

router.get('/hashtags/new', (req, res) => {
  res.render('social/hashtags/form', { title: 'New Hashtag Set - WTS Admin', hashtagSet: null, currentPage: 'social-hashtags', platforms: PLATFORMS });
});

router.post('/hashtags', async (req, res) => {
  try {
    const { name, description, hashtags, category, platforms } = req.body;
    const hashtagsArray = hashtags ? hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean).map(h => '#' + h) : [];
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    await db.query('INSERT INTO hashtag_sets (name, description, hashtags, category, platforms) VALUES ($1,$2,$3,$4,$5)', [name, description, hashtagsArray, category, platformsArray]);
    req.session.successMessage = 'Hashtag set created';
    res.redirect('/social/hashtags');
  } catch (error) {
    req.session.errorMessage = 'Failed to create hashtag set';
    res.redirect('/social/hashtags/new');
  }
});

router.get('/hashtags/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM hashtag_sets WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/social/hashtags');
    res.render('social/hashtags/form', { title: 'Edit Hashtag Set - WTS Admin', hashtagSet: result.rows[0], currentPage: 'social-hashtags', platforms: PLATFORMS });
  } catch (error) {
    res.redirect('/social/hashtags');
  }
});

router.post('/hashtags/:id', async (req, res) => {
  try {
    const { name, description, hashtags, category, platforms } = req.body;
    const hashtagsArray = hashtags ? hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean).map(h => '#' + h) : [];
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    await db.query('UPDATE hashtag_sets SET name=$1, description=$2, hashtags=$3, category=$4, platforms=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6', [name, description, hashtagsArray, category, platformsArray, req.params.id]);
    req.session.successMessage = 'Hashtag set updated';
    res.redirect('/social/hashtags');
  } catch (error) {
    req.session.errorMessage = 'Failed to update hashtag set';
    res.redirect('/social/hashtags/' + req.params.id + '/edit');
  }
});

router.post('/hashtags/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM hashtag_sets WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Hashtag set deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete hashtag set';
  }
  res.redirect('/social/hashtags');
});

// ==================== CONTENT CALENDAR ====================

router.get('/calendar', async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth();
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);

    const [postsResult, campaignsResult] = await Promise.all([
      db.query(`
        SELECT sp.id, sp.content, sp.platforms, sp.scheduled_at, sp.status, sp.content_type,
               sc.name as campaign_name, sc.color as campaign_color
        FROM social_posts sp
        LEFT JOIN social_campaigns sc ON sp.campaign_id = sc.id
        WHERE sp.scheduled_at BETWEEN $1 AND $2
        ORDER BY sp.scheduled_at ASC
      `, [startDate.toISOString(), endDate.toISOString()]),
      db.query("SELECT id, name, color FROM social_campaigns ORDER BY name ASC"),
    ]);

    res.render('social/calendar', {
      title: 'Content Calendar - WTS Admin',
      posts: postsResult.rows,
      campaigns: campaignsResult.rows,
      currentPage: 'social-calendar',
      month, year,
      platforms: PLATFORMS,
    });
  } catch (error) {
    res.render('social/calendar', {
      title: 'Content Calendar - WTS Admin',
      posts: [], campaigns: [],
      currentPage: 'social-calendar',
      month: new Date().getMonth(), year: new Date().getFullYear(),
      platforms: PLATFORMS,
      error: 'Failed to load calendar',
    });
  }
});

// ==================== AI PROVIDER SETTINGS ====================

router.get('/ai-settings', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ai_providers ORDER BY cost_per_1m_input ASC');
    const providers = result.rows.map(function(p) {
      p.key_configured = !!process.env[p.api_key_env];
      return p;
    });
    res.render('social/ai-settings', {
      title: 'AI Providers - WTS Admin',
      currentPage: 'social-analytics',
      providers,
    });
  } catch (error) {
    res.render('social/ai-settings', {
      title: 'AI Providers - WTS Admin',
      currentPage: 'social-analytics',
      providers: [],
      error: 'Failed to load providers',
    });
  }
});

router.post('/ai-settings/:id/toggle', async (req, res) => {
  try {
    await db.query('UPDATE ai_providers SET is_active = NOT is_active WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Provider toggled';
  } catch (error) {
    req.session.errorMessage = 'Failed to toggle provider';
  }
  res.redirect('/social/ai-settings');
});

// ==================== BATCH MULTI-LANGUAGE ====================

router.post('/batch-generate', async (req, res) => {
  try {
    const { source_type, source_id, platforms, tone, style, cta, languages, ai_provider } = req.body;
    const langsArray = Array.isArray(languages) ? languages : (languages ? [languages] : ['en']);
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : ['Twitter/X']);
    const results = {};

    for (const lang of langsArray) {
      const body = { source_type, source_id, platforms: platformsArray, tone, style, cta, language: lang, ai_provider: ai_provider || 'auto' };

      // Reuse internal generate logic
      const provider = body.ai_provider === 'auto' ? autoSelectProvider(platformsArray, lang, source_type) : body.ai_provider;

      let sourceContent = null;
      if (source_type && source_id) {
        sourceContent = await fetchSourceContent(source_type, source_id);
      }

      const platformInfo = platformsArray.map(function(p) {
        const pDef = PLATFORMS.find(x => x.id === p);
        return pDef ? p + ' (' + pDef.charLimit + ' chars)' : p;
      }).join(', ');

      const langName = LANGUAGES.find(l => l.code === lang);

      const systemPrompt = `You are a social media copywriter for Words That Sells, a digital marketing agency.
Generate exactly 1 social media post variation.
Tone: ${tone || 'professional'}. Style: ${style || 'key takeaway'}. CTA: ${cta || 'Read more'}.
Platforms: ${platformInfo}. Language: ${langName ? langName.name : lang}.
Return ONLY valid JSON: {"text":"post text","hashtags":["#Tag1","#Tag2"]}`;

      let userPrompt = 'Create 1 social media post';
      if (sourceContent) {
        userPrompt += ' promoting: ' + sourceContent.title;
        if (sourceContent.excerpt) userPrompt += '. Summary: ' + sourceContent.excerpt.substring(0, 300);
        if (sourceContent.url) userPrompt += '. URL: ' + sourceContent.url;
      }

      let rawResponse;
      try {
        switch (provider) {
          case 'gemini': rawResponse = await callGemini(userPrompt, systemPrompt); break;
          case 'claude_haiku': rawResponse = await callClaude('claude-haiku-4-5-20251001', systemPrompt, userPrompt); break;
          case 'claude_sonnet': rawResponse = await callClaude('claude-sonnet-4-5-20250929', systemPrompt, userPrompt); break;
          case 'perplexity': rawResponse = await callPerplexity(userPrompt, systemPrompt); break;
          default: rawResponse = await callDeepSeek(userPrompt, systemPrompt); break;
        }
        let jsonStr = rawResponse;
        const fenceMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonStr = fenceMatch[1];
        const parsed = JSON.parse(jsonStr.trim());
        results[lang] = { success: true, provider, text: parsed.text, hashtags: parsed.hashtags || [] };
      } catch (e) {
        results[lang] = { success: false, provider, error: e.message };
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== OAUTH FLOWS (Phase 3) ====================

// Platform OAuth config
const OAUTH_CONFIG = {
  facebook: {
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    scope: 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish',
    clientIdEnv: 'META_APP_ID',
    clientSecretEnv: 'META_APP_SECRET',
  },
  twitter: {
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scope: 'tweet.read tweet.write users.read offline.access',
    clientIdEnv: 'TWITTER_CLIENT_ID',
    clientSecretEnv: 'TWITTER_CLIENT_SECRET',
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'openid profile w_member_social',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
  },
  tiktok: {
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic,video.publish',
    clientIdEnv: 'TIKTOK_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
  },
  pinterest: {
    authUrl: 'https://www.pinterest.com/oauth/',
    tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
    scope: 'boards:read,pins:read,pins:write',
    clientIdEnv: 'PINTEREST_APP_ID',
    clientSecretEnv: 'PINTEREST_APP_SECRET',
  },
};

function getOAuthRedirectUri(req, platform) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return proto + '://' + req.get('host') + '/social/oauth/' + platform + '/callback';
}

// Start OAuth — redirect user to platform
router.get('/oauth/:platform', (req, res) => {
  const platform = req.params.platform;
  const config = OAUTH_CONFIG[platform];
  if (!config) return res.status(400).send('Unsupported platform: ' + platform);

  const clientId = process.env[config.clientIdEnv];
  if (!clientId) {
    req.session.errorMessage = config.clientIdEnv + ' not configured. Add it to Railway env vars.';
    return res.redirect('/social/channels');
  }

  const state = require('crypto').randomBytes(16).toString('hex');
  req.session.oauthState = state;
  req.session.oauthPlatform = platform;

  const redirectUri = getOAuthRedirectUri(req, platform);
  let authUrl;

  if (platform === 'twitter') {
    // Twitter uses PKCE
    const codeVerifier = require('crypto').randomBytes(32).toString('base64url');
    const codeChallenge = require('crypto').createHash('sha256').update(codeVerifier).digest('base64url');
    req.session.twitterCodeVerifier = codeVerifier;
    authUrl = config.authUrl + '?response_type=code&client_id=' + encodeURIComponent(clientId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&scope=' + encodeURIComponent(config.scope) +
      '&state=' + state +
      '&code_challenge=' + codeChallenge + '&code_challenge_method=S256';
  } else if (platform === 'tiktok') {
    authUrl = config.authUrl + '?client_key=' + encodeURIComponent(clientId) +
      '&response_type=code&scope=' + encodeURIComponent(config.scope) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) + '&state=' + state;
  } else {
    authUrl = config.authUrl + '?client_id=' + encodeURIComponent(clientId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=code&scope=' + encodeURIComponent(config.scope) +
      '&state=' + state;
  }

  res.redirect(authUrl);
});

// OAuth callback — exchange code for token, save channel
router.get('/oauth/:platform/callback', async (req, res) => {
  const platform = req.params.platform;
  const config = OAUTH_CONFIG[platform];
  const { code, state } = req.query;

  if (!config || !code) {
    req.session.errorMessage = 'OAuth failed: no authorization code received';
    return res.redirect('/social/channels');
  }

  if (state !== req.session.oauthState) {
    req.session.errorMessage = 'OAuth failed: state mismatch (possible CSRF)';
    return res.redirect('/social/channels');
  }

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) {
    req.session.errorMessage = 'OAuth credentials not configured';
    return res.redirect('/social/channels');
  }

  const redirectUri = getOAuthRedirectUri(req, platform);

  try {
    let tokenBody, tokenHeaders;

    if (platform === 'twitter') {
      const basicAuth = Buffer.from(clientId + ':' + clientSecret).toString('base64');
      tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + basicAuth };
      tokenBody = 'grant_type=authorization_code&code=' + encodeURIComponent(code) +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&code_verifier=' + (req.session.twitterCodeVerifier || '');
    } else if (platform === 'tiktok') {
      tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
      tokenBody = 'client_key=' + encodeURIComponent(clientId) +
        '&client_secret=' + encodeURIComponent(clientSecret) +
        '&code=' + encodeURIComponent(code) +
        '&grant_type=authorization_code&redirect_uri=' + encodeURIComponent(redirectUri);
    } else {
      tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
      tokenBody = 'client_id=' + encodeURIComponent(clientId) +
        '&client_secret=' + encodeURIComponent(clientSecret) +
        '&code=' + encodeURIComponent(code) +
        '&grant_type=authorization_code&redirect_uri=' + encodeURIComponent(redirectUri);
    }

    const tokenResp = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: tokenHeaders,
      body: tokenBody,
    });

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in;

    if (!accessToken) {
      req.session.errorMessage = 'OAuth failed: ' + JSON.stringify(tokenData);
      return res.redirect('/social/channels');
    }

    // Fetch account info
    let accountName = '', accountId = '';
    try {
      if (platform === 'facebook') {
        const meResp = await fetch('https://graph.facebook.com/v21.0/me?fields=id,name&access_token=' + accessToken);
        const me = await meResp.json();
        accountName = me.name; accountId = me.id;
      } else if (platform === 'twitter') {
        const meResp = await fetch('https://api.twitter.com/2/users/me', { headers: { 'Authorization': 'Bearer ' + accessToken } });
        const me = await meResp.json();
        accountName = me.data.username; accountId = me.data.id;
      } else if (platform === 'linkedin') {
        const meResp = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { 'Authorization': 'Bearer ' + accessToken } });
        const me = await meResp.json();
        accountName = me.name || me.given_name; accountId = me.sub;
      } else if (platform === 'tiktok') {
        accountName = 'TikTok User'; accountId = tokenData.open_id || '';
      } else if (platform === 'pinterest') {
        const meResp = await fetch('https://api.pinterest.com/v5/user_account', { headers: { 'Authorization': 'Bearer ' + accessToken } });
        const me = await meResp.json();
        accountName = me.username; accountId = me.id;
      }
    } catch (e) {
      accountName = platform + ' Account';
    }

    const platformNameMap = { facebook: 'Facebook', twitter: 'Twitter/X', linkedin: 'LinkedIn', tiktok: 'TikTok', pinterest: 'Pinterest' };
    const tokenExpires = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    // Upsert channel
    await db.query(`
      INSERT INTO social_channels (platform, account_name, account_id, access_token, refresh_token, token_expires, status, settings)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
      ON CONFLICT (platform, account_id) DO UPDATE SET
        access_token = $4, refresh_token = COALESCE($5, social_channels.refresh_token),
        token_expires = $6, account_name = $2, status = 'active', updated_at = CURRENT_TIMESTAMP
    `, [platformNameMap[platform] || platform, accountName, accountId, accessToken, refreshToken, tokenExpires,
        JSON.stringify({ oauth_platform: platform, connected_at: new Date().toISOString() })]);

    // Add unique constraint if missing (for upsert)
    try {
      await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_platform_account ON social_channels(platform, account_id)');
    } catch (e) { /* ignore if exists */ }

    req.session.successMessage = accountName + ' connected via ' + (platformNameMap[platform] || platform);
    res.redirect('/social/channels');
  } catch (error) {
    console.error('OAuth callback error:', error);
    req.session.errorMessage = 'OAuth exchange failed: ' + error.message;
    res.redirect('/social/channels');
  }
});

// Token refresh utility
async function refreshOAuthToken(channel) {
  const platformMap = { 'Facebook': 'facebook', 'Twitter/X': 'twitter', 'LinkedIn': 'linkedin', 'TikTok': 'tiktok', 'Pinterest': 'pinterest' };
  const platform = platformMap[channel.platform];
  if (!platform || !channel.refresh_token) return null;

  const config = OAUTH_CONFIG[platform];
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) return null;

  try {
    let body;
    if (platform === 'twitter') {
      body = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(channel.refresh_token);
    } else {
      body = 'client_id=' + encodeURIComponent(clientId) +
        '&client_secret=' + encodeURIComponent(clientSecret) +
        '&grant_type=refresh_token&refresh_token=' + encodeURIComponent(channel.refresh_token);
    }

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (platform === 'twitter') {
      headers['Authorization'] = 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64');
    }

    const resp = await fetch(config.tokenUrl, { method: 'POST', headers, body });
    const data = await resp.json();

    if (data.access_token) {
      const tokenExpires = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
      await db.query(
        'UPDATE social_channels SET access_token=$1, refresh_token=COALESCE($2, refresh_token), token_expires=$3, status=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5',
        [data.access_token, data.refresh_token || null, tokenExpires, 'active', channel.id]
      );
      return data.access_token;
    }
  } catch (e) {
    console.error('Token refresh error for ' + channel.platform + ':', e.message);
  }
  await db.query("UPDATE social_channels SET status='expired', updated_at=CURRENT_TIMESTAMP WHERE id=$1", [channel.id]);
  return null;
}

// Get valid token (refresh if expired)
async function getValidToken(channel) {
  if (channel.token_expires && new Date(channel.token_expires) > new Date(Date.now() + 5 * 60 * 1000)) {
    return channel.access_token;
  }
  if (channel.refresh_token) {
    return await refreshOAuthToken(channel);
  }
  return channel.access_token;
}

// ==================== DIRECT PUBLISHING ====================

// Platform-specific publish functions
async function publishToFacebook(channel, post) {
  const token = await getValidToken(channel);
  if (!token) throw new Error('No valid Facebook token');

  // Get page token (needed for page posting)
  const pagesResp = await fetch('https://graph.facebook.com/v21.0/me/accounts?access_token=' + token);
  const pagesData = await pagesResp.json();
  const page = pagesData.data && pagesData.data[0];
  if (!page) throw new Error('No Facebook page found. User must be a page admin.');

  const pageToken = page.access_token;
  const params = new URLSearchParams();
  params.append('message', post.content + (post.hashtags ? '\n\n' + post.hashtags.join(' ') : ''));
  if (post.link_url) params.append('link', post.link_url);
  params.append('access_token', pageToken);

  const resp = await fetch('https://graph.facebook.com/v21.0/' + page.id + '/feed', { method: 'POST', body: params });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return { platform_post_id: data.id, url: 'https://facebook.com/' + data.id };
}

async function publishToTwitter(channel, post) {
  const token = await getValidToken(channel);
  if (!token) throw new Error('No valid Twitter token');

  let tweetText = post.content;
  if (post.hashtags && post.hashtags.length) tweetText += '\n\n' + post.hashtags.slice(0, 5).join(' ');
  if (post.link_url) tweetText += '\n' + post.link_url;
  if (tweetText.length > 280) tweetText = tweetText.substring(0, 277) + '...';

  const resp = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ text: tweetText }),
  });
  const data = await resp.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return { platform_post_id: data.data.id, url: 'https://x.com/' + channel.account_name + '/status/' + data.data.id };
}

async function publishToLinkedIn(channel, post) {
  const token = await getValidToken(channel);
  if (!token) throw new Error('No valid LinkedIn token');

  let text = post.content;
  if (post.hashtags && post.hashtags.length) text += '\n\n' + post.hashtags.join(' ');

  const body = {
    author: 'urn:li:person:' + channel.account_id,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: post.link_url ? 'ARTICLE' : 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  if (post.link_url) {
    body.specificContent['com.linkedin.ugc.ShareContent'].media = [{ status: 'READY', originalUrl: post.link_url }];
  }

  const resp = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return { platform_post_id: data.id, url: 'https://linkedin.com/feed/update/' + data.id };
}

// Main publish endpoint
router.post('/posts/:id/publish', async (req, res) => {
  try {
    const postResult = await db.query('SELECT * FROM social_posts WHERE id = $1', [req.params.id]);
    if (postResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Post not found' });
    const post = postResult.rows[0];

    if (!post.platforms || post.platforms.length === 0) {
      return res.status(400).json({ success: false, error: 'No platforms selected' });
    }

    const results = {};
    const channels = await db.query("SELECT * FROM social_channels WHERE status IN ('active', 'expired') AND platform = ANY($1)", [post.platforms]);

    for (const channel of channels.rows) {
      try {
        let result;
        switch (channel.platform) {
          case 'Facebook': result = await publishToFacebook(channel, post); break;
          case 'Twitter/X': result = await publishToTwitter(channel, post); break;
          case 'LinkedIn': result = await publishToLinkedIn(channel, post); break;
          default:
            result = { skipped: true, reason: 'Publishing not yet supported for ' + channel.platform };
        }
        results[channel.platform] = { success: true, ...result };
      } catch (e) {
        results[channel.platform] = { success: false, error: e.message };
      }
    }

    // Mark post as published
    await db.query("UPDATE social_posts SET status='published', published_at=CURRENT_TIMESTAMP, engagement_data=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2",
      [JSON.stringify(results), post.id]);

    res.json({ success: true, results });
  } catch (error) {
    console.error('Publish error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
