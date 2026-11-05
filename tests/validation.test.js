import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone, isValidEmail, validateLeadPayload, validateConsulenzaPayload, parseLinkAnnunci, whatsappNumber,
} from '../lib/validation.js';

test('normalizePhone: formati italiani validi', () => {
  assert.equal(normalizePhone('333 1234567'), '+393331234567');
  assert.equal(normalizePhone('+39 333 123 4567'), '+393331234567');
  assert.equal(normalizePhone('0039 333-1234567'), '+393331234567');
  assert.equal(normalizePhone('393331234567'), '+393331234567');
  assert.equal(normalizePhone('(0422) 123456'), '+390422123456');
  assert.equal(normalizePhone('320 1234567'), '+393201234567');
});

test('normalizePhone: rifiuta numeri non validi o non italiani', () => {
  assert.equal(normalizePhone('abc12'), null);
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('+44 7911 123456'), null);
  assert.equal(normalizePhone('+1 202 555 0101'), null);
  assert.equal(normalizePhone('233 1234567'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
});

test('isValidEmail', () => {
  assert.equal(isValidEmail('mario@esempio.it'), true);
  assert.equal(isValidEmail('mario@esempio'), false);
  assert.equal(isValidEmail('mario esempio@x.it'), false);
  assert.equal(isValidEmail(''), false);
});

const base = {
  nome: ' Mario ', cognome: 'Rossi', telefono: '333 1234567', email: 'Mario@Esempio.it',
  marca: 'Fiat', modello: 'Panda', anno: '2015', comune: 'Treviso',
  tipo_servizio: 'Andiamo a vederla insieme', consenso_privacy: true,
};

test('validateLeadPayload: payload del form della landing', () => {
  const r = validateLeadPayload(base, new Date('2026-10-25'));
  assert.equal(r.ok, true);
  assert.equal(r.data.nome, 'Mario');
  assert.equal(r.data.email, 'mario@esempio.it');
  assert.equal(r.data.telefono, '+393331234567');
  assert.equal(r.data.tipo_servizio, 'insieme');
  assert.equal(r.data.comune_auto, 'Treviso');
  assert.equal(r.data.anno, 2015);
  assert.equal(r.data.link_annuncio, null);
});

test('validateLeadPayload: mappa il servizio "al posto tuo"', () => {
  const r = validateLeadPayload({ ...base, tipo_servizio: 'Andiamo noi a vederla al posto tuo' });
  assert.equal(r.data.tipo_servizio, 'al_posto_tuo');
});

test('validateLeadPayload: consenso privacy obbligatorio', () => {
  for (const v of [false, undefined, 'true', 1]) {
    const r = validateLeadPayload({ ...base, consenso_privacy: v });
    assert.equal(r.ok, false);
    assert.ok(r.errors.consenso_privacy);
  }
});

test('validateLeadPayload: campi mancanti e anno fuori range', () => {
  const r = validateLeadPayload({ ...base, nome: '', telefono: '123', anno: '1900', servizio: 'x', tipo_servizio: 'boh' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.nome && r.errors.telefono && r.errors.anno && r.errors.tipo_servizio);
});

test('validateLeadPayload: tronca campi troppo lunghi', () => {
  const r = validateLeadPayload({ ...base, nome: 'A'.repeat(500) });
  assert.equal(r.data.nome.length, 80);
});

test('whatsappNumber', () => {
  assert.equal(whatsappNumber('+393331234567'), '393331234567');
  assert.equal(whatsappNumber('3331234567'), '393331234567');
  assert.equal(whatsappNumber(''), '');
});

const consulenza = {
  nome: 'Mario', cognome: 'Rossi', email: 'Mario@Esempio.it', telefono: '333 1234567',
  percorrenza: '10_20k', uso_prevalente: 'misto', comune_residenza: ' Padova ', blocchi_traffico: 'non_so',
  auto_preferite: 'Golf\nOctavia', link_annunci: '', consenso_privacy: true,
};

test('validateConsulenzaPayload: payload del modale', () => {
  const r = validateConsulenzaPayload(consulenza);
  assert.equal(r.ok, true);
  assert.equal(r.data.email, 'mario@esempio.it');
  assert.equal(r.data.telefono, '+393331234567');
  assert.equal(r.data.comune_residenza, 'Padova');
  assert.equal(r.data.link_annunci, null);
});

test('validateConsulenzaPayload: scelte fuori elenco e campi mancanti', () => {
  const r = validateConsulenzaPayload({ ...consulenza, percorrenza: '50k', uso_prevalente: 'toString', blocchi_traffico: undefined, auto_preferite: ' ' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.percorrenza);
  assert.ok(r.errors.uso_prevalente);
  assert.ok(r.errors.blocchi_traffico);
  assert.ok(r.errors.auto_preferite);
});

test('validateConsulenzaPayload: consenso privacy obbligatorio', () => {
  const r = validateConsulenzaPayload({ ...consulenza, consenso_privacy: 'true' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.consenso_privacy);
});

test('parseLinkAnnunci: uno per riga, solo http(s), massimo 10', () => {
  assert.deepEqual(parseLinkAnnunci(' https://a.it/1 \n\nhttp://b.com/x\r\n').links, ['https://a.it/1', 'http://b.com/x']);
  assert.equal(parseLinkAnnunci('https://a.it/1\nciao').ok, false);
  assert.equal(parseLinkAnnunci('javascript:alert(1)').ok, false);
  assert.equal(parseLinkAnnunci(Array(11).fill('https://a.it').join('\n')).ok, false);
  assert.equal(parseLinkAnnunci(undefined).ok, true);
});
