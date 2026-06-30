/**
 * Footer export — turn the admin's footer data (menu_items + site_settings)
 * into the build-time footers.json structure consumed by
 * scripts/inject-footers.js. Used by the Footer Settings "Publish" action.
 *
 * Slice 1 produces the default `main` variant from the current admin footer.
 * It merges into any existing footers.json so other variants and the
 * page→variant assignments (e.g. /en/resources/* → keep) are preserved.
 */
const db = require('../../database/db');

const SOCIAL_FIELDS = [
  { key: 'footer_social_instagram', icon: 'fab fa-instagram', label: 'Instagram' },
  { key: 'footer_social_linkedin', icon: 'fab fa-linkedin', label: 'LinkedIn' },
  { key: 'footer_social_facebook', icon: 'fab fa-facebook-square', label: 'Facebook' },
  { key: 'footer_social_twitter', icon: 'fab fa-twitter-square', label: 'Twitter' },
  { key: 'footer_social_youtube', icon: 'fab fa-youtube-square', label: 'YouTube' },
];

async function getSettings() {
  const r = await db.query(`SELECT key, value FROM site_settings WHERE key LIKE 'footer_%'`);
  const s = {};
  r.rows.forEach(row => { s[row.key] = row.value || ''; });
  return s;
}

function buildSocial(s) {
  return SOCIAL_FIELDS
    .filter(f => s[f.key])
    .map(f => ({ icon: f.icon, href: s[f.key], label: f.label }));
}

function buildContact(s) {
  const items = [];
  if (s.footer_contact_address) {
    items.push({ icon: 'fas fa-map-marker-alt', text: s.footer_contact_address });
  }
  if (s.footer_contact_maps_url) {
    items.push({ icon: 'fab fa-google', href: s.footer_contact_maps_url, external: true, text: 'Find us on Google' });
  }
  if (s.footer_contact_whatsapp) {
    const digits = s.footer_contact_whatsapp.replace(/[^0-9]/g, '');
    let href = 'https://wa.me/' + digits;
    if (s.footer_contact_whatsapp_text) href += '?text=' + encodeURIComponent(s.footer_contact_whatsapp_text);
    items.push({ icon: 'fab fa-whatsapp', href, external: true, text: s.footer_contact_whatsapp });
  }
  if (s.footer_contact_email) {
    let href = 'mailto:' + s.footer_contact_email;
    const params = [];
    if (s.footer_contact_email_subject) params.push('subject=' + encodeURIComponent(s.footer_contact_email_subject));
    if (s.footer_contact_email_body) params.push('body=' + encodeURIComponent(s.footer_contact_email_body));
    if (params.length) href += '?' + params.join('&');
    items.push({ icon: 'fas fa-envelope', href, external: true, text: s.footer_contact_email });
  }
  return items;
}

// Build the nested columns from menu_items at the given location.
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

// Build the `main` footer variant object from the current admin data.
async function buildMainVariant() {
  const s = await getSettings();
  const [columns, legal] = await Promise.all([
    buildColumns('footer'),
    buildLegal('footer-legal'),
  ]);
  return {
    social: buildSocial(s),
    contactHeading: 'Contact Us',
    contact: buildContact(s),
    columns,
    legal,
    copyright: s.footer_copyright || '',
  };
}

// Merge a freshly built variant into an existing footers.json object (or create
// a fresh skeleton), preserving assignments and any other variants.
function mergeFootersConfig(existing, variantName, variant) {
  const base = (existing && typeof existing === 'object') ? existing : null;
  const config = base || {
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

module.exports = { buildMainVariant, mergeFootersConfig };
