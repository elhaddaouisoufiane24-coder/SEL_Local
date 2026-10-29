'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sessionClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { newBookingToken, tokenExpiry } from '@/lib/tokens';
import { sendBookingLink } from '@/lib/email';
import { siteUrl, STATI } from '@/lib/format';

export async function signIn(formData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const supabase = await sessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/admin/login?e=credenziali');
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect('/admin/login?e=accesso');
  }
  redirect('/admin');
}

export async function signOut() {
  const supabase = await sessionClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

export async function toggleContattato(formData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const next = formData.get('next') === 'true';
  await supabase
    .from('leads')
    .update({ contattato: next, contattato_at: next ? new Date().toISOString() : null })
    .eq('id', id);
  revalidatePath('/admin');
  revalidatePath(`/admin/leads/${id}`);
}

export async function saveNote(formData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  await supabase.from('leads').update({ note_interne: String(formData.get('note') || '') }).eq('id', id);
  redirect(`/admin/leads/${id}?ok=${encodeURIComponent('Note salvate')}`);
}

export async function saveRimborso(formData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const value = Number(String(formData.get('rimborso') || '0').replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > 5000) {
    redirect(`/admin/leads/${id}?err=${encodeURIComponent('Importo non valido')}`);
  }
  const { data: lead } = await supabase.from('leads').select('stato').eq('id', id).single();
  if (lead && !['nuova', 'link_inviato'].includes(lead.stato)) {
    redirect(`/admin/leads/${id}?err=${encodeURIComponent('Il cliente ha già pagato: il totale non si modifica più')}`);
  }
  await supabase.from('leads').update({ rimborso_km: Math.round(value * 100) / 100 }).eq('id', id);
  redirect(`/admin/leads/${id}?ok=${encodeURIComponent('Rimborso aggiornato')}`);
}

export async function generateLink(formData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const { data: lead } = await supabase.from('leads').select('stato').eq('id', id).single();
  if (!lead || !['nuova', 'link_inviato'].includes(lead.stato)) {
    redirect(`/admin/leads/${id}?err=${encodeURIComponent('Link non generabile in questo stato')}`);
  }
  await supabase
    .from('leads')
    .update({ token_prenotazione: newBookingToken(), token_scadenza: tokenExpiry().toISOString() })
    .eq('id', id);
  redirect(`/admin/leads/${id}?ok=${encodeURIComponent('Link generato (valido 7 giorni)')}`);
}

async function leadWithValidLink(supabase, id) {
  const { data: lead } = await supabase.from('leads').select('*').eq('id', id).single();
  if (!lead) redirect('/admin');
  const valid = lead.token_prenotazione && lead.token_scadenza && new Date(lead.token_scadenza) > new Date();
  if (!valid || !['nuova', 'link_inviato'].includes(lead.stato)) {
    redirect(`/admin/leads/${id}?err=${encodeURIComponent('Genera prima un link valido')}`);
  }
  return { lead, url: `${siteUrl()}/prenota/${lead.token_prenotazione}` };
}

export async function sendLinkByEmail(formData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const { lead, url } = await leadWithValidLink(supabase, id);
  const res = await sendBookingLink(lead, url);
  if (!res.ok) redirect(`/admin/leads/${id}?err=${encodeURIComponent('Invio email non riuscito')}`);
  await supabase.from('leads').update({ stato: 'link_inviato' }).eq('id', id);
  redirect(`/admin/leads/${id}?ok=${encodeURIComponent('Email inviata a ' + lead.email)}`);
}

/** Chiamata quando si apre WhatsApp col link: segna la lead come "link_inviato". */
export async function markLinkSent(id) {
  const { supabase } = await requireAdmin();
  await supabase
    .from('leads')
    .update({ stato: 'link_inviato' })
    .eq('id', String(id))
    .in('stato', ['nuova', 'link_inviato']);
  revalidatePath('/admin');
  revalidatePath(`/admin/leads/${id}`);
}

export async function setStato(formData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get('id'));
  const stato = String(formData.get('stato'));
  if (!STATI.includes(stato)) redirect(`/admin/leads/${id}`);
  await supabase.from('leads').update({ stato }).eq('id', id);
  redirect(`/admin/leads/${id}?ok=${encodeURIComponent('Stato aggiornato')}`);
}
