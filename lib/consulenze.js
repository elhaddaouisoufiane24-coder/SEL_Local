import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { siteUrl, euro } from '@/lib/format';
import { notifyAdmin, consulenzaPaidToCustomer } from '@/lib/email';

/** Checkout per una consulenza. L'importo viene SEMPRE dal database (consulenza.prezzo). */
export async function createConsulenzaCheckout(c) {
  const cents = Math.round(Number(c.prezzo) * 100);
  if (!Number.isInteger(cents) || cents < 50) throw new Error('Importo non valido');

  const base = siteUrl();
  return stripe().checkout.sessions.create({
    mode: 'payment',
    locale: 'it',
    client_reference_id: c.id,
    customer_email: c.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: cents,
          product_data: {
            name: 'Consulenza AutoInspecta - scelta dell\'auto',
            description: 'Ti aiutiamo a capire quale auto cercare in base a percorrenza, uso ed esigenze.',
          },
        },
      },
    ],
    // "tipo" fa distinguere al webhook una consulenza da un'ispezione
    metadata: { tipo: 'consulenza', consulenza_id: c.id },
    payment_intent_data: {
      description: `AutoInspecta - Consulenza - ${c.nome} ${c.cognome}`,
      metadata: { tipo: 'consulenza', consulenza_id: c.id },
    },
    success_url: `${base}/consulenza/grazie?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/consulenza/grazie?c=${c.id}&annullato=1`,
  });
}

/** Crea il checkout e salva l'id della sessione sulla consulenza. Ritorna l'URL di Stripe. */
export async function startConsulenzaPayment(c) {
  const session = await createConsulenzaCheckout(c);
  const { error } = await adminClient()
    .from('consulenze')
    .update({ stripe_session_id: session.id })
    .eq('id', c.id)
    .eq('stato', 'in_attesa_pagamento');
  if (error) console.error('consulenze: impossibile salvare la sessione Stripe', error);
  return session.url;
}

/**
 * Registra il pagamento di una consulenza. Idempotente come settleSession: webhook e
 * pagina di ritorno possono chiamarla entrambi, solo il primo cambia stato e invia le email.
 */
export async function settleConsulenzaSession(session) {
  if (session.payment_status !== 'paid') return { changed: false };
  const id = session.metadata?.consulenza_id || session.client_reference_id;
  if (!id) return { changed: false };

  const db = adminClient();
  const paymentIntent =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;

  const { data: updated, error } = await db
    .from('consulenze')
    .update({
      stato: 'pagato',
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntent,
      pagato_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('stato', 'in_attesa_pagamento')
    .select('*');
  if (error) throw error;

  if (!updated?.length) {
    const { data: c, error: readErr } = await db.from('consulenze').select('*').eq('id', id).maybeSingle();
    if (readErr) throw readErr;
    if (c && !['pagato', 'completato'].includes(c.stato)) {
      await notifyAdmin({
        subject: `Pagamento su consulenza ${c.stato}`,
        title: 'Pagamento ricevuto su una consulenza non attiva',
        rows: [['Cliente', `${c.nome} ${c.cognome}`], ['Stato', c.stato], ['Importo', euro(session.amount_total / 100)], ['Sessione', session.id]],
        path: `/admin/consulenze/${c.id}`,
        note: 'Controlla in Stripe: potrebbe servire un rimborso o un cambio di stato manuale.',
      });
    }
    return { changed: false, consulenza: c };
  }

  const c = updated[0];
  await Promise.all([
    consulenzaPaidToCustomer(c),
    notifyAdmin({
      subject: `Nuova consulenza pagata: ${c.nome} ${c.cognome}`,
      title: 'Consulenza pagata',
      rows: [
        ['Cliente', `${c.nome} ${c.cognome}`],
        ['Telefono', c.telefono],
        ['Email', c.email],
        ['Importo', euro(session.amount_total / 100)],
      ],
      path: `/admin/consulenze/${c.id}`,
    }),
  ]);
  return { changed: true, consulenza: c };
}

/** Rimborso totale registrato su Stripe -> consulenza "rimborsata". */
export async function settleConsulenzaRefund(charge) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi || !charge.refunded) return { changed: false };
  const { data: updated, error } = await adminClient()
    .from('consulenze')
    .update({ stato: 'rimborsato' })
    .eq('stripe_payment_intent_id', pi)
    .neq('stato', 'rimborsato')
    .select('*');
  if (error) throw error;
  if (!updated?.length) return { changed: false };
  const c = updated[0];
  await notifyAdmin({
    subject: `Rimborso consulenza: ${c.nome} ${c.cognome}`,
    title: 'Consulenza rimborsata',
    rows: [['Cliente', `${c.nome} ${c.cognome}`], ['Importo rimborsato', euro(charge.amount_refunded / 100)]],
    path: `/admin/consulenze/${c.id}`,
  });
  return { changed: true, consulenza: c };
}
