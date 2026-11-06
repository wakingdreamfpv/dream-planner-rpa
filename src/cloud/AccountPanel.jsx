// Account & Crew (Chunk 1): sign in, set a password after an invite, and — for the CRP — invite and manage crew.
import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { getSupabase } from './client.js';
import { cloudAvailable } from './config.js';
import { PilotInduction, CrpInductions, CrpReview, StatusPill } from './Induction.jsx';
import { useCloudJobs } from './cloudJobs.js';
import CrewProfile from './CrewProfile.jsx';

const ROLE_LABEL = { crp: 'CRP', pilot: 'Pilot', observer: 'Observer' };
const ROLE_STYLE = { crp: 'bg-violet-100 text-violet-800', pilot: 'bg-sky-100 text-sky-800', observer: 'bg-emerald-100 text-emerald-800' };
const initials = (n, e) => (String(n || '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || String(e || '?')[0] || '?').toUpperCase();
const btn = 'px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed';
const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300';

// v6.9: the browser couldn't reach the function at all (not deployed, wrong name, or JWT check on)
const fnHelp = (m) => /Failed to send a request|Failed to fetch|NetworkError/i.test(m || '')
  ? "Couldn't reach the invite-user function. In Supabase › Edge Functions, check that a function named exactly invite-user is deployed and that its Enforce JWT verification setting is OFF."
  : m;

function Modal({ title, onClose, children }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => { document.documentElement.classList.add('wd-modal-open'); return () => document.documentElement.classList.remove('wd-modal-open'); }, []);
  return (
    <div className="fixed inset-0 z-[4900] bg-slate-900/60 flex items-stretch sm:items-center justify-center p-0 sm:p-3 print:hidden" data-testid="account-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[calc(100dvh-1.5rem)]">
        <div className="flex items-center gap-3 px-4 sm:px-5 py-2 border-b border-slate-200 shrink-0" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
          <h2 className="font-bold text-slate-800 flex-1">{title}</h2>
          <button type="button" onClick={onClose} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-full px-3 h-10 text-sm font-semibold" aria-label="Close"><i className="fa-solid fa-xmark text-lg"></i><span>Close</span></button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 min-h-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>{children}</div>
      </div>
    </div>
  );
}

function SignIn({ sb, onDone }) {
  // v6.7: password first (phones offer to save it), emailed link and reset as the fallbacks
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('wd_last_email') || ''; } catch (e) { return ''; } });
  const [pw, setPw] = useState(''), [show, setShow] = useState(false), [mode, setMode] = useState('password'), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const em = email.trim();
    try { localStorage.setItem('wd_last_email', em); } catch (x) {}
    try {
      if (mode === 'link') {
        const { error } = await sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        setMsg({ ok: true, t: `Check ${em} for a sign-in link. On a phone, open it in the same browser you're using now (if your mail app opens its own browser, choose "Open in Safari/Chrome").` });
      } else if (mode === 'password') {
        const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
        if (error) throw error;
        try { sessionStorage.setItem('wd_just_signed_in', '1'); } catch (x) {}
        onDone && onDone();
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        setMsg({ ok: true, t: `If ${em} has a login, a password reset link is on its way.` });
      }
    } catch (err) {
      const m = err.message || String(err);
      setMsg({ ok: false, t: /signups not allowed|not found|user not found/i.test(m) ? `There's no login for ${em} yet. Logins are invite-only: the CRP invites this email (Database & Settings › Crew & users), then you accept the email.`
        : /Invalid login/i.test(m) ? 'Wrong email or password. If you never set a password, use "Email me a sign-in link" below.'
        : /rate limit|too many/i.test(m) ? 'Too many emails sent just now. Wait a minute and try again.'
        : /not confirmed/i.test(m) ? 'This login hasn\'t been accepted yet. Open the invitation email and click Accept invitation first.'
        : m });
    } finally { setBusy(false); }
  };
  const big = 'w-full px-3.5 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-violet-300';
  const swap = (m) => { setMode(m); setMsg(null); };
  return (
    <form onSubmit={go} className="space-y-3 max-w-sm mx-auto" data-testid="signin-form" method="post" action="#">
      <p className="text-sm text-slate-600">{mode === 'password' ? 'Sign in with your email and password.' : mode === 'link' ? 'We\'ll email you a link that signs you in, no password needed.' : 'We\'ll email you a link to choose a new password.'}</p>
      <label className="block">
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Email</span>
        <input type="email" name="email" required autoComplete="username" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={big} data-testid="signin-email" />
      </label>
      {mode === 'password' && (
        <label className="block">
          <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Password</span>
          <div className="relative">
            <input type={show ? 'text' : 'password'} name="password" required autoComplete="current-password" placeholder="Password"
              value={pw} onChange={e => setPw(e.target.value)} className={big + ' pr-16'} data-testid="signin-password" />
            <button type="button" onClick={() => setShow(v => !v)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-violet-700 px-2.5 py-2">{show ? 'Hide' : 'Show'}</button>
          </div>
        </label>
      )}
      <button type="submit" disabled={busy} className="w-full py-3 rounded-xl text-base font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50" data-testid="signin-submit">{busy ? 'Please wait…' : mode === 'link' ? 'Email me a sign-in link' : mode === 'password' ? 'Sign in' : 'Send reset link'}</button>
      {msg && <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} data-testid="signin-msg">{msg.t}</div>}
      <div className="flex flex-col items-center gap-1 pt-1 text-sm">
        {mode !== 'password' && <button type="button" onClick={() => swap('password')} className="text-violet-700 font-semibold py-1.5" data-signin-mode="password">Sign in with a password</button>}
        {mode !== 'link' && <button type="button" onClick={() => swap('link')} className="text-violet-700 font-semibold py-1.5" data-signin-mode="link">Email me a sign-in link instead</button>}
        {mode !== 'reset' && <button type="button" onClick={() => swap('reset')} className="text-slate-500 py-1.5" data-signin-mode="reset">Forgot password?</button>}
      </div>
      <p className="text-[11px] text-slate-400 text-center">Logins are by invitation from the Chief Remote Pilot. You stay signed in on this device until you sign out.</p>
    </form>
  );
}

