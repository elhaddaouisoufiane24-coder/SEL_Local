// Helper di formattazione e costanti condivise (usabili anche lato client).

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function euro(n) {
  const v = Number(n);
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number.isFinite(v) ? v : 0);
}

export function formatDateTime(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Rome',
  }).format(new Date(d));
}

export function formatDate(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(new Date(d));
}

export const SERVIZIO_LABEL = {
  insieme: 'Andiamo a vederla insieme',
  al_posto_tuo: 'Andiamo noi a vederla al posto tuo',
};

export const STATO_LABEL = {
  nuova: 'Nuova',
  link_inviato: 'Link inviato',
  pagato: 'Pagato',
  prenotato: 'Prenotato',
  completato: 'Completato',
  annullato: 'Annullato',
  rimborsato: 'Rimborsato',
};

export const STATI = Object.keys(STATO_LABEL);
