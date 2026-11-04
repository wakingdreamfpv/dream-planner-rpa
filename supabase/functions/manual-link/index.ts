// manual-link: a 5-minute link to the protected Operations Manual for someone holding a valid observer link (no login).
// Deploy with "Verify JWT" OFF (the observer has no login; the link token is checked here instead).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const sha256 = async (t: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))).map(b => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || '');
    if (!/^[a-f0-9]{40,80}$/i.test(token)) return json({ error: 'This link is not valid.' }, 400);
    const { data: tk } = await admin.from('observer_tokens').select('id, expires_at, label').eq('token_hash', await sha256(token)).maybeSingle();
    if (!tk || new Date(tk.expires_at).getTime() < Date.now()) return json({ error: 'This link has expired. Ask the CRP for a new one.' }, 403);
    const { data: s } = await admin.from('app_settings').select('key, value').in('key', ['manual_file', 'manual_version']);
    const m: Record<string, any> = {}; (s || []).forEach((r: any) => { m[r.key] = r.value; });
    const path = m.manual_file && m.manual_file.path;
    if (!path) return json({ error: "The CRP hasn't uploaded the Operations Manual yet." }, 404);
    const { data: u, error } = await admin.storage.from('ops-manual').createSignedUrl(path, 300);
    if (error || !u) return json({ error: 'Could not open the manual' }, 500);
    await admin.from('document_access_log').insert({ user_id: null, document: 'ops-manual', doc_version: String(m.manual_version || ''), page: 0, duration_s: 0, token_id: tk.id, viewer: tk.label || 'observer link' });
    return json({ url: u.signedUrl, version: m.manual_version || '' });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
