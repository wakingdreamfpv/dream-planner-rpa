// Dream Planner RPA — backup (Supabase Edge Function), v7.15
// A snapshot of every table the planner keeps (people, registers, sign-offs, jobs, flights, settings…) as one JSON file.
//   { mode: 'cron' }      run daily by pg_cron: saved to the private "backups" bucket (once a day), and emailed to the
//                         CRP as an attachment daily or weekly (Database & Settings › Email notifications › Backups)
//   { mode: 'download' }  from the planner, signed in as the CRP: returns the snapshot now
// Deploy with Verify JWT OFF (the daily run has no login). Secrets: RESEND_API_KEY, NOTIFY_FROM (as for notify).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
export const TABLES = ['profiles', 'invites', 'people', 'experience', 'signoff_records', 'certifications', 'flight_counts', 'jobs', 'job_crew', 'job_flights',
  'pilot_hours', 'fleet_types', 'shared_data', 'app_settings', 'access_grants', 'observer_tokens', 'document_access_log', 'audit_log', 'notification_prefs'];
const todayBne = () => new Date(Date.now() + 10 * 3600e3).toISOString().slice(0, 10);
const isoDow = (d: string) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };
const b64 = (s: string) => { const u = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(bin); };

async function snapshot(admin: any) {
  const out: Record<string, unknown> = { app: 'Dream Planner RPA', kind: 'cloud-backup', version: 1, createdAt: new Date().toISOString(), tables: {} };
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) { // page through big tables
      const { data, error } = await admin.from(t).select('*').range(from, from + 999);
      if (error) { (out as any).tables[t] = { error: error.message }; break; }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    if (!(out as any).tables[t]) (out as any).tables[t] = rows;
    counts[t] = rows.length;
  }
  (out as any).counts = counts;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || 'cron');
    const today = todayBne();

    if (mode === 'download') {
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: who } = token ? await admin.auth.getUser(token) : { data: null } as any;
      if (!who?.user) return json({ error: 'Not signed in' }, 401);
      const { data: me } = await admin.from('profiles').select('role, active').eq('id', who.user.id).maybeSingle();
      if (!me || me.role !== 'crp' || me.active === false) return json({ error: 'Only the CRP can download a backup' }, 403);
      return json(await snapshot(admin));
    }
    if (mode !== 'cron') return json({ error: 'Unknown mode' }, 400);

    // once a day, however often this is called
    const name = `daily/${today}.json`;
    const { data: have } = await admin.storage.from('backups').list('daily', { search: today + '.json' });
    if ((have || []).some((f: any) => f.name === today + '.json')) return json({ ok: true, skipped: 'already backed up today' });
    const snap = await snapshot(admin);
    const text = JSON.stringify(snap);
    const { error: upErr } = await admin.storage.from('backups').upload(name, new Blob([text], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });

    // email it to each CRP who wants it (a copy that lives outside Supabase)
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('NOTIFY_FROM') || 'Dream Flight RPA Planner <planner@wakingdreamfpv.com>';
    const [{ data: crps }, { data: prefs }] = await Promise.all([
      admin.from('profiles').select('id, email, full_name, role, active').eq('role', 'crp'),
      admin.from('notification_prefs').select('user_id, backup_email')]);
    const sent: unknown[] = [];
    for (const c of (crps || []).filter((x: any) => x.active !== false && x.email)) {
      const how = ((prefs || []).find((p: any) => p.user_id === c.id) || {}).backup_email || 'weekly';
      if (how === 'off' || (how === 'weekly' && isoDow(today) !== 1)) continue; // weekly = Mondays
      if (!resendKey) { sent.push({ to: c.email, skipped: 'RESEND_API_KEY missing' }); continue; }
      const counts = (snap as any).counts || {};
      const html = `<p style="font-family:Arial,sans-serif;font-size:14px;color:#334155;">Attached is the ${today} backup of the planner's cloud records
        (${counts.people || 0} people, ${counts.certifications || 0} certifications, ${counts.signoff_records || 0} sign-offs, ${counts.jobs || 0} jobs).
        Keep it somewhere safe outside Supabase. A copy is also kept in the private "backups" bucket.</p>`;
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [c.email], subject: `Planner backup ${today}`, html, attachments: [{ filename: `Dream Planner backup ${today}.json`, content: b64(text) }] }) });
      sent.push({ to: c.email, ok: r.ok, status: r.status });
    }
    return json({ ok: true, stored: upErr ? null : name, storeError: upErr ? upErr.message : undefined, counts: (snap as any).counts, sent });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
