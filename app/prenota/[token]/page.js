import { adminClient } from '@/lib/supabase/admin';
import { stripe, settleSession } from '@/lib/stripe';
import { euro, formatDateTime, SERVIZIO_LABEL } from '@/lib/format';
import { payAction } from './actions';
import CalEmbed from './CalEmbed';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prenota il controllo - AutoInspecta' };

function Shell({ children }) {
  return (
    <>
      <div className="topbar"><div className="topbar-in"><img src="/asset/logo-autoinspecta-transparent.png" alt="AutoInspecta" /></div></div>
      <main className="wrap">{children}</main>
    </>
  );
}

function Message({ icon, title, children }) {
  return (
    <Shell>
      <div className="card hero-card">
        <div className="icon">{icon}</div>
        <h1>{title}</h1>
        <p className="muted">{children}</p>
      </div>
    </Shell>
  );
}

function Riepilogo({ lead }) {
  return (
    <div className="card">
      <h2>Riepilogo</h2>
      <dl className="kv">
        <dt>Auto</dt><dd>{lead.marca} {lead.modello} {lead.anno}</dd>
        <dt>Servizio</dt><dd>{SERVIZIO_LABEL[lead.tipo_servizio]}</dd>
        <dt>Comune</dt><dd>{lead.comune_auto}</dd>
      </dl>
    </div>
  );
}

export default async function PrenotaPage({ params, searchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const db = adminClient();

  let { data: lead, error: leadErr } = await db.from('leads').select('*').eq('token_prenotazione', token).maybeSingle();
  if (leadErr) {
    console.error('prenota: errore database', leadErr);
    return <Message icon="⚠️" title="Servizio non disponibile">Si è verificato un problema temporaneo. Riprova tra un minuto.</Message>;
  }
  if (!lead) return <Message icon="🔗" title="Link non valido">Questo link non esiste. Se pensi sia un errore, scrivici e ne generiamo uno nuovo.</Message>;

  // Ritorno da Stripe: si verifica la sessione lato server, cosi' la pagina e' corretta
  // anche se il webhook arriva con qualche secondo di ritardo.
  const sessionId = typeof sp?.session_id === 'string' ? sp.session_id : null;
  if (sessionId && ['nuova', 'link_inviato'].includes(lead.stato)) {
    try {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      if (session.metadata?.lead_id === lead.id) {
        await settleSession(session);
        ({ data: lead } = await db.from('leads').select('*').eq('id', lead.id).maybeSingle());
      }
    } catch (err) {
      console.error('prenota: verifica sessione fallita', err);
    }
  }

  if (['annullato', 'rimborsato'].includes(lead.stato)) {
    return <Message icon="ℹ️" title="Richiesta non più attiva">Questa richiesta è stata chiusa. Per qualsiasi dubbio scrivici.</Message>;
  }

  if (['prenotato', 'completato'].includes(lead.stato)) {
    return (
      <Shell>
        <div className="card hero-card">
          <div className="icon">✅</div>
          <h1>{lead.stato === 'completato' ? 'Controllo completato' : 'Appuntamento confermato'}</h1>
          {lead.data_ora_appuntamento && <p><strong>{formatDateTime(lead.data_ora_appuntamento)}</strong></p>}
          <p className="muted">Hai ricevuto la conferma via email. Per spostare o annullare l'appuntamento usa il link presente nell'email di conferma.</p>
          {lead.calcom_booking_uid && lead.stato === 'prenotato' && (
            <a className="btn btn-outline" href={`https://cal.com/reschedule/${encodeURIComponent(lead.calcom_booking_uid)}`}>Sposta o annulla</a>
          )}
        </div>
        <Riepilogo lead={lead} />
      </Shell>
    );
  }

  if (lead.stato === 'pagato') {
    return (
      <Shell>
        <div className="card hero-card">
          <div className="icon">🎉</div>
          <h1>Pagamento ricevuto, grazie!</h1>
          <p className="muted">Ora scegli giorno e ora del controllo. Puoi tornare su questa pagina in qualsiasi momento da questo link.</p>
        </div>
        <CalEmbed
          calLink={process.env.NEXT_PUBLIC_CALCOM_LINK}
          leadId={lead.id}
          name={`${lead.nome} ${lead.cognome}`}
          email={lead.email}
          phone={lead.telefono}
        />
      </Shell>
    );
  }

  // nuova / link_inviato: il link vale solo se non scaduto
  const scaduto = !lead.token_scadenza || new Date(lead.token_scadenza) < new Date();
  if (scaduto) {
    return <Message icon="⏰" title="Link scaduto">Questo link non è più valido. Scrivici e te ne inviamo uno nuovo.</Message>;
  }

  return (
    <Shell>
      <div className="card">
        <h1>Ciao {lead.nome}, ci siamo quasi</h1>
        <p className="muted">Paga in modo sicuro con Stripe e subito dopo scegli giorno e ora del controllo.</p>
        {sp?.annullato && <div className="flash err">Pagamento annullato: puoi riprovare quando vuoi.</div>}
        {sp?.errore && <div className="flash err">Si è verificato un errore. Riprova tra un momento.</div>}
      </div>
      <Riepilogo lead={lead} />
      <div className="card">
        <div className="price-box">
          <div className="price-row"><span>Ispezione</span><span>{euro(lead.prezzo_base)}</span></div>
          <div className="price-row"><span>Rimborso chilometrico</span><span>{euro(lead.rimborso_km)}</span></div>
          <div className="price-row price-total"><span>Totale</span><span>{euro(lead.totale)}</span></div>
        </div>
        <form action={payAction}>
          <input type="hidden" name="token" value={token} />
          <button className="btn btn-block" type="submit">Paga e scegli la data</button>
        </form>
        <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>Carta, Apple Pay e Google Pay. Il pagamento è gestito da Stripe.</p>
      </div>
    </Shell>
  );
}
