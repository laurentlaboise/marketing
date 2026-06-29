// Product taxonomy — single source of truth for the catalog structure.
//
// Shared by the admin form (dropdowns), server-side validation, the public
// API, and the bulk importer so categories can't drift into "Business Tools"
// vs "business-tools" vs "Biz Tools" across the catalog.
//
// Derived from the real product URLs and "Ideal For" lines in the product
// listings doc. Add/rename here and every consumer stays in sync.

// Primary category = the authoritative enum (already maps to the 4 front-end
// service pages and their URLs).
const SERVICE_PAGES = [
  { value: 'content-creation', label: 'Content Creation' },
  { value: 'social-media-management', label: 'Social Media Management' },
  { value: 'web-development', label: 'Web Development' },
  { value: 'business-tools', label: 'Business Tools' },
];

// Constrained child categories, scoped to each service_page.
const SUBCATEGORIES = {
  'content-creation': [
    { value: 'logo-design', label: 'Logo Design' },
    { value: 'copywriting', label: 'Copywriting & SEO Articles' },
    { value: 'translation', label: 'Translation Services' },
    { value: 'photography', label: 'Photography & Stock Images' },
    { value: 'banner-design', label: 'Banner Design' },
    { value: 'rss-feed', label: 'RSS Feed' },
    { value: 'menu-software', label: 'Restaurant Menu Software' },
    { value: 'car-listings', label: 'Car Listing Generator' },
  ],
  'social-media-management': [
    { value: 'page-setup', label: 'Page Setup' },
    { value: 'post-generators', label: 'Post Generators' },
    { value: 'publishing', label: 'Cross-Platform Publishing' },
    { value: 'social-ads', label: 'Sponsored Social Ads' },
  ],
  'web-development': [
    { value: 'landing-pages', label: 'Landing Pages' },
    { value: 'wordpress-divi', label: 'WordPress & Divi' },
    { value: 'web-apps', label: 'No-Code Web Apps' },
    { value: 'online-forms', label: 'Online Forms' },
    { value: 'crm-database', label: 'CRM & Database' },
  ],
  'business-tools': [
    { value: 'business-cards', label: 'Digital & NFC Business Cards' },
    { value: 'google-business-profile', label: 'Google Business Profile' },
    { value: 'google-adsense', label: 'Google AdSense' },
    { value: 'design-tools', label: 'Design Tool Access' },
    { value: 'sme-packages', label: 'SME All-in-One Packages' },
  ],
};

// Cross-cutting industry tags (from the "Ideal For" lines). Many-to-many: a
// product can target several. Drives the "browse by industry" tiers.
const INDUSTRIES = [
  { value: 'entrepreneurs', label: 'Entrepreneurs & Founders' },
  { value: 'smes', label: 'SMEs' },
  { value: 'agencies', label: 'Agencies' },
  { value: 'consultants', label: 'Consultants' },
  { value: 'sales-teams', label: 'Sales Teams' },
  { value: 'real-estate', label: 'Real Estate' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'hospitality-tourism', label: 'Hospitality & Tourism' },
  { value: 'restaurants-bars', label: 'Restaurants & Bars' },
  { value: 'retail-shops', label: 'Retail & Shops' },
  { value: 'events', label: 'Events' },
  { value: 'coaches-recruiters', label: 'Coaches & Recruiters' },
  { value: 'content-creators', label: 'Content Creators' },
  { value: 'corporate-teams', label: 'Corporate Teams' },
];

// How a product is acquired. Lead-first by default: most services start with a
// strategy conversation; only true self-serve products check out directly.
const PURCHASE_MODES = [
  { value: 'consult', label: 'Request a Quote / Book a Call' },
  { value: 'buy', label: 'Buy Now (self-serve checkout)' },
];

// Unit the displayed price is quoted in (only meaningful for one-time pricing).
const PRICE_UNITS = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'hour', label: 'Per hour' },
  { value: 'item', label: 'Per item' },
  { value: 'quantity', label: 'Per agreed quantity' },
];

// Flat sets for O(1) validation.
const SERVICE_PAGE_VALUES = SERVICE_PAGES.map((s) => s.value);
const INDUSTRY_VALUES = INDUSTRIES.map((i) => i.value);
const PURCHASE_MODE_VALUES = PURCHASE_MODES.map((m) => m.value);
const PRICE_UNIT_VALUES = PRICE_UNITS.map((u) => u.value);

function subcategoryValuesFor(servicePage) {
  return (SUBCATEGORIES[servicePage] || []).map((s) => s.value);
}

// Is `subcategory` valid for the given `servicePage`?
function isValidSubcategory(servicePage, subcategory) {
  if (!subcategory) return false;
  return subcategoryValuesFor(servicePage).includes(subcategory);
}

module.exports = {
  SERVICE_PAGES,
  SUBCATEGORIES,
  INDUSTRIES,
  PURCHASE_MODES,
  PRICE_UNITS,
  SERVICE_PAGE_VALUES,
  INDUSTRY_VALUES,
  PURCHASE_MODE_VALUES,
  PRICE_UNIT_VALUES,
  subcategoryValuesFor,
  isValidSubcategory,
};
