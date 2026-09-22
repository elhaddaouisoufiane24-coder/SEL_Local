import Stripe from 'stripe';
import { getClientIp, checkRateLimit } from '../lib/rate-limit.js';
import { isBot } from '../lib/honeypot.js';
import { calFetch, CAL_EVENT_TYPE_ID } from '../lib/cal-api.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ISPEZIONE_CENTS = 14900; // €149 fisso, deciso lato server: mai fidarsi del prezzo inviato dal client

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isBot(req.body)) {
    return res.status(200).json({ url: null });
  }

  const ip = getClientIp(req);
  const { allowed } = checkRateLimit(ip, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!allowed) {
    return res.status(429).json({ error: 'Troppe richieste, riprova più tardi.' });
  }

  const {
    nome,
    email,
    link_annuncio,
    indirizzo,
    data_ora,
    tipo_servizio,
    trasferta_cents,
  } = req.body || {};

  if (!nome || !email || !link_annuncio || !indirizzo || !data_ora || !tipo_servizio) {
    return res.status(400).json({ error: 'Dati mancanti o non validi' });
  }

  // Rinnoviamo/verifichiamo la reservation dello slot proprio ora, subito prima
  // di mandare il cliente a pagare: se nel frattempo lo slot non è più
  // disponibile (reservation scaduta e preso da un altro), meglio scoprirlo
  // qui — dove possiamo ancora mostrare un errore e far tornare l'utente allo
  // Step 2 — che dopo il pagamento, quando non c'è più nessuno a cui rispondere.
  const reservation = await calFetch('/slots/reservations', {
    method: 'POST',
    apiVersion: '2024-09-04',
    body: {
      eventTypeId: CAL_EVENT_TYPE_ID,
      slotStart: data_ora,
      reservationDuration: 30,
    },
  });

  if (!reservation.ok) {
    return res.status(409).json({
      error: 'SLOT_TAKEN',
      message: 'Questo slot non è più disponibile, scegline un altro.',
    });
  }

  const trasferta = Number.isFinite(trasferta_cents) ? trasferta_cents : 0;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Ispezione AutoInspecta',
              description: '101 punti di controllo professionali',
            },
            unit_amount: ISPEZIONE_CENTS,
          },
          quantity: 1,
        },
        ...(trasferta > 0 ? [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Rimborso trasferta',
              description: `Viaggio andata/ritorno verso: ${indirizzo}`,
            },
            unit_amount: trasferta,
          },
          quantity: 1,
        }] : []),
      ],
      mode: 'payment',
      success_url: 'https://www.autoinspecta.it/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.autoinspecta.it/#form',
      metadata: {
        nome,
        email,
        link_annuncio,
        indirizzo,
        data_ora,
        tipo_servizio,
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Errore nella creazione del pagamento' });
  }
}
