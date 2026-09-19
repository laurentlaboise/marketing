import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { resolvePriceLabel, resolveUnitPrice } from '../lib/catalog';
import { money } from '../lib/format';
import type { CatalogProduct } from '../types';

export function ProductCard({
  product,
  reason,
  action,
}: {
  product: CatalogProduct;
  reason?: string;
  action?: ReactNode;
}) {
  const unit = resolveUnitPrice(product, product.default_option_key);
  return (
    <article className="card accent">
      <div className="product-meta">
        <span className={`badge ${product.purchase_mode === 'buy' && unit != null ? 'buy' : 'quote'}`}>
          {product.purchase_mode === 'buy' && unit != null ? 'Buy' : 'Quote'}
        </span>
        <span className={`badge ${product.live_matched ? 'live' : 'demo'}`}>
          {product.live_matched ? 'Live price' : 'Printed / demo'}
        </span>
        <span className="tiny">{product.code}</span>
      </div>
      <h2>
        <Link to={`/q/${product.slug}`}>{product.name}</Link>
      </h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {reason || product.description}
      </p>
      <p className="price">{unit != null ? money(unit, product.currency) : product.price_label}</p>
      <p className="tiny">{resolvePriceLabel(product, product.default_option_key)}</p>
      {action}
    </article>
  );
}
