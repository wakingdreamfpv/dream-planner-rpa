// Dream Planner RPA — digest (Supabase Edge Function), v7.11
// A weekly or fortnightly email of compliance issues and setup still to do, plus a one-off alert 7 days before a
// certification expires. Each login chooses in Database & Settings › Email notifications.
//   { mode: 'cron' }            run daily by pg_cron (07:30 Brisbane); sends only what's due today, never twice
//   { mode: 'test' | 'preview' } from the planner, signed in: sends (or returns) your own digest now
// Deploy with Verify JWT OFF (the daily run has no login). Secrets: RESEND_API_KEY, NOTIFY_FROM, APP_URL (as for notify).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const COMP: Record<string, string> = { induction: 'Induction', evlos: 'EVLOS', oonp: 'OONP', night: 'Night', evlos_observer: 'EVLOS observer' };
const compLabel = (c: string) => (c.startsWith('type:') ? c.slice(5) : COMP[c] || c);
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const names = (s: unknown) => String(s ?? '').split(/[,;/&\n]|\band\b/).map((x) => x.replace(/\(.*?\)/g, '').trim()).filter((x) => x.length > 1);

// today in Brisbane, and day arithmetic on YYYY-MM-DD
const todayBne = () => new Date(Date.now() + 10 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const fmt = (d: string) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const isoDow = (d: string) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };
const weekNo = (d: string) => Math.floor((Date.parse(d + 'T00:00:00Z') / 864e5 + 3) / 7); // weeks since 1970 (Mondays)

// what each person on a job needs (same rules as the planner)
function jobNeeds(plan: any) {
  const ov = plan?.overview || {}, ap = plan?.approval || {}, lg = plan?.log || {}, jsa = plan?.jsa || {};
  const ops = jsa.operationTypes || [], evlos = ops.includes('EVLOS'), oonp = ops.includes('OONP'), night = jsa.timeOfDay === 'NIGHT' || jsa.timeOfDay === 'DAY_NIGHT';
  const types = (ov.rpaTypes || []).filter((t: string) => t && t !== 'Custom');
  const crew = new Map<string, any>(), rank: any = { rpic: 0, pilot: 1, observer: 2 };
  const add = (s: unknown, role: string) => names(s).forEach((n) => { const k = norm(n), c = crew.get(k); if (!c || rank[role] < rank[c.role]) crew.set(k, { name: n, role, obs: c?.obs || false }); });
  add(ov.rpic, 'rpic'); add(ap.rpName, 'rpic'); add(lg.crewRP, 'pilot'); add(lg.crewSecondRP, 'pilot');
  if (evlos) names(jsa.evlosObserver).forEach((n) => { add(n, 'observer'); crew.get(norm(n)).obs = true; });
  return [...crew.values()].map((c) => {
    const needs: string[][] = [];
    if (c.role !== 'observer') { needs.push(['induction']); if (types.length) needs.push(types.map((t: string) => 'type:' + t)); if (evlos && c.role === 'rpic') needs.push(['evlos']); if (oonp) needs.push(['oonp']); if (night) needs.push(['night']); }
    if (c.obs) needs.push(['evlos_observer']);
    return { ...c, needs };
  });
}