// v7.28: set or change your password any time while signed in (crew and CRP)
function PasswordBox({ sb }) {
  const [open, setOpen] = useState(false), [saved, setSaved] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5" data-testid="pw-box">
      {open ? <SetPassword sb={sb} why="change" onDone={(ok) => { setOpen(false); setSaved(!!ok); }} />
        : <div className="flex flex-wrap items-center gap-2">
            <i className="fa-solid fa-key text-slate-400"></i>
            <span className="flex-1 text-sm text-slate-600">{saved ? <span className="text-emerald-700 font-semibold" data-testid="pw-saved">Password saved. Use it next time you sign in.</span> : 'Password'}</span>
            <button type="button" onClick={() => { setOpen(true); setSaved(false); }} className={btn + ' border border-slate-300 text-slate-700'} data-testid="pw-change">Set or change password</button>
          </div>}
    </div>
  );
}

function SetPassword({ sb, onDone, why }) {
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const go = async (e) => {
    e.preventDefault(); setErr('');
    if (pw.length < 10) { setErr('Use at least 10 characters.'); return; }
    if (pw !== pw2) { setErr('The passwords don\'t match.'); return; }
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setErr(/should be different/i.test(error.message) ? 'That is already your password.' : error.message); else onDone(true);
  };
  return (
    <form onSubmit={go} className="space-y-3" data-testid="setpw-form">
      <p className="text-sm text-slate-600">{why === 'recovery' || why === 'change' ? 'Choose a new password.' : 'Welcome! Choose a password so you can sign in any time (or skip and use an emailed link).'}</p>
      <input type="password" autoComplete="new-password" placeholder="New password (10+ characters)" value={pw} onChange={e => setPw(e.target.value)} className={input} />
      <input type="password" autoComplete="new-password" placeholder="Repeat password" value={pw2} onChange={e => setPw2(e.target.value)} className={input} />
      {err && <div className="text-sm text-red-700">{err}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btn + ' bg-violet-600 text-white hover:bg-violet-700'}>{busy ? 'Saving…' : 'Save password'}</button>
        {why !== 'recovery' && <button type="button" onClick={() => onDone(false)} className={btn + ' border border-slate-300 text-slate-600'}>{why === 'change' ? 'Cancel' : 'Skip'}</button>}
      </div>
    </form>
  );
}

