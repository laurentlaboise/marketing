import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { findProduct } from '../lib/catalog';
import { parseProductCode } from '../lib/format';
import { useCatalog } from '../state';

export function HomePage() {
  const { catalog, loading } = useCatalog();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!catalog) return;
    const hit = findProduct(catalog, parseProductCode(code) || code);
    if (!hit) {
      setError('No printed code like that. Try SEO3, WPDIVI, or CANVAM.');
      return;
    }
    navigate(`/q/${hit.slug}`);
  }

  return (
    <main className="page">
      <p className="kicker">Paper catalog → portal cart</p>
      <h1>Scan the code. Pick the work. Pay in the client portal.</h1>
      <p className="lede">
        This is the front door for the printed v2.1 catalog. It does not take cards or BCEL here —
        checkout stays on the WordsThatSells portal so the same price list and customer account are used.
      </p>

      {catalog?.warning && <div className="banner">{catalog.warning}</div>}
      {loading && <p className="muted">Loading catalog…</p>}
      {catalog && (
        <p className="tiny">
          {catalog.liveOk
            ? `Live API ok · ${catalog.matchedCount}/${catalog.products.length} printed SKUs matched.`
            : catalog.demoForced
              ? 'Demo mode (VITE_DEMO=1) — seed prices only.'
              : 'API down — demo seed prices.'}
        </p>
      )}

      <div className="stack" style={{ marginTop: '1rem' }}>
        <Link className="btn primary block" to="/wizard">
          Start the 5-question wizard · เริ่มเลย
        </Link>
        <form className="card" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="code">Or enter a product code from the paper page</label>
            <input
              id="code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError('');
              }}
              placeholder="e.g. seo3 or WPDIVI"
              autoCapitalize="characters"
            />
          </div>
          {error && <p className="banner error">{error}</p>}
          <button className="btn secondary block" type="submit" style={{ marginTop: '0.75rem' }}>
            Open product
          </button>
        </form>
      </div>

      <section className="card" style={{ marginTop: '1.2rem' }}>
        <h2>How a paper QR connects</h2>
        <ol className="muted">
          <li>QR encodes the <strong>slug</strong> (<code>/q/seo3</code>), never the numeric SKU.</li>
          <li>Wizard and cart use one price spine — live <code>/api/public/products</code> when reachable.</li>
          <li>Checkout hands off to <code>/portal/cart</code>. Stripe and BCEL stay in wts-admin.</li>
        </ol>
        <p className="tiny">
          <code>/api/public/qr/:id</code> is a BCEL payment image. Do not print those as catalog deep links.
        </p>
      </section>
    </main>
  );
}
