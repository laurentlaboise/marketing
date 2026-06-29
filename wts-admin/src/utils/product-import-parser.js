// Parser for the WordsThatSells product-listings document.
//
// The source is a Google-Docs export with noisy Markdown (stray `*`, labels
// like `**Price:****`). We strip the `*` noise, split into product blocks by
// numbered `## N. Name` headings, then read labelled fields between labels.
// Output maps onto the products schema; everything imports as a draft, so
// best-effort parsing with per-product warnings is fine — the admin reviews.

const slugify = require('./slugify');
const taxonomy = require('../config/product-taxonomy');

const SERVICE_PAGE_BY_CATEGORY = {
  'digital business services': 'business-tools',
  'digital content creation services': 'content-creation',
  'digital web development services': 'web-development',
  'digital social media services': 'social-media-management',
};

// Ordered keyword → subcategory rules. Only applied when the candidate
// subcategory actually belongs to the resolved service_page, which keeps
// ambiguous words (e.g. "photos", "ads") scoped correctly.
const SUBCATEGORY_RULES = [
  ['logo-design', /logo/i],
  ['translation', /translat/i],
  ['copywriting', /copywriting|blog|seo article|website copy|\barticle/i],
  ['banner-design', /banner/i],
  ['photography', /stock photo|photo shoot|photograph|\bphotos?\b/i],
  ['rss-feed', /rss/i],
  ['menu-software', /menu/i],
  ['car-listings', /car listing|vehicle|\bcar\b/i],
  ['landing-pages', /landing page/i],
  ['wordpress-divi', /wordpress|divi/i],
  ['web-apps', /bubble|web app|no-?code/i],
  ['crm-database', /\bcrm\b|database/i],
  ['online-forms', /\bform\b|forms\b/i],
  ['business-cards', /nfc|utap|virtual card|business card|qr code|qr-?friendly/i],
  ['google-business-profile', /google business|business profile/i],
  ['google-adsense', /adsense/i],
  ['design-tools', /canva/i],
  ['sme-packages', /all-in-one|\bsme\b/i],
  ['page-setup', /page setup/i],
  ['post-generators', /post generator/i],
  ['publishing', /cross platform|publishing/i],
  ['social-ads', /sponsored|social ad|\bads?\b/i],
];

// Industry tags inferred from the "Ideal For" line (multi-valued).
const INDUSTRY_RULES = [
  ['real-estate', /real estate/i],
  ['automotive', /car dealer|automotive|vehicle|dealership|rental/i],
  ['hospitality-tourism', /hospitality|tourism|hotel|\btour/i],
  ['restaurants-bars', /restaurant|\bbars?\b|cafe|café|\bfood\b|f&b/i],
  ['retail-shops', /\bshops?\b|retail|\bstore/i],
  ['events', /event/i],
  ['coaches-recruiters', /coach|recruit/i],
  ['content-creators', /\bcreators?\b|blogger|publisher/i],
  ['agencies', /agenc/i],
  ['consultants', /consultant/i],
  ['sales-teams', /sales team|sales department|sales professional|\bsales\b/i],
  ['corporate-teams', /corporate|enterprise|business network|association/i],
  ['entrepreneurs', /entrepreneur|founder|startup/i],
  ['smes', /\bsmes?\b|small business|local business/i],
];

const LABEL_RE = /^(Category|SKU|Price|Description|Features|Ideal For|Call to Action|Stripe Checkout Link|Product Link)\s*:\s*(.*)$/i;

function parsePrice(raw) {
  const s = String(raw || '').trim();
  if (!s || /custom quote|on request|contact/i.test(s)) {
    return { pricing_type: 'one_time', price: null, price_unit: 'fixed', monthly_price: null, yearly_price: null };
  }
  const m = s.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
  const amount = m ? parseFloat(m[1]) : null;
  if (/\/\s*month|per month|monthly/i.test(s)) {
    return { pricing_type: 'subscription', price: null, price_unit: 'fixed', monthly_price: amount, yearly_price: null };
  }
  if (/\/\s*year|per year|yearly|annual/i.test(s)) {
    return { pricing_type: 'subscription', price: null, price_unit: 'fixed', monthly_price: null, yearly_price: amount };
  }
  if (/\/\s*hour|per hour|hourly/i.test(s)) {
    return { pricing_type: 'one_time', price: amount, price_unit: 'hour', monthly_price: null, yearly_price: null };
  }
  if (/per agreed quantity|per quantity|\beach\b|per unit/i.test(s)) {
    return { pricing_type: 'one_time', price: amount, price_unit: 'quantity', monthly_price: null, yearly_price: null };
  }
  return { pricing_type: 'one_time', price: amount, price_unit: 'fixed', monthly_price: null, yearly_price: null };
}

