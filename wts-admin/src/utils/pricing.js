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

module.exports = { normalizeTiers, unitPriceForQuantity };
