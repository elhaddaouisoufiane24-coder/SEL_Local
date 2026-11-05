import { adminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { settleConsulenzaSession } from '@/lib/consulenze';
import { euro } from '@/lib/format';
import { CONSULENZA_PROSSIMI_PASSI } from '@/lib/email';
import { retryConsulenzaPayment } from './actions';
import PixelPurchase from './PixelPurchase';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Consulenza - AutoInspecta' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Shell({ children }) {
  return (
    <>
      <div className="topbar"><div className="topbar-in"><a href="/"><img src="/asset/logo-autoinspecta-transparent.png" alt="AutoInspecta" /></a></div></div>
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
        {children}
      </div>
    </Shell>
  );
}

export default async function ConsulenzaGrazie({ searchParams }) {
  const sp = await searchParams;
  const sessionId = typeof sp?.session_id === 'string' ? sp.session_id : null;

  // Ritorno da Stripe dopo il pagamento: si verifica la sessione lato server, cosi' la
  // pagina e' corretta anche se il webhook arriva in ritardo.
  if (sessionId) {
    let session;
    try {
      session = await stripe().checkout.sessions.retrieve(sessionId);
    } catch (err) {
      console.error('consulenza: sessione Stripe non trovata', err);
    }
    if (!session || session.metadata?.tipo !== 'consulenza') {
      return <Message icon="🔗" title="Link non valido"><p className="muted">Non troviamo questo pagamento. Se hai pagato, controlla la tua email o scrivici.</p></Message>;
    }
    if (session.payment_status !== 'paid') {
      return <Message icon="⏳" title="Pagamento in elaborazione"><p className="muted">Stiamo aspettando la conferma da Stripe. Riceverai un'email appena il pagamento sarà completato.</p></Message>;
    }
    try {
      await settleConsulenzaSession(session);
    } catch (err) {
      console.error('consulenza: registrazione pagamento fallita', err);
    }
    const value = session.amount_total / 100;
    return (
      <Message icon="🎉" title="Pagamento ricevuto, grazie!">
        <p>Hai pagato <strong>{euro(value)}</strong> per la consulenza sulla scelta dell'auto.</p>
        <p className="muted">{CONSULENZA_PROSSIMI_PASSI} Ti abbiamo inviato un'email di conferma con il riepilogo.</p>
        <a className="btn" href="/">Torna al sito</a>
        <PixelPurchase sessionId={session.id} value={value} />
      </Message>
    );
  }

  // Ritorno da Stripe con "Indietro": si puo' riprovare finche' la consulenza e' da pagare.
  const id = typeof sp?.c === 'string' && UUID_RE.test(sp.c) ? sp.c : null;
  if (id) {
    const { data: c } = await adminClient().from('consulenze').select('id, nome, prezzo, stato').eq('id', id).maybeSingle();
    if (c?.stato === 'in_attesa_pagamento') {
      return (
        <Message icon="💳" title="Pagamento non completato">
          <p className="muted">Ciao {c.nome}, la tua richiesta è salvata ma il pagamento non è andato a buon fine. Puoi riprovare quando vuoi.</p>
          {sp?.errore && <div className="flash err">Si è verificato un errore. Riprova tra un momento.</div>}
          <form action={retryConsulenzaPayment}>
            <input type="hidden" name="id" value={c.id} />
            <button className="btn btn-block" type="submit">Paga {euro(c.prezzo)}</button>
          </form>
        </Message>
      );
    }
    if (c && ['pagato', 'completato'].includes(c.stato)) {
      return <Message icon="✅" title="Pagamento già ricevuto"><p className="muted">{CONSULENZA_PROSSIMI_PASSI}</p></Message>;
    }
  }

  return <Message icon="ℹ️" title="Nessun pagamento da mostrare"><p className="muted">Se hai appena pagato, controlla la tua email. Per qualsiasi dubbio scrivici.</p><a className="btn" href="/">Torna al sito</a></Message>;
}
