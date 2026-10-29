// Account & Crew (Chunk 1): sign in, set a password after an invite, and — for the CRP — invite and manage crew.
import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { getSupabase } from './client.js';
import { cloudAvailable } from './config.js';

const ROLE_LABEL = { crp: 'CRP', pilot: 'Pilot', observer: 'Observer' };
const ROLE_STYLE = { crp: 'bg-violet-100 text-violet-800', pilot: 'bg-sky-100 text-sky-800', observer: 'bg-emerald-100 text-emerald-800' };
const initials = (n, e) => (String(n || '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || String(e || '?')[0] || '?').toUpperCase();
const btn = 'px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed';
const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300';

function Modal({ title, onClose, children }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[4900] bg-slate-900/60 flex items-start sm:items-center justify-center p-3 overflow-y-auto print:hidden" data-testid="account-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-slate-800 flex-1">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl px-1" aria-label="Close"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function SignIn({ sb, onDone }) {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [mode, setMode] = useState('link'), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (mode === 'link') {
        const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        setMsg({ ok: true, t: `Check ${email.trim()} for a sign-in link. Open it on this device.` });
      } else if (mode === 'password') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw error;
        onDone && onDone();
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        setMsg({ ok: true, t: `If ${email.trim()} has a login, a password reset link is on its way.` });
      }
    } catch (err) {
      const m = err.message || String(err);
      setMsg({ ok: false, t: /signups not allowed|not found|user not found/i.test(m) ? `There's no login for ${email.trim()} yet. Logins are invite-only: the CRP invites this email (Users & logins › Invite crew, or Supabase › Authentication › Users › Send invitation), then you accept the email.`
        : /Invalid login/i.test(m) ? 'Wrong email or password. Try "Email me a link" or "Forgot password".'
        : /rate limit|too many/i.test(m) ? 'Too many emails sent just now. Wait a minute and try again.'
        : /not confirmed/i.test(m) ? 'This login hasn\'t been accepted yet. Open the invitation email and click Accept invitation first.'
        : m });
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={go} className="space-y-3" data-testid="signin-form">
      <p className="text-sm text-slate-600">Sign in to see your crew record and sign-offs. Logins are by invitation from the CRP.</p>
      <div className="flex gap-1 text-xs">
        {[['link', 'Email me a link'], ['password', 'Password'], ['reset', 'Forgot password']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setMode(k); setMsg(null); }} className={`px-2.5 py-1 rounded-full border ${mode === k ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-300 text-slate-600'}`}>{l}</button>
        ))}
      </div>
      <input type="email" required autoComplete="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className={input} data-testid="signin-email" />
      {mode === 'password' && <input type="password" required autoComplete="current-password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} className={input} />}
      <button type="submit" disabled={busy} className={btn + ' w-full bg-violet-600 text-white hover:bg-violet-700'} data-testid="signin-submit">{busy ? 'Please wait…' : mode === 'link' ? 'Send sign-in link' : mode === 'password' ? 'Sign in' : 'Send reset link'}</button>
      {msg && <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} data-testid="signin-msg">{msg.t}</div>}
    </form>
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
    if (error) setErr(error.message); else onDone();
  };
  return (
    <form onSubmit={go} className="space-y-3" data-testid="setpw-form">
      <p className="text-sm text-slate-600">{why === 'recovery' ? 'Choose a new password.' : 'Welcome! Choose a password so you can sign in any time (or skip and use an emailed link).'}</p>
      <input type="password" autoComplete="new-password" placeholder="New password (10+ characters)" value={pw} onChange={e => setPw(e.target.value)} className={input} />
      <input type="password" autoComplete="new-password" placeholder="Repeat password" value={pw2} onChange={e => setPw2(e.target.value)} className={input} />
      {err && <div className="text-sm text-red-700">{err}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btn + ' bg-violet-600 text-white hover:bg-violet-700'}>{busy ? 'Saving…' : 'Save password'}</button>
        {why !== 'recovery' && <button type="button" onClick={onDone} className={btn + ' border border-slate-300 text-slate-600'}>Skip</button>}
      </div>
    </form>
  );
}

