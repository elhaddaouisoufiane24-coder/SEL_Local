import 'server-only';
import Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';
import { siteUrl, euro, SERVIZIO_LABEL } from '@/lib/format';
import { notifyAdmin, paymentReceivedToCustomer } from '@/lib/email';

let client;
export function stripe() {
  if (!client) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY mancante');
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

/** L'importo viene SEMPRE dal database (lead.totale), mai dal browser. */
export async function createCheckoutSession(lead) {
  const cents = Math.round(Number(lead.totale) * 100);
  if (!Number.isInteger(cents) || cents < 50) throw new Error('Importo non valido');

  const base = siteUrl();
  const auto = `${lead.marca} ${lead.modello} ${lead.anno}`;

  return stripe().checkout.sessions.create({
    mode: 'payment',
    // Nessun payment_method_types: Stripe mostra i metodi attivi in dashboard
    // (carta, Apple Pay, Google Pay...).
    locale: 'it',
    client_reference_id: lead.id,
    customer_email: lead.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: cents,
          product_data: {
            name: `Controllo AutoInspecta - ${auto}`,
            description: `${SERVIZIO_LABEL[lead.tipo_servizio] || ''} | Ispezione ${euro(lead.prezzo_base)} + rimborso km ${euro(lead.rimborso_km)}`.slice(0, 500),
          },
        },
      },
    ],
    metadata: { lead_id: lead.id },
    payment_intent_data: {
      description: `AutoInspecta - ${lead.nome} ${lead.cognome} - ${auto}`,
      metadata: { lead_id: lead.id },
    },
    success_url: `${base}/prenota/${lead.token_prenotazione}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/prenota/${lead.token_prenotazione}?annullato=1`,
  });
}

/**
 * Registra il pagamento di una Checkout Session. Idempotente: webhook e pagina di
 * ritorno possono chiamarla entrambi, solo il primo cambia lo stato e invia le email.
 */
export async function settleSession(session) {
  if (session.payment_status !== 'paid') return { changed: false };
  const leadId = session.metadata?.lead_id || session.client_reference_id;
  if (!leadId) return { changed: false };

  const db = adminClient();
  const { data: lead, error: readErr } = await db.from('leads').select('*').eq('id', leadId).maybeSingle();
  if (readErr) throw readErr;
  if (!lead) return { changed: false };

  const paymentIntent =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;

  const { data: updated, error } = await db
    .from('leads')
    .update({
      stato: 'pagato',
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntent,
      pagato_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .in('stato', ['nuova', 'link_inviato'])
    .select('*');
  if (error) throw error;

  if (!updated?.length) {
    // Gia' registrato oppure lead in uno stato che non accetta pagamenti.
    if (!['pagato', 'prenotato', 'completato'].includes(lead.stato)) {
      await notifyAdmin({
        subject: `Pagamento su lead ${lead.stato}`,
        title: 'Pagamento ricevuto su una lead non attiva',
        rows: [['Cliente', `${lead.nome} ${lead.cognome}`], ['Stato lead', lead.stato], ['Importo', euro(session.amount_total / 100)], ['Sessione', session.id]],
        leadId: lead.id,
        note: 'Controlla in Stripe: potrebbe servire un rimborso o un cambio di stato manuale.',
      });
    }
    return { changed: false, lead };
  }

  const paidLead = updated[0];
  const paidCents = session.amount_total;
  const expectedCents = Math.round(Number(paidLead.totale) * 100);
  let note;
  if (paidCents !== expectedCents) {
    note = `ATTENZIONE: pagati ${euro(paidCents / 100)} ma il totale attuale in scheda è ${euro(paidLead.totale)} (probabile modifica del rimborso dopo l'invio del link).`;
    const { error: noteErr } = await db
      .from('leads')
      .update({ note_interne: [paidLead.note_interne, note].filter(Boolean).join('\n') })
      .eq('id', paidLead.id);
    if (noteErr) console.error('stripe: impossibile salvare la nota di discrepanza', noteErr);
  }

  const bookingUrl = `${siteUrl()}/prenota/${paidLead.token_prenotazione}`;
  await Promise.all([
    paymentReceivedToCustomer(paidLead, bookingUrl),
    notifyAdmin({
      subject: `Pagamento ricevuto: ${paidLead.nome} ${paidLead.cognome}`,
      title: 'Pagamento ricevuto',
      rows: [['Cliente', `${paidLead.nome} ${paidLead.cognome}`], ['Auto', `${paidLead.marca} ${paidLead.modello} ${paidLead.anno}`], ['Importo', euro(paidCents / 100)]],
      leadId: paidLead.id,
      note,
    }),
  ]);
  return { changed: true, lead: paidLead };
}

/** Rimborso totale registrato su Stripe -> stato "rimborsato". */
export async function settleRefund(charge) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi || !charge.refunded) return { changed: false };
  const db = adminClient();
  const { data: updated, error } = await db
    .from('leads')
    .update({ stato: 'rimborsato' })
    .eq('stripe_payment_intent_id', pi)
    .neq('stato', 'rimborsato')
    .select('*');
  if (error) throw error;
  if (!updated?.length) return { changed: false };
  const l = updated[0];
  await notifyAdmin({
    subject: `Rimborso registrato: ${l.nome} ${l.cognome}`,
    title: 'Pagamento rimborsato',
    rows: [['Cliente', `${l.nome} ${l.cognome}`], ['Importo rimborsato', euro(charge.amount_refunded / 100)]],
    leadId: l.id,
  });
  return { changed: true, lead: l };
}
