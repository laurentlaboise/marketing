// Shared CORS / origin allow-list, used by the global cors() middleware in
// server.js and by browser-origin checks on public write endpoints.
const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://wordsthatsells.website',
  'https://www.wordsthatsells.website'
];

const getAllowedOrigins = () => {
  return process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;
};

// Browser-sent Origin header check for public, unauthenticated write
// endpoints. Requests without an Origin header (curl, server-to-server)
// are allowed — the goal is to stop cross-site browser posts, which
// always carry Origin.
const isOriginAllowed = (req) => {
  const origin = req.get('origin');
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
};

module.exports = { getAllowedOrigins, isOriginAllowed };
