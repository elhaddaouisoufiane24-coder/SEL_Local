import { sessionClient } from '@/lib/supabase/server';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin - AutoInspecta' };

export default async function AdminLayout({ children }) {
  const supabase = await sessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <>
      <div className="topbar">
        <div className="topbar-in">
          <a href="/admin"><img src="/asset/logo-autoinspecta-transparent.png" alt="AutoInspecta" /></a>
          {user && (
            <form action={signOut}><button className="btn btn-outline btn-sm" type="submit">Esci</button></form>
          )}
        </div>
      </div>
      <main className="wrap">{children}</main>
    </>
  );
}
