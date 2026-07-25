// Builds the faqs.json snapshot the site's bake step consumes
// (scripts/inject-faqs.js at the repo root). Published FAQs only, with
// per-language payload maps keyed by the site's internal directory codes
// (en|th|la|fr — the la↔lo mapping is HTML-facing and belongs to the
// injector, never to this export). Placement pools ship fully expanded so
// the injector never needs placement semantics beyond "render these".
const db = require('../../database/db');

const TARGET_LANGS = ['th', 'la', 'fr'];

async function buildFaqsJson() {
  const [categories, faqs, placements, faqTranslations, categoryTranslations] = await Promise.all([
    db.query(`SELECT id, slug, name, description, sort_order FROM faq_categories
              WHERE status = 'active' ORDER BY sort_order ASC, name ASC`),
    db.query(`SELECT f.id, f.slug, f.question, f.answer_html, f.sort_order, c.slug AS category_slug
              FROM faqs f LEFT JOIN faq_categories c
                ON c.id = f.category_id AND c.status = 'active'
              WHERE f.status = 'published'
              ORDER BY f.sort_order ASC, f.created_at ASC`),
    db.query(`SELECT p.page_path, p.pinned, p.sort_order, f.slug
              FROM faq_placements p JOIN faqs f ON f.id = p.faq_id AND f.status = 'published'
              ORDER BY p.page_path ASC, p.pinned DESC, p.sort_order ASC, f.sort_order ASC`),
    db.query(`SELECT entity_id, target_language, content_payload FROM translations
              WHERE entity_type = 'faq' AND status = 'published' AND target_language = ANY($1)`,
      [TARGET_LANGS]),
    db.query(`SELECT entity_id, target_language, content_payload FROM translations
              WHERE entity_type = 'faq_category' AND status = 'published' AND target_language = ANY($1)`,
      [TARGET_LANGS]),
  ]);

  const tByFaq = {};
  for (const row of faqTranslations.rows) {
    (tByFaq[row.entity_id] = tByFaq[row.entity_id] || {})[row.target_language] = row.content_payload || {};
  }
  const tByCategory = {};
  for (const row of categoryTranslations.rows) {
    (tByCategory[row.entity_id] = tByCategory[row.entity_id] || {})[row.target_language] = row.content_payload || {};
  }

  const langMap = (translationsForRow, enValue, field) => {
    const out = { en: enValue };
    for (const [lang, payload] of Object.entries(translationsForRow || {})) {
      if (payload && payload[field]) out[lang] = payload[field];
    }
    return out;
  };

  const publishedSlugs = faqs.rows.map((f) => f.slug);
  const pages = {};
  for (const row of placements.rows) {
    if (!pages[row.page_path]) pages[row.page_path] = { pinned: [], pool: [] };
    pages[row.page_path][row.pinned ? 'pinned' : 'pool'].push(row.slug);
  }

  return {
    generated_at: new Date().toISOString(),
    generated_by: 'wts-admin FAQ publish',
    categories: categories.rows.map((c) => ({
      slug: c.slug,
      sort_order: c.sort_order,
      name: langMap(tByCategory[c.id], c.name, 'name'),
      description: langMap(tByCategory[c.id], c.description || '', 'description'),
    })),
    faqs: faqs.rows.map((f) => ({
      slug: f.slug,
      category: f.category_slug || null,
      sort_order: f.sort_order,
      question: langMap(tByFaq[f.id], f.question, 'question'),
      answer_html: langMap(tByFaq[f.id], f.answer_html, 'answer_html'),
    })),
    placements: pages,
  };
}

// Best-effort faqs.json export + commit to the site repo. The push triggers
// faq-sync.yml, which bakes the FAQ regions into the static pages. Same
// contract as the localize dispatch: failures are reported, never thrown —
// a missing GITHUB_TOKEN must not block an admin save or a publish approve.
async function publishFaqSnapshot(message) {
  try {
    const { getFile, putFile } = require('./github-content');
    const json = JSON.stringify(await buildFaqsJson(), null, 2) + '\n';
    const current = await getFile('faqs.json');
    // Ignore the volatile generated_at/generated_by header when deciding
    // whether anything real changed — a no-op export must not create a
    // commit (and a site rebuild) on every publish click.
    const essence = (s) => String(s).split('\n').filter((l) => !/^\s*"generated_(at|by)":/.test(l)).join('\n');
    if (current && essence(current.content) === essence(json)) return { ok: true, reason: 'unchanged' };
    const result = await putFile('faqs.json', json, `Update FAQ content via admin (${message})`, current ? current.sha : null);
    if (!result.ok) console.warn('FAQ snapshot publish skipped:', result.reason);
    return result;
  } catch (error) {
    console.warn('FAQ snapshot publish failed:', error.message);
    return { ok: false, reason: error.message };
  }
}

module.exports = { buildFaqsJson, publishFaqSnapshot };
