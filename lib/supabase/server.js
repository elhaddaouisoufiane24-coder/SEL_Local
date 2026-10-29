import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Client legato alla sessione dell'utente (cookie): le query passano da RLS,
// quindi funzionano solo se l'utente e' in admin_emails.
export async function sessionClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Chiamato da un Server Component: il refresh dei cookie lo fa il middleware.
          }
        },
      },
    }
  );
}
