import { getClientIp, checkRateLimit } from '../lib/rate-limit.js';
import { isBot } from '../lib/honeypot.js';
import { calFetch, CAL_EVENT_TYPE_ID } from '../lib/cal-api.js';

// Quanto teniamo bloccato lo slot per un cliente che sta completando il
// checkout Stripe. Ampiamente sufficiente per compilare i dati e pagare;
// create-checkout.js rinnova comunque la reservation subito prima del pagamento.
const RESERVATION_MINUTES = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isBot(req.body)) {
    return res.status(200).json({ reservationUid: null });
  }

  const ip = getClientIp(req);
  const { allowed } = checkRateLimit(ip, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!allowed) {
    return res.status(429).json({ error: 'Troppe richieste, riprova più tardi.' });
  }

  const { start } = req.body || {};
  if (!start || typeof start !== 'string') {
    return res.status(400).json({ error: 'Slot non valido' });
  }

  const result = await calFetch('/slots/reservations', {
    method: 'POST',
    apiVersion: '2024-09-04',
    body: {
      eventTypeId: CAL_EVENT_TYPE_ID,
      slotStart: start,
      reservationDuration: RESERVATION_MINUTES,
    },
  });

  if (!result.ok) {
    return res.status(409).json({ error: 'Questo slot non è più disponibile, scegline un altro.' });
  }

  res.status(200).json({
    reservationUid: result.data?.data?.reservationUid || null,
    reservationUntil: result.data?.data?.reservationUntil || null,
  });
}
