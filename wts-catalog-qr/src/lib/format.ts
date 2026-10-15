export function money(amount: number | null | undefined, currency = 'USD'): string {
  if (amount == null || Number.isNaN(amount)) return 'Quote';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function lineAmount(unit: number | null, qty: number): number | null {
  if (unit == null) return null;
  return Math.round(unit * qty * 100) / 100;
}

export function parseProductCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}
