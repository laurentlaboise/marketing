// Volume-discount quantity pricing helpers.
//
// A product with pricing_type 'tiered' stores quantity_tiers: an array of
// { min_qty, unit_price } sorted ascending by min_qty. The unit price applies
// from that quantity up to (but not including) the next tier's min_qty, so the
// per-unit price drops as the customer buys more.

// Coerce raw tier input (from a form or JSONB) into a clean, sorted array.
function normalizeTiers(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch (e) { arr = []; }
  }
  if (!Array.isArray(arr)) return [];

  const cleaned = arr
    .map((t) => ({
      min_qty: parseInt(t && t.min_qty, 10),
      unit_price: (t && (t.unit_price === '' || t.unit_price == null)) ? null : parseFloat(t && t.unit_price),
    }))
    .filter((t) => Number.isFinite(t.min_qty) && t.min_qty >= 1
      && t.unit_price != null && Number.isFinite(t.unit_price) && t.unit_price >= 0);

  // De-dupe by min_qty (last wins), then sort ascending.
  const byMin = new Map();
  cleaned.forEach((t) => byMin.set(t.min_qty, t));
  return Array.from(byMin.values()).sort((a, b) => a.min_qty - b.min_qty);
}

// The per-unit price for a given quantity given a sorted tier list.
function unitPriceForQuantity(tiers, qty) {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  const q = Math.max(1, parseInt(qty, 10) || 1);
  let price = tiers[0].unit_price; // below the first threshold → first tier price
  for (const t of tiers) {
    if (q >= t.min_qty) price = t.unit_price;
  }
  return price;
}

/**
 * Named price options for pricing_type='options' (one product, multiple SKUs/prices).
 * Each option: { key, label, sku, price, strategy?, stripe_price_id?, features?, description? }
 */
function normalizePriceOptions(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch (e) { arr = []; }
  }
  if (!Array.isArray(arr)) return [];

  const cleaned = [];
  const seenKeys = new Set();
  arr.forEach((o, idx) => {
    if (!o || typeof o !== 'object') return;
    const key = String(o.key || o.id || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    if (!key || seenKeys.has(key)) return;
    const price = o.price === '' || o.price == null ? null : parseFloat(o.price);
    if (price == null || !Number.isFinite(price) || price < 0) return;
    const label = String(o.label || o.name || key).trim().slice(0, 120);
    if (!label) return;
    seenKeys.add(key);
    let features = o.features;
    if (typeof features === 'string') {
      features = features.split('\n').map((f) => f.trim()).filter(Boolean);
    }
    if (!Array.isArray(features)) features = [];
    cleaned.push({
      key,
      label,
      sku: o.sku != null && String(o.sku).trim() ? String(o.sku).trim().slice(0, 100) : null,
      price,
      strategy: o.strategy != null && String(o.strategy).trim()
        ? String(o.strategy).trim().slice(0, 60)
        : null,
      stripe_price_id: o.stripe_price_id != null && String(o.stripe_price_id).trim()
        ? String(o.stripe_price_id).trim().slice(0, 255)
        : null,
      features: features.map((f) => String(f).trim()).filter(Boolean).slice(0, 20),
      description: o.description != null && String(o.description).trim()
        ? String(o.description).trim().slice(0, 500)
        : null,
      sort: Number.isFinite(parseInt(o.sort, 10)) ? parseInt(o.sort, 10) : idx,
    });
  });
  return cleaned.sort((a, b) => a.sort - b.sort).map(({ sort, ...rest }) => rest);
}

function findPriceOption(options, optionKey) {
  const list = normalizePriceOptions(options);
  if (!list.length) return null;
  const key = String(optionKey || '').trim().toLowerCase();
  if (!key) return list[0];
  return list.find((o) => o.key === key) || null;
}

module.exports = {
  normalizeTiers,
  unitPriceForQuantity,
  normalizePriceOptions,
  findPriceOption,
};
