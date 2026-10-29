import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
let client = null;
// Tests can inject a stand-in client (window.__WD_SUPABASE_MOCK__) so the screens can be checked without a network.
export function getSupabase() {
  if (typeof window !== 'undefined' && window.__WD_SUPABASE_MOCK__) return window.__WD_SUPABASE_MOCK__;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
  return client;
}
