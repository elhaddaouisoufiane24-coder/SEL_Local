import { NextResponse } from 'next/server';
import { stripe, settleSession, settleRefund } from '@/lib/stripe';

export const runtime = 'nodejs';

// La firma Stripe si verifica sul body RAW: niente request.json().
export async function POST(request) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: 'Non autorizzato' }, { status: 400 });

  const raw = await request.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error('stripe webhook: firma non valida', err.message);
    return NextResponse.json({ error: 'Firma non valida' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await settleSession(event.data.object);
    } else if (event.type === 'charge.refunded') {
      await settleRefund(event.data.object);
    }
  } catch (err) {
    console.error('stripe webhook: errore elaborazione', event.type, err);
    // 500 => Stripe riprova piu' tardi.
    return NextResponse.json({ error: 'Errore elaborazione' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
