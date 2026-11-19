// v7.45: one Crew list. Each person is one row, whatever they are: pilot, observer, assessor (or several), with or
// without a login. Brings together the planner's own name lists (pilots, observers, assessors: what the job forms pick
// from), the account's crew records (sign-offs) and logins / invites. Nothing is deleted from the account here.
import React, { useMemo, useState } from 'react';

const low = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const ROLE = { pilot: 'Pilot', observer: 'Observer', assessor: 'Assessor' };
const LOGIN_ROLE = { crp: 'CRP', pilot: 'Pilot', observer: 'Observer' };
const todayMid = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const dueBadge = (iso, label) => {
  if (!iso) return null; const d = new Date(iso); if (isNaN(d.getTime())) return null;
  const days = Math.round((d - todayMid()) / 86400000);
  if (days < 0) return { t: `${label} expired`, c: 'bg-red-100 text-red-700' };
  if (days <= 30) return { t: `${label} due in ${days}d`, c: 'bg-amber-100 text-amber-800' };
  return null;
};

// one row per person; exported for the tests
export function mergeCrew({ pilots = [], observers = [], assessors = [], records = [], logins = [], invites = [] }) {
  const out = [];
  const find = (name, email) => { const e = low(email), n = low(name);
    return (e && out.find(p => p.emails.includes(e))) || (n && out.find(p => p.key === n)) || null; };
  const get = (name, email) => {
    let p = find(name, email);
    if (!p) { p = { key: low(name) || low(email), name: String(name || email || '').trim(), emails: [], roles: {}, local: null, record: null, login: null, invite: null, extraOff: 0 }; out.push(p); }
    if (email && !p.emails.includes(low(email))) p.emails.push(low(email));
    return p;
  };
  pilots.forEach(x => { if (!x || !String(x.name || '').trim()) return; const p = get(x.name, x.email); p.roles.pilot = true; p.local = x; });
  observers.forEach(n => { if (String(n || '').trim()) get(n).roles.observer = true; });
  assessors.forEach(n => { if (String(n || '').trim()) get(n).roles.assessor = true; });
  records.forEach(r => { if (!r || !(r.full_name || r.email)) return;
    const p = find(r.full_name, r.email);
    if (p && p.record) { if (p.record.active === false && r.active !== false) { p.record = r; p.extraOff++; } else p.extraOff++; return; } // a switched-off duplicate stays out of the way
    const q = p || get(r.full_name, r.email); q.record = r; if (r.email && !q.emails.includes(low(r.email))) q.emails.push(low(r.email)); });
  logins.forEach(l => { if (!l) return; const p = get(l.full_name || l.email, l.email); if (!p.login || (l.active && !p.login.active)) p.login = l; });
  invites.filter(i => i && !i.accepted_user_id).forEach(i => { const p = find(i.full_name, i.email); if (p && p.login) return; const q = p || get(i.full_name, i.email); q.invite = i; });
  out.forEach(p => {
    const lr = (p.login && p.login.role) || (p.record && p.record.role) || '';
    p.accountRole = lr;
    p.isCrp = lr === 'crp';
    p.off = (p.record && p.record.active === false) || (p.login && p.login.active === false) ? true : false;
    p.email = (p.local && p.local.email) || (p.login && p.login.email) || (p.record && p.record.email) || (p.invite && p.invite.email) || '';
    p.arn = (p.local && p.local.arn) || (p.record && p.record.arn) || '';
  });
  return out.sort((a, b) => (a.off - b.off) || a.name.localeCompare(b.name));
}