function CrewAdmin({ sb, me }) {
  const [people, setPeople] = useState([]), [invites, setInvites] = useState([]), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'pilot' });
  const load = useCallback(async () => {
    const [p, i] = await Promise.all([
      sb.from('profiles').select('id,email,full_name,role,active,created_at').order('full_name'),
      sb.from('invites').select('email,full_name,role,invited_at,accepted_user_id').order('invited_at', { ascending: false }),
    ]);
    if (p.error || i.error) setErr((p.error || i.error).message); else { setErr(''); setPeople(p.data || []); setInvites(i.data || []); }
  }, [sb]);
  useEffect(() => { load(); }, [load]);
  const invite = async (e) => {
    e.preventDefault(); setBusy(true); setNote(null);
    const { data, error } = await sb.functions.invoke('invite-user', { body: { ...form, email: form.email.trim().toLowerCase(), redirectTo: location.origin + location.pathname } });
    setBusy(false);
    const msg = error ? ((data && data.error) || error.message) : (data && (data.error || data.message));
    if (error || (data && data.error)) setNote({ ok: false, t: msg || 'Invite failed' });
    else { setNote({ ok: true, t: msg || 'Invite sent' }); setForm({ full_name: '', email: '', role: form.role }); load(); }
  };
  const update = async (id, patch) => {
    const { error } = await sb.from('profiles').update(patch).eq('id', id);
    if (error) setNote({ ok: false, t: error.message }); else load();
  };
  const pending = invites.filter(i => !i.accepted_user_id);
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
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Crew with logins ({people.length})</div>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {people.map(p => (
            <div key={p.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${p.active ? '' : 'bg-slate-50 opacity-70'}`} data-crew-row={p.email}>
              <span className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">{initials(p.full_name, p.email)}</span>
              <div className="flex-1 min-w-0"><div className="font-semibold text-slate-800 truncate">{p.full_name || '—'}{p.id === me.id && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}</div><div className="text-xs text-slate-500 truncate">{p.email}</div></div>
              <select value={p.role} disabled={p.id === me.id} onChange={e => update(p.id, { role: e.target.value })} className="text-xs border border-slate-300 rounded px-1.5 py-1" title="Role">
                <option value="pilot">Pilot</option><option value="observer">Observer</option><option value="crp">CRP</option>
              </select>
              {p.id !== me.id && <button type="button" onClick={() => { if (p.active ? confirm(`Deactivate ${p.full_name || p.email}? They can't sign in to see crew records until reactivated. Their records are kept.`) : true) update(p.id, { active: !p.active }); }} className={`text-xs px-2 py-1 rounded border ${p.active ? 'border-slate-300 text-slate-600' : 'border-emerald-300 text-emerald-700'}`}>{p.active ? 'Deactivate' : 'Activate'}</button>}
            </div>
          ))}
        </div>
      </div>
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
    const t = /type=(invite|recovery|signup)/.exec(hash);
    sb.auth.getSession().then(({ data }) => { setSession(data.session); loadMe(data.session); setLoading(false); if (t && data.session) { setNeedPw(t[1]); setOpen(true); } });
    const { data: sub } = sb.auth.onAuthStateChange((evt, s) => {
      setSession(s); loadMe(s);
      if (evt === 'PASSWORD_RECOVERY') { setNeedPw('recovery'); setOpen(true); }
    });
    return () => sub && sub.subscription && sub.subscription.unsubscribe();
  }, [sb, loadMe]);
  const signOut = async () => { await sb.auth.signOut(); setOpen(false); };
  const chip = (
    <button type="button" onClick={() => setOpen(true)} data-testid="account-chip"
      className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
      {session ? <><span className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center text-[10px] font-bold">{initials(me && me.full_name, session.user.email)}</span><span className="max-w-[9rem] truncate">{(me && me.full_name) || session.user.email}</span>{me && me.role && <span className="text-[10px] font-bold uppercase opacity-80">{ROLE_LABEL[me.role]}</span>}</>
        : <><i className="fa-solid fa-user"></i>{loading ? '…' : 'Sign in'}</>}
    </button>
  );
  const account = session && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold">{initials(me && me.full_name, session.user.email)}</span>
                  <div className="flex-1 min-w-0"><div className="font-semibold text-slate-800">{(me && me.full_name) || session.user.email}</div><div className="text-xs text-slate-500">{session.user.email}</div></div>
                  {me && me.role && <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_STYLE[me.role]}`} data-testid="my-role">{ROLE_LABEL[me.role]}</span>}
                  <button type="button" onClick={signOut} className={btn + ' border border-slate-300 text-slate-600'} data-testid="signout">Sign out</button>
                </div>
                {me && !me.active && <div className="text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-lg px-3 py-2" data-testid="inactive-note">Your login isn't active. Ask the CRP to invite or activate you.</div>}
                {me && me.active && me.role === 'crp' && <CrewAdmin sb={sb} me={me} />}
                {me && me.active && me.role !== 'crp' && <MyProfile sb={sb} me={me} onSaved={() => loadMe(session)} />}
                <p className="text-[11px] text-slate-400"><i className="fa-solid fa-circle-info mr-1"></i>Jobs and plans are still saved on this device for now; cloud sync of jobs comes in a later update.</p>
              </div>
  );
  const inline = slot2 && createPortal(
    <div data-testid="account-inline">
      {loading ? <p className="text-sm text-slate-500">Checking your login…</p>
        : !session ? <SignIn sb={sb} onDone={() => {}} />
        : account}
    </div>, slot2);
  const floating = !slot && (
    <div className="fixed bottom-3 left-3 z-[1500] print:hidden" style={{ background: '#2d0a5e', borderRadius: 10 }}>{chip}</div>
  );
  return (
    <>
      {slot ? createPortal(chip, slot) : floating}
      {inline}
      {open && (
        <Modal title={needPw ? 'Set your password' : session ? 'Account & crew' : 'Sign in'} onClose={() => setOpen(false)}>
          {needPw && session ? <SetPassword sb={sb} why={needPw} onDone={() => { setNeedPw(null); history.replaceState(null, '', location.pathname + location.search); }} />
            : !session ? <SignIn sb={sb} onDone={() => {}} />
            : account
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
