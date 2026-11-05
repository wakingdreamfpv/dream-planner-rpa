// ═══ Dream Planner RPA · edge function "notify" · last changed in v7.22 ═══
// Paste into: Supabase › Edge Functions › notify › Code (replace everything) › Deploy. Verify JWT: OFF.
// Dream Planner RPA — notify (Supabase Edge Function)
// Sends the induction emails through Resend:
//   induction_submitted → every active CRP ("<the pilot's name> has submitted their induction")
//   induction_certified → the pilot ("You're certified" or "not yet competent")
// Secrets (Supabase › Edge Functions › Secrets): RESEND_API_KEY (required), NOTIFY_FROM, APP_URL (optional).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const COMPETENCY: Record<string, string> = { induction: 'Induction', evlos: 'EVLOS', oonp: 'OONP', night: 'Night' };
const compLabel = (c: string) => c.startsWith('type:') ? 'Type: ' + c.slice(5) : (COMPETENCY[c] || c);

function page(title: string, bodyHtml: string, button: string, url: string) {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;">
<tr><td style="background:#2d0a5e;padding:24px 28px;"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c4b5fd;font-weight:700;">Dream Flight RPA</div>
<div style="font-size:21px;font-weight:800;color:#fff;margin-top:4px;">Operations Planner</div></td></tr>
<tr><td style="padding:28px;"><h1 style="margin:0 0 12px;font-size:19px;">${esc(title)}</h1>${bodyHtml}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr><td style="border-radius:10px;background:#7c3aed;">
<a href="${esc(url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;">${esc(button)}</a></td></tr></table>
</td></tr></table></td></tr></table></body></html>`;
}
const P = (t: string) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:#334155;">${t}</p>`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('NOTIFY_FROM') || 'Dream Flight RPA Planner <planner@wakingdreamfpv.com>';
    const appUrl = Deno.env.get('APP_URL') || 'https://planner.wakingdreamfpv.com/';

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who } = token ? await admin.auth.getUser(token) : { data: null };
    if (!who?.user) return json({ error: 'Not signed in' }, 401);
    const { data: me } = await admin.from('profiles').select('role, active').eq('id', who.user.id).single();
    if (!me?.active) return json({ error: 'Login not active' }, 403);

    const body = await req.json().catch(() => ({}));
    const event = String(body.event || '');
    // v7.11: people can turn each kind of email off (Database & Settings › Email notifications)
    const keep = async (emails: string[], key: string) => {
      if (!emails.length) return emails;
      const { data: ps } = await admin.from('profiles').select('id, email').in('email', emails.map((e) => String(e).toLowerCase()));
      const ids = (ps || []).map((p: any) => p.id); if (!ids.length) return emails;
      const { data: pf } = await admin.from('notification_prefs').select('user_id, events').in('user_id', ids);
      const off = new Set((pf || []).filter((x: any) => x.events && x.events[key] === false).map((x: any) => x.user_id));
      const offEmails = new Set((ps || []).filter((p: any) => off.has(p.id)).map((p: any) => String(p.email).toLowerCase()));
      return emails.filter((e) => !offEmails.has(String(e).toLowerCase()));
    };

    // v7.8: the CRP emails a job link / training link to someone without a login
    if (event === 'observer_link') {
      if (me.role !== 'crp') return json({ error: 'Only the CRP can send this' }, 403);
      const to4 = String(body.email || '').trim().toLowerCase(), link = String(body.link || '');
      if (!/^\S+@\S+\.\S+$/.test(to4)) return json({ error: 'Enter a valid email' }, 400);
      if (!link.startsWith(appUrl.replace(/\/$/, '')) || !/#observer=[a-f0-9]{40,80}$/i.test(link)) return json({ error: 'Not a planner observer link' }, 400);
      if (!resendKey) return json({ ok: true, sent: 0, message: 'Email not set up (RESEND_API_KEY missing)' });
      const { data: crpP } = await admin.from('profiles').select('full_name').eq('id', who.user.id).single();
      const training = !!body.training, title = String(body.title || '').slice(0, 120);
      const subject4 = training ? 'EVLOS observer training sign-off' : `Your job pack and EVLOS observer sign-off: ${title}`;
      const html4 = page(subject4,
        P(`${esc(crpP?.full_name || 'The Chief Remote Pilot')} has sent you ${training ? 'your EVLOS observer training sign-off' : 'the job pack for <b>' + esc(title) + '</b>'}.`) +
        P(training ? 'Open it on your phone: read the observer extract and the Operations Manual, tick the declaration and sign. No login needed.'
          : 'Open it on your phone: the flight plan, map, hazards and emergency contacts, the Operations Manual, and your EVLOS observer sign-off. No login needed.') +
        P('The link works for 7 days.'), training ? 'Open the sign-off' : 'Open the job pack', link);
      const r4 = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to4], subject: subject4, html: html4 }) });
      if (!r4.ok) return json({ ok: false, error: 'Email failed: ' + (await r4.text()).slice(0, 200) }, 502);
      return json({ ok: true, sent: 1 });
    }
    // v7.5.7: the CRP asks crew on a job to fill in the post-flight log
    if (event === 'log_request') {
      if (me.role !== 'crp') return json({ error: 'Only the CRP can send this' }, 403);
      const { data: job } = await admin.from('jobs').select('id, title, op_id, start_date').eq('id', String(body.job_id || '')).single();
      if (!job) return json({ error: 'Job not found' }, 404);
      const emails = (Array.isArray(body.emails) ? body.emails : []).map((x: any) => String(x || '').trim().toLowerCase()).filter(Boolean).slice(0, 20);
      const { data: crew } = await admin.from('job_crew').select('job_role, people:person_id (full_name, email)').eq('job_id', job.id);
      const onJob: Record<string, any> = {}; (crew || []).forEach((c: any) => { if (c.people?.email) onJob[String(c.people.email).toLowerCase()] = c; });
      const { data: crpP } = await admin.from('profiles').select('full_name').eq('id', who.user.id).single();
      const send = await keep(emails.filter((e: string) => onJob[e]), 'log_request'), skipped = emails.filter((e: string) => !onJob[e]);
      if (!send.length) return json({ ok: true, sent: 0, skipped, message: 'Nobody selected is on this job in the cloud.' });
      if (!resendKey) return json({ ok: true, sent: 0, skipped, message: 'Email not set up (RESEND_API_KEY missing)' });
      const note = String(body.note || '').slice(0, 500);
      let sent = 0;
      for (const e of send) {
        const c = onJob[e], nm = c.people?.full_name || '';
        const subject3 = `Please fill in the post-flight log: ${job.title || job.op_id || 'your job'}`;
        const html3 = page(subject3,
          P(`Hi ${esc(nm.split(' ')[0] || '')},`) +
          P(`${esc(crpP?.full_name || 'The Chief Remote Pilot')} has asked you to fill in the post-flight log for <b>${esc(job.title || '')}</b>${job.op_id ? ' (' + esc(job.op_id) + ')' : ''}${job.start_date ? ' · ' + esc(job.start_date) : ''}.`) +
          (note ? P('Note: ' + esc(note)) : '') +
          P('Open the job, log each flight (length, height, batteries, telemetry if you have it), answer the post-flight questions, then tap <b>Send my log to the CRP</b>.'),
          'Open the flight log', appUrl + '#crew-job=' + job.id);
        const r3 = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [e], subject: subject3, html: html3 }) });
        if (r3.ok) sent++;
      }
      return json({ ok: true, sent, skipped });
    }
    // v7.18: the CRP emails a live plan link (client or crew) — they view the plan and comment, no login
    if (event === 'plan_link') {
      if (me.role !== 'crp') return json({ error: 'Only the CRP can send this' }, 403);
      const to7 = String(body.email || '').trim().toLowerCase(), link7 = String(body.link || '');
      if (!/^\S+@\S+\.\S+$/.test(to7)) return json({ error: 'Enter a valid email' }, 400);
      if (!link7.startsWith(appUrl.replace(/\/$/, '')) || !/#plan=[a-f0-9]{40,80}$/i.test(link7)) return json({ error: 'Not a planner plan link' }, 400);
      if (!resendKey) return json({ ok: true, sent: 0, message: 'Email not set up (RESEND_API_KEY missing)' });
      const { data: crpP7 } = await admin.from('profiles').select('full_name').eq('id', who.user.id).single();
      const title7 = String(body.title || '').slice(0, 120), nm7 = String(body.name || '').split(' ')[0].slice(0, 40);
      const subject7 = `Flight plan for review: ${title7}`;
      const html7 = page(subject7,
        (nm7 ? P(`Hi ${esc(nm7)},`) : '') +
        P(`${esc(crpP7?.full_name || 'The Chief Remote Pilot')} has shared the flight plan for <b>${esc(title7)}</b> with you.`) +
        P(body.audience === 'crew' ? 'Open it on your phone or computer: read the plan, comment on any section and suggest changes. No login needed.' : 'Open it on your phone or computer, read the plan, and leave comments or questions on any section. No login needed.') +
        P('The link always shows the latest version of the plan.'), 'Open the plan', link7);
      const r7 = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to7], subject: subject7, html: html7 }) });
      if (!r7.ok) return json({ ok: false, error: 'Email failed: ' + (await r7.text()).slice(0, 200) }, 502);
      return json({ ok: true, sent: 1 });
    }
    // v7.16: the CRP asks the job's RPIC to log in and sign the plan
    if (event === 'rpic_sign_request') {
      if (me.role !== 'crp') return json({ error: 'Only the CRP can send this' }, 403);
      const { data: job } = await admin.from('jobs').select('id, title, op_id, start_date').eq('id', String(body.job_id || '')).single();
      if (!job) return json({ error: 'Job not found' }, 404);
      const { data: crew } = await admin.from('job_crew').select('job_role, people:person_id (full_name, email, user_id)').eq('job_id', job.id).eq('job_role', 'rpic');
      const r5 = (crew || []).map((c: any) => c.people || {})[0] || null;
      const name5 = r5?.full_name || String(body.name || '');
      if (!r5 || !r5.user_id || !r5.email) return json({ ok: false, reason: 'no_login', name: name5, email: r5?.email || '' });
      const { data: crpP } = await admin.from('profiles').select('full_name').eq('id', who.user.id).single();
      const send5 = await keep([String(r5.email).toLowerCase()], 'sign_request');
      if (!send5.length) return json({ ok: true, sent: 0, name: name5, email: r5.email, message: 'they have turned these emails off' });
      if (!resendKey) return json({ ok: true, sent: 0, name: name5, email: r5.email, message: 'Email not set up (RESEND_API_KEY missing)' });
      const subject5 = `Please review and sign as RPIC: ${job.title || job.op_id || 'your job'}`;
      const html5 = page(subject5,
        P(`Hi ${esc(String(name5).split(' ')[0] || '')},`) +
        P(`${esc(crpP?.full_name || 'The Chief Remote Pilot')} has asked you to review and sign the flight plan for <b>${esc(job.title || '')}</b>${job.op_id ? ' (' + esc(job.op_id) + ')' : ''}${job.start_date ? ' · ' + esc(job.start_date) : ''} as Remote Pilot in Command.`) +
        P('Log in, read the plan, map, JSA and risk register, then sign: click to sign, type your name or draw your signature. You can add comments for the CRP.'),
        'Log in and sign', appUrl + '#rpic-sign=' + job.id);
      const r6 = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: send5, subject: subject5, html: html5 }) });
      if (!r6.ok) return json({ ok: false, error: 'Email failed: ' + (await r6.text()).slice(0, 200) }, 502);
      return json({ ok: true, sent: 1, name: name5, email: r5.email });
    }
    // v7.22: a pilot or observer saved changes to a company plan → they arrive as suggestions; email the CRP(s) to review them
    if (event === 'plan_suggestions') {
      const jobId8 = String(body.job_id || '');
      const { data: job } = await admin.from('jobs').select('id, title, op_id, start_date').eq('id', jobId8).single();
      if (!job) return json({ error: 'Job not found' }, 404);
      const { data: mine } = await admin.from('job_crew').select('job_role, people:person_id!inner (full_name, user_id)').eq('job_id', job.id).eq('people.user_id', who.user.id);
      const onJob8 = (mine || [])[0] as any;
      if (!onJob8) return json({ error: 'You are not on this job' }, 403);
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: sg } = await admin.from('plan_comments').select('body, suggestion').eq('job_id', job.id).eq('author_user', who.user.id).eq('kind', 'suggestion').eq('status', 'open').gte('created_at', since);
      if (!sg || !sg.length) return json({ error: 'No new suggestions' }, 400);
      const { data: crps } = await admin.from('profiles').select('email').eq('role', 'crp').eq('active', true);
      const to8 = await keep((crps || []).map((c: any) => c.email).filter(Boolean), 'plan_suggestions');
      if (!to8.length) return json({ ok: true, sent: 0, message: 'No CRP to email' });
      if (!resendKey) return json({ ok: true, sent: 0, message: 'Email not set up (RESEND_API_KEY missing); shown in the planner only' });
      const nm8 = onJob8.people?.full_name || 'A crew member', role8 = ({ rpic: 'RPIC', pilot: 'pilot', observer: 'observer' } as Record<string, string>)[onJob8.job_role] || 'crew member';
      const subject8 = `${nm8} suggested ${sg.length === 1 ? 'a change' : sg.length + ' changes'} to ${job.title || job.op_id || 'a job'}`;
      const items = sg.slice(0, 8).map((x: any) => `<li style="margin:0 0 6px;">${esc(String(x.body || '').slice(0, 220))}</li>`).join('');
      const html8 = page(subject8,
        P(`<b>${esc(nm8)}</b> (${esc(role8)}) changed the plan for <b>${esc(job.title || '')}</b>${job.op_id ? ' (' + esc(job.op_id) + ')' : ''}${job.start_date ? ' · ' + esc(job.start_date) : ''}. Nothing has changed in your plan yet.`) +
        `<ul style="margin:0 0 12px 18px;padding:0;font-size:14px;color:#334155;">${items}</ul>` + (sg.length > 8 ? P(`…and ${sg.length - 8} more.`) : '') +
        P('Open the job to accept or decline each one. Accepted changes go into the plan; then save the job.'),
        'Review the changes', appUrl + '#job-comments=' + job.id);
      const r8 = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: to8, subject: subject8, html: html8 }) });
      if (!r8.ok) return json({ ok: false, error: 'Email failed: ' + (await r8.text()).slice(0, 200) }, 502);
      return json({ ok: true, sent: to8.length });
    }
    // v7.5.2: a crew member signed as RPIC on a company job → email the CRP(s)
    if (event === 'rpic_signed') {
      const { data: row } = await admin.from('job_flights')
        .select('id, flight, job_id, jobs:job_id (title, op_id, start_date), people:person_id (full_name, email, user_id)').eq('id', String(body.flight_id || '')).single();
      const sig = (row?.flight || {}) as any, who2 = (row as any)?.people || {}, job = (row as any)?.jobs || {};
      if (!row || sig.kind !== 'rpic_signature' || who2.user_id !== who.user.id) return json({ error: 'Signature not found' }, 404);
      const { data: crps } = await admin.from('profiles').select('email').eq('role', 'crp').eq('active', true);
      const to2 = await keep((crps || []).map((c: any) => c.email).filter(Boolean), 'rpic_signed');
      const subject2 = `${who2.full_name || 'Your RPIC'} has signed ${job.title || 'a job'} as RPIC`;
      const html2 = page(subject2,
        P(`<b>${esc(who2.full_name)}</b> (${esc(who2.email)}) has reviewed and signed the flight plan as Remote Pilot in Command.`) +
        P(`Job: <b>${esc(job.title || '')}</b>${job.op_id ? ' (' + esc(job.op_id) + ')' : ''}${job.start_date ? ' · ' + esc(job.start_date) : ''}`) +
        P('Review and sign opens the job on the Authorisation tab with their signature added, ready for you to sign as CRP and approve the flight.'),
        'Review and sign', appUrl + '#rpic-signed=' + row.id);
      if (!to2.length) return json({ ok: true, sent: 0, message: 'No CRP to email' });
      if (!resendKey) return json({ ok: true, sent: 0, message: 'Email not set up (RESEND_API_KEY missing); shown in the planner only' });
      const r2 = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: to2, subject: subject2, html: html2 }) });
      if (!r2.ok) return json({ ok: false, error: 'Email failed: ' + (await r2.text()).slice(0, 200) }, 502);
      return json({ ok: true, sent: to2.length });
    }
    const { data: rec } = await admin.from('signoff_records')
      .select('id, type, status, answers, person_id, people:person_id (full_name, email, user_id)').eq('id', String(body.signoff_id || '')).single();
    if (!rec || rec.type !== 'pilot_induction') return json({ error: 'Induction not found' }, 404);
    const pilot = (rec as any).people || {};

    let to: string[] = [], subject = '', html = '';
    if (event === 'induction_submitted') {
      // only the pilot themselves, right after submitting
      if (pilot.user_id !== who.user.id || rec.status !== 'awaiting_crp') return json({ error: 'Nothing to send' }, 400);
      const { data: crps } = await admin.from('profiles').select('email').eq('role', 'crp').eq('active', true);
      to = (crps || []).map((c: any) => c.email).filter(Boolean);
      const a = (rec.answers || {}) as any;
      subject = `${pilot.full_name || 'A pilot'} has submitted their induction`;
      html = page(subject,
        P(`<b>${esc(pilot.full_name)}</b> (${esc(pilot.email)}) has completed Part 1 of the pilot induction and signed the declaration.`) +
        P(`Types: ${esc((a.types || []).join(', ') || '—')} · Approvals sought: ${esc((a.approvals || []).map((x: string) => COMPETENCY[x] || x).join(', ') || 'Induction & type only')}`) +
        P('Open the planner to review it and complete Part 2.'), 'Review the induction', appUrl + '#review-induction=' + rec.id);
    } else if (event === 'induction_certified') {
      if (me.role !== 'crp' || !['certified', 'not_yet_competent'].includes(rec.status)) return json({ error: 'Nothing to send' }, 400);
      to = [pilot.email].filter(Boolean);
      const crp = ((rec.answers || {}) as any).crp || {};
      if (rec.status === 'certified') {
        const { data: certs } = await admin.from('certifications').select('competency, next_due').eq('signoff_id', rec.id);
        subject = "You're certified to fly with Dream Flight RPA";
        html = page(subject,
          P(`Hi ${esc(pilot.full_name || '')},`) + P('Your induction has been checked and certified by the Chief Remote Pilot.') +
          P((certs || []).map((c: any) => `• ${esc(compLabel(c.competency))}: due again ${esc(c.next_due)}`).join('<br>')) +
          P('Sign in to the planner to see your record.'), 'Open the planner', appUrl + '#my-induction');
      } else {
        subject = 'Your induction: not yet competent';
        html = page(subject,
          P(`Hi ${esc(pilot.full_name || '')},`) + P('The Chief Remote Pilot has reviewed your induction and recorded it as <b>not yet competent</b> for now.') +
          (crp.notes ? P('Notes: ' + esc(crp.notes)) : '') + P('Talk to the CRP about the next step; you can start a new induction from the planner.'),
          'Open the planner', appUrl + '#my-induction');
      }
    } else return json({ error: 'Unknown event' }, 400);

    to = await keep(to, 'induction');
    if (!to.length) return json({ ok: true, sent: 0, message: 'No one to email' });
    if (!resendKey) return json({ ok: true, sent: 0, message: 'Email not set up (RESEND_API_KEY missing); shown in the planner only' });
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!r.ok) return json({ ok: false, error: 'Email failed: ' + (await r.text()).slice(0, 200) }, 502);
    return json({ ok: true, sent: to.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
