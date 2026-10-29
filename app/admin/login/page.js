import { signIn } from '../actions';

const ERRORI = {
  credenziali: 'Email o password non corrette.',
  accesso: 'Questo account non è autorizzato.',
};

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  return (
    <div className="card" style={{ maxWidth: 420, margin: '24px auto' }}>
      <h1>Accedi</h1>
      {sp?.e && <div className="flash err">{ERRORI[sp.e] || 'Errore di accesso.'}</div>}
      <form action={signIn}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn btn-block" type="submit">Entra</button>
      </form>
    </div>
  );
}
