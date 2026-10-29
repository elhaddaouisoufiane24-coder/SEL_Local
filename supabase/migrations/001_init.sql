-- AutoInspecta: schema iniziale (lead, RLS, funzione is_admin)
-- Esegui questo file nel SQL Editor di Supabase, poi aggiungi la tua email admin (vedi README).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Admin: elenco delle email autorizzate. Nessuna policy = leggibile solo con
-- service role / SQL editor, mai da browser.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_emails (
  email text primary key
);
alter table public.admin_emails enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- Lead
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- auto
  marca text not null,
  modello text not null,
  anno integer not null check (anno between 1980 and 2100),
  link_annuncio text,
  comune_auto text not null,

  tipo_servizio text not null check (tipo_servizio in ('insieme', 'al_posto_tuo')),

  -- cliente
  nome text not null,
  cognome text not null,
  telefono text not null,
  email text not null,

  -- gestione interna
  contattato boolean not null default false,
  contattato_at timestamptz,
  note_interne text,

  -- prezzo (il totale e' sempre calcolato dal database)
  prezzo_base numeric(10, 2) not null default 149.00 check (prezzo_base >= 0),
  rimborso_km numeric(10, 2) not null default 0 check (rimborso_km >= 0),
  totale numeric(10, 2) generated always as (prezzo_base + rimborso_km) stored,

  -- link di prenotazione
  token_prenotazione text unique,
  token_scadenza timestamptz,

  stato text not null default 'nuova'
    check (stato in ('nuova', 'link_inviato', 'pagato', 'prenotato', 'completato', 'annullato', 'rimborsato')),

  -- Stripe
  stripe_session_id text,
  stripe_payment_intent_id text,
  pagato_at timestamptz,

  -- Cal.com
  calcom_booking_uid text,
  data_ora_appuntamento timestamptz,

  -- privacy / anti-spam
  consenso_privacy boolean not null default false,
  consenso_privacy_at timestamptz,
  ip_hash text
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_stato_idx on public.leads (stato);
create index if not exists leads_contattato_idx on public.leads (contattato);
create index if not exists leads_ip_hash_created_idx on public.leads (ip_hash, created_at);
create index if not exists leads_payment_intent_idx on public.leads (stripe_payment_intent_id);
create index if not exists leads_calcom_uid_idx on public.leads (calcom_booking_uid);
create index if not exists leads_email_idx on public.leads (lower(email));

-- ---------------------------------------------------------------------------
-- Row Level Security: solo l'admin autenticato legge e scrive.
-- Il pubblico NON ha nessuna policy: i lead entrano solo da /api/leads,
-- che usa la service role key (lato server, bypassa RLS).
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;

drop policy if exists "admin_all" on public.leads;
create policy "admin_all" on public.leads
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Nessun accesso diretto per il ruolo anonimo
revoke all on public.leads from anon;
revoke all on public.admin_emails from anon, authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant execute on function public.is_admin() to authenticated;
