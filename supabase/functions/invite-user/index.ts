// Dream Planner RPA — invite-user (Supabase Edge Function)
// Only an active CRP can call this. It records the invite (which sets the person's role when they first sign in)
// and sends Supabase's invite email. The service-role key is only ever used here, on the server.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Who is calling? (validated by the auth server)
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not signed in' }, 401);
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who?.user) return json({ error: 'Not signed in' }, 401);
    const { data: me } = await admin.from('profiles').select('role, active').eq('id', who.user.id).single();
    if (!me || me.role !== 'crp' || !me.active) return json({ error: 'Only the CRP can invite crew' }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const full_name = String(body.full_name || '').trim().slice(0, 120);
    const role = String(body.role || '');
    const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined; // must be in Auth › URL Configuration
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400);
    if (!['pilot', 'observer', 'crp'].includes(role)) return json({ error: 'Role must be pilot, observer or crp' }, 400);
    if (!full_name) return json({ error: 'Enter their name' }, 400);

    const { error: invErr } = await admin.from('invites').upsert(
      { email, full_name, role, invited_by: who.user.id, invited_at: new Date().toISOString() }, { onConflict: 'email' });
    if (invErr) return json({ error: 'Could not record the invite: ' + invErr.message }, 500);

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        return json({ ok: true, existing: true, message: `${email} already has a login. Their role is set from the invite the next time they sign in, or change it in the crew list.` });
      }
      return json({ error: error.message }, 400);
    }
    return json({ ok: true, userId: data?.user?.id ?? null, message: `Invite sent to ${email}` });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
