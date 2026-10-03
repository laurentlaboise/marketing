import { WIZARD_INDUSTRIES } from './catalog';
import type { CatalogProduct, RankedProduct, WizardAnswers } from '../types';

export const INDUSTRY_OPTIONS = [
  { id: 'restaurants-bars', label: 'Restaurants & bars', th: 'ร้านอาหาร / บาร์' },
  { id: 'retail-shops', label: 'Retail shops', th: 'ร้านค้า' },
  { id: 'hospitality-tourism', label: 'Hospitality & tourism', th: 'โรงแรม / ท่องเที่ยว' },
  { id: 'smes', label: 'SMEs', th: 'ธุรกิจขนาดกลาง' },
  { id: 'professional-services', label: 'Professional services', th: 'สำนักงานวิชาชีพ' },
] as const;

export const GOAL_OPTIONS = [
  { id: 'get-found', label: 'Get found online', th: 'ให้คนค้นเจอ' },
  { id: 'look-professional', label: 'Look professional', th: 'ดูน่าเชื่อถือ' },
  { id: 'sell-more', label: 'Sell more this month', th: 'ขายให้ได้เดือนนี้' },
  { id: 'save-time', label: 'Save time on marketing', th: 'ประหยัดเวลา' },
] as const;

export const WEBSITE_OPTIONS = [
  { id: 'no', label: 'No website yet' },
  { id: 'building', label: 'Building one' },
  { id: 'yes', label: 'Yes — it is live' },
] as const;

export const BUDGET_OPTIONS = [
  { id: 'under-100', label: 'Under $100' },
  { id: '100-400', label: '$100 – $400' },
  { id: '400-plus', label: '$400+' },
  { id: 'not-sure', label: 'Not sure yet' },
] as const;

export const LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English' },
  { id: 'th', label: 'Thai / ไทย' },
  { id: 'lo', label: 'Lao / ລາວ' },
  { id: 'mixed', label: 'Mixed languages' },
] as const;

const GOAL_CODES: Record<string, string[]> = {
  'get-found': ['SEO3', 'SEO12', 'GBP', 'BLOG3', 'STOCKSEO', 'XLSEO', 'RSS'],
  'look-professional': ['LOGODES', 'LOGOAI', 'WPDIVI', 'WPHOME', 'QRCD', 'NFC', 'VCPRO', 'NFCC'],
  'sell-more': ['MENU', 'CARLIST', 'BANNER', 'GBP', 'CANVAM', 'STOCK10', 'COPY1K'],
  'save-time': ['CANVAM', 'CANVAY', 'RSS', 'AIDOC', 'XLSEO', 'SMEBM'],
};

const WEBSITE_CODES: Record<string, string[]> = {
  no: ['WPDIVI', 'WPHOME', 'GBP', 'LOGODES', 'QRCD'],
  building: ['WPMOD', 'CANVAM', 'STOCK10', 'COPY1K'],
  yes: ['SEO3', 'BLOG3', 'COPY5K', 'XLSEO', 'RSS', 'STOCKSEO'],
};

const LANG_CODES = ['XLSEO', 'XLSEOY', 'AIDOC', 'COPY1K', 'COPY5K', 'COPY10K'];

function unit(p: CatalogProduct): number | null {
  if (p.price_usd != null) return p.price_usd;
  const priced = p.price_options.find((o) => o.price != null);
  return priced?.price ?? null;
}

export function rankProducts(products: CatalogProduct[], answers: WizardAnswers): RankedProduct[] {
  const industryCodes = new Set(WIZARD_INDUSTRIES[answers.industry] || []);
  const goalCodes = new Set(GOAL_CODES[answers.goal] || []);
  const siteCodes = new Set(WEBSITE_CODES[answers.hasWebsite] || []);
  const wantLang = answers.languages !== 'en';

  const ranked: RankedProduct[] = products.map((product) => {
    let score = 0;
    const reasons: string[] = [];
    if (industryCodes.has(product.code)) {
      score += 40;
      reasons.push('Fits this industry');
    }
    if (product.industries.includes(answers.industry)) {
      score += 12;
    }
    if (goalCodes.has(product.code)) {
      score += 24;
      reasons.push('Matches the goal');
    }
    if (siteCodes.has(product.code)) {
      score += 16;
      reasons.push(answers.hasWebsite === 'no' ? 'Helps you get a site' : 'Works with a live site');
    }
    if (wantLang && LANG_CODES.includes(product.code)) {
      score += 14;
      reasons.push('Language-aware');
    }
    const price = unit(product);
    if (answers.budget === 'under-100' && price != null && price <= 100) {
      score += 10;
      reasons.push('In the under-$100 band');
    } else if (answers.budget === '100-400' && price != null && price >= 50 && price <= 400) {
      score += 10;
      reasons.push('In the $100–$400 band');
    } else if (answers.budget === '400-plus' && price != null && price >= 200) {
      score += 10;
      reasons.push('Larger package');
    } else if (answers.budget === 'under-100' && price != null && price > 400) {
      score -= 18;
    }
    if (product.live_in_portal) score += 4;
    if (product.purchase_mode === 'buy' && price != null) score += 3;
    return { product, score, reasons };
  });

  return ranked
    .filter((r) => r.score >= 16)
    .sort((a, b) => b.score - a.score || (unit(a.product) ?? 9e9) - (unit(b.product) ?? 9e9))
    .slice(0, 8);
}

export const emptyAnswers: WizardAnswers = {
  industry: '',
  goal: '',
  hasWebsite: '',
  budget: '',
  languages: '',
};
