import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { validateLeadPayload } from '@/lib/validation';
import { hashIp } from '@/lib/tokens';
import { notifyNewLead, confirmToCustomer } from '@/lib/email';

export const runtime = 'nodejs';

const MAX_PER_HOUR_PER_IP = 5;

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip')) || 'unknown';
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  // Honeypot: un bot compila il campo nascosto. Rispondiamo ok senza salvare nulla.
  if (typeof body?.sito_web === 'string' && body.sito_web.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  const result = validateLeadPayload(body);
  if (!result.ok) {
    return NextResponse.json({ error: 'Controlla i dati inseriti.', fields: result.errors }, { status: 400 });
  }

  const db = adminClient();
  const ipHash = hashIp(clientIp(request));

  // Rate limit su database (valido anche con piu' istanze serverless).
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since);
  if (countError) {
    console.error('leads: errore rate limit', countError);
    return NextResponse.json({ error: 'Servizio momentaneamente non disponibile.' }, { status: 503 });
  }
  if ((count ?? 0) >= MAX_PER_HOUR_PER_IP) {
    return NextResponse.json({ error: 'Troppe richieste, riprova più tardi.' }, { status: 429 });
  }

  const { data: lead, error } = await db
    .from('leads')
    .insert({
      ...result.data,
      consenso_privacy: true,
      consenso_privacy_at: new Date().toISOString(),
      ip_hash: ipHash,
    })
    .select('*')
    .single();
  if (error) {
    console.error('leads: errore inserimento', error);
    return NextResponse.json({ error: 'Non siamo riusciti a registrare la richiesta. Riprova.' }, { status: 500 });
  }

  // La lead e' salvata: le email non devono mai far fallire la richiesta.
  await Promise.allSettled([notifyNewLead(lead), confirmToCustomer(lead)]);

  return NextResponse.json({ ok: true });
}
