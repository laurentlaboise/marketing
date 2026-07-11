// Throwaway-inbox domains blocked from creating portal accounts. Bots and
// abuse funnels lean on these; real prospects in Laos/Thailand do not.
// Extend per deployment with DISPOSABLE_EMAIL_DOMAINS (comma-separated) —
// no redeploy needed to react to a new burner service.
const BASE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamailblock.com',
  '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'tempmail.dev',
  'yopmail.com', 'sharklasers.com', 'trashmail.com', 'trash-mail.com',
  'getnada.com', 'dispostable.com', 'maildrop.cc', 'mintemail.com',
  'throwawaymail.com', 'fakeinbox.com', 'mailnesia.com', 'tempr.email',
  'discard.email', 'spamgourmet.com', 'mytemp.email', 'burnermail.io',
  'emailondeck.com', 'moakt.com', 'tmpmail.net', 'mohmal.com',
  'mail-temp.com', '1secmail.com', 'emailfake.com',
]);

const extraDomains = () => (process.env.DISPOSABLE_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function isDisposableEmail(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at === -1) return false;
  const domain = String(email).slice(at + 1).toLowerCase();
  return BASE_DOMAINS.has(domain) || extraDomains().includes(domain);
}

module.exports = { isDisposableEmail };
