#!/usr/bin/env node
/**
 * Sync WTS catalog products → Stripe Products + Prices, write IDs back to DB.
 *
 * Usage (from wts-admin, with Railway env):
 *   railway run node scripts/sync-products-to-stripe.js --dry-run
 *   railway run node scripts/sync-products-to-stripe.js
 *   railway run node scripts/sync-products-to-stripe.js --limit=10
 *
 * Requires: STRIPE_SECRET_KEY, DATABASE_URL
 * Does not charge customers — only creates catalog objects.
 */
/* eslint-disable no-console */
const Stripe = require('stripe');

const DRY = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cents(amount) {
  return Math.round(amount * 100);
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY missing');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing — run via: railway run node scripts/sync-products-to-stripe.js');
    process.exit(1);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: products } = await pool.query(
    `SELECT id, name, description, sku, slug, currency, status, pricing_type, product_type,
            price, monthly_price, yearly_price, setup_fee,
            stripe_product_id, stripe_price_id, stripe_price_id_monthly, stripe_price_id_yearly,
            stripe_price_id_setup, image_url
     FROM products
     WHERE COALESCE(status, 'active') = 'active'
     ORDER BY sort_order NULLS LAST, name`
  );

  let list = products;
  if (ONLY) {
    list = list.filter((p) => p.id === ONLY || p.sku === ONLY || (p.slug && p.slug === ONLY));
  }
  if (LIMIT > 0) list = list.slice(0, LIMIT);

  console.log(`Products to consider: ${list.length} (dry-run=${DRY})`);
  console.log(`Stripe mode: ${process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST'}`);

  const summary = { created: 0, skipped: 0, updated: 0, errors: [] };

  for (const p of list) {
    const currency = (p.currency || 'USD').toLowerCase();
    const isSub =
      p.pricing_type === 'subscription' || p.product_type === 'subscription';
    const oneTime = num(p.price);
    const monthly = num(p.monthly_price);
    const yearly = num(p.yearly_price);
    const setup = num(p.setup_fee);

    const hasOneTime = !isSub && oneTime;
    const hasSub = isSub && (monthly || yearly);
    if (!hasOneTime && !hasSub) {
      console.log(`SKIP  ${p.name} — no sellable price`);
      summary.skipped += 1;
      continue;
    }

    // Already fully linked?
    if (!isSub && p.stripe_product_id && p.stripe_price_id) {
      console.log(`OK    ${p.name} — already has stripe_price_id`);
      summary.skipped += 1;
      continue;
    }
    if (isSub && p.stripe_product_id && (p.stripe_price_id_monthly || p.stripe_price_id_yearly)) {
      console.log(`OK    ${p.name} — already has subscription stripe prices`);
      summary.skipped += 1;
      continue;
    }

    try {
      let productId = p.stripe_product_id;
      if (!productId) {
        if (DRY) {
          console.log(`DRY   CREATE product: ${p.name}`);
          productId = 'prod_dry_run';
        } else {
          const created = await stripe.products.create({
            name: p.name,
            description: (p.description || '').slice(0, 500) || undefined,
            images: p.image_url ? [p.image_url] : undefined,
            metadata: {
              wts_product_id: p.id,
              wts_sku: p.sku || '',
              wts_slug: p.slug || '',
              source: 'wts-admin-sync',
            },
          });
          productId = created.id;
          console.log(`PROD  ${p.name} → ${productId}`);
        }
      }

      let stripe_price_id = p.stripe_price_id;
      let stripe_price_id_monthly = p.stripe_price_id_monthly;
      let stripe_price_id_yearly = p.stripe_price_id_yearly;
      let stripe_price_id_setup = p.stripe_price_id_setup;

      if (hasOneTime && !stripe_price_id) {
        if (DRY) {
          console.log(`DRY   CREATE one_time price ${oneTime} ${currency}`);
          stripe_price_id = 'price_dry_run';
        } else {
          const price = await stripe.prices.create({
            product: productId,
            currency,
            unit_amount: cents(oneTime),
            metadata: { wts_product_id: p.id, kind: 'one_time' },
          });
          stripe_price_id = price.id;
          console.log(`PRICE one_time ${oneTime} ${currency} → ${stripe_price_id}`);
        }
      }

      if (hasSub) {
        if (monthly && !stripe_price_id_monthly) {
          if (DRY) {
            console.log(`DRY   CREATE monthly ${monthly}`);
            stripe_price_id_monthly = 'price_dry_monthly';
          } else {
            const price = await stripe.prices.create({
              product: productId,
              currency,
              unit_amount: cents(monthly),
              recurring: { interval: 'month' },
              metadata: { wts_product_id: p.id, kind: 'monthly' },
            });
            stripe_price_id_monthly = price.id;
            console.log(`PRICE monthly ${monthly} → ${stripe_price_id_monthly}`);
          }
        }
        if (yearly && !stripe_price_id_yearly) {
          if (DRY) {
            console.log(`DRY   CREATE yearly ${yearly}`);
            stripe_price_id_yearly = 'price_dry_yearly';
          } else {
            const price = await stripe.prices.create({
              product: productId,
              currency,
              unit_amount: cents(yearly),
              recurring: { interval: 'year' },
              metadata: { wts_product_id: p.id, kind: 'yearly' },
            });
            stripe_price_id_yearly = price.id;
            console.log(`PRICE yearly ${yearly} → ${stripe_price_id_yearly}`);
          }
        }
      }

      if (setup && !stripe_price_id_setup) {
        if (DRY) {
          console.log(`DRY   CREATE setup fee ${setup}`);
          stripe_price_id_setup = 'price_dry_setup';
        } else {
          const price = await stripe.prices.create({
            product: productId,
            currency,
            unit_amount: cents(setup),
            metadata: { wts_product_id: p.id, kind: 'setup' },
          });
          stripe_price_id_setup = price.id;
          console.log(`PRICE setup ${setup} → ${stripe_price_id_setup}`);
        }
      }

      if (!DRY) {
        await pool.query(
          `UPDATE products SET
             stripe_product_id = COALESCE($2, stripe_product_id),
             stripe_price_id = COALESCE($3, stripe_price_id),
             stripe_price_id_monthly = COALESCE($4, stripe_price_id_monthly),
             stripe_price_id_yearly = COALESCE($5, stripe_price_id_yearly),
             stripe_price_id_setup = COALESCE($6, stripe_price_id_setup),
             updated_at = NOW()
           WHERE id = $1`,
          [
            p.id,
            productId && productId !== 'prod_dry_run' ? productId : null,
            stripe_price_id && !String(stripe_price_id).includes('dry') ? stripe_price_id : null,
            stripe_price_id_monthly && !String(stripe_price_id_monthly).includes('dry')
              ? stripe_price_id_monthly
              : null,
            stripe_price_id_yearly && !String(stripe_price_id_yearly).includes('dry')
              ? stripe_price_id_yearly
              : null,
            stripe_price_id_setup && !String(stripe_price_id_setup).includes('dry')
              ? stripe_price_id_setup
              : null,
          ]
        );
        summary.updated += 1;
        summary.created += 1;
        console.log(`DB    updated ${p.name}`);
      } else {
        summary.created += 1;
      }
    } catch (e) {
      console.error(`ERR   ${p.name}:`, e.message);
      summary.errors.push({ id: p.id, name: p.name, error: e.message });
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
