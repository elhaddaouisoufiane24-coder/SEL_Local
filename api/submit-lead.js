import { getClientIp, checkRateLimit } from '../lib/rate-limit.js';
import { isBot } from '../lib/honeypot.js';

const RESEND_URL = 'https://api.resend.com/emails';

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const isText = (v, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function isValidPhone(v) {
  if (typeof v !== 'string' || !/^\+?[0-9\s().\-]+$/.test(v.trim())) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function isValidEmail(v) {
  return typeof v === 'string' && v.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Honeypot: rispondiamo ok senza inviare nulla, così il bot non capisce di essere stato scoperto.
  if (isBot(req.body)) {
    return res.status(200).json({ ok: true });
  }

  const ip = getClientIp(req);
  const { allowed } = checkRateLimit(`lead:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!allowed) {
    return res.status(429).json({ error: 'Troppe richieste, riprova più tardi.' });
  }

  const {
    nome, cognome, telefono, email,
    link_annuncio, marca, modello, anno,
    tipo_servizio, comune,
  } = req.body || {};

  if (
    !isText(nome, 80) || !isText(cognome, 80) ||
    !isValidPhone(telefono) || !isValidEmail(email) ||
    !isText(marca) || !isText(modello) || !isText(String(anno ?? ''), 4) ||
    !isText(tipo_servizio) || !isText(comune)
  ) {
    return res.status(400).json({ error: 'Dati mancanti o non validi' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_TO_EMAIL;
  if (!apiKey || !to) {
    console.error('submit-lead: RESEND_API_KEY o LEAD_TO_EMAIL non configurate, richiesta NON inviata');
    return res.status(503).json({ error: 'Servizio non disponibile' });
  }

  const annuncio = isText(link_annuncio, 500) ? link_annuncio.trim() : '(non fornito)';
  const auto = `${marca} ${modello} ${anno}`;

  const rows = [
    ['Nome', `${nome} ${cognome}`],
    ['Telefono', telefono],
    ['Email', email],
    ['Auto', auto],
    ['Comune', comune],
    ['Servizio', tipo_servizio],
    ['Annuncio', annuncio],
  ];

  const html = `<h2>Nuova richiesta di ricontatto</h2><table cellpadding="6">${rows
    .map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`)
    .join('')}</table>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.LEAD_FROM_EMAIL || 'AutoInspecta <onboarding@resend.dev>',
        to: to.split(',').map((a) => a.trim()),
        reply_to: email.trim(),
        subject: `Nuova richiesta: ${auto} (${comune})`,
        html,
        text,
      }),
    });
    if (!response.ok) {
      console.error('submit-lead: Resend ha risposto', response.status, await response.text());
      return res.status(502).json({ error: 'Invio non riuscito' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('submit-lead: errore di rete', err);
    return res.status(502).json({ error: 'Invio non riuscito' });
  }
}
