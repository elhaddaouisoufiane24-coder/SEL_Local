'use server';

import { redirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase/admin';
import { startConsulenzaPayment } from '@/lib/consulenze';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nuovo checkout per una consulenza ancora da pagare (dopo un "Indietro" da Stripe). */
export async function retryConsulenzaPayment(formData) {
  const id = String(formData.get('id') || '');
  if (!UUID_RE.test(id)) redirect('/');
  const { data: c } = await adminClient().from('consulenze').select('*').eq('id', id).maybeSingle();
  if (!c || c.stato !== 'in_attesa_pagamento') redirect(`/consulenza/grazie?c=${id}`);

  let url;
  try {
    url = await startConsulenzaPayment(c);
  } catch (err) {
    console.error('consulenza: errore nuovo checkout', err);
    redirect(`/consulenza/grazie?c=${id}&annullato=1&errore=1`);
  }
  redirect(url);
}
