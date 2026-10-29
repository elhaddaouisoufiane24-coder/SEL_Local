import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyCalSignature, parseCalEvent } from '../lib/calcom.js';

const secret = 'segreto-di-test';
const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'abc' } });
const sig = createHmac('sha256', secret).update(body).digest('hex');

test('verifyCalSignature: firma valida', () => {
  assert.equal(verifyCalSignature(body, sig, secret), true);
  assert.equal(verifyCalSignature(body, `sha256=${sig}`, secret), true);
});

test('verifyCalSignature: rifiuta firme errate o mancanti', () => {
  assert.equal(verifyCalSignature(body, sig, 'altro-segreto'), false);
  assert.equal(verifyCalSignature(body + ' ', sig, secret), false);
  assert.equal(verifyCalSignature(body, 'zzzz', secret), false);
  assert.equal(verifyCalSignature(body, '', secret), false);
  assert.equal(verifyCalSignature(body, sig, ''), false);
  assert.equal(verifyCalSignature(body, undefined, secret), false);
});

test('parseCalEvent: estrae lead_id, uid e orario', () => {
  const ev = parseCalEvent({
    triggerEvent: 'BOOKING_CREATED',
    payload: {
      uid: 'u1', startTime: '2026-11-03T09:00:00.000Z',
      metadata: { lead_id: '123e4567-e89b-12d3-a456-426614174000' },
      attendees: [{ email: 'Mario@Esempio.it', name: 'Mario Rossi' }],
    },
  });
  assert.equal(ev.type, 'BOOKING_CREATED');
  assert.equal(ev.uid, 'u1');
  assert.equal(ev.leadId, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(ev.attendeeEmail, 'mario@esempio.it');
});

test('parseCalEvent: ignora lead_id non UUID', () => {
  const ev = parseCalEvent({ triggerEvent: 'BOOKING_CREATED', payload: { metadata: { lead_id: "1' or '1'='1" } } });
  assert.equal(ev.leadId, null);
});

test('parseCalEvent: riprogrammazione espone il vecchio uid', () => {
  const ev = parseCalEvent({ triggerEvent: 'BOOKING_RESCHEDULED', payload: { uid: 'new', rescheduleUid: 'old' } });
  assert.equal(ev.previousUid, 'old');
});
