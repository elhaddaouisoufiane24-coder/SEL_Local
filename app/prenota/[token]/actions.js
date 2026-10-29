'use server';

import { redirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase/admin';
import { createCheckoutSession } from '@/lib/stripe';

/** Crea la Checkout Session. Token, stato e importo sono riletti dal database. */
export async function payAction(formData) {
  const token = String(formData.get('token') || '');
  const db = adminClient();
  const { data: lead } = await db.from('leads').select('*').eq('token_prenotazione', token).maybeSingle();

  if (!lead) redirect(`/prenota/${encodeURIComponent(token)}`);
  if (!['nuova', 'link_inviato'].includes(lead.stato)) redirect(`/prenota/${token}`);
  if (lead.token_scadenza && new Date(lead.token_scadenza) < new Date()) redirect(`/prenota/${token}`);

  let url;
  try {
    const session = await createCheckoutSession(lead);
    url = session.url;
  } catch (err) {
    console.error('prenota: errore creazione checkout', err);
    redirect(`/prenota/${token}?errore=1`);
  }
  redirect(url);
}