function page(title: string, intro: string, sections: { h: string; items: string[] }[], appUrl: string, company: string) {
  const sec = sections.filter((s) => s.items.length).map((s) => `<h2 style="margin:22px 0 8px;font-size:15px;color:#2d0a5e;">${esc(s.h)}</h2>
<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.55;color:#334155;">${s.items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join('')}</ul>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;">
<tr><td style="background:#2d0a5e;padding:22px 28px;"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c4b5fd;font-weight:700;">${esc(company || 'Dream Flight RPA')}</div>
<div style="font-size:20px;font-weight:800;color:#fff;margin-top:4px;">${esc(title)}</div></td></tr>
<tr><td style="padding:24px 28px;"><p style="margin:0;font-size:15px;line-height:1.55;color:#334155;">${intro}</p>${sec}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr><td style="border-radius:10px;background:#7c3aed;">
<a href="${esc(appUrl)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">Open the planner</a></td></tr></table>
<p style="margin:14px 0 0;font-size:12px;color:#64748b;">Change how often you get this in Database &amp; Settings › Email notifications.</p>
</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('NOTIFY_FROM') || 'Dream Flight RPA Planner <planner@wakingdreamfpv.com>';
    const appUrl = Deno.env.get('APP_URL') || 'https://planner.wakingdreamfpv.com/';
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || 'cron');
    const today = todayBne();

    // only who's asking, for a test / preview
    let only: string | null = null;
    if (mode === 'test' || mode === 'preview') {
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: who } = token ? await admin.auth.getUser(token) : { data: null } as any;
      if (!who?.user) return json({ error: 'Not signed in' }, 401);
      only = who.user.id;
    } else if (mode !== 'cron') return json({ error: 'Unknown mode' }, 400);

    // everything the digest needs, once
    const [{ data: profiles }, { data: prefs }, { data: cur }, { data: people }, { data: shared }, { data: sign }, { data: grants }, { data: jobs }, { data: crew }, { data: settings }] = await Promise.all([
      admin.from('profiles').select('id, email, full_name, role, active'),
      admin.from('notification_prefs').select('*'),
      admin.rpc('_currency_all'),
      admin.from('people').select('id, user_id, full_name, email, role, active'),
      admin.from('shared_data').select('area, data'),
      admin.from('signoff_records').select('id, type, status, person_id, created_at').in('status', ['draft', 'awaiting_crp']),
      admin.from('access_grants').select('id, status').eq('status', 'requested'),
      admin.from('jobs').select('id, title, op_id, start_date, status, overview:plan->overview, jsa:plan->jsa, approval:plan->approval, log:plan->log').gte('start_date', today).lte('start_date', addDays(today, 28)).order('start_date'),
      admin.from('job_crew').select('job_id, person_id, job_role'),
      admin.from('app_settings').select('key, value').in('key', ['manual_file']),
    ]);
    const sh: any = {}; (shared || []).forEach((s: any) => { sh[s.area] = s.data; });
    const company = (sh.company || {}).name || '';
    const rows: any[] = cur || [], ppl: any[] = (people || []).filter((p: any) => p.active !== false);
    const pref = (uid: string, role: string) => ({ digest: role === 'crp' ? 'weekly' : 'fortnightly', digest_day: 1, expiry_alerts: true, events: {}, ...((prefs || []).find((p: any) => p.user_id === uid) || {}) });
    const personOf = (name: string) => ppl.find((p) => norm(p.full_name) === norm(name)) || null;
    const certLine = (r: any) => `<b>${esc(r.full_name)}</b>: ${esc(compLabel(r.competency))} ${r.status === 'expired' ? '<b style="color:#b91c1c">expired ' + esc(fmt(r.due)) + '</b>' : 'due ' + esc(fmt(r.due)) + ' (' + days(today, r.due) + ' days)'}`;
    const jobProblems = (j: any, onlyPerson?: string) => {
      const out: string[] = [];
      jobNeeds(j).forEach((c: any) => {
        const p = personOf(c.name);
        if (onlyPerson && (!p || p.id !== onlyPerson)) return;
        if (!p) { out.push(`${esc(c.name)} isn't in the crew list, so their currency can't be checked`); return; }
        c.needs.forEach((anyOf: string[]) => {
          const have = rows.filter((r) => r.person_id === p.id && anyOf.includes(r.competency));
          const ok = have.some((r) => r.status !== 'expired' && (!r.due || r.due >= (j.start_date || today)));
          if (!ok) out.push(`${esc(c.name)}: ${esc(anyOf.length > 1 ? 'type (' + anyOf.map(compLabel).join(' / ') + ')' : compLabel(anyOf[0]))} ${have.length ? 'not current on the day' : 'not certified'}`);
        });
      });
      return out;
    };

    const sent: any[] = [];
    const send = async (uid: string, to: string, kind: string, ref: string, subject: string, html: string) => {
      if (mode === 'cron') {
        const { error: le } = await admin.from('notification_log').insert({ user_id: uid, kind, ref }); // unique: never twice
        if (le) return false;
      }
      if (!resendKey) { sent.push({ to, subject, skipped: 'RESEND_API_KEY missing' }); return false; }
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, html }) });
      sent.push({ to, subject, ok: r.ok }); return r.ok;
    };

    for (const pr of (profiles || []).filter((p: any) => p.active && p.email && (!only || p.id === only))) {
      const pf = pref(pr.id, pr.role), isCrp = pr.role === 'crp';
      const me = ppl.find((p) => p.user_id === pr.id);
      const mine = isCrp ? rows.filter((r) => r.active !== false) : rows.filter((r) => me && r.person_id === me.id);
      const sections: { h: string; items: string[] }[] = [];

      // 1. certifications expired or due within 60 days
      sections.push({ h: isCrp ? 'Crew certifications' : 'Your certifications', items: mine.filter((r) => r.status !== 'current').sort((a, b) => String(a.due).localeCompare(String(b.due))).map(certLine) });
      // 2. upcoming jobs (next 4 weeks) with crew who aren't current
      const myJobs = isCrp ? (jobs || []) : (jobs || []).filter((j: any) => (crew || []).some((c: any) => c.job_id === j.id && me && c.person_id === me.id));
      sections.push({ h: 'Upcoming jobs', items: myJobs.flatMap((j: any) => jobProblems(j, isCrp ? undefined : me?.id).map((t) => `<b>${esc(j.title || j.op_id)}</b> (${esc(fmt(j.start_date))}): ${t}`)) });
      if (isCrp) {
        // 3. waiting for the CRP
        const waiting: string[] = [];
        const nInd = (sign || []).filter((s: any) => s.type === 'pilot_induction' && s.status === 'awaiting_crp').length, nObs = (sign || []).filter((s: any) => s.type === 'evlos_observer' && s.status === 'awaiting_crp').length;
        if (nInd) waiting.push(`${nInd} pilot induction${nInd === 1 ? '' : 's'} to review and certify`);
        if (nObs) waiting.push(`${nObs} EVLOS observer sign-off${nObs === 1 ? '' : 's'} to countersign`);
        if ((grants || []).length) waiting.push(`${grants!.length} access request${grants!.length === 1 ? '' : 's'} from crew`);
        sections.push({ h: 'Waiting for you', items: waiting });
        // 4. company compliance calendar (overdue or due within 30 days)
        const comp = ((sh.compliance || {}).items || []).filter((i: any) => i.date && days(today, i.date) <= 30)
          .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
          .map((i: any) => { const d = days(today, i.date); return `${esc(i.label)}: ${d < 0 ? '<b style="color:#b91c1c">overdue since ' + esc(fmt(i.date)) + '</b>' : 'due ' + esc(fmt(i.date)) + ' (' + d + ' days)'}`; });
        sections.push({ h: 'Compliance calendar', items: comp });
        // 5. setup still to do
        const setup: string[] = [...((sh.compliance || {}).setup || []).map(esc)];
        const mf = (settings || []).find((s: any) => s.key === 'manual_file');
        if (!mf || !(mf.value && mf.value.path)) setup.push('Upload the Operations Manual for crew and observers (Database &amp; Settings › Operations Manual)');
        if (!(sh.company || {}).openAipKey && !setup.some((s) => /OpenAIP/.test(s))) setup.push('Add the OpenAIP key so the airspace class is worked out for every job');
        ppl.filter((p) => p.role === 'pilot' && !rows.some((r) => r.person_id === p.id)).forEach((p) => setup.push(`${esc(p.full_name)} has no certifications yet (induction not done)`));
        ppl.filter((p) => p.role === 'observer' && !rows.some((r) => r.person_id === p.id && r.competency === 'evlos_observer')).forEach((p) => setup.push(`${esc(p.full_name)} isn't trained and assessed as an EVLOS observer yet`));
        sections.push({ h: 'Setup still to do', items: setup });
      } else if (pr.role === 'pilot' && me && !rows.some((r) => r.person_id === me.id && r.competency === 'induction')) {
        const draft = (sign || []).find((s: any) => s.type === 'pilot_induction' && s.person_id === me.id);
        sections.push({ h: 'Setup still to do', items: [draft && draft.status === 'awaiting_crp' ? 'Your induction is with the CRP to certify' : 'Complete your pilot induction (sign in › My induction)'] });
      }
      const count = sections.reduce((t, s) => t + s.items.length, 0);

      // a) weekly / fortnightly digest
      const dueToday = mode !== 'cron' || (pf.digest !== 'off' && isoDow(today) === Number(pf.digest_day) && (pf.digest === 'weekly' || weekNo(today) % 2 === 0));
      if (dueToday && (count > 0 || mode !== 'cron')) {
        const subject = count ? `${count} compliance item${count === 1 ? '' : 's'} to look at` : 'All clear: nothing to sort out';
        const intro = count ? `Hi ${esc(String(pr.full_name || '').split(' ')[0])}, here's what needs attention${isCrp ? ' across the company' : ''}.` : `Hi ${esc(String(pr.full_name || '').split(' ')[0])}, nothing needs attention right now.`;
        const html = page(subject, intro, sections, appUrl, company);
        if (mode === 'preview') return json({ ok: true, subject, html, count });
        await send(pr.id, pr.email, 'digest', today, subject, html);
      }
      // b) 7-day expiry alerts (daily run only), once per certification
      if (mode === 'cron' && pf.expiry_alerts) {
        for (const r of mine.filter((r) => r.due && days(today, r.due) >= 0 && days(today, r.due) <= 7)) {
          const subject = `${isCrp ? r.full_name + "'s" : 'Your'} ${compLabel(r.competency)} expires ${fmt(r.due)}`;
          const html = page(subject, `${certLine(r)}. ${isCrp ? 'Record a check in Database &amp; Settings › Registers, or plan for it on upcoming jobs.' : 'Talk to the CRP about a check before then.'}`, [], appUrl, company);
          await send(pr.id, pr.email, 'expiry7', r.cert_id + ':' + r.due, subject, html);
        }
      }
    }
    return json({ ok: true, date: today, sent });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
