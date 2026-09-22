import { getClientIp, checkRateLimit } from '../lib/rate-limit.js';
import { isBot } from '../lib/honeypot.js';

const ORIGIN_ADDRESS = 'Maserada sul Piave, TV, Italia';
const RATE_PER_KM_EURO = 0.5; // per km, già sul totale andata+ritorno

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Bot rilevato dall'honeypot: rispondiamo 200 senza far capire che è stato
  // scoperto, ma non chiamiamo Google Maps (niente costo, niente dati finti utili).
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

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
  // Se il frontend ha già geocoded l'indirizzo (selezione da Nominatim), usa
  // le coordinate esatte e salta il geocoding interno di Google.
  const destination = hasCoords
    ? { location: { latLng: { latitude: lat, longitude: lon } } }
    : { address: indirizzo };

  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.travelAdvisory.tollInfo,routes.legs.travelAdvisory.tollInfo',
      },
      body: JSON.stringify({
        origin: { address: ORIGIN_ADDRESS },
        destination,
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        extraComputations: ['TOLLS'],
        routeModifiers: {
          vehicleInfo: { emissionType: 'GASOLINE' },
        },
      }),
    });

    const data = await response.json();
    const route = data?.routes?.[0];

    if (!response.ok || !route || !Number.isFinite(route.distanceMeters)) {
      throw new Error(data?.error?.message || 'Percorso non trovato per questo indirizzo');
    }

    const kmAndata = route.distanceMeters / 1000;
    const kmTotali = kmAndata * 2;

    const estimatedPrice = route.travelAdvisory?.tollInfo?.estimatedPrice;
    let stimaPedaggi = false;
    let pedaggiAndataEuro = 0;

    if (Array.isArray(estimatedPrice) && estimatedPrice.length > 0) {
      pedaggiAndataEuro = estimatedPrice.reduce((sum, price) => {
        const units = Number(price.units || 0);
        const nanos = Number(price.nanos || 0);
        return sum + units + nanos / 1e9;
      }, 0);
    } else {
      // Nessun dato pedaggi per questa tratta (es. strade non a pedaggio):
      // assumiamo 0 e segnaliamo al frontend che è una stima.
      stimaPedaggi = true;
    }

    const pedaggiTotaliEuro = pedaggiAndataEuro * 2;
    const trasfertaEuro = kmTotali * RATE_PER_KM_EURO + pedaggiTotaliEuro;

    res.status(200).json({
      km: Math.round(kmTotali * 10) / 10,
      pedaggi_cents: Math.round(pedaggiTotaliEuro * 100),
      trasferta_cents: Math.round(trasfertaEuro * 100),
      stima_pedaggi: stimaPedaggi,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Errore nel calcolo del percorso' });
  }
}
