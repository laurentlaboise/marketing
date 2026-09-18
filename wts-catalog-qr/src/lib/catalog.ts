import seed from '../data/catalog-seed.json';
import productIndex from '../data/product-index.json';
import { storyFor } from './stories';
import type { CatalogProduct, CatalogState, PriceOption, PricingType, PurchaseMode } from '../types';

export const PORTAL_API_DEFAULT = 'https://admin.wordsthatsells.website/api/public';
export const PORTAL_ORIGIN_DEFAULT = 'https://admin.wordsthatsells.website';

type SeedProduct = {
  code: string;
  slug: string;
  name: string;
  sku: string | null;
  price_label: string;
  price_usd: number | null;
  purchase_mode: string;
  has_quotation: boolean;
  has_intake: boolean;
  has_sales: boolean;
  live_in_portal: boolean;
};

type IndexEntry = {
  title?: string;
  sku?: string | null;
  price?: string | null;
};

type LiveOption = {
  key?: string;
  label?: string;
  sku?: string | null;
  price?: number | null;
  description?: string;
};

type LiveProduct = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  price?: number | null;
  currency?: string;
  sku?: string | null;
  purchase_mode?: string;
  price_unit?: string;
  industries?: string[];
  pricing?: {
    type?: string;
    options?: LiveOption[];
    one_time_price?: number | null;
    monthly_price?: number | null;
    yearly_price?: number | null;
    from_price?: number | null;
  };
};

export const INDUSTRY_LABELS: Record<string, string> = {
  'restaurants-bars': 'Restaurants & bars',
  'retail-shops': 'Retail shops',
  'hospitality-tourism': 'Hospitality & tourism',
  smes: 'SMEs',
  'professional-services': 'Professional services',
};

const SKU_OVERRIDES: Record<string, string> = {
  // Seed COPY5K reuses the 2.5k SKU; product-index + live options use 19106836.
  COPY5K: '19106836',
  GBP: '19385828',
};

function industriesByCode(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const groups = seed.wizard_industries as Record<string, string[]>;
  for (const [industry, codes] of Object.entries(groups)) {
    for (const code of codes) {
      const list = map.get(code) || [];
      if (!list.includes(industry)) list.push(industry);
      map.set(code, list);
    }
  }
  return map;
}

