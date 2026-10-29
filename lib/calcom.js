import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Cal.com firma il body RAW con HMAC-SHA256 (hex) e lo manda in X-Cal-Signature-256.
 * Il confronto e' a tempo costante.
 */
export function verifyCalSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const given = String(signatureHeader).trim().replace(/^sha256=/i, '');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Estrae da un evento webhook Cal.com i campi che ci servono. */
export function parseCalEvent(body) {
  const payload = body?.payload || {};
  const meta = payload.metadata || {};
  const leadIdRaw = meta.lead_id ?? meta.leadId ?? payload.responses?.lead_id?.value;
  const attendee = Array.isArray(payload.attendees) ? payload.attendees[0] : undefined;
  return {
    type: body?.triggerEvent,
    uid: payload.uid || null,
    // In una riprogrammazione Cal.com indica l'uid della prenotazione precedente
    previousUid: payload.rescheduleUid || payload.rescheduledFromUid || null,
    startTime: payload.startTime || null,
    leadId: typeof leadIdRaw === 'string' && UUID_RE.test(leadIdRaw) ? leadIdRaw : null,
    attendeeEmail: attendee?.email ? String(attendee.email).toLowerCase() : null,
    attendeeName: attendee?.name || null,
    reason: payload.cancellationReason || payload.reason || null,
  };
}
