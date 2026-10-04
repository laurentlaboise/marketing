import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { publicOrigin } from '../lib/catalog';
import { useCatalog } from '../state';
import type { CatalogProduct } from '../types';

type QrRow = {
  product: CatalogProduct;
  svg: string;
  png: string;
};

async function makeQr(url: string): Promise<{ svg: string; png: string }> {
  const [svg, png] = await Promise.all([
    QRCode.toString(url, { type: 'svg', margin: 1, width: 256, color: { dark: '#303942', light: '#ffffff' } }),
    QRCode.toDataURL(url, { margin: 1, width: 512, color: { dark: '#303942', light: '#ffffff' } }),
  ]);
  return { svg, png };
}

function download(filename: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

function svgHref(svg: string): string {
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}

export function PrintQrsPage() {
  const { catalog } = useCatalog();
  const [readyOnly, setReadyOnly] = useState(true);
  const [rows, setRows] = useState<QrRow[]>([]);
  const origin = publicOrigin();

  const products = useMemo(() => {
    if (!catalog) return [];
    const list = readyOnly ? catalog.products.filter((p) => p.live_in_portal) : catalog.products;
    return list;
  }, [catalog, readyOnly]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: QrRow[] = [];
      for (const product of products) {
        const url = `${origin}/q/${product.slug}`;
        const art = await makeQr(url);
        next.push({ product, ...art });
      }
      if (!cancelled) setRows(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [products, origin]);

  return (
    <main className="page wide">
      <p className="kicker">Print QRs</p>
      <h1>One QR per printed slug</h1>
      <p className="lede">
        Each code points at <code>{origin || 'this-origin'}/q/&#123;slug&#125;</code> — never a numeric SKU, and never
        <code> /api/public/qr/:id</code> (that path is BCEL payment art).
      </p>
      {catalog?.warning && <div className="banner">{catalog.warning}</div>}
      <label className="row" style={{ marginBottom: '1rem' }}>
        <input type="checkbox" checked={readyOnly} onChange={(e) => setReadyOnly(e.target.checked)} />
        Only the ~{catalog?.cardReadyCount ?? 6} SKUs marked card-ready in the seed
      </label>
      <div className="qr-grid">
        {rows.map((row) => (
          <article key={row.product.slug} className="card">
            <div dangerouslySetInnerHTML={{ __html: row.svg }} />
            <h2 style={{ marginTop: '0.6rem' }}>{row.product.code}</h2>
            <p className="tiny">
              {row.product.name}
              <br />
              /q/{row.product.slug}
            </p>
            <div className="row">
              <button
                className="btn ghost"
                type="button"
                onClick={() => download(`wts-${row.product.slug}.svg`, svgHref(row.svg))}
              >
                SVG
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => download(`wts-${row.product.slug}.png`, row.png)}
              >
                PNG
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
