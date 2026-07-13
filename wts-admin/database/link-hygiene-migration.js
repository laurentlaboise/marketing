// One-shot (but idempotent, re-run every boot) repair of auto-link damage:
//
//   1. glossary.slug reconciliation — rows were slugged independently of the
//      static pages under en/resources/glossary/, so every DB-derived link
//      404'd. GLOSSARY_SLUG_MAP (reviewed by hand, one-to-one) renames each
//      slug to the real page basename. After the first run every UPDATE
//      matches zero rows.
//
//   2. Content sweep — long-form fields that already carry injected
//      auto-links get stripNestedAutoLinks (the form's old double-wrap bug)
//      and rewriteGlossaryHrefs (links minted under the old slugs). Rows are
//      only written when the text actually changes.
//
// Money-safety, same contract as the interlink sweep: swept fields are
// translation sources, so every touched row gets its PUBLISHED translations'
// source_hash refreshed inside the same transaction — repairs never flip
// paid work back to pending.
const { GLOSSARY_SLUG_MAP, sanitizeAutoLinks } = require('../src/lib/link-hygiene');

const SWEEP_SOURCES = {
  article: { table: 'articles', fields: ['text_article', 'excerpt', 'content'] },
  glossary: { table: 'glossary', fields: ['definition', 'example'] },
  seo_term: { table: 'seo_terms', fields: ['definition', 'short_definition', 'examples'] },
  guide: { table: 'guides', fields: ['short_description', 'long_content'] },
  product: { table: 'products', fields: ['description', 'slide_in_content'] },
};

async function run(client) {
  const core = require('../src/lib/translation-core');
  const summary = { slugsRenamed: 0, rowsCleaned: 0 };

  await client.query('BEGIN');
  try {
    // Runs after the boot transaction (and its lock) committed — take the
    // same advisory lock so parallel boots (test servers, rolling deploys)
    // can't sweep concurrently. Transaction-scoped: released at COMMIT.
    await client.query('SELECT pg_advisory_xact_lock(727150001)');

    for (const [oldSlug, newSlug] of Object.entries(GLOSSARY_SLUG_MAP)) {
      const res = await client.query(
        `UPDATE glossary SET slug = $2, updated_at = CURRENT_TIMESTAMP
         WHERE slug = $1
           AND NOT EXISTS (SELECT 1 FROM glossary g2 WHERE g2.slug = $2)`,
        [oldSlug, newSlug]
      );
      summary.slugsRenamed += res.rowCount;
    }

    for (const [type, src] of Object.entries(SWEEP_SOURCES)) {
      // Only rows that can contain injected links — everything else is
      // skipped without even running the transforms. All SWEEP_SOURCES
      // tables are created unconditionally by the boot DDL, so a query
      // error here is a real bug and must propagate (the db.js call site
      // logs it without blocking startup).
      const rows = (await client.query(
        `SELECT id, ${src.fields.join(', ')} FROM ${src.table}
         WHERE ${src.fields.map((f) => `${f} LIKE '%auto-linked%'`).join(' OR ')}`
      )).rows;

      for (const row of rows) {
        const changes = {};
        for (const field of src.fields) {
          if (!row[field] || typeof row[field] !== 'string') continue;
          const cleaned = sanitizeAutoLinks(row[field]);
          if (cleaned !== row[field]) changes[field] = cleaned;
        }
        if (!Object.keys(changes).length) continue;

        const setSql = Object.keys(changes)
          .map((field, i) => `${field} = $${i + 1}`) // names from SWEEP_SOURCES, never input
          .join(', ');
        await client.query(
          `UPDATE ${src.table} SET ${setSql}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $${Object.keys(changes).length + 1}`,
          [...Object.values(changes), row.id]
        );
        const source = await core.fetchEntitySource(type, String(row.id), client);
        if (source) {
          await client.query(
            `UPDATE translations SET source_hash = $1
             WHERE entity_type = $2 AND entity_id = $3 AND status = 'published'`,
            [source.hash, type, String(row.id)]
          );
        }
        summary.rowsCleaned += 1;
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
  return summary;
}

module.exports = { run, SWEEP_SOURCES };
