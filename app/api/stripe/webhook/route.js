import { NextResponse } from 'next/server';
import { stripe, settleSession, settleRefund } from '@/lib/stripe';
import { settleConsulenzaSession, settleConsulenzaRefund } from '@/lib/consulenze';

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
      const session = event.data.object;
      if (session.metadata?.tipo === 'consulenza') await settleConsulenzaSession(session);
      else await settleSession(session);
    } else if (event.type === 'charge.refunded') {
      // Il payment intent appartiene a una sola delle due tabelle: l'altra non trova nulla.
      await settleRefund(event.data.object);
      await settleConsulenzaRefund(event.data.object);
    }
  } catch (err) {
    console.error('stripe webhook: errore elaborazione', event.type, err);
    // 500 => Stripe riprova piu' tardi.
    return NextResponse.json({ error: 'Errore elaborazione' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