function CrewAdmin({ sb, me, defaultOpen = true }) {
  const [show, setShow] = useState(defaultOpen);
  const [people, setPeople] = useState([]), [invites, setInvites] = useState([]), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'pilot' });
  const [ind, setInd] = useState({}), [review, setReview] = useState(null), [profileOf, setProfileOf] = useState(null);
  const load = useCallback(async () => {
    const [p, i] = await Promise.all([
      sb.from('profiles').select('id,email,full_name,role,active,created_at').order('full_name'),
      sb.from('invites').select('email,full_name,role,invited_at,accepted_user_id').order('invited_at', { ascending: false }),
    ]);
    if (p.error || i.error) setErr((p.error || i.error).message); else { setErr(''); setPeople(p.data || []); setInvites(i.data || []); }
    // v7.2.7: each person's latest induction, shown on their row (linked by login id, else email)
    try {
      const { data: recs } = await sb.from('signoff_records').select('id,status,created_at,person_signed_at,crp_signed_at,people:person_id (user_id,email)').eq('type', 'pilot_induction').order('created_at', { ascending: false });
      const m = {}; (recs || []).forEach(r => { const pe = r && r.people; if (!pe) return; const k = pe.user_id || String(pe.email || '').toLowerCase(); if (k && !m[k]) m[k] = r; }); setInd(m);
    } catch (e) {}
  }, [sb]);
  useEffect(() => { load(); }, [load]);
  // v6.2: the planner's Crew & users lists invite through the shared bridge; follow its updates here
  useEffect(() => { const h = () => { const c = window.wdCloud; if (c) { setPeople(c.people); setInvites(c.invites); } }; window.addEventListener('wd-cloud', h); return () => window.removeEventListener('wd-cloud', h); }, []);
  const invite = async (e) => {
    e.preventDefault(); setBusy(true); setNote(null);
    const { data, error } = await sb.functions.invoke('invite-user', { body: { ...form, email: form.email.trim().toLowerCase(), company: window.wdCompany || '', redirectTo: location.origin + location.pathname } });
    setBusy(false);
    const msg = error ? ((data && data.error) || error.message) : (data && (data.error || data.message));
    if (error || (data && data.error)) setNote({ ok: false, t: fnHelp(msg) || 'Invite failed' });
    else { setNote({ ok: true, t: msg || 'Invite sent' }); setForm({ full_name: '', email: '', role: form.role }); load(); window.wdCloud && window.wdCloud.refresh(); }
  };
  const update = async (id, patch) => {
    const { error } = await sb.from('profiles').update(patch).eq('id', id);
    if (error) setNote({ ok: false, t: error.message }); else { load(); window.wdCloud && window.wdCloud.refresh(); }
  };
  const pending = invites.filter(i => !i.accepted_user_id);
  // v7.22: the CRP can send anyone a password reset or a one-tap sign-in link (Supabase sends it; nobody sees the password)
  const sendReset = async (p, kind) => {
    const who = p.full_name || p.email, back = location.origin + location.pathname;
    if (!confirm(kind === 'reset' ? `Email ${who} a link to choose a new password?\n\nTheir current password keeps working until they change it.` : `Email ${who} a one-tap sign-in link?\n\nUseful if their invite link expired or they're locked out. It signs them in without a password.`)) return;
    const { error } = kind === 'reset' ? await sb.auth.resetPasswordForEmail(p.email, { redirectTo: back })
      : await sb.auth.signInWithOtp({ email: p.email, options: { shouldCreateUser: false, emailRedirectTo: back } });
    setNote(error ? { ok: false, t: (/rate|seconds/i.test(error.message) ? 'Too many emails just now; wait a minute and try again. ' : 'Not sent: ') + error.message }
      : { ok: true, t: (kind === 'reset' ? 'Password reset email sent to ' : 'Sign-in link sent to ') + p.email + '. It works once and expires after an hour.' });
    try { document.querySelector('[data-testid=invite-msg]') && document.querySelector('[data-testid=invite-msg]').scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ok */ }
  };
  if (!show) return (
    <button type="button" data-testid="crew-admin-toggle" onClick={() => setShow(true)} className="w-full flex items-center gap-3 border border-slate-200 hover:bg-slate-50 rounded-xl px-4 py-3 text-left">
      <i className="fa-solid fa-users text-violet-600"></i>
      <span className="flex-1"><span className="block font-semibold text-slate-800 text-sm">Crew logins &amp; invites</span><span className="block text-xs text-slate-500">{people.length} with logins{pending.length ? ` · ${pending.length} invited` : ''}. Invite pilots and observers, change roles.</span></span>
      <i className="fa-solid fa-chevron-right text-slate-400"></i>
    </button>
  );
  return (
    <div className="space-y-5" data-testid="crew-admin">
      <form onSubmit={invite} className="border border-violet-200 bg-violet-50/50 rounded-xl p-4 space-y-2">
        <div className="font-semibold text-violet-900 text-sm"><i className="fa-solid fa-user-plus mr-1.5"></i>Invite crew</div>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input required placeholder="Full name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className={input + ' sm:col-span-2'} data-testid="invite-name" />
          <input required type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={input + ' sm:col-span-2'} data-testid="invite-email" />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={input} data-testid="invite-role">
            <option value="pilot">Pilot</option><option value="observer">Observer</option><option value="crp">CRP (admin)</option>
          </select>
          <button type="submit" disabled={busy} className={btn + ' bg-violet-600 text-white hover:bg-violet-700'} data-testid="invite-send">{busy ? 'Sending…' : 'Send invite'}</button>
        </div>
        <p className="text-[11px] text-slate-500">They get an email to set up their login. Their role comes from this invite — they can't change it themselves.</p>
        {note && <div className={`text-sm rounded-lg px-3 py-2 ${note.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} data-testid="invite-msg">{note.t}</div>}
      </form>
      {err && <div className="text-sm text-red-700">Couldn't load crew: {err}</div>}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Crew with logins ({people.length}) · role, induction and access</div>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {people.map(p => (
            <div key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm ${p.active ? '' : 'bg-slate-50 opacity-70'}`} data-crew-row={p.email}>
              <span className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">{initials(p.full_name, p.email)}</span>
              <div className="flex-1 min-w-0"><div className="font-semibold text-slate-800 truncate"><button type="button" data-crew-profile={p.email} onClick={() => setProfileOf(p)} className="hover:text-violet-700 hover:underline text-left" title="Open their profile: details, induction, hours, jobs and access">{p.full_name || '—'}</button>{p.id === me.id && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}</div><div className="text-xs text-slate-500 truncate">{p.email}</div></div>
              <select value={p.role} disabled={p.id === me.id} onChange={e => update(p.id, { role: e.target.value })} className="text-xs border border-slate-300 rounded px-1.5 py-1" title="Role">
                <option value="pilot">Pilot</option><option value="observer">Observer</option><option value="crp">CRP</option>
              </select>
              {(() => { const r = ind[p.id] || ind[String(p.email || '').toLowerCase()]; const fmt = (d) => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                if (p.role === 'observer') return null;
                if (!r) return p.role === 'pilot' ? <span data-ind-of={p.email} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Induction not started</span> : null;
                return <span className="flex items-center gap-1.5" data-ind-of={p.email}><StatusPill s={r.status} />{r.status === 'certified' && r.crp_signed_at && <span className="text-[11px] text-slate-500 hidden sm:inline">{fmt(r.crp_signed_at)}</span>}
                  {r.status !== 'draft' && <button type="button" data-crew-review={p.email} onClick={() => setReview(r.id)} className={`text-xs px-2 py-1 rounded font-semibold ${r.status === 'awaiting_crp' ? 'bg-violet-600 text-white' : 'border border-slate-300 text-slate-700'}`}>{r.status === 'awaiting_crp' ? 'Review' : 'View'}</button>}</span>; })()}
              {p.id !== me.id && p.active && <span className="flex gap-1.5">
                <button type="button" data-crew-reset={p.email} onClick={() => sendReset(p, 'reset')} title="Email them a link to choose a new password" className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"><i className="fa-solid fa-key mr-1"></i>Reset password</button>
                <button type="button" data-crew-link={p.email} onClick={() => sendReset(p, 'link')} title="Email them a one-tap sign-in link" className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"><i className="fa-solid fa-envelope mr-1"></i>Sign-in link</button>
              </span>}
              {p.id !== me.id && <button type="button" onClick={() => { if (p.active ? confirm(`Deactivate ${p.full_name || p.email}? They can't sign in to see crew records until reactivated. Their records are kept.`) : true) update(p.id, { active: !p.active }); }} className={`text-xs px-2 py-1 rounded border ${p.active ? 'border-slate-300 text-slate-600' : 'border-emerald-300 text-emerald-700'}`}>{p.active ? 'Deactivate' : 'Activate'}</button>}
            </div>
          ))}
        </div>
      </div>
      {profileOf && !review && <CrewProfile sb={sb} profile={profileOf} onClose={() => setProfileOf(null)} onReview={(id) => setReview(id)} />}
      {review && <CrpReview sb={sb} me={me} id={review} onClose={() => { setReview(null); load(); }} />}
      {pending.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Invited, not signed in yet ({pending.length})</div>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {pending.map(i => (
              <div key={i.email} className="flex items-center gap-3 px-3 py-2 text-sm" data-invite-row={i.email}>
                <div className="flex-1 min-w-0"><div className="font-semibold text-slate-700 truncate">{i.full_name}</div><div className="text-xs text-slate-500">{i.email} · invited {new Date(i.invited_at).toLocaleDateString('en-AU')}</div></div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ROLE_STYLE[i.role]}`}>{ROLE_LABEL[i.role]}</span>
                <button type="button" onClick={() => setForm({ full_name: i.full_name, email: i.email, role: i.role })} className="text-xs text-violet-700 underline">Resend</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MyProfile({ sb, me, onSaved }) {
  const [name, setName] = useState(me.full_name || ''), [msg, setMsg] = useState('');
  const save = async () => { const { error } = await sb.from('profiles').update({ full_name: name.trim() }).eq('id', me.id); setMsg(error ? error.message : 'Saved'); if (!error) onSaved(); };
  return (
    <div className="space-y-2" data-testid="my-profile">
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Your name</label>
      <div className="flex gap-2"><input value={name} onChange={e => setName(e.target.value)} className={input} /><button type="button" onClick={save} className={btn + ' bg-slate-800 text-white'}>Save</button></div>
      {msg && <div className="text-xs text-slate-500">{msg}</div>}
      <p className="text-xs text-slate-500">Inductions, certifications and sign-offs will appear here as they're added.</p>
    </div>
  );
}

function AccountPanel() {
  const sb = getSupabase();
  const [session, setSession] = useState(null), [me, setMe] = useState(null), [open, setOpen] = useState(false), [needPw, setNeedPw] = useState(null), [loading, setLoading] = useState(true);
  const [slot, setSlot] = useState(null), [slot2, setSlot2] = useState(null);
  useEffect(() => { const find = () => { const s = document.getElementById('wd-account-slot'); if (s) setSlot(s); else setTimeout(find, 300); }; find(); }, []);
  // v6.1: the same panel inline in Database & Settings › Users & logins
  useEffect(() => { let t; const find = () => { const s = document.getElementById('wd-account-settings-slot'); if (s) setSlot2(s); else t = setTimeout(find, 500); }; find(); return () => clearTimeout(t); }, []);
  const loadMe = useCallback(async (s) => {
    if (!s) { setMe(null); return; }
    const { data } = await sb.from('profiles').select('id,email,full_name,role,active').eq('id', s.user.id).maybeSingle();
    setMe(data || { id: s.user.id, email: s.user.email, full_name: '', role: null, active: false });
  }, [sb]);
  useEffect(() => {
    const hash = typeof location !== 'undefined' ? location.hash : '';
    let t = /type=(invite|recovery|signup)/.exec(hash);
    // v7.22: the planner reloads once after a first sign-in (to open the person's own space), which can drop the link's
    // details from the address bar; keep them for this tab so the password step still happens after the reload
    try { if (t) sessionStorage.setItem('wd_pw_intent', t[1]); else { const k = sessionStorage.getItem('wd_pw_intent'); if (k) t = [k, k]; } } catch (e) { /* ok */ }
    // v7.22: a crew member arriving from their invite gets one welcome card (with an optional password) from the planner
    // instead of a separate "Set your password" pop-up; the CRP, and password resets, still get this panel's form
    sb.auth.getSession().then(({ data }) => { setSession(data.session); loadMe(data.session); setLoading(false);
      if (t && data.session) { if (t[1] === 'recovery') { setNeedPw('recovery'); setOpen(true); } else setInvitePw(t[1]); }
      if (t && !data.session) { try { sessionStorage.removeItem('wd_pw_intent'); } catch (e) { /* ok */ } } });
    const { data: sub } = sb.auth.onAuthStateChange((evt, s) => {
      setSession(s); loadMe(s);
      if (evt === 'PASSWORD_RECOVERY') { setNeedPw('recovery'); setOpen(true); }
    });
    return () => sub && sub.subscription && sub.subscription.unsubscribe();
  }, [sb, loadMe]);
  const signOut = async () => { await sb.auth.signOut(); setOpen(false); };
  const [invitePw, setInvitePw] = useState(null);
  useEffect(() => {
    if (!invitePw || !me) return;
    if (!(me.active && me.role && me.role !== 'crp')) { setNeedPw(invitePw); setOpen(true); setInvitePw(null); }
  }, [invitePw, me]);
  useEffect(() => {
    const clear = () => { try { history.replaceState(null, '', location.pathname + location.search); sessionStorage.removeItem('wd_pw_intent'); } catch (e) { /* ok */ } };
    const done = () => { setInvitePw(null); clear(); };
    const own = () => { setNeedPw('invite'); setOpen(true); setInvitePw(null); };
    window.addEventListener('wd-invite-pw-done', done); window.addEventListener('wd-open-setpw', own);
    return () => { window.removeEventListener('wd-invite-pw-done', done); window.removeEventListener('wd-open-setpw', own); };
  }, []);
  useEffect(() => { const h = () => setOpen(false); window.addEventListener('wd-close-account', h); return () => window.removeEventListener('wd-close-account', h); }, []);
  // v7.4 (Chunk 2b): jobs, crew, shared data and access requests in the cloud
  useCloudJobs(sb, me);
  // v7.5.2: the planner needs to know if a pilot has already done their induction (so it stops asking)
  useEffect(() => {
    let dead = false;
    const pub = (v) => { window.wdMyInduction = v; window.dispatchEvent(new Event('wd-my-induction')); };
    if (!(me && me.active && me.role && me.role !== 'crp')) { pub(undefined); return; }
    const load = async () => {
      try {
        const { data: person } = await sb.from('people').select('id').eq('user_id', me.id).maybeSingle();
        if (!person) { if (!dead) pub({ status: null }); return; }
        const { data: recs } = await sb.from('signoff_records').select('status,person_signed_at,crp_signed_at').eq('person_id', person.id).eq('type', 'pilot_induction').order('created_at', { ascending: false }).limit(1);
        if (!dead) pub({ status: (recs && recs[0] && recs[0].status) || null, at: recs && recs[0] && (recs[0].crp_signed_at || recs[0].person_signed_at) });
      } catch (e) { /* offline: leave unknown */ }
    };
    load(); window.addEventListener('wd-induction-changed', load);
    return () => { dead = true; window.removeEventListener('wd-induction-changed', load); };
  }, [sb, me]);
  // v6.8: the planner routes first-time users by sign-in state and role
  useEffect(() => {
    const v = loading ? { state: 'loading' } : !session ? { state: 'out' }
      : { state: 'in', userId: session.user.id, email: session.user.email, name: (me && me.full_name) || '', role: (me && me.active && me.role) || null, ready: !!me,
          meta: session.user.user_metadata || {}, invitePw: !!invitePw };
    window.wdAuth = v; window.dispatchEvent(new Event('wd-auth'));
    if (session) { try { localStorage.removeItem('wd_edition'); } catch (e) {} }
  }, [loading, session, me, invitePw]);
  const [toast, setToast] = useState('');
  // v7.2.4: links from the induction emails open the right screen (#review-induction=<id> for the CRP, #my-induction for the pilot)
  const readDeep = () => { const h = (typeof location !== 'undefined' && location.hash) || ''; const m = /^#review-induction=([A-Za-z0-9_-]{4,})$/.exec(h); return m ? { review: m[1] } : h === '#my-induction' ? { mine: true } : null; };
  const [deep, setDeep] = useState(readDeep);
  useEffect(() => { const h = () => { const d = readDeep(); if (d) setDeep(d); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []); // eslint-disable-line
  const [reviewId, setReviewId] = useState(null);
  useEffect(() => {
    if (!deep || !me || !me.active) return;
    // wait until the planner has opened this person's own data space (it may reload once after sign-in)
    const ns = window.__WD_NS; if (ns !== undefined && (me.role === 'crp' ? ns !== '' : !String(ns).startsWith('crew:'))) return;
    if (deep.review && me.role === 'crp') { setReviewId(null); setTimeout(() => setReviewId(deep.review), 0); }
    setOpen(true);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }, [deep, me]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t); }, [toast]);
  // v6.2: share the CRP's view of logins with the planner (Crew & users shows login status and Invite per person)
  useEffect(() => {
    let dead = false;
    const publish = (v) => { window.wdCloud = v; window.dispatchEvent(new Event('wd-cloud')); };
    if (!(me && me.active && me.role === 'crp')) { publish(null); return; }
    const refresh = async () => {
      const [p, i] = await Promise.all([
        sb.from('profiles').select('id,email,full_name,role,active').order('full_name'),
        sb.from('invites').select('email,full_name,role,invited_at,accepted_user_id').order('invited_at', { ascending: false }),
      ]);
      if (dead || p.error || i.error) return;
      publish({ isCrp: true, people: p.data || [], invites: i.data || [], refresh, invite });
    };
    const invite = async ({ full_name, email, role }) => {
      const { data, error } = await sb.functions.invoke('invite-user', { body: { full_name, email: String(email || '').trim().toLowerCase(), role, company: window.wdCompany || '', redirectTo: location.origin + location.pathname } });
      const msg = error ? ((data && data.error) || error.message) : (data && (data.error || data.message));
      await refresh();
      return (error || (data && data.error)) ? { ok: false, msg: fnHelp(msg) || 'Invite failed' } : { ok: true, msg: msg || 'Invite sent' };
    };
    refresh();
    return () => { dead = true; };
  }, [sb, me]);
  // v6.3 (Chunk 3): inductions waiting for the CRP show as a badge on the account button
  const [awaiting, setAwaiting] = useState(0);
  useEffect(() => { window.wdAwaitingCount = awaiting; window.dispatchEvent(new Event('wd-awaiting')); }, [awaiting]);
  useEffect(() => {
    if (!(me && me.active && me.role === 'crp')) { setAwaiting(0); return; }
    sb.from('signoff_records').select('id').eq('type', 'pilot_induction').eq('status', 'awaiting_crp').then(({ data }) => setAwaiting((data || []).length));
  }, [sb, me]);
  // The CRP's planner publishes the fleet's RPA types so pilots can pick them in their induction
  useEffect(() => {
    if (!(me && me.active && me.role === 'crp')) return;
    let last = '';
    const push = async () => {
      const names = Array.isArray(window.wdFleetTypes) ? [...new Set(window.wdFleetTypes.map(n => String(n).trim()).filter(Boolean))].sort() : null;
      if (!names || !names.length || names.join('|') === last) return;
      last = names.join('|');
      await sb.from('fleet_types').upsert(names.map(name => ({ name, active: true, updated_at: new Date().toISOString() })), { onConflict: 'name' });
      const { data } = await sb.from('fleet_types').select('name').eq('active', true);
      const gone = (data || []).map(x => x.name).filter(n => !names.includes(n));
      for (const name of gone) await sb.from('fleet_types').update({ active: false }).eq('name', name);
    };
    const safe = () => { push().catch(() => {}); };
    safe(); window.addEventListener('wd-fleet', safe);
    return () => window.removeEventListener('wd-fleet', safe);
  }, [sb, me]);
  const chip = (
    <button type="button" onClick={() => setOpen(true)} data-testid="account-chip"
      className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
      {session ? <><span className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center text-[10px] font-bold">{initials(me && me.full_name, session.user.email)}</span><span className="hidden sm:inline max-w-[9rem] truncate">{(me && me.full_name) || session.user.email}</span>{me && me.role && <span className="text-[10px] font-bold uppercase opacity-80">{ROLE_LABEL[me.role]}</span>}{awaiting > 0 && <span data-testid="awaiting-badge" title="Inductions waiting for you" className="ml-0.5 text-[10px] font-bold bg-amber-400 text-amber-950 rounded-full px-1.5">{awaiting}</span>}</>
        : <><i className="fa-solid fa-user"></i>{loading ? '…' : 'Sign in'}</>}
    </button>
  );
  const [justIn, setJustIn] = useState(false);
  useEffect(() => { if (!session) return; try { if (sessionStorage.getItem('wd_just_signed_in')) { sessionStorage.removeItem('wd_just_signed_in'); setJustIn(true); setToast('You\'re signed in as ' + session.user.email + '. You\'ll stay signed in on this device until you sign out.'); } } catch (e) {} }, [session]);
  // v6.7: the welcome screen (and anything else) can open the sign-in panel
  useEffect(() => { const h = () => setOpen(true); window.addEventListener('wd-open-account', h); return () => window.removeEventListener('wd-open-account', h); }, []);
  const accountView = (inlineCtx) => session && (
              <div className="space-y-5">
                {justIn && <div className="text-sm bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg px-3 py-2 flex items-start gap-2" data-testid="signed-in-note"><i className="fa-solid fa-circle-check mt-0.5"></i><span><b>You're signed in.</b> You'll stay signed in on this device until you tap Sign out.</span></div>}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-11 h-11 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold">{initials(me && me.full_name, session.user.email)}</span>
                  <div className="flex-1 min-w-0"><div className="font-semibold text-slate-800">{(me && me.full_name) || session.user.email}</div><div className="text-xs text-slate-500">{session.user.email}</div></div>
                  {me && me.role && <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_STYLE[me.role]}`} data-testid="my-role">{ROLE_LABEL[me.role]}</span>}
                  <button type="button" onClick={signOut} className={btn + ' border border-slate-300 text-slate-600'} data-testid="signout">Sign out</button>
                </div>
                {me && !me.active && <div className="text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-lg px-3 py-2" data-testid="inactive-note">Your login isn't active. Ask the CRP to invite or activate you.</div>}
                {me && me.active && me.role === 'crp' && <CrpInductions sb={sb} me={me} onCount={setAwaiting} autoOpenId={inlineCtx ? null : reviewId} />}
                {me && me.active && me.role === 'crp' && <CrewAdmin sb={sb} me={me} defaultOpen={!!inlineCtx} />}
                {me && me.active && me.role === 'pilot' && <PilotInduction sb={sb} me={me} />}
                {me && me.active && me.role !== 'crp' && <MyProfile sb={sb} me={me} onSaved={() => loadMe(session)} />}
                {me && me.active && <PasswordBox sb={sb} />}
                <p className="text-[11px] text-slate-400"><i className="fa-solid fa-circle-info mr-1"></i>{me && me.role === 'crp' ? 'Your jobs and your company setup are saved to your account, so they follow you to any device you sign in on.' : 'Your jobs come from your CRP and follow you to any device you sign in on.'}</p>
              </div>
  );
  const inline = slot2 && createPortal(
    <div data-testid="account-inline">
      {loading ? <p className="text-sm text-slate-500">Checking your login…</p>
        : !session ? <SignIn sb={sb} onDone={() => {}} />
        : accountView(true)}
    </div>, slot2);
  const floating = !slot && (
    <div className="fixed bottom-3 left-3 z-[1500] print:hidden" style={{ background: '#2d0a5e', borderRadius: 10 }}>{chip}</div>
  );
  return (
    <>
      {slot ? createPortal(chip, slot) : floating}
      {toast && <div data-testid="signin-toast" className="fixed top-3 left-1/2 -translate-x-1/2 z-[5100] w-[min(460px,calc(100vw-24px))] bg-emerald-600 text-white text-sm font-medium rounded-xl shadow-2xl px-4 py-3 flex items-start gap-2 print:hidden" style={{ marginTop: 'env(safe-area-inset-top)' }}><i className="fa-solid fa-circle-check mt-0.5"></i><span className="flex-1">{toast}</span><button type="button" onClick={() => setToast('')} aria-label="Dismiss" className="opacity-80 px-1"><i className="fa-solid fa-xmark"></i></button></div>}
      {inline}
      {open && (
        <Modal title={needPw ? 'Set your password' : session ? 'Account & crew' : 'Sign in'} onClose={() => setOpen(false)}>
          {needPw && session ? <SetPassword sb={sb} why={needPw} onDone={() => { setNeedPw(null); history.replaceState(null, '', location.pathname + location.search); try { sessionStorage.removeItem('wd_pw_intent'); } catch (e) { /* ok */ } }} />
            : !session ? <SignIn sb={sb} onDone={() => setOpen(false)} />
            : accountView(false)
}
        </Modal>
      )}
    </>
  );
}

export function mountAccountPanel() {
  if (!cloudAvailable()) return;
  const host = document.createElement('div'); host.id = 'wd-cloud'; document.body.appendChild(host);
  createRoot(host).render(<AccountPanel />);
}
