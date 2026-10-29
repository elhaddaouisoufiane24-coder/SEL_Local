import { NextResponse } from 'next/server';
import { verifyCalSignature, parseCalEvent } from '@/lib/calcom';
import { handleCalEvent } from '@/lib/bookings';

export const runtime = 'nodejs';

export async function POST(request) {
  const raw = await request.text();
  const signature = request.headers.get('x-cal-signature-256');
  if (!verifyCalSignature(raw, signature, process.env.CALCOM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Firma non valida' }, { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }

  try {
    const result = await handleCalEvent(parseCalEvent(body));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('calcom webhook: errore elaborazione', err);
    return NextResponse.json({ error: 'Errore elaborazione' }, { status: 500 });
  }
}
