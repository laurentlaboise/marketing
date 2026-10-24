import { portalApiBase, portalOrigin } from './catalog';
import type { ResolvedLine } from './cart';
import type { PortalSeedItem, PortalSeedPayload } from '../types';

export type { PortalSeedPayload } from '../types';

/**
 * Portal handoff (v1 stub)
 * ------------------------
 * Paper QR never talks to Stripe or BCEL. Checkout lives on wts-admin:
 *   FEATURE_CART portal at /portal/cart
 *   POST /api/public/my-services  (session cookie + Origin allow-list)
 *   POST /portal/cart/items/:productId/add  (same session)
 *
 * This app can:
 *   1. Build a signed-looking *unsigned* catalog_seed query (slugs + qty + option).
 *   2. Call POST /api/public/portal-signup (email → upsertCustomer + magic link)
 *      when the catalog origin is on ALLOWED_ORIGINS.
 *   3. If GET /api/public/portal-me says signed_in, POST each line to /my-services
 *      using live_id. That only works same-site (wordsthatsells.website).
 *
 * Follow-up (marketing / wts-admin PR, not this folder):
 *   - Honor ?next=/portal/cart&catalog_seed=… on /portal/login and magic-link auth
 *   - After session, resolve seed slugs/SKUs into saved_services
 *   - Add the catalog origin to DEFAULT_ORIGINS / ALLOWED_ORIGINS
 * Until then, "Continue to portal checkout" opens /portal/cart with the seed
 * attached so a human (or the follow-up) can finish the insert.
 */

export function seedFromLines(resolved: import('./cart').ResolvedLine[]): PortalSeedPayload {
  return {
    v: 1,
    source: 'wts-catalog-qr',
    items: resolved.map((r): PortalSeedItem => ({
      slug: r.product.slug,
      live_slug: r.product.live_slug,
      live_id: r.product.live_id,
      qty: r.line.qty,
      option_key: r.line.option_key,
      billing_period: r.line.billing_period,
    })),
  };
}

export function encodeSeed(payload: PortalSeedPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function portalCartPath(payload: PortalSeedPayload): string {
  return `/portal/cart?catalog_seed=${encodeSeed(payload)}`;
}

export function portalCartUrl(payload: PortalSeedPayload): string {
  const next = portalCartPath(payload);
  return `${portalOrigin()}/portal/login?next=${encodeURIComponent(next)}`;
}

export function portalCartDirectUrl(payload: PortalSeedPayload): string {
  return `${portalOrigin()}${portalCartPath(payload)}`;
}

export function portalChatUrl(): string {
  return `${portalOrigin()}/portal/chat`;
}

export function whatsappUrl(text: string, number: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export async function fetchPortalMe(): Promise<{ signed_in: boolean; email?: string | null }> {
  const res = await fetch(`${portalApiBase()}/portal-me`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return { signed_in: false };
  return res.json();
}

export async function portalSignup(email: string, name?: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${portalApiBase()}/portal-signup`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, name: name || '' }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok) return { ok: false, error: body.error || `Signup failed (${res.status})` };
  return { ok: true };
}

/** Session-authenticated seed. Works only when this origin is allow-listed and the portal cookie is present. */
export async function seedPortalCart(resolved: ResolvedLine[]): Promise<{ ok: boolean; seeded: number; error?: string }> {
  let seeded = 0;
  for (const r of resolved) {
    if (!r.product.live_id) continue;
    const res = await fetch(`${portalApiBase()}/my-services`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        product_id: r.product.live_id,
        option_key: r.line.option_key,
        quantity: r.line.qty,
        billing_period: r.line.billing_period,
      }),
    });
    if (res.ok) seeded += 1;
    else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, seeded, error: body.error || `Could not add ${r.product.slug}` };
    }
  }
  return { ok: seeded > 0, seeded, error: seeded ? undefined : 'No live product ids to seed' };
}
