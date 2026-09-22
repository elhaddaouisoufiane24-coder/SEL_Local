import Stripe from 'stripe';
import { calFetch, CAL_EVENT_TYPE_ID } from '../lib/cal-api.js';

// Stripe verifica la firma sul corpo RAW della richiesta: va disabilitato il
// body parser automatico di Vercel, altrimenti la firma non corrisponde più.
export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function creaPrenotazioneCal(session) {
  const { nome, email, indirizzo, data_ora, tipo_servizio } = session.metadata || {};

  const result = await calFetch('/bookings', {
    method: 'POST',
    apiVersion: '2024-08-13',
    body: {
      start: data_ora,
      eventTypeId: CAL_EVENT_TYPE_ID,
      attendee: {
        name: nome,
        email,
        timeZone: 'Europe/Rome',
      },
      location: { type: 'attendeeAddress', address: indirizzo },
      bookingFieldsResponses: {
        'Tipo-di-Servizio': tipo_servizio,
      },
    },
  });

  if (!result.ok) {
    // Il cliente ha già pagato: questo è il caso raro (reservation scaduta e
    // slot preso nel frattempo) che non possiamo più intercettare a video.
    // Va gestito manualmente — per questo logghiamo tutto ciò che serve per
    // ricontattare il cliente.
    console.error(
      'Booking Cal.com fallita dopo pagamento riuscito. session:',
      session.id,
      'metadata:',
      session.metadata,
      'errore:',
      JSON.stringify(result.data)
    );
    return;
  }

  console.log('Prenotazione Cal.com creata dopo pagamento:', result.data?.data?.uid);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signature = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Verifica firma webhook fallita:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      await creaPrenotazioneCal(session);
    } catch (err) {
      console.error('Errore creazione prenotazione post-pagamento:', err.message);
    }
  }

  res.status(200).json({ received: true });
}