export default function CrewList({ pilots = [], observers = [], assessors = [], cloud = null, currency = null, onSave, onRegisters, onObserverRegister }) {
  const [flt, setFlt] = useState('all'), [q, setQ] = useState(''), [edit, setEdit] = useState(null), [msg, setMsg] = useState('');
  const crew = useMemo(() => mergeCrew({ pilots, observers, assessors, records: (currency && currency.people) || [], logins: (cloud && cloud.people) || [], invites: (cloud && cloud.invites) || [] }),
    [pilots, observers, assessors, currency, cloud]);
  const rowsOf = (p) => (p.record && currency ? (currency.rows || []).filter(r => r.person_id === p.record.id) : []);
  const counts = { all: crew.filter(p => !p.off).length, pilot: crew.filter(p => !p.off && p.roles.pilot).length, observer: crew.filter(p => !p.off && p.roles.observer).length,
    assessor: crew.filter(p => !p.off && p.roles.assessor).length, nologin: crew.filter(p => !p.off && !p.login && !p.invite).length, off: crew.filter(p => p.off).length };
  const shown = crew.filter(p => flt === 'off' ? p.off : !p.off && (flt === 'all' || (flt === 'nologin' ? !p.login && !p.invite : p.roles[flt])))
    .filter(p => !q.trim() || low(p.name + ' ' + p.email + ' ' + p.arn).includes(low(q)));

  // save the planner's name lists (what the job forms pick from) for one person
  const save = (f, orig) => {
    const name = f.name.trim(); if (!name) { setMsg('Add a name.'); return false; }
    const was = orig ? low(orig.name) : null;
    if (crew.some(p => p.key === low(name) && p.key !== was)) { setMsg(`${name} is already in the list.`); return false; }
    const drop = (n) => low(n) !== was && low(n) !== low(name);
    const prevLocal = (orig && orig.local) || {};
    const pil = pilots.filter(x => drop(x.name));
    if (f.pilot) pil.push({ ...prevLocal, name, arn: f.arn.trim(), phone: f.phone.trim(), email: f.email.trim().toLowerCase(), medicalExpiry: f.medicalExpiry, trainingExpiry: f.trainingExpiry });
    const obs = observers.filter(drop); if (f.observer) obs.push(name);
    const ass = assessors.filter(drop); if (f.assessor) ass.push(name);
    onSave && onSave({ pilots: pil, observers: obs, assessors: ass });
    setMsg(orig ? `${name} saved.` : `${name} added.`); return true;
  };
  const startEdit = (p) => { setMsg(''); setEdit({ orig: p, name: p ? p.name : '', email: p ? p.email : '', arn: p ? p.arn : '', phone: (p && p.local && p.local.phone) || '',
    medicalExpiry: (p && p.local && p.local.medicalExpiry) || '', trainingExpiry: (p && p.local && p.local.trainingExpiry) || '',
    pilot: p ? !!p.roles.pilot : true, observer: p ? !!p.roles.observer : false, assessor: p ? !!p.roles.assessor : false, invite: false }); };
  const toggleRole = (p, r) => {
    const f = { name: p.name, email: p.email, arn: p.arn, phone: (p.local && p.local.phone) || '', medicalExpiry: (p.local && p.local.medicalExpiry) || '', trainingExpiry: (p.local && p.local.trainingExpiry) || '',
      pilot: !!p.roles.pilot, observer: !!p.roles.observer, assessor: !!p.roles.assessor };
    f[r] = !f[r]; save(f, p);
  };
  const remove = (p) => {
    if (!window.confirm(`Take ${p.name} off the planner's crew lists?\n\nThey stop showing in the pilot, observer and assessor pickers on new jobs. Past jobs, sign-offs and any login are kept.`)) return;
    onSave && onSave({ pilots: pilots.filter(x => low(x.name) !== p.key), observers: observers.filter(n => low(n) !== p.key), assessors: assessors.filter(n => low(n) !== p.key) });
    setMsg(`${p.name} taken off the lists.`);
  };
  const invite = async (p, emailIn) => {
    if (!cloud || !cloud.invite) return;
    let e = low(emailIn || p.email);
    if (!e) { e = low(window.prompt(`Email address for ${p.name}'s login:`) || ''); if (!e) return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { window.alert('That doesn\'t look like an email address.'); return; }
    const role = p.roles.pilot || p.isCrp || p.accountRole === 'pilot' ? 'pilot' : 'observer';
    if (!window.confirm(`Send ${p.name} an invite to log in as ${LOGIN_ROLE[role]}?\n\n${e}\n\nThey get an email to set a password.`)) return;
    if (p.local && !p.local.email) onSave && onSave({ pilots: pilots.map(x => low(x.name) === p.key ? { ...x, email: e } : x), observers, assessors });
    const res = await cloud.invite({ full_name: p.name, email: e, role });
    setMsg(res && res.ok ? `Invite sent to ${e}.` : `Invite not sent: ${(res && res.msg) || 'try again'}`);
  };

  const chip = 'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap';
  const inp = 'w-full text-sm border border-slate-300 rounded px-2 py-1';
  const loginChip = (p) => {
    if (!cloud) return null;
    if (p.login) return <span data-login={p.login.active ? 'active' : 'inactive'} title={p.login.email} className={`${chip} ${p.login.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}><i className="fa-solid fa-user-check"></i>{p.login.active ? 'Login · ' + LOGIN_ROLE[p.login.role] : 'Login switched off'}</span>;
    if (p.invite) return <span data-login="invited" title={p.invite.email} className={`${chip} bg-amber-100 text-amber-800`}><i className="fa-solid fa-envelope"></i>Invited · not signed in yet</span>;
    if (p.off) return null;
    return <button type="button" data-login="none" data-invite-person={p.name} onClick={() => invite(p)} className={`${chip} bg-violet-100 text-violet-800 hover:bg-violet-200`}><i className="fa-solid fa-user-plus"></i>No login · invite</button>;
  };
  const signoffChip = (p) => {
    if (!currency || !p.record) return null;
    const rs = rowsOf(p); if (p.isCrp && !rs.length) return null;
    if (!rs.length) return <button type="button" onClick={onRegisters} data-crew-signoffs="none" className={`${chip} bg-slate-100 text-slate-600`}>No sign-offs yet</button>;
    const ex = rs.filter(r => r.status === 'expired').length, due = rs.filter(r => r.status === 'due_soon').length;
    return <button type="button" onClick={onRegisters} data-crew-signoffs={ex ? 'expired' : due ? 'due' : 'current'} title="Open Registers & currency"
      className={`${chip} ${ex ? 'bg-red-100 text-red-700' : due ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
      <i className="fa-solid fa-id-badge"></i>{ex ? `${ex} sign-off${ex === 1 ? '' : 's'} expired` : due ? `${due} due soon` : `${rs.length} sign-off${rs.length === 1 ? '' : 's'} current`}</button>;
  };
  const form = edit && (
    <div className="border border-violet-200 bg-violet-50 rounded-xl p-3 space-y-2" data-crew-form="1">
      <div className="grid sm:grid-cols-3 gap-2">
        <label className="text-xs font-semibold text-slate-600">Name<input className={inp + ' mt-1'} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} data-crew-f-name="1" /></label>
        <label className="text-xs font-semibold text-slate-600">Email (needed for a login)<input type="email" className={inp + ' mt-1'} value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} data-crew-f-email="1" /></label>
        <label className="text-xs font-semibold text-slate-600">Phone<input type="tel" className={inp + ' mt-1'} value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></label>
      </div>
      <div className="flex flex-wrap gap-3 text-sm" data-crew-f-roles="1">
        {Object.entries(ROLE).map(([k, l]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit[k]} onChange={e => setEdit({ ...edit, [k]: e.target.checked })} data-crew-f-role={k} />{l}</label>)}
      </div>
      {edit.pilot && <div className="grid sm:grid-cols-3 gap-2">
        <label className="text-xs font-semibold text-slate-600">ARN<input className={inp + ' mt-1 font-mono'} value={edit.arn} onChange={e => setEdit({ ...edit, arn: e.target.value })} data-crew-f-arn="1" /></label>
        <label className="text-xs font-semibold text-slate-600">Medical expiry<input type="date" className={inp + ' mt-1'} value={edit.medicalExpiry} onChange={e => setEdit({ ...edit, medicalExpiry: e.target.value })} /></label>
        <label className="text-xs font-semibold text-slate-600">RePL / training currency due<input type="date" className={inp + ' mt-1'} value={edit.trainingExpiry} onChange={e => setEdit({ ...edit, trainingExpiry: e.target.value })} /></label>
      </div>}
      {!edit.orig && cloud && cloud.invite && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={edit.invite} onChange={e => setEdit({ ...edit, invite: e.target.checked })} data-crew-f-invite="1" />Send them a login invite now</label>}
      <p className="text-[11px] text-slate-500">Pilot, Observer and Assessor decide which pickers they show in on a job. A login is separate: only people who sign plans or log flights from their own device need one.</p>
      <div className="flex gap-2">
        <button type="button" data-crew-save="1" className="text-xs font-bold px-3 py-2 rounded-md bg-violet-700 text-white"
          onClick={() => { const f = edit; if (save(f, f.orig)) { setEdit(null); if (f.invite && !f.orig) invite({ name: f.name.trim(), email: f.email, roles: { pilot: f.pilot, observer: f.observer }, local: null, key: low(f.name) }, f.email); } }}>
          {edit.orig ? 'Save' : 'Add to crew'}</button>
        <button type="button" className="text-xs underline" onClick={() => setEdit(null)}>Cancel</button>
      </div>
    </div>);

  const TABS = [['all', 'Everyone'], ['pilot', 'Pilots'], ['observer', 'Observers'], ['assessor', 'Assessors'], ...(cloud ? [['nologin', 'No login']] : []), ...(counts.off ? [['off', 'Switched off']] : [])];
  return (
    <div className="space-y-3" data-crew-list="1">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-crew-add="1" onClick={() => startEdit(null)} className="text-xs font-semibold px-3 py-1.5 rounded-md bg-violet-700 text-white"><i className="fa-solid fa-user-plus mr-1"></i>Add person</button>
        <div className="flex flex-wrap gap-1">{TABS.map(([k, l]) => <button key={k} type="button" data-crew-tab={k} onClick={() => setFlt(k)}
          className={`text-xs px-2.5 py-1 rounded-full border ${flt === k ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>{l} <span className="opacity-70">{counts[k]}</span></button>)}</div>
        <input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} className="ml-auto text-xs border border-slate-300 rounded px-2 py-1 w-36" />
      </div>
      {msg && <p className="text-xs text-emerald-800" data-crew-msg="1">{msg}</p>}
      {edit && !edit.orig && form}
      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
        {shown.length === 0 && <p className="text-sm text-slate-500 px-3 py-3">Nobody here.</p>}
        {shown.map(p => {
          const med = p.local && dueBadge(p.local.medicalExpiry, 'Medical'), trn = p.local && dueBadge(p.local.trainingExpiry, 'Currency');
          return (
            <div key={p.key} data-crew-person={p.name} className={p.off ? 'bg-slate-50 opacity-70' : ''}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
                <div className="flex-1 min-w-[10rem]">
                  <div className="font-semibold text-slate-800">{p.name}{p.isCrp && <span className={`${chip} ml-1.5 bg-violet-100 text-violet-800`}>CRP</span>}</div>
                  <div className="text-xs text-slate-500">{[p.arn && 'ARN ' + p.arn, p.local && p.local.phone, p.email].filter(Boolean).join(' · ') || <span className="italic">No details yet</span>}</div>
                </div>
                <div className="flex flex-wrap gap-1" data-crew-roles={p.name}>
                  {Object.entries(ROLE).map(([k, l]) => (
                    <button key={k} type="button" data-crew-role={k} data-on={p.roles[k] ? '1' : '0'} disabled={p.off} onClick={() => toggleRole(p, k)}
                      title={p.roles[k] ? `Shows in the ${l.toLowerCase()} picker on jobs. Click to stop.` : `Click to add to the ${l.toLowerCase()} picker on jobs`}
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${p.roles[k] ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'}`}>{l}</button>))}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {loginChip(p)}{signoffChip(p)}
                  {med && <span className={`${chip} ${med.c}`}>{med.t}</span>}{trn && <span className={`${chip} ${trn.c}`}>{trn.t}</span>}
                  {p.roles.observer && onObserverRegister && <button type="button" onClick={onObserverRegister} className={`${chip} bg-sky-50 text-sky-800`} title="EVLOS observer sign-offs"><i className="fa-solid fa-binoculars"></i>EVLOS register</button>}
                </div>
                {!p.off && <div className="flex gap-0.5">
                  <button type="button" data-crew-edit={p.name} onClick={() => startEdit(p)} className="text-slate-400 hover:text-blue-600 p-1" title="Edit"><i className="fa-solid fa-pen text-sm"></i></button>
                  {(p.roles.pilot || p.roles.observer || p.roles.assessor) && <button type="button" data-crew-remove={p.name} onClick={() => remove(p)} className="text-slate-400 hover:text-red-500 p-1" title="Take off the crew lists"><i className="fa-solid fa-trash-can text-sm"></i></button>}
                </div>}
              </div>
              {edit && edit.orig && edit.orig.key === p.key && <div className="px-3 pb-3">{form}</div>}
            </div>);
        })}
      </div>
      <p className="text-[11px] text-slate-500">One row per person. Blue role buttons decide where they show on a job. The login chip shows whether they can sign in. The sign-off chip comes from Registers &amp; currency (switch people off or change login roles under Login accounts below).</p>
    </div>
  );
}
