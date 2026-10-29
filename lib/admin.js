import 'server-only';
import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/server';

/**
 * Richiede un utente autenticato E presente in admin_emails (funzione is_admin()).
 * Chi ha un account Supabase ma non e' admin viene disconnesso.
 */
export async function requireAdmin() {
  const supabase = await sessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect('/admin/login?e=accesso');
  }
  return { supabase, user };
}
