import Stripe from 'stripe';
import { getClientIp, checkRateLimit } from '../lib/rate-limit.js';
import { isBot } from '../lib/honeypot.js';

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

  const { nome, link_annuncio, indirizzo, trasferta_cents, pedaggi_cents } = req.body || {};

  if (!nome || !link_annuncio || !indirizzo) {
    return res.status(400).json({ error: 'Dati mancanti o non validi' });
  }

  const trasferta = Number.isFinite(trasferta_cents) ? trasferta_cents : 0;
  const pedaggi = Number.isFinite(pedaggi_cents) ? pedaggi_cents : 0;

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
        ...(trasferta + pedaggi > 0 ? [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Rimborso trasferta',
              description: `Viaggio andata/ritorno verso: ${indirizzo}`,
            },
            unit_amount: trasferta + pedaggi,
          },
          quantity: 1,
        }] : []),
      ],
      mode: 'payment',
      success_url: 'https://www.autoinspecta.it/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.autoinspecta.it/#form',
      metadata: {
        nome,
        link_annuncio,
        indirizzo,
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Errore nella creazione del pagamento' });
  }
}
