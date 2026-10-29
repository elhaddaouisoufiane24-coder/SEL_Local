import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Client con service role: bypassa RLS. Usare SOLO in codice server
// (route handler, webhook, pagina pubblica /prenota) mai nel browser.
let client;
export function adminClient() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase non configurato (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
