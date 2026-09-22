import { getClientIp, checkRateLimit } from '../lib/rate-limit.js';
import { isBot } from '../lib/honeypot.js';

// Maserada sul Piave (TV) — coordinate fisse, geocoded una volta via Nominatim.
const ORIGIN_LAT = 45.7528549;
const ORIGIN_LON = 12.3398874;

const RATE_PER_KM_EURO = 0.5; // per km, già sul totale andata+ritorno
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
    return res.status(200).json({ km: 0, trasferta_cents: 0, pedaggi_cents: 0, stima_pedaggi: false });
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
    let destLat = lat;
    let destLon = lon;

    // Se il frontend non ha già le coordinate (es. l'utente non ha selezionato
    // una voce dal menu di suggerimenti), geocodiamo qui l'indirizzo testuale:
    // OpenRouteService accetta solo coordinate, non indirizzi in chiaro.
    if (!Number.isFinite(destLat) || !Number.isFinite(destLon)) {
      const geo = await geocodeIndirizzo(indirizzo);
      destLat = geo.lat;
      destLon = geo.lon;
    }

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

    // Nessun provider di routing gratuito (OpenRouteService incluso) fornisce
    // prezzi reali dei pedaggi italiani: sono dati commerciali proprietari.
    // Il rimborso resta quindi solo km × tariffa, segnalato come stima.
    const trasfertaEuro = kmTotali * RATE_PER_KM_EURO;

    res.status(200).json({
      km: Math.round(kmTotali * 10) / 10,
      pedaggi_cents: 0,
      trasferta_cents: Math.round(trasfertaEuro * 100),
      stima_pedaggi: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Errore nel calcolo del percorso' });
  }
}
