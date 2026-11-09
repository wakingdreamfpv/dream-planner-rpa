// v7.30: "Get it for your company". People using the free planner leave their details (EnquiryDialog); the CRP sees
// them in Database & Settings › Enquiries (EnquiriesList). Stored in public.enquiries (migration 0013): visitors can only
// add one through submit_enquiry(); only CRP accounts can read them or mark them contacted / closed. Nothing is deleted.
import React, { useEffect, useState } from 'react';
import { getSupabase } from '../cloud/client.js';

// v7.32: email Mike about it (the enquiry-alert function sends each one once; if it fails, it's still in Settings › Enquiries)
export const alertMike = (sb, id) => { if (sb && id) { try { Promise.resolve(sb.functions.invoke('enquiry-alert', { body: { id } })).catch(() => {}); } catch (e) { /* still saved */ } } };
export const ENQUIRY_FALLBACK_EMAIL = 'mike@wakingdreamfpv.com';
export const INTERESTS = [
  ['founder', 'Founding member (beta)', 'Early access and a founder price'],
  ['monthly', 'Monthly plan', ''],
  ['annual', 'Annual plan', ''],
  ['source', 'Buy the whole thing to customise', 'Your own copy of the planner'],
  ['updates', 'Just keep me posted', ''],
];
const interestLabel = (k) => (INTERESTS.find((x) => x[0] === k) || [k, k || '—'])[1];

