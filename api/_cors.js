/**
 * Scopes CORS to the request's own deployment host instead of '*'.
 * This service's only browser client is its own index.html served from
 * the same Vercel deployment, so matching req.headers.host covers
 * production, the custom alias, and every preview URL automatically —
 * no hardcoded domain to get wrong or forget to update. A desktop app
 * client (see api/search.js) sends no Origin header and is unaffected.
 */
function applyCors(req, res, { methods, headers } = {}) {
  const origin = req.headers.origin;
  const selfOrigin = req.headers.host ? `https://${req.headers.host}` : null;
  const devOrigin = 'http://localhost:3000';

  if (origin && (origin === selfOrigin || origin === devOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods || 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', headers || 'Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false;
  }
  return true;
}

module.exports = { applyCors };
