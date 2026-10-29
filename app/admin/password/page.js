import { requireAdmin } from '@/lib/admin';
import { changePassword } from '../actions';

const ERRORI = {
  corta: 'La password deve avere almeno 10 caratteri.',
  diverse: 'Le due password non coincidono.',
  fallita: 'Non è stato possibile cambiare la password. Riprova.',
};

export default async function PasswordPage({ searchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  return (
    <>
      <p><a className="muted" href="/admin">← Tutte le richieste</a></p>
      <div className="card" style={{ maxWidth: 460 }}>
        <h1>Cambia password</h1>
        {sp?.ok && <div className="flash ok">Password cambiata.</div>}
        {sp?.e && <div className="flash err">{ERRORI[sp.e] || 'Errore.'}</div>}
        <form action={changePassword}>
          <div className="field">
            <label htmlFor="nuova">Nuova password</label>
            <input id="nuova" name="nuova" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <div className="field">
            <label htmlFor="conferma">Ripeti la nuova password</label>
            <input id="conferma" name="conferma" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <button className="btn btn-block" type="submit">Salva password</button>
        </form>
        <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>Almeno 10 caratteri. Usa una password che non hai già usato altrove.</p>
      </div>
    </>
  );
}
