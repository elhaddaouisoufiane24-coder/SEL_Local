import { requireAdmin } from '@/lib/admin';
import { CONSULENZA_STATO_LABEL, PERCORRENZA_LABEL, formatDate } from '@/lib/format';

const FILTRI = [
  { key: 'pagate', label: 'Da fare' },
  { key: 'tutte', label: 'Tutte' },
  { key: 'in_attesa', label: 'Non pagate' },
  { key: 'completate', label: 'Completate' },
];

const STATO_BADGE = {
  in_attesa_pagamento: 'b-amber', pagato: 'b-green', completato: 'b-gray', annullato: 'b-gray', rimborsato: 'b-gray',
};

export default async function ConsulenzeHome({ searchParams }) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const filtro = FILTRI.some((f) => f.key === sp?.f) ? sp.f : 'pagate';

  let query = supabase
    .from('consulenze')
    .select('id, created_at, nome, cognome, telefono, comune_residenza, percorrenza, stato')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filtro === 'pagate') query = query.eq('stato', 'pagato');
  if (filtro === 'in_attesa') query = query.eq('stato', 'in_attesa_pagamento');
  if (filtro === 'completate') query = query.eq('stato', 'completato');

  const [{ data: consulenze, error }, { count: daFare }] = await Promise.all([
    query,
    supabase.from('consulenze').select('id', { count: 'exact', head: true }).eq('stato', 'pagato'),
  ]);

  return (
    <>
      <p><a className="muted" href="/admin">← Richieste di ispezione</a></p>
      <div className={`counter ${daFare ? '' : 'zero'}`}>
        <span className="n">{daFare ?? 0}</span>
        <span>{daFare ? 'consulenze pagate da fare' : 'nessuna consulenza da fare'}</span>
      </div>

      <nav className="filters" aria-label="Filtri">
        {FILTRI.map((f) => (
          <a key={f.key} href={`/admin/consulenze?f=${f.key}`} className={`chip ${filtro === f.key ? 'on' : ''}`}>{f.label}</a>
        ))}
      </nav>

      {error && <div className="flash err">Errore nel caricamento: {error.message}</div>}
      {!error && consulenze?.length === 0 && <div className="card muted">Nessuna consulenza trovata.</div>}

      {consulenze?.map((c) => (
        <div className="lead-item" key={c.id}>
          <a className="lead-main" href={`/admin/consulenze/${c.id}`}>
            <div className="lead-name">{c.nome} {c.cognome}</div>
            <div className="lead-meta">{c.comune_residenza} · {PERCORRENZA_LABEL[c.percorrenza]}/anno</div>
            <div className="lead-meta small">{formatDate(c.created_at)}</div>
            <div className="lead-badges">
              <span className={`badge ${STATO_BADGE[c.stato]}`}>{CONSULENZA_STATO_LABEL[c.stato]}</span>
            </div>
          </a>
        </div>
      ))}
    </>
  );
}
