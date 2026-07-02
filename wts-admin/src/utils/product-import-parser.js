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

// ── Seed-JSON importer ─────────────────────────────────────────
//
// The curated catalog lives as JSON arrays under database/seed/ (one object
// per product, every editor field populated). The import screen accepts that
// JSON pasted directly; this validates/coerces each entry against the same
// taxonomy the form uses and returns the parseProductListings() shape.

const ALLOWED_PRICING_TYPES = ['one_time', 'subscription', 'tiered'];

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseSeedProducts(rawText) {
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    throw new Error('Invalid JSON: ' + e.message);
  }
  if (!Array.isArray(data)) {
    throw new Error('Expected a JSON array of products.');
  }

  const products = data.map((entry, i) => {
    const warnings = [];
    const e = entry || {};
    const name = String(e.name || '').trim();
    if (name.length < 3 || name.length > 80) warnings.push('Name must be 3–80 characters.');

    const servicePage = taxonomy.SERVICE_PAGE_VALUES.includes(e.service_page) ? e.service_page : null;
    if (!servicePage) warnings.push(`Invalid service_page "${e.service_page}".`);
    const subcategory = servicePage && taxonomy.isValidSubcategory(servicePage, e.subcategory) ? e.subcategory : null;
    if (!subcategory) warnings.push(`Invalid subcategory "${e.subcategory}" for ${e.service_page}.`);

    const pricingType = ALLOWED_PRICING_TYPES.includes(e.pricing_type) ? e.pricing_type : 'one_time';
    const tiers = Array.isArray(e.quantity_tiers)
      ? e.quantity_tiers
          .map((t) => ({ min_qty: parseInt(t && t.min_qty, 10), unit_price: num(t && t.unit_price) }))
          .filter((t) => Number.isFinite(t.min_qty) && t.min_qty >= 1 && t.unit_price !== null)
      : [];
    if (pricingType === 'tiered' && !tiers.length) warnings.push('Tiered pricing without valid quantity_tiers.');

    const industries = Array.isArray(e.industries)
      ? e.industries.filter((v) => taxonomy.INDUSTRY_VALUES.includes(v)).slice(0, 6)
      : [];

    const priceUnit = taxonomy.PRICE_UNIT_VALUES.includes(e.price_unit) ? e.price_unit : 'fixed';
    const purchaseMode = taxonomy.PURCHASE_MODE_VALUES.includes(e.purchase_mode) ? e.purchase_mode : 'consult';

    const price = pricingType === 'one_time' ? num(e.price) : null;
    const monthly = pricingType === 'subscription' ? num(e.monthly_price) : null;
    const yearly = pricingType === 'subscription' ? num(e.yearly_price) : null;
    if (purchaseMode === 'buy' &&
        !((pricingType === 'one_time' && price > 0) ||
          (pricingType === 'subscription' && (monthly > 0 || yearly > 0)) ||
          (pricingType === 'tiered' && tiers.length))) {
      warnings.push('purchase_mode "buy" without a sellable price — imported as consult.');
    }

    const stripeLink = String(e.stripe_payment_link || '').trim();
    const description = String(e.description || '').trim();
    if (description.length < 20) warnings.push('Description shorter than 20 characters.');

    return {
      name,
      slug: e.slug && /^[a-z0-9-]+$/.test(e.slug) ? e.slug : slugify(name),
      sku: e.sku ? String(e.sku).trim() : null,
      service_page: servicePage,
      subcategory,
      description,
      features: Array.isArray(e.features) ? e.features.map((f) => String(f).trim()).filter(Boolean) : [],
      industries,
      pricing_type: pricingType,
      price,
      price_unit: priceUnit,
      monthly_price: monthly,
      yearly_price: yearly,
      quantity_tiers: tiers,
      purchase_mode: warnings.some((w) => w.startsWith('purchase_mode')) ? 'consult' : purchaseMode,
      currency: 'USD',
      stripe_payment_link: /^https?:\/\//i.test(stripeLink) ? stripeLink : null,
      product_type: e.product_type === 'subscription' || pricingType === 'subscription' ? 'subscription'
        : (e.product_type === 'digital' ? 'digital' : 'service'),
      icon_class: /^fa[srb]?\s+fa-[a-z0-9-]+$/.test(String(e.icon_class || '')) ? e.icon_class : null,
      sort_order: Number.isFinite(parseInt(e.sort_order, 10)) ? parseInt(e.sort_order, 10) : 0,
      slide_in_title: e.slide_in_title ? String(e.slide_in_title).trim().slice(0, 500) : null,
      slide_in_subtitle: e.slide_in_subtitle ? String(e.slide_in_subtitle).trim() : null,
      slide_in_content: e.slide_in_content ? String(e.slide_in_content).trim() : null,
      status: 'draft',
      warnings,
    };
  });

  return { products };
}

module.exports = { parseProductListings, parseSeedProducts, SERVICE_PAGE_BY_CATEGORY };
