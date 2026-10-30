// Dream Planner RPA — notify (Supabase Edge Function)
// Sends the induction emails through Resend:
//   induction_submitted → every active CRP ("Ben has submitted his induction")
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
        P('Open the planner to review it and complete Part 2.'), 'Review the induction', appUrl);
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
          P('Sign in to the planner to see your record.'), 'Open the planner', appUrl);
      } else {
        subject = 'Your induction: not yet competent';
        html = page(subject,
          P(`Hi ${esc(pilot.full_name || '')},`) + P('The Chief Remote Pilot has reviewed your induction and recorded it as <b>not yet competent</b> for now.') +
          (crp.notes ? P('Notes: ' + esc(crp.notes)) : '') + P('Talk to the CRP about the next step; you can start a new induction from the planner.'),
          'Open the planner', appUrl);
      }
    } else return json({ error: 'Unknown event' }, 400);

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
