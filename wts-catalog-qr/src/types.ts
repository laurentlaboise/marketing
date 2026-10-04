export type PurchaseMode = 'buy' | 'consult';

export type PricingType = 'one_time' | 'options' | 'subscription' | 'tiered';

export type PriceOption = {
  key: string;
  label: string;
  price: number | null;
  sku?: string | null;
  description?: string;
};

export type ProductStory = {
  before: string;
  after: string;
};

export type CatalogProduct = {
  code: string;
  slug: string;
  name: string;
  sku: string | null;
  price_label: string;
  price_usd: number | null;
  purchase_mode: PurchaseMode;
  has_quotation: boolean;
  has_intake: boolean;
  has_sales: boolean;
  live_in_portal: boolean;
  industries: string[];
  description: string;
  story: ProductStory;
  price_options: PriceOption[];
  pricing_type: PricingType;
  default_option_key: string | null;
  currency: string;
  price_unit: string;
  live_slug: string | null;
  live_id: string | null;
  live_matched: boolean;
  source: 'demo' | 'merged';
};

export type CartLine = {
  slug: string;
  qty: number;
  option_key: string | null;
  billing_period: 'monthly' | 'yearly' | null;
};

export type PortalSeedItem = {
  slug: string;
  live_slug?: string | null;
  live_id?: string | null;
  qty: number;
  option_key?: string | null;
  billing_period?: 'monthly' | 'yearly' | null;
};

export type PortalSeedPayload = {
  v: 1;
  source: 'wts-catalog-qr';
  items: PortalSeedItem[];
};

export type CatalogState = {
  products: CatalogProduct[];
  bySlug: Map<string, CatalogProduct>;
  byCode: Map<string, CatalogProduct>;
  demoForced: boolean;
  liveOk: boolean;
  liveCount: number;
  matchedCount: number;
  cardReadyCount: number;
  warning: string | null;
};

export type WizardAnswers = {
  industry: string;
  goal: string;
  hasWebsite: string;
  budget: string;
  languages: string;
};

export type RankedProduct = {
  product: CatalogProduct;
  score: number;
  reasons: string[];
};
