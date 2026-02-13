# Social Media Command Center — Full Plan (V2)

## Vision

A multi-AI, multi-language, multi-platform social media command center inside the WTS Admin dashboard. Pull content from the website, generate posts in any language using the best AI for the job, attach media from the library, shorten links with Bitly for click tracking, publish directly to connected social accounts via OAuth, and track everything through Google Analytics + Meta Pixel for retargeting.

**Cost-efficiency principle:** Use free tiers everywhere possible. Route AI tasks to the cheapest model that can handle them. Only pay for what scales.

---

## Part A: Multi-AI Engine

### The Strategy — Right AI for the Right Job

Instead of using one AI for everything, route each task to the AI that does it best AND cheapest:

| Task | AI Used | Why | Cost |
|------|---------|-----|------|
| **Short posts** (tweets, glossary tips) | DeepSeek V3 | Dirt cheap at $0.28/1M input tokens. Good enough for short-form | ~$0.001 per post |
| **Long-form posts** (LinkedIn articles, guides) | Claude Haiku 4.5 | Best quality-to-cost ratio for marketing copy | ~$0.005 per post |
| **Multi-language translation** | Gemini 2.0 Flash-Lite | Free tier available. Google excels at multilingual. Cheapest paid: $0.075/1M tokens | Free or ~$0.001 per translation |
| **Trend-aware posts** (timely content, news hooks) | Perplexity Sonar | Has live web search built in. Knows what's trending RIGHT NOW | ~$0.003 per post |
| **Complex campaigns** (multi-post series, strategy) | Claude Sonnet 4.5 | Most capable for nuanced marketing strategy | ~$0.02 per generation |
| **Fallback / custom** | User's choice | Let the user pick which AI to use | Varies |

### Cost Estimate: 100 posts/month
```
60 short posts (DeepSeek)     = 60 × $0.001 = $0.06
20 long posts (Claude Haiku)  = 20 × $0.005 = $0.10
100 translations (Gemini Free)= 100 × $0.00 = $0.00
10 trend posts (Perplexity)   = 10 × $0.003 = $0.03
5 campaigns (Claude Sonnet)   = 5 × $0.02  = $0.10
                                        TOTAL ≈ $0.29/month
```

Compare to using Claude Sonnet for everything: 100 × $0.02 = $2.00/month. **This is 7x cheaper.**

### Database Changes

