-- AutoInspecta: consulenza per la scelta dell'auto (pagamento immediato, prezzo fisso).
-- Esegui questo file nel SQL Editor di Supabase dopo 001_init.sql.

create table if not exists public.consulenze (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- cliente
  nome text not null,
  cognome text not null,
  email text not null,
  telefono text not null,

  -- questionario
  percorrenza text not null check (percorrenza in ('meno_10k', '10_20k', '20_30k', 'oltre_30k')),
  uso_prevalente text not null check (uso_prevalente in ('citta', 'misto', 'autostrada')),
  comune_residenza text not null,
  blocchi_traffico text not null check (blocchi_traffico in ('si', 'no', 'non_so')),
  auto_preferite text not null,
  link_annunci text, -- uno per riga

  -- prezzo fissato al momento della richiesta (il checkout lo rilegge da qui)
  prezzo numeric(10, 2) not null check (prezzo > 0),

  stato text not null default 'in_attesa_pagamento'
    check (stato in ('in_attesa_pagamento', 'pagato', 'completato', 'annullato', 'rimborsato')),

  -- Stripe
  stripe_session_id text,
  stripe_payment_intent_id text,
  pagato_at timestamptz,

  -- gestione interna
  note_interne text,

  -- privacy / anti-spam
  consenso_privacy boolean not null default false,
  consenso_privacy_at timestamptz,
  ip_hash text
);

create index if not exists consulenze_created_at_idx on public.consulenze (created_at desc);
create index if not exists consulenze_stato_idx on public.consulenze (stato);
create index if not exists consulenze_ip_hash_created_idx on public.consulenze (ip_hash, created_at);
create index if not exists consulenze_payment_intent_idx on public.consulenze (stripe_payment_intent_id);

-- Stesse regole di leads: solo l'admin autenticato legge e scrive; il pubblico entra
-- solo da /api/consulenze con la service role key.
alter table public.consulenze enable row level security;

drop policy if exists "admin_all" on public.consulenze;
create policy "admin_all" on public.consulenze
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.consulenze from anon;
grant select, insert, update, delete on public.consulenze to authenticated;
