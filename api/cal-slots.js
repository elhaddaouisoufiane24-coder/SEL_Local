import { getClientIp, checkRateLimit } from '../lib/rate-limit.js';
import { calFetch, CAL_EVENT_TYPE_ID } from '../lib/cal-api.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const { allowed } = checkRateLimit(ip, { limit: 30, windowMs: 60 * 1000 });
  if (!allowed) {
    return res.status(429).json({ error: 'Troppe richieste, riprova tra poco.' });
  }

  const { start, end } = req.query || {};
  if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
    return res.status(400).json({ error: 'Parametri start/end mancanti' });
  }

  const query = new URLSearchParams({
    eventTypeId: String(CAL_EVENT_TYPE_ID),
    start,
    end,
    timeZone: 'Europe/Rome',
  });

  const result = await calFetch(`/slots?${query}`, { apiVersion: '2024-09-04' });

  if (!result.ok) {
    return res.status(result.status).json({ error: 'Errore nel recupero degli orari disponibili' });
  }

  res.status(200).json(result.data);
}
