import { getClientIp, checkRateLimit } from '../lib/rate-limit.js';

// Proxy verso Nominatim (OpenStreetMap). Serve perché i browser non possono
// impostare l'header User-Agent da fetch/XHR (è tra gli header "forbidden"
// dello spec Fetch) — Nominatim lo richiede per policy, quindi la chiamata
// va fatta lato server, dove l'header viene effettivamente inviato.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'AutoInspecta.it Booking Form (contatto: elhaddaoui.soufiane24@gmail.com)';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  // Limite più permissivo del solito (qui è una ricerca-mentre-digiti, non un
  // invio form), ma comunque protegge Nominatim da un uso eccessivo: il
  // debounce lato client (400ms) è la prima barriera, questo è un backstop.
  const { allowed } = checkRateLimit(ip, { limit: 30, windowMs: 60 * 1000 });
  if (!allowed) {
    return res.status(429).json({ error: 'Troppe richieste, riprova tra poco.' });
  }

  const q = (req.query?.q || '').toString().trim();
  if (q.length < 3) {
    return res.status(200).json([]);
  }

  try {
    const url = `${NOMINATIM_URL}?${new URLSearchParams({
      q,
      format: 'json',
      addressdetails: '1',
      limit: '5',
      countrycodes: 'it',
    })}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      throw new Error('Nominatim ha risposto con un errore');
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Errore nella ricerca indirizzi' });
  }
}