function resolveSubcategory(servicePage, haystack) {
  if (!servicePage) return null;
  const allowed = taxonomy.subcategoryValuesFor(servicePage);
  for (const [value, re] of SUBCATEGORY_RULES) {
    if (allowed.includes(value) && re.test(haystack)) return value;
  }
  return null;
}

function resolveIndustries(idealFor) {
  const found = [];
  for (const [value, re] of INDUSTRY_RULES) {
    if (re.test(idealFor) && !found.includes(value)) found.push(value);
  }
  return found.slice(0, 6);
}

// Read labelled fields out of one product block's lines.
function readFields(lines) {
  const positions = [];
  lines.forEach((line, idx) => {
    const m = line.match(LABEL_RE);
    if (m) positions.push({ idx, label: m[1].toLowerCase(), inline: (m[2] || '').trim() });
  });
  const fields = {};
  positions.forEach((cur, k) => {
    const end = k + 1 < positions.length ? positions[k + 1].idx : lines.length;
    const content = [];
    if (cur.inline) content.push(cur.inline);
    for (let j = cur.idx + 1; j < end; j++) {
      const l = lines[j].trim();
      if (l === '') continue;
      if (/^#/.test(l)) break; // a heading ends the section (guards trailing doc text)
      content.push(l);
    }
    fields[cur.label] = content;
  });
  return fields;
}

function parseProductListings(rawText) {
  // Strip Markdown bold noise and normalise newlines.
  const text = String(rawText || '').replace(/\*/g, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));

  // Product blocks start at a numbered heading: "## 2. Name" (Docs export) or
  // just "2. Name" (plain paste). The Markdown hashes are optional.
  const headingRe = /^(?:#{1,6}\s*)?\d+\.\s+(.+?)\s*$/;
  const starts = [];
  lines.forEach((l, idx) => { if (headingRe.test(l)) starts.push(idx); });

  const products = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const name = lines[start].match(headingRe)[1].trim();
    const block = lines.slice(start + 1, end);

    // A real product block carries labelled fields. This rejects prose
    // numbered lists (e.g. a "1. Launch Ready Starter" bullet in trailing
    // strategy notes) that happen to start with "N.".
    if (!block.some((l) => LABEL_RE.test(l))) continue;

    const fields = readFields(block);

    const warnings = [];
    const first = (k) => (fields[k] && fields[k][0]) || '';
    const joined = (k) => (fields[k] || []).join(' ').trim();

    const category = first('category');
    const servicePage = SERVICE_PAGE_BY_CATEGORY[category.toLowerCase().trim()] || null;
    if (!servicePage) warnings.push(`Unrecognized category "${category}" — set Service Page manually.`);

    const productLink = (first('product link') || '').replace(/[<>]/g, '').trim();
    const haystack = `${name} ${productLink} ${category}`;
    const subcategory = resolveSubcategory(servicePage, haystack);
    if (servicePage && !subcategory) warnings.push('Could not infer subcategory — set it manually.');

    // Features may be "- item" (Docs export) or plain lines (paste). Strip any
    // leading bullet character and keep every non-empty line.
    const features = (fields['features'] || [])
      .map((l) => l.replace(/^[-*•·]\s*/, '').trim())
      .filter(Boolean);

    const idealFor = joined('ideal for');
    const industries = resolveIndustries(idealFor);

    const priceRaw = first('price');
    const pricing = parsePrice(priceRaw);
    if (pricing.price === null && pricing.monthly_price === null && pricing.yearly_price === null) {
      warnings.push(`No fixed price ("${priceRaw}") — imported as a quote item.`);
    }

    const stripeLink = (first('stripe checkout link') || '').replace(/[<>]/g, '').trim();

    products.push({
      name,
      slug: slugify(name),
      sku: first('sku') || null,
      service_page: servicePage,
      subcategory,
      description: joined('description'),
      features,
      industries,
      ...pricing,
      purchase_mode: 'consult', // lead-first default; admin flips true self-serve items to "buy"
      currency: 'USD',
      stripe_payment_link: /^https?:\/\//i.test(stripeLink) ? stripeLink : null,
      product_link: /^https?:\/\//i.test(productLink) ? productLink : null,
      slide_in_subtitle: idealFor ? `Ideal for: ${idealFor}` : null,
      status: 'draft',
      warnings,
    });
  }

  return { products };
}

module.exports = { parseProductListings, SERVICE_PAGE_BY_CATEGORY };
