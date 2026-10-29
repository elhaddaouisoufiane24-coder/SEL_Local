import Stripe from 'stripe';

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
    // Fase di test: niente prenotazione automatica su Cal.com. Il pagamento
    // e tutti i dati del cliente sono già nei metadata della sessione Stripe
    // (visibili in dashboard); il contatto avviene manualmente su WhatsApp.
    console.log('Pagamento confermato:', event.data.object.id);
  }

  res.status(200).json({ received: true });
}
