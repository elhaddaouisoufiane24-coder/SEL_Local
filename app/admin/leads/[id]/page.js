import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { euro, formatDate, formatDateTime, siteUrl, SERVIZIO_LABEL, STATO_LABEL } from '@/lib/format';
import { whatsappNumber } from '@/lib/validation';
import {
  toggleContattato, saveNote, saveRimborso, generateLink, sendLinkByEmail, setStato,
} from '../../actions';
import WhatsappSend from './WhatsappSend';

export default async function LeadPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: l } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
  if (!l) notFound();

  const modificabile = ['nuova', 'link_inviato'].includes(l.stato);
  const linkValido = l.token_prenotazione && l.token_scadenza && new Date(l.token_scadenza) > new Date();
  const url = linkValido ? `${siteUrl()}/prenota/${l.token_prenotazione}` : null;
  const wa = whatsappNumber(l.telefono);
  const waLeadText = `Ciao ${l.nome}, sono di AutoInspecta: ti scrivo per la tua richiesta di controllo su ${l.marca} ${l.modello} ${l.anno}.`;
  const waLinkText = url
    ? `Ciao ${l.nome}, qui AutoInspecta. Ecco il link per pagare (${euro(l.totale)}) e scegliere giorno e ora del controllo di ${l.marca} ${l.modello} ${l.anno}: ${url}`
    : '';

  return (
    <>
      <p><a className="muted" href="/admin">← Tutte le richieste</a></p>
      {sp?.ok && <div className="flash ok">{sp.ok}</div>}
      {sp?.err && <div className="flash err">{sp.err}</div>}

      <div className="card">
        <h1>{l.nome} {l.cognome}</h1>
        <div className="lead-badges" style={{ marginBottom: 14 }}>
          <span className={`badge ${l.contattato ? 'b-green' : 'b-red'}`}>{l.contattato ? 'CONTATTATO' : 'NON CONTATTATO'}</span>
          <span className="badge b-blue">{STATO_LABEL[l.stato]}</span>
        </div>
        <div className="actions" style={{ marginBottom: 14 }}>
          <a className="btn btn-outline" href={`tel:${l.telefono}`}>Chiama</a>
          <a className="btn btn-green" href={`https://wa.me/${wa}?text=${encodeURIComponent(waLeadText)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        </div>
        <form action={toggleContattato}>
          <input type="hidden" name="id" value={l.id} />
          <input type="hidden" name="next" value={String(!l.contattato)} />
          <button className="btn btn-outline btn-block" type="submit">
            {l.contattato ? 'Segna come NON contattato' : 'Segna come contattato'}
          </button>
        </form>
        {l.contattato_at && <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>Contattato il {formatDate(l.contattato_at)}</p>}
      </div>

      {l.data_ora_appuntamento && (
        <div className="card" style={{ background: 'var(--green-bg)' }}>
          <h2>Appuntamento</h2>
          <p style={{ margin: 0, fontWeight: 700 }}>{formatDateTime(l.data_ora_appuntamento)}</p>
        </div>
      )}

      <div className="card">
        <h2>Dati richiesta</h2>
        <dl className="kv">
          <dt>Ricevuta</dt><dd>{formatDate(l.created_at)}</dd>
          <dt>Telefono</dt><dd>{l.telefono}</dd>
          <dt>Email</dt><dd>{l.email}</dd>
          <dt>Auto</dt><dd>{l.marca} {l.modello} {l.anno}</dd>
          <dt>Comune</dt><dd>{l.comune_auto}</dd>
          <dt>Servizio</dt><dd>{SERVIZIO_LABEL[l.tipo_servizio]}</dd>
          <dt>Annuncio</dt><dd>{l.link_annuncio ? <a href={l.link_annuncio} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{l.link_annuncio}</a> : '—'}</dd>
          <dt>Privacy</dt><dd>{l.consenso_privacy ? `Accettata il ${formatDate(l.consenso_privacy_at)}` : 'Non registrata'}</dd>
          {l.pagato_at && (<><dt>Pagato il</dt><dd>{formatDate(l.pagato_at)}</dd></>)}
          {l.stripe_payment_intent_id && (<><dt>Stripe</dt><dd className="small">{l.stripe_payment_intent_id}</dd></>)}
        </dl>
      </div>

      <div className="card">
        <h2>Prezzo</h2>
        <div className="price-box">
          <div className="price-row"><span>Ispezione</span><span>{euro(l.prezzo_base)}</span></div>
          <div className="price-row"><span>Rimborso km</span><span>{euro(l.rimborso_km)}</span></div>
          <div className="price-row price-total"><span>Totale</span><span>{euro(l.totale)}</span></div>
        </div>
        {modificabile ? (
          <form action={saveRimborso}>
            <input type="hidden" name="id" value={l.id} />
            <div className="field">
              <label htmlFor="rimborso">Rimborso chilometrico (€)</label>
              <input id="rimborso" name="rimborso" type="text" inputMode="decimal" defaultValue={String(Number(l.rimborso_km).toFixed(2)).replace('.', ',')} />
            </div>
            <button className="btn btn-block" type="submit">Aggiorna totale</button>
          </form>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>Il cliente ha già pagato: il totale è bloccato.</p>
        )}
      </div>

      {modificabile && (
        <div className="card">
          <h2>Link per pagare e prenotare</h2>
          {Number(l.rimborso_km) === 0 && (
            <div className="flash" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>Il rimborso km è 0 €: impostalo prima di inviare il link se serve.</div>
          )}
          {url ? (
            <>
              <div className="linkbox">{url}<br /><span className="muted">Scade il {formatDate(l.token_scadenza)}</span></div>
              <div className="actions" style={{ marginBottom: 10 }}>
                <form action={sendLinkByEmail}>
                  <input type="hidden" name="id" value={l.id} />
                  <button className="btn btn-block" type="submit">Invia via email</button>
                </form>
                <WhatsappSend id={l.id} href={`https://wa.me/${wa}?text=${encodeURIComponent(waLinkText)}`} />
              </div>
            </>
          ) : (
            l.token_prenotazione && <p className="muted small">Il link precedente è scaduto.</p>
          )}
          <form action={generateLink}>
            <input type="hidden" name="id" value={l.id} />
            <button className="btn btn-outline btn-block" type="submit">{url ? 'Rigenera link (invalida il precedente)' : 'Genera link'}</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Note interne</h2>
        <form action={saveNote}>
          <input type="hidden" name="id" value={l.id} />
          <div className="field"><textarea name="note" defaultValue={l.note_interne || ''} placeholder="Appunti visibili solo a te" /></div>
          <button className="btn btn-block" type="submit">Salva note</button>
        </form>
      </div>

      <div className="card">
        <h2>Stato</h2>
        <div className="actions">
          {l.stato !== 'completato' && (
            <form action={setStato}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="stato" value="completato" /><button className="btn btn-outline btn-block" type="submit">Segna completato</button></form>
          )}
          {l.stato !== 'annullato' && (
            <form action={setStato}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="stato" value="annullato" /><button className="btn btn-danger btn-block" type="submit">Annulla richiesta</button></form>
          )}
        </div>
      </div>
    </>
  );
}
