import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { validateConsulenzaPayload } from '@/lib/validation';
import { hashIp } from '@/lib/tokens';
import { CONSULENZA_PREZZO } from '@/lib/format';
import { startConsulenzaPayment } from '@/lib/consulenze';

export const runtime = 'nodejs';

const MAX_PER_HOUR_PER_IP = 5;

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip')) || 'unknown';
}

// Salva la richiesta "in attesa di pagamento" e restituisce l'URL di Stripe Checkout.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  // Honeypot: un bot compila il campo nascosto. Niente salvataggio, niente checkout.
  if (typeof body?.sito_web === 'string' && body.sito_web.trim() !== '') {
    return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  const result = validateConsulenzaPayload(body);
  if (!result.ok) {
    return NextResponse.json({ error: 'Controlla i dati inseriti.', fields: result.errors }, { status: 400 });
  }

  const db = adminClient();
  const ipHash = hashIp(clientIp(request));

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from('consulenze')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since);
  if (countError) {
    console.error('consulenze: errore rate limit', countError);
    return NextResponse.json({ error: 'Servizio momentaneamente non disponibile.' }, { status: 503 });
  }
  if ((count ?? 0) >= MAX_PER_HOUR_PER_IP) {
    return NextResponse.json({ error: 'Troppe richieste, riprova più tardi.' }, { status: 429 });
  }

  const { data: consulenza, error } = await db
    .from('consulenze')
    .insert({
      ...result.data,
      prezzo: CONSULENZA_PREZZO,
      consenso_privacy: true,
      consenso_privacy_at: new Date().toISOString(),
      ip_hash: ipHash,
    })
    .select('*')
    .single();
  if (error) {
    console.error('consulenze: errore inserimento', error);
    return NextResponse.json({ error: 'Non siamo riusciti a registrare la richiesta. Riprova.' }, { status: 500 });
  }

  try {
    const url = await startConsulenzaPayment(consulenza);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error('consulenze: errore creazione checkout', err);
    return NextResponse.json({ error: 'Non siamo riusciti ad avviare il pagamento. Riprova tra un momento.' }, { status: 502 });
  }
}
