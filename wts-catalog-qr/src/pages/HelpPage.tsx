import { portalChatUrl, whatsappUrl } from '../lib/portal';
import { whatsappNumber } from '../lib/catalog';

export function HelpPage() {
  const chat = portalChatUrl();
  const wa = whatsappUrl(
    'Hello WordsThatSells — I scanned a paper catalog QR and need help choosing / checking out.',
    whatsappNumber(),
  );

  return (
    <main className="page">
      <p className="kicker">Help · ช่วยเหลือ</p>
      <h1>Talk to a person, or the portal chat</h1>
      <p className="lede">
        Intake PDFs are out of scope here. For a quote or a stuck cart, use the existing client portal chat
        or WhatsApp. Payments still happen on the portal.
      </p>
      <div className="stack">
        <a className="btn primary block" href={chat} target="_blank" rel="noreferrer">
          Open portal chat
        </a>
        <a className="btn secondary block" href={wa} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
      </div>
      <section className="card" style={{ marginTop: '1.2rem' }}>
        <h2>What this app will not do</h2>
        <ul className="muted">
          <li>No Stripe keys, no BCEL QR generation.</li>
          <li>No second price list — demo seed only when the public API is down or <code>VITE_DEMO=1</code>.</li>
          <li>No production deploy from this folder without an explicit yes.</li>
        </ul>
      </section>
    </main>
  );
}
