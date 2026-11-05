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

// ---- Consulenza scelta auto ----
export const CONSULENZA_PREZZO = 29.99;

export const CONSULENZA_STATO_LABEL = {
  in_attesa_pagamento: 'In attesa di pagamento',
  pagato: 'Pagato',
  completato: 'Completato',
  annullato: 'Annullato',
  rimborsato: 'Rimborsato',
};

export const CONSULENZA_STATI = Object.keys(CONSULENZA_STATO_LABEL);

export const PERCORRENZA_LABEL = {
  meno_10k: 'Meno di 10.000 km',
  '10_20k': '10.000 - 20.000 km',
  '20_30k': '20.000 - 30.000 km',
  oltre_30k: 'Oltre 30.000 km',
};

export const USO_LABEL = { citta: 'Città', misto: 'Misto', autostrada: 'Autostrada' };

export const BLOCCHI_LABEL = { si: 'Sì', no: 'No', non_so: 'Non so' };
