// v7.31: the free beta. Anyone using the free planner can sign up (name, email, company: no payment details) and get
// the full planner on their own device until the paid launch on 10 January 2027. Their data lives only on that device
// (its own space, 'beta'), nothing is shared and there's no account. Their details go to the CRP's Enquiries list.
// When the beta ends they go back to the free planner, and can always download everything they made as a backup file.
import React, { useState } from 'react';
import { getSupabase } from '../cloud/client.js';
import { alertMike } from './Enquiries.jsx';

const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} };

// The beta runs until the start of 10 January 2027 (local time). 'wd_beta_end_test' is for the browser tests only.
export const WD_BETA_END = (() => { const t = lsGet('wd_beta_end_test'); return t ? new Date(t) : new Date(2027, 0, 10); })();
export const BETA_END_TEXT = '10 January 2027';
export const BETA_LAST_DAY_TEXT = '9 January 2027';
export const betaJoined = () => lsGet('wd_edition') === 'beta';
export const betaActiveNow = () => betaJoined() && Date.now() < WD_BETA_END.getTime();
export const betaEnded = () => betaJoined() && Date.now() >= WD_BETA_END.getTime();
export const betaDaysLeft = () => Math.max(0, Math.ceil((WD_BETA_END.getTime() - Date.now()) / 86400000));
export const betaInfo = () => { try { return JSON.parse(lsGet('wd_beta') || 'null'); } catch (e) { return null; } };

// ── on-device storage (same layout as the planner's own: database 'wakingdream_planner__<space>', store 'kv') ──
const idbOpen = (name) => new Promise((res, rej) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbAll = async (name) => { const d = await idbOpen(name); return new Promise((res) => { const out = {}; const t = d.transaction('kv'); const c = t.objectStore('kv').openCursor();
  c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); }; c.onerror = () => res(out); }); };
const idbPutAll = async (name, obj) => { const d = await idbOpen(name); return new Promise((res) => { const t = d.transaction('kv', 'readwrite'); const st = t.objectStore('kv');
  Object.keys(obj).forEach((k) => st.put(obj[k], k)); t.oncomplete = () => res(true); t.onerror = () => res(false); }); };

// Send the beta sign-up to the CRP's Enquiries list. Never blocks the beta: if there's no signal it's retried later.
export const sendBetaSignup = async (info) => {
  const sb = getSupabase(); if (!sb || !info) return false;
  try {
    const call = sb.rpc('submit_enquiry', { p_name: info.name, p_email: info.email, p_company: info.company || '', p_phone: '', p_interest: info.interest || 'updates',
      p_message: 'Joined the free beta (until ' + BETA_LAST_DAY_TEXT + ')', p_source: 'beta-signup', p_consent: true });
    const r = await Promise.race([call, new Promise((res) => setTimeout(() => res({ error: { message: 'timeout' } }), 8000))]);
    if (r && r.error && !/too many/i.test(String(r.error.message))) return false;
    if (r && !r.error) alertMike(sb, r.data);
    lsSet('wd_beta', JSON.stringify({ ...info, sent: true })); return true;
  } catch (e) { return false; }
};

// Start the beta: remember who they are, bring the free planner's job across, then reload into the beta space.
export const startBeta = async (info, setupNow = true) => {
  const rec = { name: info.name.trim(), email: info.email.trim().toLowerCase(), company: (info.company || '').trim(), interest: info.interest || 'updates', joined: new Date().toISOString(), sent: false };
  lsSet('wd_beta', JSON.stringify(rec));
  await sendBetaSignup(rec);
  try {
    const beta = await idbAll('wakingdream_planner__beta');
    if (!beta.rpas_database) { const free = await idbAll('wakingdream_planner__free'); if (Object.keys(free).length) await idbPutAll('wakingdream_planner__beta', free); }
  } catch (e) { /* the beta still starts, just without the free job */ }
  lsSet('wd_edition', 'beta');
  try { sessionStorage.setItem('wd_beta_new', setupNow ? '1' : 'later'); } catch (e) {} // v7.33: set up now (opens company setup) or later
  location.reload();
};

// Everything made in the beta, as a backup file (the same format as Database & Settings › Back up)
export const downloadBetaRecords = async () => {
  let raw = null; try { raw = (await idbAll('wakingdream_planner__beta')).rpas_database || null; } catch (e) {}
  if (!raw) { alert('No beta records were found on this device.'); return false; }
  let db = {}; try { db = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
  const out = { ...db, _backup: { appVersion: 'beta', exportedAt: new Date().toISOString(), note: 'Free beta records (until ' + BETA_LAST_DAY_TEXT + ')' } };
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'Dream_Planner_Beta_Records_' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000); return true;
};

const Shell = ({ title, kicker, onClose, children, testid }) => (
  <div className="fixed inset-0 z-[4900] bg-slate-900/60 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto print:hidden" data-testid={testid} onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-2 sm:my-6">
      <div className="px-5 py-4 text-white relative" style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 60%,#4c1d95 100%)' }}>
        {onClose && <button type="button" onClick={onClose} data-beta-close="1" aria-label="Close" className="absolute z-10 top-2 right-2 w-11 h-11 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 text-xl"><i className="fa-solid fa-xmark"></i></button>}
        <div className="text-xs uppercase tracking-widest opacity-75 pr-10">{kicker}</div>
        <h2 className="text-xl font-bold mt-1 pr-8">{title}</h2>
      </div>
      {children}
    </div>
  </div>
);