function parseIndexPrice(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = label.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function defaultOptions(code: string, price: number | null): { options: PriceOption[]; key: string | null; type: PricingType } {
  if (code === 'SMEBM') {
    return {
      type: 'options',
      key: 'basic_monthly',
      options: [
        { key: 'basic_monthly', label: 'Monthly mentoring', price: price ?? 290, sku: '20486641-M' },
        { key: 'basic_yearly', label: 'Yearly mentoring', price: 2436, sku: '20486641-Y' },
      ],
    };
  }
  if (code === 'CANVAM' || code === 'CANVAY') {
    return {
      type: 'options',
      key: code === 'CANVAY' ? 'yearly' : 'monthly',
      options: [
        { key: 'monthly', label: 'Monthly', price: 15, sku: '15354843' },
        { key: 'yearly', label: 'Yearly', price: 126, sku: '15354844' },
      ],
    };
  }
  return { type: 'one_time', key: null, options: [] };
}

function buildDemoProducts(): CatalogProduct[] {
  const byIndustry = industriesByCode();
  const index = productIndex.products as Record<string, IndexEntry>;
  return (seed.products as SeedProduct[]).map((raw) => {
    const idx = index[raw.code] || {};
    const sku = SKU_OVERRIDES[raw.code] || (raw.sku && !raw.sku.includes('xx') ? raw.sku : idx.sku || raw.sku);
    const cleanedSku = sku && sku.includes('xx') ? null : sku;
    const indexPrice = parseIndexPrice(idx.price);
    const priceUsd = raw.price_usd ?? indexPrice;
    const defaults = defaultOptions(raw.code, priceUsd);
    const name = raw.name;
    return {
      code: raw.code,
      slug: raw.slug,
      name,
      sku: cleanedSku,
      price_label: raw.price_label,
      price_usd: priceUsd,
      purchase_mode: (raw.purchase_mode === 'buy' ? 'buy' : 'consult') as PurchaseMode,
      has_quotation: raw.has_quotation,
      has_intake: raw.has_intake,
      has_sales: raw.has_sales,
      live_in_portal: raw.live_in_portal,
      industries: byIndustry.get(raw.code) || [],
      description: idx.title && idx.title !== 'How to use' ? idx.title : name,
      story: storyFor(raw.slug),
      price_options: defaults.options,
      pricing_type: defaults.type,
      default_option_key: defaults.key,
      currency: 'USD',
      price_unit: 'fixed',
      live_slug: null,
      live_id: null,
      live_matched: false,
      source: 'demo',
    };
  });
}

function optionUnit(product: CatalogProduct, optionKey: string | null): number | null {
  if (product.price_options.length && optionKey) {
    const hit = product.price_options.find((o) => o.key === optionKey);
    if (hit) return hit.price;
  }
  return product.price_usd;
}

export function resolveUnitPrice(product: CatalogProduct, optionKey: string | null): number | null {
  return optionUnit(product, optionKey || product.default_option_key);
}

export function resolvePriceLabel(product: CatalogProduct, optionKey: string | null): string {
  const key = optionKey || product.default_option_key;
  if (key) {
    const opt = product.price_options.find((o) => o.key === key);
    if (opt && opt.price != null) return `${opt.label} · $${opt.price}`;
    if (opt) return opt.label;
  }
  if (product.price_usd != null) return product.price_label;
  return product.price_label || 'Quote';
}

function indexLive(live: LiveProduct[]) {
  const bySku = new Map<string, { product: LiveProduct; option?: LiveOption }>();
  const bySlug = new Map<string, LiveProduct>();
  for (const p of live) {
    if (p.slug) bySlug.set(p.slug, p);
    if (p.sku) bySku.set(String(p.sku), { product: p });
    for (const opt of p.pricing?.options || []) {
      if (opt.sku) bySku.set(String(opt.sku), { product: p, option: opt });
    }
  }
  return { bySku, bySlug };
}

function mergeLive(demo: CatalogProduct[], live: LiveProduct[]): CatalogProduct[] {
  const { bySku, bySlug } = indexLive(live);
  return demo.map((product) => {
    const skuHit = product.sku ? bySku.get(product.sku) : undefined;
    const slugHit = bySlug.get(product.slug);
    const hit = skuHit?.product || slugHit;
    if (!hit) return product;

    const liveOptions = (hit.pricing?.options || [])
      .filter((o) => o.key)
      .map((o) => ({
        key: String(o.key),
        label: o.label || String(o.key),
        price: o.price ?? null,
        sku: o.sku || null,
        description: o.description,
      }));

    const matchedOption = skuHit?.option;
    const defaultKey = matchedOption?.key
      || product.default_option_key
      || (liveOptions[0]?.key ?? null);

    const livePrice =
      matchedOption?.price ??
      hit.pricing?.one_time_price ??
      hit.pricing?.from_price ??
      hit.price ??
      product.price_usd;

    const purchaseMode: PurchaseMode = hit.purchase_mode === 'buy' ? 'buy' : 'consult';

    return {
      ...product,
      name: product.name,
      description: hit.description || product.description,
      price_usd: livePrice ?? product.price_usd,
      purchase_mode: purchaseMode,
      price_options: liveOptions.length ? liveOptions : product.price_options,
      pricing_type: (hit.pricing?.type as PricingType) || product.pricing_type,
      default_option_key: defaultKey,
      currency: hit.currency || 'USD',
      price_unit: hit.price_unit || product.price_unit,
      industries: (hit.industries && hit.industries.length ? hit.industries : product.industries),
      live_slug: hit.slug || null,
      live_id: hit.id || null,
      live_matched: true,
      source: 'merged',
      live_in_portal: product.live_in_portal || purchaseMode === 'buy',
    };
  });
}

function toState(products: CatalogProduct[], meta: { demoForced: boolean; liveOk: boolean; liveCount: number; warning: string | null }): CatalogState {
  return {
    products,
    bySlug: new Map(products.map((p) => [p.slug, p])),
    byCode: new Map(products.map((p) => [p.code, p])),
    demoForced: meta.demoForced,
    liveOk: meta.liveOk,
    liveCount: meta.liveCount,
    matchedCount: products.filter((p) => p.live_matched).length,
    cardReadyCount: products.filter((p) => p.live_in_portal).length,
    warning: meta.warning,
  };
}

export function portalApiBase(): string {
  const raw = (import.meta.env.VITE_PORTAL_API || PORTAL_API_DEFAULT).trim();
  return raw.replace(/\/$/, '');
}

export function portalOrigin(): string {
  const raw = (import.meta.env.VITE_PORTAL_ORIGIN || PORTAL_ORIGIN_DEFAULT).trim();
  return raw.replace(/\/$/, '');
}

export function isDemoForced(): boolean {
  const flag = (import.meta.env.VITE_DEMO || '').trim();
  return flag === '1' || flag.toLowerCase() === 'true';
}

export function publicOrigin(): string {
  const raw = (import.meta.env.VITE_PUBLIC_ORIGIN || '').trim();
  if (raw) return raw.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function whatsappNumber(): string {
  return (import.meta.env.VITE_WHATSAPP || '8562055528034').replace(/\D/g, '');
}

export async function loadCatalog(): Promise<CatalogState> {
  const demo = buildDemoProducts();
  const cardReady = demo.filter((p) => p.live_in_portal).length;
  const gap = `Printed catalog v2.1 has ${demo.length} SKUs; about ${cardReady} are marked card-ready in the portal. Do not print every QR until slugs/SKUs are reconciled.`;

  if (isDemoForced()) {
    return toState(demo, { demoForced: true, liveOk: false, liveCount: 0, warning: gap });
  }

  try {
    const res = await fetch(`${portalApiBase()}/products`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = (await res.json()) as LiveProduct[] | { error?: string };
    if (!Array.isArray(payload)) throw new Error('Unexpected products payload');
    const merged = mergeLive(demo, payload);
    return toState(merged, {
      demoForced: false,
      liveOk: true,
      liveCount: payload.length,
      warning: gap,
    });
  } catch {
    return toState(demo, {
      demoForced: false,
      liveOk: false,
      liveCount: 0,
      warning: `${gap} Live API unreachable — showing printed catalog prices.`,
    });
  }
}

export function findProduct(state: CatalogState, raw: string): CatalogProduct | undefined {
  const key = raw.trim();
  if (!key) return undefined;
  const lower = key.toLowerCase();
  return (
    state.bySlug.get(lower) ||
    state.byCode.get(key.toUpperCase()) ||
    state.products.find((p) => p.sku === key) ||
    state.products.find((p) => p.live_slug === lower)
  );
}

export const WIZARD_INDUSTRIES = seed.wizard_industries as Record<string, string[]>;
