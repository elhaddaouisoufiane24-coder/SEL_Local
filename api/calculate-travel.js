import { getClientIp, checkRateLimit } from '../lib/rate-limit.js';
import { isBot } from '../lib/honeypot.js';

// Maserada sul Piave (TV) — coordinate fisse, geocoded una volta via Nominatim.
const ORIGIN_LAT = 45.7528549;
const ORIGIN_LON = 12.3398874;

const RATE_PER_KM_EURO = 0.65; // per km, già sul totale andata+ritorno; include una stima dei pedaggi
const NOMINATIM_USER_AGENT = 'AutoInspecta.it Booking Form (contatto: elhaddaoui.soufiane24@gmail.com)';
const ORS_DIRECTIONS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car';

async function geocodeIndirizzo(indirizzo) {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: indirizzo,
    format: 'json',
    limit: '1',
    countrycodes: 'it',
  })}`;
  const response = await fetch(url, { headers: { 'User-Agent': NOMINATIM_USER_AGENT } });
  if (!response.ok) {
    throw new Error('Geocoding non riuscito per questo indirizzo');
  }
  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('Indirizzo non trovato');
  }
  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Bot rilevato dall'honeypot: rispondiamo 200 senza far capire che è stato
  // scoperto, ma non chiamiamo servizi esterni (niente costo, niente dati finti utili).
  if (isBot(req.body)) {
    return res.status(200).json({ km: 0, trasferta_cents: 0 });
  }

  const ip = getClientIp(req);
  const { allowed } = checkRateLimit(ip, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!allowed) {
    return res.status(429).json({ error: 'Troppe richieste, riprova più tardi.' });
  }

  const { indirizzo, lat, lon } = req.body || {};
  if (!indirizzo || typeof indirizzo !== 'string' || indirizzo.trim().length < 5) {
    return res.status(400).json({ error: 'Indirizzo non valido' });
  }

  try {
    // Se il frontend ha già le coordinate (l'utente ha selezionato un
    // suggerimento Nominatim), le usiamo direttamente e saltiamo il
    // geocoding: OpenRouteService accetta solo coordinate, non testo.
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    const { lat: destLat, lon: destLon } = hasCoords
      ? { lat, lon }
      : await geocodeIndirizzo(indirizzo);

    const orsResponse = await fetch(ORS_DIRECTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.OPENROUTESERVICE_API_KEY,
      },
      body: JSON.stringify({
        coordinates: [
          [ORIGIN_LON, ORIGIN_LAT],
          [destLon, destLat],
        ],
      }),
    });

    const orsData = await orsResponse.json();
    const route = orsData?.routes?.[0];

    if (!orsResponse.ok || !route || !Number.isFinite(route.summary?.distance)) {
      throw new Error(orsData?.error?.message || 'Percorso non trovato per questo indirizzo');
    }

    const kmAndata = route.summary.distance / 1000;
    const kmTotali = kmAndata * 2;
    const trasfertaEuro = kmTotali * RATE_PER_KM_EURO;

    res.status(200).json({
      km: Math.round(kmTotali * 10) / 10,
      trasferta_cents: Math.round(trasfertaEuro * 100),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Errore nel calcolo del percorso' });
  }
}
