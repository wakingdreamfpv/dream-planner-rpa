// ═══ Dream Planner RPA · edge function "enquiry-alert" · last changed in v7.34 ═══
// Paste into: Supabase › Edge Functions › Deploy a new function › name it enquiry-alert › Code (replace everything) › Deploy.
// Verify JWT: OFF (visitors using the free planner have no login).
// Emails each new "Get it for your company" enquiry, beta sign-up and beta feedback / bug report to Mike, once.
//   { id }  the enquiry id that submit_enquiry() returned. Only enquiries made in the last 15 minutes that haven't
//           been emailed yet are sent, so nobody can use this to send the same email again or to send anything else.
// Secrets: RESEND_API_KEY (as for notify), NOTIFY_FROM (optional), ENQUIRY_TO (optional, default mike@wakingdreamfpv.com).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const INTEREST: Record<string, string> = { founder: 'Founding member (beta)', monthly: 'Monthly plan', annual: 'Annual plan', source: 'Buy-once source licence', updates: 'Just keep me updated' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'No enquiry' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ ok: true, sent: 0, message: 'Email not set up (RESEND_API_KEY missing); see Settings › Enquiries' });
    const from = Deno.env.get('NOTIFY_FROM') || 'Dream Flight RPA Planner <planner@wakingdreamfpv.com>';
    const to = Deno.env.get('ENQUIRY_TO') || 'mike@wakingdreamfpv.com';
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    // Claim it first (only one call can), so it's emailed once at most
    const { data: rows } = await admin.from('enquiries').update({ emailed_at: new Date().toISOString() })
      .eq('id', id).is('emailed_at', null).gte('created_at', since).select('*');
    const e = rows && rows[0];
    if (!e) return json({ ok: true, sent: 0 });
    const beta = e.source === 'beta-signup';
    const FB: Record<string, string> = { 'feedback-bug': 'Bug report', 'feedback-idea': 'Feature request', 'feedback-general': 'Beta feedback' };
    const fb = FB[e.source as string];
    const heading = fb || (beta ? 'New beta tester' : 'New enquiry');
    const subject = heading + ': ' + (fb ? String(e.message || '').replace(/^\[[^\]]*\]\s*/, '').split('\n')[0].slice(0, 60) + ' (' + e.name + ')' : e.name + (e.company ? ' (' + e.company + ')' : ''));
    const row = (k: string, v: unknown) => v ? `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:6px 0;font-size:14px;color:#0f172a;white-space:pre-wrap;">${esc(v)}</td></tr>` : '';
    const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;">
<tr><td style="background:#2d0a5e;padding:20px 26px;border-radius:14px 14px 0 0;"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c4b5fd;font-weight:700;">Dream Flight RPA Planner</div>
<div style="font-size:20px;font-weight:800;color:#fff;margin-top:4px;">${heading}</div></td></tr>
<tr><td style="padding:22px 26px;"><table role="presentation" cellpadding="0" cellspacing="0">
${row('Name', e.name)}${row('Email', e.email)}${row('Company', e.company)}${row('Phone', e.phone)}${row('Interested in', INTEREST[e.interest] || e.interest)}${row('Message', e.message)}${row('From', e.source)}${row('When', new Date(e.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' }))}
</table><p style="margin:18px 0 0;font-size:13px;color:#64748b;">Reply to this email to answer them. It's also in the planner under Settings › Enquiries.</p></td></tr></table></td></tr></table></body></html>`;
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: e.email, subject, html }) });
    if (!r.ok) { await admin.from('enquiries').update({ emailed_at: null }).eq('id', id); return json({ ok: false, error: 'Email failed: ' + (await r.text()).slice(0, 200) }, 502); }
    return json({ ok: true, sent: 1 });
  } catch (err) { return json({ ok: false, error: String(err).slice(0, 200) }, 500); }
});
