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

  const {
    nome,
    whatsapp,
    email,
    link_annuncio,
    marca_modello,
    tipo_servizio,
    comune,
    via_civico,
    preferenze,
    trasferta_cents,
  } = req.body || {};

  if (!nome || !whatsapp || !email || !marca_modello || !tipo_servizio || !comune || !via_civico) {
    return res.status(400).json({ error: 'Dati mancanti o non validi' });
  }

  const trasferta = Number.isFinite(trasferta_cents) ? trasferta_cents : 0;
  const preferenzeTesto = preferenze || '(non indicate)';
  const linkAnnuncioTesto = link_annuncio || '(non fornito)';

  // Riepilogo leggibile: appare come descrizione del pagamento nella dashboard
  // Stripe e nell'app mobile, così è visibile a colpo d'occhio senza aprire i metadata.
  const paymentDescription = [
    nome,
    `WhatsApp: ${whatsapp}`,
    `Auto: ${marca_modello}`,
    `Comune: ${comune}`,
    `Via: ${via_civico}`,
    `Servizio: ${tipo_servizio}`,
    `Annuncio: ${linkAnnuncioTesto}`,
    `Preferenze: ${preferenzeTesto}`,
  ].join(' | ');

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
              description: `Viaggio andata/ritorno verso: ${comune}`,
            },
            unit_amount: trasferta,
          },
          quantity: 1,
        }] : []),
      ],
      mode: 'payment',
      success_url: 'https://www.autoinspecta.it/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.autoinspecta.it/#form',
      payment_intent_data: {
        description: paymentDescription,
      },
      metadata: {
        nome,
        whatsapp,
        email,
        link_annuncio: linkAnnuncioTesto,
        marca_modello,
        tipo_servizio,
        comune,
        via_civico,
        preferenze: preferenzeTesto,
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Errore nella creazione del pagamento' });
  }
}