New table: `ai_providers`
```sql
CREATE TABLE ai_providers (
  id VARCHAR(50) PRIMARY KEY,     -- 'claude_haiku', 'claude_sonnet', 'deepseek', 'gemini', 'perplexity'
  name VARCHAR(100),              -- 'Claude Haiku 4.5'
  api_key_env VARCHAR(100),       -- 'ANTHROPIC_API_KEY' (env var name, not the key itself)
  model_id VARCHAR(200),          -- 'claude-haiku-4-5-20251001'
  endpoint_url TEXT,              -- 'https://api.anthropic.com/v1/messages'
  cost_per_1m_input DECIMAL(8,4), -- 1.0000
  cost_per_1m_output DECIMAL(8,4),-- 5.0000
  best_for TEXT[],                -- {'short_posts', 'translations', 'trend_posts'}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Add to `social_posts`:
```sql
ALTER TABLE social_posts ADD COLUMN source_type VARCHAR(50);
ALTER TABLE social_posts ADD COLUMN source_id UUID;
ALTER TABLE social_posts ADD COLUMN source_title VARCHAR(500);
ALTER TABLE social_posts ADD COLUMN source_url TEXT;
ALTER TABLE social_posts ADD COLUMN ai_provider VARCHAR(50);        -- which AI generated it
ALTER TABLE social_posts ADD COLUMN ai_generated BOOLEAN DEFAULT false;
ALTER TABLE social_posts ADD COLUMN ai_prompt_used TEXT;
ALTER TABLE social_posts ADD COLUMN ai_variations JSONB;
ALTER TABLE social_posts ADD COLUMN language VARCHAR(10) DEFAULT 'en';  -- 'en', 'lo', 'th', 'fr', etc.
ALTER TABLE social_posts ADD COLUMN bitly_url TEXT;                 -- shortened URL
ALTER TABLE social_posts ADD COLUMN bitly_clicks INTEGER DEFAULT 0; -- cached click count
ALTER TABLE social_posts ADD COLUMN pixel_events JSONB;             -- tracking pixel data
```

### Environment Variables Needed
```
ANTHROPIC_API_KEY=sk-ant-...          # Claude (Haiku + Sonnet)
DEEPSEEK_API_KEY=sk-...               # DeepSeek V3
GOOGLE_GEMINI_API_KEY=...             # Gemini Flash-Lite
PERPLEXITY_API_KEY=pplx-...           # Perplexity Sonar
BITLY_ACCESS_TOKEN=...                # Bitly link shortening
```

### AI Generation Card — Updated UX

```
┌─ AI POST GENERATOR ───────────────────────────────────────┐
│                                                            │
│  AI Engine:                                                │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │
│  │DeepSeek│ │ Claude │ │ Gemini │ │Perplx. │ │  Auto  │  │
│  │  $     │ │  $$    │ │  Free  │ │  $$    │ │   ✨    │  │
│  │ Short  │ │Quality │ │Translt.│ │ Trend  │ │ Smart  │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │
│  (toggle buttons — "Auto" is default, picks best AI)      │
│                                                            │
│  ┌─ Options Row ────────────────────────────────────────┐  │
│  │ Tone: [Professional ▼] Style: [Key Takeaway ▼]      │  │
│  │ CTA:  [Read more ▼]    Language: [English ▼]         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  [✨ Generate 3 Variations]         Est. cost: ~$0.001     │
│                                                            │
│  ┌─ Variation 1 (DeepSeek V3) ───────────────────────┐    │
│  │ "Did you know? An SEO audit reveals hidden..."     │    │
│  │                                                    │    │
│  │ EN: 142 chars  ✓ X   ✓ LinkedIn                   │    │
│  │ [Use This ✓]  [Translate ▼]  [Copy]               │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌─ Variation 2 ─────────────────────────────────────┐    │
│  │ ...                                                │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌─ Variation 3 ─────────────────────────────────────┐    │
│  │ ...                                                │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  [↻ Regenerate]  [✎ Custom Prompt]  [Switch AI ▼]        │
└────────────────────────────────────────────────────────────┘
```

**"Auto" mode logic:**
1. If selected platforms include Twitter/X only → DeepSeek (short, cheap)
2. If language != English → Gemini Flash-Lite (best multilingual)
3. If user typed "trending" or "news" in custom prompt → Perplexity Sonar
4. If LinkedIn or long-form content type → Claude Haiku
5. Complex multi-post campaign → Claude Sonnet

**Cost indicator:** Show estimated cost in real-time next to the Generate button: `Est. cost: ~$0.001`

### AI Router Backend

```
POST /social/generate-post

Request:
{
  "source_type": "glossary",
  "source_id": "uuid",
  "platforms": ["Twitter/X", "LinkedIn"],
  "tone": "professional",
  "style": "key_takeaway",
  "cta": "Read more",
  "language": "en",
  "ai_provider": "auto",      // or "deepseek", "claude_haiku", etc.
  "custom_prompt": null
}