// ── Join the beta ─────────────────────────────────────────────────────────
export function BetaDialog({ open, onClose }) {
  const [f, setF] = useState({ name: '', email: '', company: '', consent: false }), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  if (!open) return null;
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setErr(''); };
  const go = async () => {
    if (!f.name.trim()) { setErr('Please add your name.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) { setErr('Please check your email address.'); return; }
    if (!f.consent) { setErr('Please tick the box to join the beta.'); return; }
    setReady(true);
  };
  const begin = async (now) => { setBusy(now ? 'now' : 'later'); await startBeta(f, now); };
  const inp = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base';
  return (
    <Shell testid="beta-join" kicker={'Free beta · until ' + BETA_LAST_DAY_TEXT} title="Try the full planner, free" onClose={busy ? null : onClose}>
      {ready ? <div className="p-4 sm:p-5 space-y-3 text-sm text-slate-700" data-beta-choice="1">
        <p className="text-base text-slate-800"><b>Thanks, {f.name.trim().split(/\s+/)[0]}. You're in.</b></p>
        <p>Would you like to set up your company now? It takes about 2 minutes: your company and ReOC details, you as the CRP, your fleet and batteries. These fill in every plan and PDF for you.</p>
        <button type="button" disabled={!!busy} onClick={() => begin(true)} className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-base font-bold disabled:opacity-50" data-beta-setup-now="1"><i className="fa-solid fa-building mr-1.5"></i>{busy === 'now' ? 'Starting your beta…' : 'Set up now'}</button>
        <button type="button" disabled={!!busy} onClick={() => begin(false)} className="w-full py-3 rounded-xl border-2 border-violet-300 text-violet-800 text-base font-bold disabled:opacity-50" data-beta-setup-later="1">{busy === 'later' ? 'Starting your beta…' : 'Set up later'}</button>
        <p className="text-xs text-slate-500">Later: you can start planning straight away. Set up any time from <b>Database &amp; Settings</b>.</p>
        {!busy && <button type="button" onClick={() => setReady(false)} className="text-xs underline text-slate-500" data-beta-back="1">Back</button>}
      </div> :
      <div className="p-4 sm:p-5 space-y-3 text-sm text-slate-700" data-beta-form="1">
        <ul className="space-y-2">
          <li className="flex gap-2"><i className="fa-solid fa-check text-emerald-600 mt-1"></i><span><b>Everything</b>: your company profile, fleet and batteries, saved jobs and drafts, flight records, templates and the compliance calendar.</span></li>
          <li className="flex gap-2"><i className="fa-solid fa-check text-emerald-600 mt-1"></i><span><b>Totally free until {BETA_LAST_DAY_TEXT}.</b> No payment details. Paid plans start on {BETA_END_TEXT}.</span></li>
          <li className="flex gap-2"><i className="fa-solid fa-mobile-screen text-violet-600 mt-1"></i><span>Your work is <b>saved on this device</b> (no account yet). Add the planner to your Home Screen and use <b>Back up</b> now and then.</span></li>
          <li className="flex gap-2"><i className="fa-solid fa-circle-info text-slate-400 mt-1"></i><span>When the beta ends you go back to the free planner, and you can download everything you made. Your job from the free planner comes with you.</span></li>
        </ul>
        <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">Your name *</span><input className={inp} autoComplete="name" value={f.name} onChange={set('name')} data-beta="name" /></label>
        <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">Email *</span><input className={inp} type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} data-beta="email" /></label>
        <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">Company</span><input className={inp} autoComplete="organization" value={f.company} onChange={set('company')} data-beta="company" /></label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.consent} onChange={set('consent')} data-beta="consent" /><span>Sign me up for the free beta. It's OK to email me about the beta and the paid launch. We never share your details.</span></label>
        {err && <p className="text-sm text-red-700" data-beta-err="1">{err}</p>}
        <button type="button" onClick={go} className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-base font-bold" data-beta-start="1">Start my free beta</button>
      </div>}
    </Shell>
  );
}

// ── The beta has ended ─────────────────────────────────────────────────────
export function BetaEndedDialog({ open, onClose, onEnquire }) {
  if (!open) return null;
  return (
    <Shell testid="beta-ended" kicker="Dream Flight RPA Planner" title="Thanks for testing the beta" onClose={onClose}>
      <div className="p-4 sm:p-5 space-y-3 text-sm text-slate-700">
        <p>The free beta ended on {BETA_END_TEXT}, when paid plans started. You're back on the free planner (one job at a time).</p>
        <p><b>Your beta records are still on this device.</b> Download them to keep, or to bring into a paid account.</p>
        <button type="button" onClick={downloadBetaRecords} className="w-full py-3 rounded-xl bg-slate-800 text-white font-bold" data-beta-download="1"><i className="fa-solid fa-download mr-1.5"></i>Download my beta records</button>
        <button type="button" onClick={onEnquire} className="w-full py-3 rounded-xl bg-amber-400 text-amber-950 font-bold" data-beta-ended-enquiry="1"><i className="fa-solid fa-building mr-1.5"></i>Get it for your company</button>
        <button type="button" onClick={onClose} className="w-full py-2.5 rounded-xl border border-slate-300 font-semibold" data-beta-ended-free="1">Continue with the free planner</button>
      </div>
    </Shell>
  );
}
