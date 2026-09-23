import { getClientIp, checkRateLimit } from '../lib/rate-limit.js';
import { isBot } from '../lib/honeypot.js';

// Maserada sul Piave (TV) — coordinate fisse, geocoded una volta via Nominatim.
const ORIGIN_LAT = 45.7528549;
const ORIGIN_LON = 12.3398874;

const RATE_PER_KM_EURO = 0.65; // per km, già sul totale andata+ritorno; include una stima dei pedaggi
const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search';
const ORS_DIRECTIONS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car';

async function geocodeComune(comune) {
  const url = `${ORS_GEOCODE_URL}?${new URLSearchParams({
    api_key: process.env.OPENROUTESERVICE_API_KEY,
    text: comune,
    'boundary.country': 'IT',
    size: '1',
  })}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Geocoding non riuscito per questo comune');
  }
  const data = await response.json();
  const feature = data?.features?.[0];
  if (!feature) {
    const err = new Error('Comune non trovato, controlla come l\'hai scritto');
    err.notFound = true;
    throw err;
  }
  const [lon, lat] = feature.geometry.coordinates;
  const props = feature.properties || {};
  const comuneTrovato = props.region_a ? `${props.name}, ${props.region_a}` : props.label || props.name;
  return { lat, lon, comuneTrovato };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Bot rilevato dall'honeypot: rispondiamo 200 senza far capire che è stato
  // scoperto, ma non chiamiamo servizi esterni (niente costo, niente dati finti utili).
  if (isBot(req.body)) {
    return res.status(200).json({ km: 0, trasferta_cents: 0, comune_trovato: '' });
  }

  const ip = getClientIp(req);
  const { allowed } = checkRateLimit(ip, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!allowed) {
    return res.status(429).json({ error: 'Troppe richieste, riprova più tardi.' });
  }

  const { comune } = req.body || {};
  if (!comune || typeof comune !== 'string' || comune.trim().length < 2) {
    return res.status(400).json({ error: 'Comune non valido' });
  }

  try {
    const { lat: destLat, lon: destLon, comuneTrovato } = await geocodeComune(comune);

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
      throw new Error(orsData?.error?.message || 'Percorso non trovato per questo comune');
    }

    const kmAndata = route.summary.distance / 1000;
    const kmTotali = kmAndata * 2;
    const trasfertaEuro = kmTotali * RATE_PER_KM_EURO;

    res.status(200).json({
      km: Math.round(kmTotali * 10) / 10,
      trasferta_cents: Math.round(trasfertaEuro * 100),
      comune_trovato: comuneTrovato,
    });
  } catch (err) {
    if (err.notFound) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Errore nel calcolo del percorso' });
  }
}
