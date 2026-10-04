import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveLines, totals } from '../lib/cart';
import { money } from '../lib/format';
import { fetchPortalMe, portalCartDirectUrl, portalCartUrl, portalSignup, seedFromLines, seedPortalCart } from '../lib/portal';
import { resolveUnitPrice } from '../lib/catalog';
import { useCatalog } from '../state';

export function CartPage() {
  const { catalog, lines, update, remove, clear } = useCatalog();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoPaid, setDemoPaid] = useState(false);

  const resolved = useMemo(() => (catalog ? resolveLines(catalog, lines) : []), [catalog, lines]);
  const sums = useMemo(() => totals(resolved), [resolved]);
  const payload = useMemo(() => seedFromLines(resolved), [resolved]);

  async function continuePortal() {
    setBusy(true);
    setNote('');
    try {
      const me = await fetchPortalMe().catch(() => ({ signed_in: false }));
      if (me.signed_in) {
        const seeded = await seedPortalCart(resolved);
        if (seeded.ok) {
          window.location.href = portalCartDirectUrl(payload);
          return;
        }
        setNote(
          seeded.error
            + ' Opening the portal with a catalog_seed query instead. wts-admin does not consume that query yet — see README.',
        );
      }
      window.open(portalCartUrl(payload), '_blank', 'noopener,noreferrer');
      setNote(
        'Portal checkout opened. Sign in there. Cart seeding from this origin is stubbed until a marketing PR honors catalog_seed after login.',
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not reach the portal.');
    } finally {
      setBusy(false);
    }
  }

  async function onSignup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote('');
    try {
      const result = await portalSignup(email.trim());
      setNote(
        result.ok
          ? 'If that mailbox can receive mail, a portal magic link is on the way. Then return here or open Continue to portal checkout.'
          : result.error || 'Signup did not complete (origin allow-list or API).',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!catalog) {
    return (
      <main className="page">
        <p className="muted">Loading cart…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="kicker">Cart</p>
      <h1>Buy vs quote, then the portal</h1>
      <p className="lede">
        Multi-item cart with quantities and options. Payable lines stay in Buy. Consult / unpriced lines stay in Quote.
        Payment is never taken here.
      </p>

      {resolved.length === 0 && (
        <div className="empty">
          Cart is empty. <Link to="/wizard">Run the wizard</Link> or open a paper code.
        </div>
      )}

      {sums.buy.length > 0 && (
        <section>
          <h2>Buy</h2>
          {sums.buy.map((r) => (
            <CartRow key={`${r.line.slug}-${r.line.option_key}`} r={r} update={update} remove={remove} />
          ))}
          <div className="card accent totals">
            <span>Buy total</span>
            <span>{money(sums.buyTotal)}</span>
          </div>
        </section>
      )}

      {sums.quote.length > 0 && (
        <section style={{ marginTop: '1.2rem' }}>
          <h2>Quote</h2>
          {sums.quote.map((r) => (
            <CartRow key={`${r.line.slug}-${r.line.option_key}`} r={r} update={update} remove={remove} />
          ))}
          <p className="tiny">These go to a human quote in the portal — not Stripe.</p>
        </section>
      )}

      {resolved.length > 0 && (
        <section className="card magenta" style={{ marginTop: '1.2rem' }}>
          <h2>Checkout CTA</h2>
          <p className="muted">
            Continue to <code>admin.wordsthatsells.website/portal/cart</code>. Stripe Embedded + BCEL stay in wts-admin.
          </p>
          <form onSubmit={onSignup} className="stack">
            <div className="field">
              <label htmlFor="email">Portal email (magic link via existing signup API)</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <button className="btn ghost" type="submit" disabled={busy || !email.includes('@')}>
              Email me a portal link
            </button>
          </form>
          <div className="stack" style={{ marginTop: '0.8rem' }}>
            <button className="btn primary block" type="button" disabled={busy} onClick={continuePortal}>
              Continue to portal checkout · ไปชำระที่พอร์ทัล
            </button>
            <button className="btn secondary block" type="button" onClick={() => setDemoPaid(true)}>
              Simulate local success (no charge)
            </button>
            <button className="btn ghost" type="button" onClick={clear}>
              Clear cart
            </button>
          </div>
          {note && <p className="banner" style={{ marginTop: '0.8rem' }}>{note}</p>}
          {demoPaid && (
            <p className="banner" style={{ marginTop: '0.8rem' }}>
              Demo only — no charge. In production the same lines would pay after portal session + saved_services seed.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

function CartRow({
  r,
  update,
  remove,
}: {
  r: ReturnType<typeof resolveLines>[number];
  update: (line: { slug: string; qty: number; option_key: string | null; billing_period: 'monthly' | 'yearly' | null }) => void;
  remove: (slug: string, optionKey: string | null) => void;
}) {
  const unit = resolveUnitPrice(r.product, r.line.option_key);
  return (
    <article className="card">
      <div className="product-meta">
        <span className={`badge ${r.bucket === 'buy' ? 'buy' : 'quote'}`}>{r.bucket === 'buy' ? 'Buy' : 'Quote'}</span>
        <span className="tiny">{r.product.code}</span>
      </div>
      <h2 style={{ marginBottom: 0 }}>
        <Link to={`/q/${r.product.slug}`}>{r.product.name}</Link>
      </h2>
      {r.product.price_options.length > 0 && (
        <div className="field" style={{ margin: '0.6rem 0' }}>
          <label>Option</label>
          <select
            value={r.line.option_key || r.product.default_option_key || ''}
            onChange={(e) =>
              update({
                ...r.line,
                option_key: e.target.value || r.product.default_option_key,
              })
            }
          >
            {r.product.price_options.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
                {opt.price != null ? ` · ${money(opt.price)}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="row">
        <div className="qty">
          <button type="button" onClick={() => update({ ...r.line, qty: Math.max(1, r.line.qty - 1) })}>
            −
          </button>
          <span>{r.line.qty}</span>
          <button type="button" onClick={() => update({ ...r.line, qty: r.line.qty + 1 })}>
            +
          </button>
        </div>
        <strong>{r.amount != null ? money(r.amount) : r.product.price_label}</strong>
        <button className="btn ghost" type="button" onClick={() => remove(r.product.slug, r.line.option_key)}>
          Remove
        </button>
      </div>
      <p className="tiny">{unit != null ? `${money(unit)} each` : 'Needs a quote'}</p>
    </article>
  );
}
