// Validazione dei dati in ingresso da /api/leads e /api/consulenze. Funzioni pure: niente I/O.

import { PERCORRENZA_LABEL, USO_LABEL, BLOCCHI_LABEL } from './format.js';

const SERVIZI_FORM = {
  'Andiamo a vederla insieme': 'insieme',
  'Andiamo noi a vederla al posto tuo': 'al_posto_tuo',
  insieme: 'insieme',
  al_posto_tuo: 'al_posto_tuo',
};

/**
 * Normalizza un numero italiano in formato +39XXXXXXXXXX.
 * Accetta mobili (3xx...) e fissi (0...), con o senza +39 / 0039 / 39 e separatori.
 * Ritorna null se non e' un numero italiano plausibile.
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!/^[+0-9\s().\-]+$/.test(s)) return null;
  const hasPlus = s.startsWith('+');
  s = s.replace(/[^0-9]/g, '');
  if (hasPlus) {
    if (!s.startsWith('39')) return null; // solo numeri italiani
    s = s.slice(2);
  } else if (s.startsWith('0039')) {
    s = s.slice(4);
  } else if (s.startsWith('39') && /^39(3\d{8,9})$/.test(s)) {
    s = s.slice(2); // 39 + mobile, senza il +
  }
  const mobile = /^3\d{8,9}$/.test(s);
  const landline = /^0\d{5,10}$/.test(s);
  return mobile || landline ? `+39${s}` : null;
}

export function isValidEmail(v) {
  return typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Valida e normalizza il payload del form. Ritorna { ok, errors, data }.
 * I messaggi di errore sono pensati per essere mostrati al cliente.
 */
export function validateLeadPayload(body, now = new Date()) {
  const errors = {};
  const b = body && typeof body === 'object' ? body : {};

  const nome = text(b.nome, 80);
  const cognome = text(b.cognome, 80);
  const marca = text(b.marca, 80);
  const modello = text(b.modello, 80);
  const comune = text(b.comune_auto ?? b.comune, 120);
  const link = text(b.link_annuncio, 500);
  const anno = Number.parseInt(b.anno, 10);
  const servizio = SERVIZI_FORM[text(b.tipo_servizio, 80)];
  const telefono = normalizePhone(b.telefono);
  const email = text(b.email, 254).toLowerCase();

  if (!nome) errors.nome = 'Inserisci il nome.';
  if (!cognome) errors.cognome = 'Inserisci il cognome.';
  if (!marca) errors.marca = 'Indica la marca.';
  if (!modello) errors.modello = 'Indica il modello.';
  if (!comune) errors.comune_auto = 'Indica il comune in cui si trova l\'auto.';
  if (!Number.isInteger(anno) || anno < 1980 || anno > now.getFullYear() + 1) errors.anno = 'Anno non valido.';
  if (!servizio) errors.tipo_servizio = 'Scegli il tipo di servizio.';
  if (!telefono) errors.telefono = 'Inserisci un numero di telefono italiano valido.';
  if (!isValidEmail(email)) errors.email = 'Inserisci un indirizzo email valido.';
  if (b.consenso_privacy !== true) errors.consenso_privacy = 'Devi accettare l\'informativa privacy per procedere.';

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    errors: {},
    data: {
      nome, cognome, marca, modello, anno,
      comune_auto: comune,
      link_annuncio: link || null,
      tipo_servizio: servizio,
      telefono, email,
    },
  };
}

const MAX_LINK_ANNUNCI = 10;

/** Link agli annunci, uno per riga: righe vuote ignorate, solo http(s). */
export function parseLinkAnnunci(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, links: [] };
  if (typeof raw !== 'string') return { ok: false, links: [] };
  const links = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (links.length > MAX_LINK_ANNUNCI) return { ok: false, links };
  const valid = links.every((l) => l.length <= 500 && /^https?:\/\/[^\s]+\.[^\s]+$/i.test(l));
  return { ok: valid, links };
}

/** Valida il form della consulenza. Ritorna { ok, errors, data } come validateLeadPayload. */
export function validateConsulenzaPayload(body) {
  const errors = {};
  const b = body && typeof body === 'object' ? body : {};
  const pick = (v, labels) => (typeof v === 'string' && Object.hasOwn(labels, v) ? v : null);

  const nome = text(b.nome, 80);
  const cognome = text(b.cognome, 80);
  const email = text(b.email, 254).toLowerCase();
  const telefono = normalizePhone(b.telefono);
  const percorrenza = pick(b.percorrenza, PERCORRENZA_LABEL);
  const uso = pick(b.uso_prevalente, USO_LABEL);
  const comune = text(b.comune_residenza, 120);
  const blocchi = pick(b.blocchi_traffico, BLOCCHI_LABEL);
  const auto = text(b.auto_preferite, 2000);
  const annunci = parseLinkAnnunci(b.link_annunci);

  if (!nome) errors.nome = 'Inserisci il nome.';
  if (!cognome) errors.cognome = 'Inserisci il cognome.';
  if (!isValidEmail(email)) errors.email = 'Inserisci un indirizzo email valido.';
  if (!telefono) errors.telefono = 'Inserisci un numero di telefono italiano valido.';
  if (!percorrenza) errors.percorrenza = 'Indica quanti km fai all\'anno.';
  if (!uso) errors.uso_prevalente = 'Indica dove fai più strada.';
  if (!comune) errors.comune_residenza = 'Indica il comune in cui abiti.';
  if (!blocchi) errors.blocchi_traffico = 'Indica se ci sono blocchi del traffico.';
  if (!auto) errors.auto_preferite = 'Indica almeno un\'auto che ti piace.';
  if (!annunci.ok) errors.link_annunci = `Inserisci al massimo ${MAX_LINK_ANNUNCI} link, uno per riga, che inizino con http:// o https://.`;
  if (b.consenso_privacy !== true) errors.consenso_privacy = 'Devi accettare l\'informativa privacy per procedere.';

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    errors: {},
    data: {
      nome, cognome, email, telefono,
      percorrenza,
      uso_prevalente: uso,
      comune_residenza: comune,
      blocchi_traffico: blocchi,
      auto_preferite: auto,
      link_annunci: annunci.links.length ? annunci.links.join('\n') : null,
    },
  };
}

/** Numero per wa.me: solo cifre, con prefisso internazionale (es. 393331234567). */
export function whatsappNumber(telefono) {
  const digits = String(telefono || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('39') ? digits : `39${digits}`;
}