Backend:
1. Resolve "auto" → pick best AI based on task
2. Fetch source content from DB
3. Build prompt (same prompt template, adapted per AI's format)
4. Call the selected AI's API
5. Parse response (normalize to same { variations: [...] } format)
6. Return with provider info + cost estimate
```

Each AI has a different API format but returns the same normalized response:
```json
{
  "success": true,
  "provider": "deepseek",
  "model": "deepseek-chat",
  "variations": [
    { "text": "...", "hashtags": ["#SEO"] }
  ],
  "estimated_cost": 0.001,
  "prompt_used": "..."
}
```

---

## Part B: Multi-Language Support

### Languages Supported

| Language | Code | Primary Market | AI Used |
|----------|------|---------------|---------|
| English | `en` | Global, SEA expats | Any (default) |
| Lao | `lo` | Laos | Gemini (best SE Asian language support) |
| Thai | `th` | Thailand | Gemini |
| Vietnamese | `vi` | Vietnam | Gemini |
| French | `fr` | Francophone Africa, Laos diaspora | Gemini or DeepSeek |
| Chinese (Simplified) | `zh` | Chinese business in SEA | DeepSeek (native Chinese) |
| Khmer | `km` | Cambodia | Gemini |
| Japanese | `ja` | Japan business | Gemini |
| Korean | `ko` | Korean business in SEA | Gemini |

### UX: Language Selector

**In the AI Generation Card:**
```
Language: [English ▼]
            ├── English (Original)
            ├── Lao (ພາສາລາວ)
            ├── Thai (ภาษาไทย)
            ├── Vietnamese (Tiếng Việt)
            ├── French (Français)
            ├── Chinese (中文)
            ├── Khmer (ខ្មែរ)
            ├── Japanese (日本語)
            └── Korean (한국어)
```

**Per-Variation Translate Button:**

After generating in English, each variation has a `[Translate ▼]` dropdown:
```
┌─ Variation 1 ──────────────────────────────────────┐
│ "Did you know? An SEO audit reveals hidden..."     │
│                                                    │
│ [Use This ✓]  [Translate ▼]  [Copy]               │
│                 ├── Lao                            │
│                 ├── Thai                           │
│                 ├── French                         │
│                 └── All Languages                  │
└────────────────────────────────────────────────────┘
```

Clicking a language:
1. Calls Gemini Flash-Lite (free tier or $0.075/1M) with: "Translate this social media post to [language]. Preserve hashtags in English. Keep the tone [professional]. Adapt cultural references."
2. Shows translated text below the original with a language flag
3. User can "Use This" on the translated version

**"All Languages" option:**
Generates translations for ALL configured languages in one batch call. Shows a grid of translated cards. User picks which ones to create as posts.

### Multi-Language Post Creation

When creating a post from a translated variation:
- `language` field set to the language code
- Same `source_id` and `source_url` (content page doesn't change)
- Different `content` (translated text)
- This creates separate post entries per language, all linked to the same source

### Batch Multi-Language Workflow

```
Content Hub → Select "SEO Audit" → Promote
→ Generate in English → Pick variation
→ Click "All Languages" → See 5 translated versions
→ Check: ✓ Lao ✓ Thai ✓ French
→ Click "Create Posts for Selected Languages"
→ Creates 4 posts (EN + LO + TH + FR) all in one action
→ Each assigned to appropriate platform/channel for that language
```

---

## Part C: Platform Integration & OAuth

### Supported Platforms

| Platform | API | Auth Method | Cost | Capabilities |
|----------|-----|-------------|------|-------------|
| **Facebook Pages** | Meta Graph API | OAuth 2.0 | Free | Post text/image/video/link, schedule, insights |
| **Instagram Business** | Meta Graph API | OAuth 2.0 (via FB) | Free | Post image/video/carousel/reel, insights |
| **WhatsApp Business** | WhatsApp Cloud API | System User Token | Free inbound; $0.01-0.06/outbound | Send templates, interactive messages |
| **Twitter/X** | X API v2 | OAuth 2.0 | Free: 1,500 posts/mo | Post text/image/video, basic analytics |
| **LinkedIn** | LinkedIn Marketing API | OAuth 2.0 | Free | Post to company pages, text/image/article |
| **TikTok** | TikTok Content Posting API | OAuth 2.0 | Free | Upload video, analytics |
| **Pinterest** | Pinterest API v5 | OAuth 2.0 | Free | Create pins (image/video/carousel), analytics |
| **Threads** | Threads API (Meta) | OAuth 2.0 (via IG) | Free | Post text/image/video, polls |
| **Google Business** | Google Business Profile API | OAuth 2.0 | Free | Post updates, reply to reviews |
| **Snapchat** | Snap Marketing API | OAuth 2.0 | Free (organic) | Post stories, basic analytics |

### OAuth Integration Architecture

**Updated `social_channels` table:**
```sql
ALTER TABLE social_channels ADD COLUMN oauth_provider VARCHAR(50);     -- 'meta', 'twitter', 'linkedin', etc.
ALTER TABLE social_channels ADD COLUMN oauth_client_id VARCHAR(255);
ALTER TABLE social_channels ADD COLUMN oauth_scopes TEXT[];
ALTER TABLE social_channels ADD COLUMN page_id VARCHAR(255);           -- for FB/IG page-specific tokens
ALTER TABLE social_channels ADD COLUMN token_encrypted TEXT;           -- AES-256 encrypted
ALTER TABLE social_channels ADD COLUMN refresh_token_encrypted TEXT;
ALTER TABLE social_channels ADD COLUMN connected_at TIMESTAMP;
ALTER TABLE social_channels ADD COLUMN last_used_at TIMESTAMP;
ALTER TABLE social_channels ADD COLUMN connection_health VARCHAR(20);  -- 'healthy', 'expiring', 'expired', 'error'
```

### Screen: Connected Accounts (Enhanced Channels Page)

**Route:** `/social/channels` (enhanced existing page)

```
┌─────────────────────────────────────────────────────────────────┐
│  Connected Accounts                                              │
│  "Connect your social media accounts to publish directly"        │
│                                                                  │
│  ┌─ CONNECT NEW ACCOUNT ─────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │  │
│  │  │ Facebook │ │Instagram │ │Twitter/X │ │ LinkedIn │     │  │
│  │  │  Pages   │ │ Business │ │          │ │ Company  │     │  │
│  │  │ [Connect]│ │ [Connect]│ │ [Connect]│ │ [Connect]│     │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │  │
│  │                                                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │  │
│  │  │  TikTok  │ │Pinterest │ │ Threads  │ │ WhatsApp │     │  │
│  │  │          │ │          │ │          │ │ Business │     │  │
│  │  │ [Connect]│ │ [Connect]│ │ [Connect]│ │ [Setup]  │     │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ CONNECTED ACCOUNTS ──────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │ 🔵 Facebook  │ Words That Sells Page                 │ │  │
│  │  │              │ Connected Feb 1 · Token expires Mar 1  │ │  │
│  │  │              │ ● Healthy                              │ │  │
│  │  │              │                [Refresh] [Disconnect]  │ │  │
│  │  ├──────────────┼───────────────────────────────────────┤ │  │
│  │  │ 📸 Instagram │ @wordsthatsells                       │ │  │
│  │  │              │ Connected via Facebook · 1,200 followers│ │  │
│  │  │              │ ● Healthy                              │ │  │
│  │  │              │                [Refresh] [Disconnect]  │ │  │
│  │  ├──────────────┼───────────────────────────────────────┤ │  │
│  │  │ 🐦 Twitter/X │ @WordsThatSells                       │ │  │
│  │  │              │ Connected Jan 15 · Free tier (1.5K/mo) │ │  │
│  │  │              │ ⚠ 1,230/1,500 posts used this month    │ │  │
│  │  │              │                [Refresh] [Disconnect]  │ │  │
│  │  └──────────────┴───────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ API KEYS (for AI providers) ─────────────────────────────┐  │
│  │  Claude API     ● Connected    [Update Key]               │  │
│  │  DeepSeek API   ● Connected    [Update Key]               │  │
│  │  Gemini API     ● Connected    [Update Key]               │  │
│  │  Perplexity API ○ Not Set      [Add Key]                  │  │
│  │  Bitly API      ● Connected    [Update Key]               │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### OAuth Flow (Per Platform)

**Meta (Facebook + Instagram + Threads):**
1. User clicks "Connect Facebook"
2. Redirect to: `https://www.facebook.com/v19.0/dialog/oauth?client_id=...&scope=pages_manage_posts,instagram_content_publish,pages_read_engagement`
3. User grants permissions, Meta redirects back
4. Backend exchanges code for access token
5. Fetch list of user's Pages → user selects which Page to connect
6. Store encrypted token + page_id in `social_channels`
7. Instagram auto-connects if linked to the Facebook Page

**Twitter/X:**
1. OAuth 2.0 with PKCE flow
2. Scopes: `tweet.read tweet.write users.read offline.access`
3. Free tier: 1,500 posts/month — dashboard tracks usage

**LinkedIn:**
1. OAuth 2.0 flow
2. Scopes: `w_member_social r_liteprofile` (personal) or `w_organization_social` (company)
3. User selects company page after connecting

**TikTok:**
1. OAuth 2.0 via TikTok Login Kit
2. Scopes: `user.info.basic video.publish video.list`
3. Note: Only video content supported

**Token Health Monitor:**
Backend cron job (runs daily):
- Check token expiry dates
- Auto-refresh tokens that support refresh (Meta, LinkedIn)
- Mark channels as "expiring" (7 days), "expired", or "error"
- Dashboard shows health indicator per channel

### Publishing Flow

When user clicks "Publish" on a post:

```
1. Post is saved to social_posts table
2. For each selected platform:
   a. Check if channel is connected and healthy
   b. If Bitly is configured: shorten the link_url → store bitly_url
   c. Prepare platform-specific payload:
      - Facebook: { message, link, attached_media }
      - Instagram: { image_url, caption } (two-step: create container → publish)
      - Twitter/X: { text } + media upload if images
      - LinkedIn: { text, article: { url, title, description } }
      - TikTok: { video_url, description } (video only)
   d. Call platform API
   e. Store platform post ID in engagement_data for later analytics
   f. Update status to 'published' + set published_at
3. If any platform fails:
   - Mark that platform as failed in engagement_data
   - Show error to user with retry option
   - Don't block other platforms
```

### Rate Limit Awareness

Dashboard shows remaining quotas:
```
┌─ Platform Quotas (this month) ───────────┐
│ Twitter/X:  270/1,500 remaining  ████░░  │
│ Facebook:   Unlimited            ████████ │
│ Instagram:  25/25 per day        ██████░  │
│ LinkedIn:   Unlimited            ████████ │
│ TikTok:     12/15 per day        █████░░  │
└──────────────────────────────────────────┘
```

---

## Part D: Bitly Link Tracking

### Integration

**Purpose:** Every link shared on social media gets a Bitly short URL so you can track exactly how many clicks each post drives.

**Free tier limits:** 5 links/month (with 1,000 API calls). For cost efficiency, we use Bitly smartly:
- Only shorten links for **published** posts (not drafts)
- Reuse the same Bitly link if the same source URL is promoted multiple times on the same platform
- Cache Bitly links in the DB to avoid duplicate API calls

**If volume exceeds free tier:** Consider self-hosted YOURLS ($0/month on your existing server) as a fallback.

### UX in Post Composer

```
┌─ Link & Tracking ─────────────────────────────────────────────┐
│                                                                │
│  Link URL: [https://wordsthatsells.website/en/articles/...  ] │
│                                                                │
│  ☑ Shorten with Bitly    ☑ Add UTM parameters                │
│                                                                │
│  Preview:                                                      │
│  Short URL: bit.ly/3xK9abc                                    │
│  Full URL:  https://wordsthatsells.website/en/articles/       │
│             seo-audit?utm_source=twitter&utm_medium=social     │
│             &utm_campaign=q1-awareness                         │
│                                                                │
│  UTM Source: [twitter ▼]  (auto-set per platform)             │
│  UTM Medium: [social   ]  UTM Campaign: [q1-awareness]       │
└────────────────────────────────────────────────────────────────┘
```

**Auto-behavior:**
- When publishing to multiple platforms, create separate Bitly links per platform with different `utm_source` values
- This way you can see in both Bitly AND Google Analytics which platform drove each click

### Bitly Analytics in Dashboard

```
┌─ Click Tracking (Last 30 Days) ──────────────────────────────┐
│                                                               │
│  Total Clicks: 1,247                                          │
│                                                               │
│  By Platform:                                                 │
│  Facebook     ████████████████  482 clicks (39%)              │
│  LinkedIn     ██████████        312 clicks (25%)              │
│  Twitter/X    ████████          248 clicks (20%)              │
│  Instagram    █████             156 clicks (13%)              │
│  Other        █                  49 clicks (3%)               │
│                                                               │
│  Top Posts by Clicks:                                         │
│  1. "SEO Audit guide..." — 89 clicks — bit.ly/3xK9abc       │
│  2. "AI Tools roundup..." — 67 clicks — bit.ly/4yL2def      │
│  3. "Content Marketing..." — 52 clicks — bit.ly/5zM3ghi     │
└───────────────────────────────────────────────────────────────┘
```

Backend: Cron job fetches click counts from Bitly API daily and caches in `social_posts.bitly_clicks`.

---

## Part E: Analytics & Retargeting

### The Stack (All Free)

| Tool | Cost | Purpose |
|------|------|---------|
| **Google Analytics 4** | Free | Website traffic, user behavior, conversion funnels, audience insights |
| **Meta Pixel** | Free | Track FB/IG visitors, build retargeting audiences |
| **LinkedIn Insight Tag** | Free | Track LinkedIn visitors, build retargeting audiences |
| **TikTok Pixel** | Free | Track TikTok visitors, build retargeting audiences |
| **X/Twitter Pixel** | Free | Track X visitors, build retargeting audiences |
| **Google Tag Manager** | Free | Manage all pixels from one place |

**Total analytics cost: $0/month**

### Pixel Implementation

All pixels are managed through **Google Tag Manager (GTM)** — one script tag on the site, all pixels configured inside GTM.

**Events to track (across all pixels):**
```
PageView          → Every page load
ViewContent       → Article, glossary, guide, tool pages
Lead              → Contact form submission
Purchase          → Checkout completion
ScrollDepth       → 25%, 50%, 75%, 100%
TimeOnSite        → 30s, 60s, 120s thresholds
CTAClick          → Any call-to-action button click
DownloadGuide     → E-guide download
ToolClick         → AI tool external link click
```

### Retargeting Audiences (Built Automatically)

| Audience | Source | Platform | Retarget With |
|----------|--------|----------|--------------|
| All site visitors (30 days) | Meta Pixel + GA4 | Facebook, Instagram | Brand awareness ads |
| Article readers | Meta Pixel event: ViewContent (articles) | Facebook, Instagram | Related articles, guides |
| Guide downloaders | Meta Pixel event: DownloadGuide | Facebook, Instagram | Service offers, consultations |
| Service page viewers | Meta Pixel event: ViewContent (services) | Facebook, Instagram, LinkedIn | Service promotions, pricing |
| High-intent (3+ pages) | GA4 audience | Google Ads | Search ads, display retargeting |
| LinkedIn visitors | LinkedIn Insight Tag | LinkedIn | Professional content, B2B offers |
| TikTok visitors | TikTok Pixel | TikTok | Video content, brand awareness |
| Cart abandoners | Meta Pixel event: InitiateCheckout | Facebook, Instagram | Checkout reminders |

### UX: Analytics Dashboard

New page: `/social/analytics`

```
┌─────────────────────────────────────────────────────────────────┐
│  Social Analytics                              Period: [30 Days ▼] │
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐│
│  │ Total Clicks  │ │ Site Visits  │ │ Conversions  │ │ Cost/Click││
│  │     1,247     │ │     892      │ │      23      │ │   $0.00  ││
│  │   ↑ 18%       │ │   ↑ 12%     │ │   ↑ 35%      │ │  (organic)││
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘│
│                                                                  │
│  ┌─ TRAFFIC BY SOURCE ────────────────────────────────────────┐ │
│  │  Facebook      ████████████████████  482  (39%)            │ │
│  │  LinkedIn      █████████████         312  (25%)            │ │
│  │  Twitter/X     ██████████            248  (20%)            │ │
│  │  Instagram     ██████                156  (13%)            │ │
│  │  Direct/Other  ██                     49  (3%)             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ CONTENT PERFORMANCE ──────────────────────────────────────┐ │
│  │  Content Type     Posts   Clicks   CTR    Best Platform    │ │
│  │  Articles          12      423    3.2%    LinkedIn         │ │
│  │  Glossary Terms    34      312    2.8%    Twitter/X        │ │
│  │  AI Tools           8      198    4.1%    Facebook         │ │
│  │  Guides             4      156    5.2%    LinkedIn         │ │
│  │  Services           6       98    2.1%    Facebook         │ │
│  │  Standalone        15       60    1.4%    Instagram        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ RETARGETING AUDIENCES ────────────────────────────────────┐ │
│  │  All Visitors (30d)     │  2,340 people │ Meta + Google    │ │
│  │  Article Readers        │    892 people │ Meta             │ │
│  │  Guide Downloaders      │    156 people │ Meta             │ │
│  │  High-Intent (3+ pages) │    423 people │ Google           │ │
│  │  Service Page Viewers   │    312 people │ Meta + LinkedIn  │ │
│  │                                                            │ │
│  │  [Create Retargeting Campaign →]                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ AI INSIGHTS (Claude-powered) ─────────────────────────────┐ │
│  │  "Your glossary posts on Twitter/X have 2.8% CTR — above   │ │
│  │   industry average of 1.5%. Consider increasing frequency   │ │
│  │   from 3x to 5x per week. LinkedIn drives the highest      │ │
│  │   conversion rate for guide downloads (5.2% CTR).           │ │
│  │   Recommendation: Focus guide promotions on LinkedIn."      │ │
│  │                                                             │ │
│  │  [Generate Weekly Report]  [Suggest Next Week's Posts]      │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Retargeting Campaign Quick-Create

From the analytics page, clicking "Create Retargeting Campaign" opens:

```
┌─ Quick Retargeting Setup ─────────────────────────────────────┐
│                                                                │
│  Audience: [Article Readers (892 people) ▼]                   │
│  Platform: ☑ Facebook  ☑ Instagram  ☐ Google  ☐ LinkedIn     │
│  Budget:   [$5.00/day ▼]  Duration: [7 days]                 │
│  Goal:     [Traffic to site ▼]                                │
│                                                                │
│  Ad Content:                                                   │
│  [✨ Generate with Claude]  or  [Pick Existing Post ▼]        │
│                                                                │
│  Estimated reach: 200-500 people/day                          │
│  Estimated cost: $35 total                                    │
│                                                                │
│  [Preview Ad]  [Create Campaign →]                            │
└────────────────────────────────────────────────────────────────┘
```

This links to Meta Ads Manager / Google Ads with pre-filled parameters. The dashboard doesn't replace Meta Ads Manager — it creates a quick-launch shortcut.

---

## Part F: Community Building CTA System

### CTA Types

Each post can include a call-to-action configured in the composer:

| CTA Type | Action | Tracking Event |
|----------|--------|---------------|
| **Read More** | Link to article/content page | ViewContent |
| **Download Guide** | Link to guide download | DownloadGuide |
| **Get a Quote** | Link to contact form | Lead |
| **Join Community** | Link to WhatsApp group / Discord | CommunityJoin |
| **Free Consultation** | Link to booking page | Lead |
| **Try Tool** | Link to AI tool page | ToolClick |
| **Subscribe** | Link to newsletter signup | Subscribe |
| **Shop** | Link to pricing/checkout | InitiateCheckout |

### UX in Post Composer

```
┌─ Call to Action ──────────────────────────────────────────────┐
│                                                                │
│  CTA Type: [Read More ▼]                                      │
│                                                                │
│  CTA Text: [Read the full guide →                         ]   │
│  CTA URL:  [auto-filled from source_url + UTM params      ]   │
│                                                                │
│  ☑ Shorten with Bitly                                         │
│  ☑ Track as conversion event: [ViewContent ▼]                 │
│                                                                │
│  WhatsApp Community:                                           │
│  ☐ Add "Join our WhatsApp group" secondary CTA               │
│    Group invite link: [https://chat.whatsapp.com/...       ]  │
└────────────────────────────────────────────────────────────────┘
```

---

## Part G: Cost Summary

### Monthly Costs at Scale (100 posts/month, 5 platforms)

| Item | Cost | Notes |
|------|------|-------|
| **AI Generation** | ~$0.30 | Multi-AI routing (see Part A) |
| **Translations** (Gemini free tier) | $0.00 | Under free tier limits |
| **Social Platform APIs** | $0.00 | All free for organic posting |
| **Bitly** | $0.00 - $10.00 | Free tier (5 links/mo) or Core ($10/mo) |
| **Google Analytics 4** | $0.00 | Free |
| **Meta Pixel** | $0.00 | Free (you only pay for ad spend) |
| **LinkedIn Insight Tag** | $0.00 | Free |
| **Google Tag Manager** | $0.00 | Free |
| **Retargeting Ads** (optional) | $5-50/month | Only if you run paid retargeting |
| **Hosting** (Railway) | Already paid | No additional cost |
| **TOTAL (organic only)** | **~$0.30 - $10.30/month** | |
| **TOTAL (with retargeting)** | **~$5.30 - $60.30/month** | |

### Cost Optimization Tactics Built In

1. **AI Router:** Auto-picks cheapest AI that can handle the task
2. **DeepSeek for bulk:** 95% cheaper than Claude for simple posts
3. **Gemini free tier:** Translation under 1,000 req/day is free
4. **Bitly link reuse:** Same URL on same platform = reuse existing short link
5. **Batch generation:** Generate multiple post variations in one API call
6. **Prompt caching:** Claude prompt caching gives 90% discount on repeated context
7. **Off-peak DeepSeek:** 75% discount during off-peak hours (16:30-00:30 GMT)
8. **Self-hosted link shortener (YOURLS):** $0 alternative to Bitly if volume grows
9. **Organic-first:** All platform posting is free. Retargeting ads optional.
10. **GA4 free tier:** Handles up to 500K sessions/month before sampling

---

## Updated Sidebar Navigation

```
Social Media
  ├── Content Hub       (NEW — fas fa-magic)
  ├── Campaigns         (existing)
  ├── Posts             (existing)
  ├── Calendar          (existing)
  ├── Analytics         (NEW — fas fa-chart-bar)
  ├── Hashtags          (existing)
  └── Channels          (enhanced — fas fa-plug)
```

---

## Build Phases

### Phase 1: Foundation (Core Posting Engine)
- Database migrations (new columns + ai_providers table)
- Content Hub page
- Enhanced Post Composer (Source Context + Media Picker)
- AI Router with Claude + DeepSeek integration
- Updated sidebar navigation

### Phase 2: Multi-AI + Multi-Language
- Gemini API integration (translation engine)
- Perplexity API integration (trend-aware posts)
- Language selector in composer
- Batch multi-language post creation
- AI provider settings page

### Phase 3: Platform OAuth + Direct Publishing
- Meta OAuth flow (Facebook + Instagram + Threads)
- Twitter/X OAuth flow
- LinkedIn OAuth flow
- TikTok OAuth flow
- Pinterest OAuth flow
- Enhanced Channels page with connect/disconnect UI
- Token health monitoring + auto-refresh
- Direct publishing to connected platforms
- Per-platform payload formatting

### Phase 4: Link Tracking + Analytics
- Bitly API integration (auto-shorten on publish)
- UTM auto-tagging per platform
- Bitly click caching cron job
- Google Tag Manager setup guidance page
- Meta Pixel event configuration
- Analytics dashboard page
- Click tracking dashboard
- Content performance tables

### Phase 5: Retargeting + Community
- Retargeting audience builder (Meta Custom Audiences)
- Quick retargeting campaign launcher
- CTA system in post composer
- WhatsApp group integration
- AI-powered insights (Claude analyzes performance data)
- Weekly report generation
- Post suggestion engine

### Phase 6: Polish + Scale
- Platform preview mockups (FB, X, LinkedIn, IG)
- Rate limit tracking per platform
- Cost tracking dashboard (AI spend per month)
- Error handling + retry logic for failed publishes
- Bulk scheduling interface
- Post templates library

---

## What's NOT Included (Future)

- Paid ad creation inside the dashboard (we link to platform ad managers)
- Social listening / mention monitoring
- Competitor analysis
- Chatbot / auto-reply on social platforms
- Email marketing integration
- CRM integration
- Team roles / multi-user approval workflows
- Mobile app
