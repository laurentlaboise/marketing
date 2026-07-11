// Transactional email via the Brevo API.
//
// Configuration (Railway → Variables):
//   BREVO_API_KEY     required — sending is disabled without it
//   BREVO_FROM_EMAIL  the verified sender address in Brevo. Until the
//                     wordsthatsells.website domain is DNS-verified this
//                     must be the address the Brevo account was created
//                     with; afterwards switch to no-reply@wordsthatsells.website
//   BREVO_FROM_NAME   display name (default: Words That Sells)

const { translate } = require('../lib/i18n');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

function isConfigured() {
  return !!(process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL);
}

async function sendEmail({ to, subject, html, text }) {
  if (!isConfigured()) {
    console.warn('Mailer not configured (BREVO_API_KEY / BREVO_FROM_EMAIL missing) — email not sent:', subject);
    return { sent: false, reason: 'not_configured' };
  }
  const payload = {
    sender: {
      email: process.env.BREVO_FROM_EMAIL,
      name: process.env.BREVO_FROM_NAME || 'Words That Sells'
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text || undefined
  };
  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`Brevo send failed (${res.status}):`, body.slice(0, 300));
    return { sent: false, reason: `http_${res.status}` };
  }
  return { sent: true };
}

// Absolute https URL so mail clients (which never resolve relative paths
// and mostly block SVG) can load the logo; white PNG reads on the dark
// header band. Overridable per deployment.
const LOGO_URL = () => process.env.EMAIL_LOGO_URL ||
  'https://wordsthatsells.website/images/SEO_AI_Digital_Marketing_Agency_Laos_Thailand_Asia_logo_with_words_white_colour_PNG_900x900.png';

// Branded shell so every portal email reads as one system.
function emailShell(title, bodyHtml, locale = 'en') {
  // The brand name is defined once and interpolated into every string that
  // mentions it — it stays identical in every language.
  const brand = translate(locale, 'emails.shell.brand');
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#122a3f;padding:14px 24px;">
      <img src="${LOGO_URL()}" alt="${brand}" height="42" style="height:42px;max-width:100%;border:0;vertical-align:middle;">
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:1.15rem;">${title}</h2>
      ${bodyHtml}
    </div>
    <div style="padding:14px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:0.78rem;">
      ${translate(locale, 'emails.shell.footer', { brand })}
    </div>
  </div>
</body></html>`;
}

async function sendMagicLink(to, link, locale = 'en') {
  const brand = translate(locale, 'emails.shell.brand');
  return sendEmail({
    to,
    subject: translate(locale, 'emails.magicLink.subject', { brand }),
    html: emailShell(translate(locale, 'emails.magicLink.title'), `
      <p style="color:#334155;font-size:0.95rem;line-height:1.6;">${translate(locale, 'emails.magicLink.intro')}</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${link}" style="background:#d62b83;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block;">${translate(locale, 'emails.magicLink.button')}</a>
      </p>
      <p style="color:#94a3b8;font-size:0.8rem;line-height:1.5;">${translate(locale, 'emails.magicLink.linkFallback')}<br>${link}</p>
      <p style="color:#94a3b8;font-size:0.8rem;">${translate(locale, 'emails.magicLink.ignore')}</p>
    `, locale),
    text: translate(locale, 'emails.magicLink.text', { brand, link })
  });
}

module.exports = { sendEmail, sendMagicLink, emailShell, isConfigured };
