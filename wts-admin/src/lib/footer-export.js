/**
 * Footer export — turn the admin's footer data (footer_variants +
 * footer_assignments + menu_items + site_settings) into the build-time
 * footers.json structure consumed by scripts/inject-footers.js. Used by the
 * Footer Settings "Publish" action.
 *
 * Storage scheme (so the default footer needs no migration):
 *   - variant 'main' → columns location 'footer' / 'footer-legal',
 *                      settings keys 'footer_<field>'.
 *   - variant <slug> → columns location 'footer:<slug>' / 'footer-legal:<slug>',
 *                      settings keys 'footer:<slug>:<field>'.
 */
const db = require('../../database/db');

const SOCIAL_FIELDS = [
  { field: 'social_instagram', icon: 'fab fa-instagram', label: 'Instagram' },
  { field: 'social_linkedin', icon: 'fab fa-linkedin', label: 'LinkedIn' },
  { field: 'social_facebook', icon: 'fab fa-facebook-square', label: 'Facebook' },
  { field: 'social_twitter', icon: 'fab fa-twitter-square', label: 'Twitter' },
  { field: 'social_youtube', icon: 'fab fa-youtube-square', label: 'YouTube' },
];

// Resolve where a variant's content lives. The 'main' variant uses the legacy
// (unprefixed) locations/keys; every other slug is namespaced.
function variantStorage(slug) {
  if (slug === 'main') {
    return { colLocation: 'footer', legalLocation: 'footer-legal', prefix: 'footer_' };
  }
  return { colLocation: `footer:${slug}`, legalLocation: `footer-legal:${slug}`, prefix: `footer:${slug}:` };
}

// Read a variant's settings as { <field>: value }. Filtered with startsWith (not
// SQL LIKE) so the '_' in 'footer_' can't wildcard-match 'footer:<slug>:' keys.
async function getSettings(prefix) {
  const r = await db.query(`SELECT key, value FROM site_settings WHERE key LIKE 'footer%'`);
  const out = {};
  r.rows.forEach(row => {
    if (row.key.startsWith(prefix)) out[row.key.slice(prefix.length)] = row.value || '';
  });
  return out;
}

function buildSocial(s) {
  return SOCIAL_FIELDS.filter(f => s[f.field]).map(f => ({ icon: f.icon, href: s[f.field], label: f.label }));
}

function buildContact(s) {
  const items = [];
  if (s.contact_address) {
    items.push({ icon: 'fas fa-map-marker-alt', text: s.contact_address });
  }
  if (s.contact_maps_url) {
    items.push({ icon: 'fab fa-google', href: s.contact_maps_url, external: true, text: 'Find us on Google' });
  }
  if (s.contact_whatsapp) {
    const digits = s.contact_whatsapp.replace(/[^0-9]/g, '');
    let href = 'https://wa.me/' + digits;
    if (s.contact_whatsapp_text) href += '?text=' + encodeURIComponent(s.contact_whatsapp_text);
    items.push({ icon: 'fab fa-whatsapp', href, external: true, text: s.contact_whatsapp });
  }
  if (s.contact_email) {
    let href = 'mailto:' + s.contact_email;
    const params = [];
    if (s.contact_email_subject) params.push('subject=' + encodeURIComponent(s.contact_email_subject));
    if (s.contact_email_body) params.push('body=' + encodeURIComponent(s.contact_email_body));
    if (params.length) href += '?' + params.join('&');
    items.push({ icon: 'fas fa-envelope', href, external: true, text: s.contact_email });
  }
  return items;
}

async function buildColumns(location) {
  const r = await db.query(
    `SELECT id, label, url, parent_id, sort_order, open_in_new_tab
     FROM menu_items WHERE is_visible = TRUE AND location = $1
     ORDER BY sort_order ASC, label ASC`,
    [location]
  );
  const byId = {};
  r.rows.forEach(row => { byId[row.id] = row; row._children = []; });
  const tops = [];
  r.rows.forEach(row => {
    if (row.parent_id && byId[row.parent_id]) byId[row.parent_id]._children.push(row);
    else tops.push(row);
  });
  return tops.map(col => ({
    heading: col.label,
    links: col._children.map(c => {
      const link = { text: c.label, href: c.url || '#' };
      if (c.open_in_new_tab) link.external = true;
      return link;
    }),
  }));
}

async function buildLegal(location) {
  const r = await db.query(
    `SELECT label, url, open_in_new_tab FROM menu_items
     WHERE is_visible = TRUE AND location = $1 AND parent_id IS NULL
     ORDER BY sort_order ASC, label ASC`,
    [location]
  );
  return r.rows.map(row => {
    const item = { text: row.label, href: row.url || '#' };
    if (row.open_in_new_tab) item.external = true;
    return item;
  });
}

// Build one variant object from its admin data.
async function buildVariant(slug) {
  const { colLocation, legalLocation, prefix } = variantStorage(slug);
  const [s, columns, legal] = await Promise.all([
    getSettings(prefix),
    buildColumns(colLocation),
    buildLegal(legalLocation),
  ]);
  return {
    social: buildSocial(s),
    contactHeading: 'Contact Us',
    contact: buildContact(s),
    columns,
    legal,
    copyright: s.copyright || '',
  };
}

// Back-compat helper retained for the simple single-variant path.
async function buildMainVariant() {
  return buildVariant('main');
}

// Build the complete footers.json from the variant + assignment tables.
async function buildAllConfig() {
  const [vRes, aRes] = await Promise.all([
    db.query(`SELECT slug, is_default FROM footer_variants ORDER BY sort_order ASC, slug ASC`),
    db.query(`SELECT pattern, variant_slug FROM footer_assignments ORDER BY sort_order ASC, created_at ASC`),
  ]);
  const variants = {};
  let def = 'main';
  for (const v of vRes.rows) {
    variants[v.slug] = await buildVariant(v.slug);
    if (v.is_default) def = v.slug;
  }
  if (!variants[def]) variants.main = variants.main || (await buildVariant('main'));
  let assignments = aRes.rows.map(a => ({ match: a.pattern, variant: a.variant_slug }));
  // Never silently wipe the article-page protection if no assignments are set.
  if (assignments.length === 0) {
    assignments = [
      { match: '/en/resources', variant: 'keep' },
      { match: '/en/resources/*', variant: 'keep' },
    ];
  }
  return { default: def, assignments, variants };
}

// Merge a single variant into an existing footers.json (preserves the rest).
function mergeFootersConfig(existing, variantName, variant) {
  const config = (existing && typeof existing === 'object') ? existing : {
    default: 'main',
    assignments: [
      { match: '/en/resources', variant: 'keep' },
      { match: '/en/resources/*', variant: 'keep' },
    ],
    variants: {},
  };
  if (!config.variants || typeof config.variants !== 'object') config.variants = {};
  if (!config.default) config.default = 'main';
  config.variants[variantName] = variant;
  return config;
}

module.exports = { buildVariant, buildMainVariant, buildAllConfig, mergeFootersConfig, variantStorage };
