import { resolveUnitPrice } from './catalog';
import { lineAmount } from './format';
import type { CartLine, CatalogProduct, CatalogState } from '../types';

const STORAGE_KEY = 'wts-catalog-qr.cart.v1';

export function loadCart(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && typeof l.slug === 'string')
      .map((l) => ({
        slug: l.slug,
        qty: Math.min(9999, Math.max(1, Number(l.qty) || 1)),
        option_key: l.option_key || null,
        billing_period: l.billing_period === 'yearly' || l.billing_period === 'monthly' ? l.billing_period : null,
      }));
  } catch {
    return [];
  }
}

export function saveCart(lines: CartLine[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
}

export function upsertLine(lines: CartLine[], next: CartLine): CartLine[] {
  const key = `${next.slug}::${next.option_key || ''}`;
  const qty = Math.min(9999, Math.max(1, next.qty));
  const existing = lines.findIndex((l) => `${l.slug}::${l.option_key || ''}` === key);
  if (existing === -1) return [...lines, { ...next, qty }];
  const copy = lines.slice();
  copy[existing] = { ...copy[existing], ...next, qty };
  return copy;
}

export function removeLine(lines: CartLine[], slug: string, optionKey: string | null): CartLine[] {
  return lines.filter((l) => !(l.slug === slug && (l.option_key || null) === (optionKey || null)));
}

export type ResolvedLine = {
  line: CartLine;
  product: CatalogProduct;
  unit: number | null;
  amount: number | null;
  bucket: 'buy' | 'quote';
};

export function resolveLines(state: CatalogState, lines: CartLine[]): ResolvedLine[] {
  const out: ResolvedLine[] = [];
  for (const line of lines) {
    const product = state.bySlug.get(line.slug);
    if (!product) continue;
    const unit = resolveUnitPrice(product, line.option_key);
    const payable = product.purchase_mode === 'buy' && unit != null && unit > 0;
    out.push({
      line,
      product,
      unit,
      amount: lineAmount(unit, line.qty),
      bucket: payable ? 'buy' : 'quote',
    });
  }
  return out;
}

export function totals(resolved: ResolvedLine[]) {
  const buy = resolved.filter((r) => r.bucket === 'buy');
  const quote = resolved.filter((r) => r.bucket === 'quote');
  const buyTotal = buy.reduce((sum, r) => sum + (r.amount || 0), 0);
  return {
    buy,
    quote,
    buyTotal: Math.round(buyTotal * 100) / 100,
    count: resolved.length,
  };
}
