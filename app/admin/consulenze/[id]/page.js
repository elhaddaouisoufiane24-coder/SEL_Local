import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import {
  euro, formatDate, CONSULENZA_STATO_LABEL, PERCORRENZA_LABEL, USO_LABEL, BLOCCHI_LABEL,
} from '@/lib/format';
import { whatsappNumber } from '@/lib/validation';
import { saveNoteConsulenza, setStatoConsulenza } from '../../actions';

export default async function ConsulenzaPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: c } = await supabase.from('consulenze').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();

  const wa = whatsappNumber(c.telefono);
  const waText = `Ciao ${c.nome}, sono di AutoInspecta: ti scrivo per la consulenza sulla scelta dell'auto.`;
  const annunci = c.link_annunci ? c.link_annunci.split('\n') : [];

  return (
    <>
      <p><a className="muted" href="/admin/consulenze">← Tutte le consulenze</a></p>
      {sp?.ok && <div className="flash ok">{sp.ok}</div>}

      <div className="card">
        <h1>{c.nome} {c.cognome}</h1>
        <div className="lead-badges" style={{ marginBottom: 14 }}>
          <span className="badge b-blue">{CONSULENZA_STATO_LABEL[c.stato]}</span>
        </div>
        <div className="actions">
          <a className="btn btn-outline" href={`tel:${c.telefono}`}>Chiama</a>
          <a className="btn btn-green" href={`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        </div>
      </div>

      <div className="card">
        <h2>Questionario</h2>
        <dl className="kv">
          <dt>Km all'anno</dt><dd>{PERCORRENZA_LABEL[c.percorrenza]}</dd>
          <dt>Guida di più</dt><dd>{USO_LABEL[c.uso_prevalente]}</dd>
          <dt>Abita a</dt><dd>{c.comune_residenza}</dd>
          <dt>Blocchi traffico</dt><dd>{BLOCCHI_LABEL[c.blocchi_traffico]}</dd>
          <dt>Auto preferite</dt><dd style={{ whiteSpace: 'pre-line' }}>{c.auto_preferite}</dd>
          <dt>Annunci</dt>
          <dd>
            {annunci.length
              ? annunci.map((l) => <div key={l}><a href={l} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{l}</a></div>)
              : '—'}
          </dd>
        </dl>
      </div>

      <div className="card">
        <h2>Contatti e pagamento</h2>
        <dl className="kv">
          <dt>Ricevuta</dt><dd>{formatDate(c.created_at)}</dd>
          <dt>Telefono</dt><dd>{c.telefono}</dd>
          <dt>Email</dt><dd>{c.email}</dd>
          <dt>Prezzo</dt><dd>{euro(c.prezzo)}</dd>
          <dt>Pagato il</dt><dd>{c.pagato_at ? formatDate(c.pagato_at) : 'Non pagato'}</dd>
          {c.stripe_payment_intent_id && (<><dt>Stripe</dt><dd className="small">{c.stripe_payment_intent_id}</dd></>)}
          <dt>Privacy</dt><dd>{c.consenso_privacy ? `Accettata il ${formatDate(c.consenso_privacy_at)}` : 'Non registrata'}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Note interne</h2>
        <form action={saveNoteConsulenza}>
          <input type="hidden" name="id" value={c.id} />
          <div className="field"><textarea name="note" defaultValue={c.note_interne || ''} placeholder="Appunti visibili solo a te" /></div>
          <button className="btn btn-block" type="submit">Salva note</button>
        </form>
      </div>

      <div className="card">
        <h2>Stato</h2>
        <div className="actions">
          {c.stato === 'pagato' && (
            <form action={setStatoConsulenza}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="stato" value="completato" /><button className="btn btn-outline btn-block" type="submit">Segna completata</button></form>
          )}
          {!['annullato', 'rimborsato'].includes(c.stato) && (
            <form action={setStatoConsulenza}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="stato" value="annullato" /><button className="btn btn-danger btn-block" type="submit">Annulla</button></form>
          )}
        </div>
        {c.stato === 'pagato' && <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>Per rimborsare usa Stripe: la consulenza passerà a "Rimborsato" da sola.</p>}
      </div>
    </>
  );
}
