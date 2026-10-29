import 'server-only';
import { siteUrl, euro, formatDateTime, SERVIZIO_LABEL } from '@/lib/format';

const RESEND_URL = 'https://api.resend.com/emails';

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Invia via Resend. Non lancia mai: ritorna { ok } cosi' un'email fallita non blocca il flusso. */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || !to) {
    console.error('email: configurazione mancante (RESEND_API_KEY / EMAIL_FROM / destinatario), email non inviata:', subject);
    return { ok: false };
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error('email: Resend ha risposto', res.status, await res.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('email: errore di rete', err);
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Layout condiviso (HTML semplice, colori e logo della landing)
// ---------------------------------------------------------------------------
function layout({ title, body, button }) {
  const logo = `${siteUrl()}/asset/logo-autoinspecta.png`;
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;">
<tr><td style="padding:24px 28px 8px;"><img src="${logo}" alt="AutoInspecta" height="36" style="height:36px;display:block;"></td></tr>
<tr><td style="padding:8px 28px 4px;"><h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:#1a1a1a;">${esc(title)}</h1></td></tr>
<tr><td style="padding:12px 28px 8px;font-size:15px;line-height:1.6;color:#374151;">${body}</td></tr>
${button ? `<tr><td style="padding:8px 28px 20px;"><a href="${esc(button.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:999px;">${esc(button.label)}</a></td></tr>` : ''}
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">AutoInspecta &middot; Al tuo fianco, prima dell'acquisto di un'auto usata.</td></tr>
</table></td></tr></table></body></html>`;
}

function table(rows) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0;">${rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#6b7280;width:38%;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;">${v}</td></tr>`)
    .join('')}</table>`;
}

const autoLabel = (l) => `${l.marca} ${l.modello} ${l.anno}`;

function riepilogoPrezzo(l) {
  return table([
    ['Auto', esc(autoLabel(l))],
    ['Servizio', esc(SERVIZIO_LABEL[l.tipo_servizio] || l.tipo_servizio)],
    ['Ispezione', esc(euro(l.prezzo_base))],
    ['Rimborso chilometrico', esc(euro(l.rimborso_km))],
    ['Totale', `<span style="color:#2563eb;font-size:17px;">${esc(euro(l.totale))}</span>`],
  ]);
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/** A te: nuova richiesta, con link alla scheda nel pannello. */
export function notifyNewLead(lead) {
  const url = `${siteUrl()}/admin/leads/${lead.id}`;
  const html = layout({
    title: 'Nuova richiesta di ispezione',
    body: table([
      ['Cliente', esc(`${lead.nome} ${lead.cognome}`)],
      ['Telefono', `<a href="tel:${esc(lead.telefono)}">${esc(lead.telefono)}</a>`],
      ['Email', `<a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>`],
      ['Auto', esc(autoLabel(lead))],
      ['Comune', esc(lead.comune_auto)],
      ['Servizio', esc(SERVIZIO_LABEL[lead.tipo_servizio])],
      ['Annuncio', lead.link_annuncio ? `<a href="${esc(lead.link_annuncio)}">${esc(lead.link_annuncio)}</a>` : ''],
    ]),
    button: { url, label: 'Apri la scheda' },
  });
  return sendEmail({
    to: process.env.ADMIN_NOTIFY_EMAIL,
    subject: `Nuova richiesta: ${autoLabel(lead)} (${lead.comune_auto})`,
    html,
    text: `Nuova richiesta da ${lead.nome} ${lead.cognome} - ${lead.telefono} - ${autoLabel(lead)} - ${lead.comune_auto}\n${url}`,
    replyTo: lead.email,
  });
}

/** Al cliente: conferma di ricezione. */
export function confirmToCustomer(lead) {
  const html = layout({
    title: `Grazie ${lead.nome}, abbiamo ricevuto la tua richiesta`,
    body: `<p>Un tecnico specializzato AutoInspecta ti contatterà a breve per capire le tue esigenze e fissare il controllo.</p>
${table([['Auto', esc(autoLabel(lead))], ['Comune', esc(lead.comune_auto)]])}
<p style="color:#6b7280;">Se qualcosa non è corretto, rispondi pure a questa email.</p>`,
  });
  return sendEmail({
    to: lead.email,
    subject: 'Abbiamo ricevuto la tua richiesta - AutoInspecta',
    html,
    text: `Grazie ${lead.nome}, abbiamo ricevuto la tua richiesta per ${autoLabel(lead)}. Un tecnico AutoInspecta ti contatterà a breve.`,
  });
}

/** Al cliente: link per pagare e scegliere la data. */
export function sendBookingLink(lead, url) {
  const html = layout({
    title: `Ciao ${lead.nome}, ecco il tuo link per prenotare`,
    body: `<p>Come anticipato, trovi qui sotto il riepilogo e il link per pagare e scegliere giorno e ora del controllo.</p>${riepilogoPrezzo(lead)}
<p style="color:#6b7280;">Il link è valido 7 giorni. Dopo il pagamento potrai scegliere subito la data.</p>`,
    button: { url, label: 'Paga e scegli la data' },
  });
  return sendEmail({
    to: lead.email,
    subject: 'Il tuo link per prenotare il controllo - AutoInspecta',
    html,
    text: `Ciao ${lead.nome}, totale ${euro(lead.totale)}. Paga e scegli la data: ${url}`,
  });
}

/** Al cliente: pagamento ricevuto, ora scegli la data. */
export function paymentReceivedToCustomer(lead, url) {
  const html = layout({
    title: 'Pagamento ricevuto, grazie!',
    body: `<p>Abbiamo ricevuto il tuo pagamento di <strong>${esc(euro(lead.totale))}</strong> per il controllo di ${esc(autoLabel(lead))}.</p>
<p>Il prossimo passo è scegliere giorno e ora dell'appuntamento. Se hai chiuso la pagina, puoi tornarci in qualsiasi momento da questo link:</p>`,
    button: { url, label: 'Scegli giorno e ora' },
  });
  return sendEmail({
    to: lead.email,
    subject: 'Pagamento ricevuto - scegli la data del controllo',
    html,
    text: `Pagamento di ${euro(lead.totale)} ricevuto. Scegli la data: ${url}`,
  });
}

/** A te: evento operativo generico (pagamento, prenotazione, annullamento, anomalie). */
export function notifyAdmin({ subject, title, rows = [], leadId, note }) {
  const url = leadId ? `${siteUrl()}/admin/leads/${leadId}` : `${siteUrl()}/admin`;
  const html = layout({
    title,
    body: `${table(rows.map(([k, v]) => [k, esc(v)]))}${note ? `<p style="color:#b45309;">${esc(note)}</p>` : ''}`,
    button: { url, label: leadId ? 'Apri la scheda' : 'Apri il pannello' },
  });
  return sendEmail({
    to: process.env.ADMIN_NOTIFY_EMAIL,
    subject,
    html,
    text: `${title}\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n${note || ''}\n${url}`,
  });
}

export { formatDateTime };
