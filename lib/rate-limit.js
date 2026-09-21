// Rate limiter in-memory per IP. Prima barriera anti-abuso: lo stato vive solo
// nella singola istanza serverless e si azzera ai cold start, quindi non è una
// difesa assoluta contro un bot distribuito — ma ferma il caso comune di uno
// script che martella lo stesso endpoint dallo stesso IP.
const buckets = new Map();

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function checkRateLimit(ip, { limit = 5, windowMs = 60 * 60 * 1000 } = {}) {
  const now = Date.now();
  const entry = buckets.get(ip);

  if (!entry || now - entry.start > windowMs) {
    buckets.set(ip, { start: now, count: 1 });
    return { allowed: true };
  }

  entry.count += 1;
  return { allowed: entry.count <= limit };
}