// ── The visitor's form ─────────────────────────────────────────────────────
export function EnquiryDialog({ open, source, onClose }) {
  const blank = { name: '', email: '', company: '', phone: '', interest: 'founder', message: '', consent: false };
  const [f, setF] = useState(blank), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [done, setDone] = useState(false), [offline, setOffline] = useState(false);
  useEffect(() => { if (open) { setErr(''); setOffline(false); } }, [open]);
  if (!open) return null;
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setErr(''); };
  const close = () => { if (done) { setF(blank); setDone(false); } onClose(); };
  const mailto = () => 'mailto:' + ENQUIRY_FALLBACK_EMAIL + '?subject=' + encodeURIComponent('Dream Flight RPA Planner for ' + (f.company || 'my company'))
    + '&body=' + encodeURIComponent(['Name: ' + f.name, 'Email: ' + f.email, f.company && 'Company: ' + f.company, f.phone && 'Phone: ' + f.phone, 'Interested in: ' + interestLabel(f.interest), f.message && '', f.message].filter((x) => x !== false && x !== undefined && x !== null).join('\n'));
  const send = async () => {
    if (!f.name.trim()) { setErr('Please add your name.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) { setErr('Please check your email address.'); return; }
    if (!f.consent) { setErr('Please tick the box so we can contact you.'); return; }
    setBusy(true); setErr('');
    const sb = getSupabase();
    try {
      if (!sb) throw new Error('offline');
      const { data: enqId, error } = await sb.rpc('submit_enquiry', { p_name: f.name, p_email: f.email, p_company: f.company, p_phone: f.phone, p_interest: f.interest, p_message: f.message, p_source: source || 'free', p_consent: true });
      if (error) throw error;
      alertMike(sb, enqId);
      setDone(true);
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/too many/i.test(m)) setErr('Thanks, we already have your details. We\'ll be in touch.');
      else if (/email not valid/i.test(m)) setErr('Please check your email address.');
      else setOffline(true); // no signal, or the server isn't ready: offer email instead, nothing is lost
    }
    setBusy(false);
  };
  const inp = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base';
  return (
    <div className="fixed inset-0 z-[4900] bg-slate-900/60 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto print:hidden" data-testid="enquiry" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-2 sm:my-6">
        <div className="px-5 py-4 text-white relative" style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 60%,#4c1d95 100%)' }}>
          <button type="button" onClick={close} data-enquiry-close="1" aria-label="Close" className="absolute z-10 top-2 right-2 w-11 h-11 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 text-xl"><i className="fa-solid fa-xmark"></i></button>
          <div className="text-xs uppercase tracking-widest opacity-75 pr-10">Dream Flight RPA Planner</div>
          <h2 className="text-xl font-bold mt-1 pr-8">Get it for your company</h2>
        </div>
        {done ? (
          <div className="p-5 space-y-3 text-sm text-slate-700" data-enquiry-done="1">
            <p className="text-base"><i className="fa-solid fa-circle-check text-emerald-600 mr-1.5"></i><b>Thanks{f.name.trim() ? ', ' + f.name.trim().split(/\s+/)[0] : ''}!</b> We've got your details and will be in touch soon.</p>
            <p>Keep using the free planner in the meantime. Your job stays on this device.</p>
            <button type="button" onClick={close} className="w-full py-3 rounded-xl bg-violet-600 text-white font-bold">Back to the planner</button>
          </div>
        ) : (
          <div className="p-4 sm:p-5 space-y-3 text-sm text-slate-700" data-enquiry-form="1">
            <p>Your company profile, fleet, crew and every job saved and shared across your devices, plus approvals, inductions, sign-offs and the compliance calendar. Leave your details and we'll be in touch.</p>
            <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">Your name *</span><input className={inp} autoComplete="name" value={f.name} onChange={set('name')} data-enquiry="name" /></label>
            <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">Email *</span><input className={inp} type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} data-enquiry="email" /></label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">Company</span><input className={inp} autoComplete="organization" value={f.company} onChange={set('company')} data-enquiry="company" /></label>
              <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">Phone</span><input className={inp} type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} data-enquiry="phone" /></label>
            </div>
            <fieldset><legend className="text-xs font-semibold text-slate-600 mb-1">I'm interested in</legend>
              <div className="space-y-1.5">{INTERESTS.map(([k, l, sub]) => (
                <label key={k} className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${f.interest === k ? 'border-violet-400 bg-violet-50' : 'border-slate-200'}`}>
                  <input type="radio" name="wd-enquiry-interest" className="mt-1" checked={f.interest === k} onChange={() => setF({ ...f, interest: k })} data-enquiry-interest={k} />
                  <span><b className="text-slate-800">{l}</b>{sub && <span className="block text-xs text-slate-500">{sub}</span>}</span>
                </label>))}</div>
            </fieldset>
            <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">Anything else? (optional)</span><textarea rows={2} maxLength={2000} className={inp} value={f.message} onChange={set('message')} data-enquiry="message" /></label>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.consent} onChange={set('consent')} data-enquiry="consent" /><span>It's OK to contact me about the Dream Flight RPA Planner. We only use your details for that, and never share them.</span></label>
            {err && <p className="text-sm text-red-700" data-enquiry-err="1">{err}</p>}
            {offline && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2" data-enquiry-offline="1">
              <p className="text-amber-900"><b>Couldn't send that just now</b> (no signal?). You can email your details instead:</p>
              <a href={mailto()} className="block text-center py-2.5 rounded-lg bg-slate-800 text-white font-semibold" data-enquiry-mailto="1"><i className="fa-solid fa-envelope mr-1.5"></i>Email {ENQUIRY_FALLBACK_EMAIL}</a>
              <p className="text-xs text-amber-900">Or try again in a moment.</p>
            </div>}
            <button type="button" disabled={busy} onClick={send} className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-base font-bold disabled:opacity-50" data-enquiry-send="1">{busy ? 'Sending…' : offline ? 'Try again' : 'Send my details'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── The CRP's list (Database & Settings › Enquiries) ─────────────────────────
const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function EnquiriesList() {
  const sb = getSupabase();
  const [rows, setRows] = useState(null), [msg, setMsg] = useState(''), [show, setShow] = useState('open');
  const load = async () => {
    setMsg('');
    try {
      const { data, error } = await sb.from('enquiries').select('id,created_at,name,email,company,phone,interest,message,source,status,handled_at').order('created_at', { ascending: false }).limit(1000);
      if (error) throw error; setRows(data || []);
    } catch (e) { setRows([]); setMsg(/relation|does not exist|schema cache/i.test(String(e.message)) ? 'Enquiries need the Supabase migration 0013_enquiries.sql (SQL Editor › New query › paste › Run).' : 'Couldn\'t load enquiries: ' + (e.message || e)); }
  };
  useEffect(() => { if (sb) load(); }, []); // eslint-disable-line
  if (!sb) return <p className="text-sm text-slate-500">Enquiries show in the online planner when you're signed in.</p>;
  const mark = async (r, status) => {
    const { error } = await sb.from('enquiries').update({ status }).eq('id', r.id);
    if (error) { setMsg('Not saved: ' + error.message); return; }
    setRows(rows.map((x) => (x.id === r.id ? { ...x, status, handled_at: new Date().toISOString() } : x)));
  };
  const download = () => {
    const head = ['Received', 'Name', 'Email', 'Company', 'Phone', 'Interested in', 'Message', 'From', 'Status'];
    const lines = [head.join(',')].concat((rows || []).map((r) => [new Date(r.created_at).toLocaleString('en-AU'), r.name, r.email, r.company, r.phone, interestLabel(r.interest), r.message, r.source, r.status].map(csvCell).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'Enquiries_' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 3000);
  };
  const list = (rows || []).filter((r) => (show === 'open' ? r.status !== 'closed' : true));
  const fresh = (rows || []).filter((r) => r.status === 'new').length;
  return (
    <div className="space-y-3 text-sm" data-enquiries="1">
      <p className="text-slate-600">People who tapped <b>Get it for your company</b> in the free planner. Only you (CRP) can see these.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={show} onChange={(e) => setShow(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded-lg" data-enquiries-show="1"><option value="open">New and contacted</option><option value="all">All, including closed</option></select>
        <button type="button" onClick={load} className="px-3 py-1.5 rounded-lg border border-slate-300"><i className="fa-solid fa-rotate mr-1"></i>Refresh</button>
        <button type="button" onClick={download} disabled={!rows || !rows.length} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white disabled:opacity-40" data-enquiries-csv="1"><i className="fa-solid fa-file-csv mr-1"></i>Download CSV</button>
        <span className="text-xs text-slate-500" data-enquiries-count={rows ? rows.length : ''}>{rows ? `${rows.length} in total · ${fresh} new` : 'Loading…'}</span>
      </div>
      {msg && <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-enquiries-msg="1">{msg}</p>}
      {rows && !list.length && !msg && <p className="text-slate-500" data-enquiries-empty="1">No enquiries yet.</p>}
      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl" hidden={!list.length}>
        {list.map((r) => (
          <div key={r.id} className="p-3 space-y-1" data-enquiry-row={r.id}>
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-slate-800">{r.name}</b>{r.company && <span className="text-slate-500">· {r.company}</span>}
              <span className={`text-[11px] font-bold uppercase px-1.5 py-0.5 rounded ${r.status === 'new' ? 'bg-violet-100 text-violet-800' : r.status === 'contacted' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{r.status}</span>
              <span className="ml-auto text-xs text-slate-500">{new Date(r.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
            <div className="text-slate-700"><a className="text-violet-700 underline" href={'mailto:' + r.email}>{r.email}</a>{r.phone && <> · <a className="text-violet-700 underline" href={'tel:' + r.phone.replace(/\s+/g, '')}>{r.phone}</a></>} · <span>{interestLabel(r.interest)}</span></div>
            {r.message && <p className="text-slate-600 whitespace-pre-wrap">{r.message}</p>}
            <div className="flex gap-2 pt-1">
              {r.status !== 'contacted' && <button type="button" onClick={() => mark(r, 'contacted')} className="text-xs px-2 py-1 rounded border border-emerald-300 text-emerald-800" data-enquiry-mark="contacted">Mark contacted</button>}
              {r.status !== 'closed' && <button type="button" onClick={() => mark(r, 'closed')} className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600" data-enquiry-mark="closed">Close</button>}
              {r.status === 'closed' && <button type="button" onClick={() => mark(r, 'new')} className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600" data-enquiry-mark="new">Reopen</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
