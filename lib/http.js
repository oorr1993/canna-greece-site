// Shared request guards for the API routes.

const ALLOWED_ORIGINS = new Set([
  'https://www.canaflight.com',
  'https://canaflight.com',
]);

// Defence-in-depth against cross-site abuse: a browser doing a legitimate
// same-origin POST sends Origin: https://www.canaflight.com. Non-browser
// clients (no Origin header) are still allowed — this is not a rate limiter,
// just a block on a foreign site scripting a visitor's browser into posting
// here cross-origin.
export function originAllowed(req) {
  const origin = req.headers['origin'];
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

export function readJsonBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  return body && typeof body === 'object' ? body : null;
}

export function clean(v, maxLen = 200) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, maxLen) : null;
}

// Deliberately permissive: the goal is to reject obvious typos and junk, not
// to adjudicate RFC 5322. A real address that this rejects is a lost lead,
// which costs more than a junk row that it lets through.
export function cleanEmail(v) {
  const s = clean(v, 254);
  if (!s) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s.toLowerCase() : null;
}
