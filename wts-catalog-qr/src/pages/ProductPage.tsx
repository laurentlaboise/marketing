import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { findProduct, resolveUnitPrice } from '../lib/catalog';
import { money } from '../lib/format';
import { useCatalog } from '../state';

export function ProductPage() {
  const { slug = '' } = useParams();
  const { catalog, loading, add } = useCatalog();
  const navigate = useNavigate();
  const product = catalog ? findProduct(catalog, slug) : undefined;
  const [optionKey, setOptionKey] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const chosen = useMemo(() => {
    if (!product) return null;
    return optionKey || product.default_option_key;
  }, [optionKey, product]);

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (!product) {
    return (
      <main className="page">
        <h1>Unknown catalog code</h1>
        <p className="lede">
          <code>{slug}</code> is not in the printed v2.1 list. Check the paper page or start the wizard.
        </p>
        <Link className="btn secondary" to="/wizard">
          Open wizard
        </Link>
      </main>
    );
  }

  const unit = resolveUnitPrice(product, chosen);
  const buyable = product.purchase_mode === 'buy' && unit != null;

  function addToCart() {
    add({
      slug: product!.slug,
      qty,
      option_key: chosen,
      billing_period: chosen === 'yearly' || chosen === 'basic_yearly' ? 'yearly' : chosen === 'monthly' || chosen === 'basic_monthly' ? 'monthly' : null,
    });
    setAdded(true);
  }

  return (
    <main className="page">
      <p className="kicker">Paper QR · /q/{product.slug}</p>
      <h1>{product.name}</h1>
      <div className="product-meta">
        <span className={`badge ${buyable ? 'buy' : 'quote'}`}>{buyable ? 'Buy' : 'Quote'}</span>
        <span className={`badge ${product.live_matched ? 'live' : 'demo'}`}>
          {product.live_matched ? 'Live portal price' : 'Printed / demo price'}
        </span>
        <span className="tiny">Code {product.code}{product.sku ? ` · SKU ${product.sku}` : ''}</span>
      </div>
      <p className="lede">{product.description}</p>

      <div className="story">
        <div className="card before">
          <p className="kicker">Before</p>
          <p style={{ margin: 0 }}>{product.story.before}</p>
        </div>
        <div className="card after">
          <p className="kicker">After</p>
          <p style={{ margin: 0 }}>{product.story.after}</p>
        </div>
      </div>

      {product.price_options.length > 0 && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h2>Configure</h2>
          <div className="choice-grid">
            {product.price_options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`choice${chosen === opt.key ? ' selected' : ''}`}
                onClick={() => setOptionKey(opt.key)}
              >
                <strong>{opt.label}</strong>
                <small>{opt.price != null ? money(opt.price, product.currency) : 'Quote'}{opt.sku ? ` · ${opt.sku}` : ''}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card accent" style={{ marginTop: '1rem' }}>
        <p className="price">{unit != null ? money(unit, product.currency) : product.price_label}</p>
        <p className="tiny">{product.live_slug ? `Portal slug ${product.live_slug}` : 'Not matched to a live portal row yet'}</p>
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <div className="qty" aria-label="Quantity">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span>{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))}>+</button>
          </div>
          <button className="btn primary" type="button" onClick={addToCart}>
            Add to cart · ใส่ตะกร้า
          </button>
          <button className="btn ghost" type="button" onClick={() => { addToCart(); navigate('/cart'); }}>
            Add & view cart
          </button>
        </div>
        {added && (
          <p className="tiny" style={{ marginTop: '0.7rem' }}>
            Added. <Link to="/cart">Open cart</Link> or <Link to="/wizard">keep matching</Link>.
          </p>
        )}
      </section>
    </main>
  );
}
