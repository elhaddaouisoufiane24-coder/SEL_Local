import { requireAdmin } from '@/lib/admin';
import { STATO_LABEL, formatDate } from '@/lib/format';
import { toggleContattato } from './actions';

const FILTRI = [
  { key: 'tutte', label: 'Tutte' },
  { key: 'non_contattati', label: 'Non contattati' },
  { key: 'link_inviato', label: 'Link inviato' },
  { key: 'pagati', label: 'Pagati' },
  { key: 'prenotati', label: 'Prenotati' },
];

const STATO_BADGE = {
  nuova: 'b-blue', link_inviato: 'b-amber', pagato: 'b-green', prenotato: 'b-green',
  completato: 'b-gray', annullato: 'b-gray', rimborsato: 'b-gray',
};

export default async function AdminHome({ searchParams }) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const filtro = FILTRI.some((f) => f.key === sp?.f) ? sp.f : 'tutte';
  // Caratteri che romperebbero il filtro .or() di PostgREST
  const term = String(sp?.q || '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 60);

  let query = supabase
    .from('leads')
    .select('id, created_at, nome, cognome, telefono, marca, modello, anno, comune_auto, contattato, stato')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filtro === 'non_contattati') query = query.eq('contattato', false);
  if (filtro === 'link_inviato') query = query.eq('stato', 'link_inviato');
  if (filtro === 'pagati') query = query.eq('stato', 'pagato');
  if (filtro === 'prenotati') query = query.eq('stato', 'prenotato');
  if (term) {
    const t = `%${term}%`;
    query = query.or(['nome', 'cognome', 'telefono', 'modello', 'marca'].map((c) => `${c}.ilike.${t}`).join(','));
  }

  const [{ data: leads, error }, { count: nonContattate }] = await Promise.all([
    query,
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('contattato', false).neq('stato', 'annullato'),
  ]);

  const hrefFiltro = (f) => `/admin?f=${f}${term ? `&q=${encodeURIComponent(term)}` : ''}`;

  return (
    <>
      <div className={`counter ${nonContattate ? '' : 'zero'}`}>
        <span className="n">{nonContattate ?? 0}</span>
        <span>{nonContattate ? 'richieste da contattare' : 'tutte le richieste sono state contattate'}</span>
      </div>

      <form className="searchrow" action="/admin" method="get">
        <input type="hidden" name="f" value={filtro} />
        <input type="search" name="q" defaultValue={term} placeholder="Cerca nome, telefono, modello" aria-label="Cerca" />
        <button className="btn" type="submit">Cerca</button>
      </form>

      <nav className="filters" aria-label="Filtri">
        {FILTRI.map((f) => (
          <a key={f.key} href={hrefFiltro(f.key)} className={`chip ${filtro === f.key ? 'on' : ''}`}>{f.label}</a>
        ))}
      </nav>

      {error && <div className="flash err">Errore nel caricamento: {error.message}</div>}
      {!error && leads?.length === 0 && <div className="card muted">Nessuna richiesta trovata.</div>}

      {leads?.map((l) => (
        <div className="lead-item" key={l.id}>
          <a className="lead-main" href={`/admin/leads/${l.id}`}>
            <div className="lead-name">{l.nome} {l.cognome}</div>
            <div className="lead-meta">{l.marca} {l.modello} {l.anno} · {l.comune_auto}</div>
            <div className="lead-meta small">{formatDate(l.created_at)}</div>
            <div className="lead-badges">
              <span className={`badge ${l.contattato ? 'b-green' : 'b-red'}`}>{l.contattato ? 'CONTATTATO' : 'NON CONTATTATO'}</span>
              <span className={`badge ${STATO_BADGE[l.stato]}`}>{STATO_LABEL[l.stato]}</span>
            </div>
          </a>
          <form className="lead-toggle" action={toggleContattato}>
            <input type="hidden" name="id" value={l.id} />
            <input type="hidden" name="next" value={String(!l.contattato)} />
            <button className={`toggle ${l.contattato ? 'on' : ''}`} type="submit" aria-label={l.contattato ? 'Segna come non contattato' : 'Segna come contattato'}>
              <span className="box">{l.contattato ? '✓' : ''}</span>
              Contattato
            </button>
          </form>
        </div>
      ))}
    </>
  );
}
