// Chunk 3 — pilot induction. Part 1: the pilot, on their own login. Part 2: the CRP reviews and certifies.
// The database checks everything that matters (submit_induction / certify_induction); these screens guide people.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SignaturePad, { SignatureView } from './SignaturePad.jsx';
import { TLDR, APPROVALS, DECLARATION_TITLE, DECLARATION_ITEMS, CONFIDENTIALITY, CRP_CHECKS, CRP_CERTIFY } from './inductionText.js';

const btn = 'px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed';
const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300';
const lbl = 'block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1';
const COMP = { induction: 'Induction', evlos: 'EVLOS', oonp: 'OONP', night: 'Night' };
export const compLabel = (c) => (String(c).startsWith('type:') ? 'Type: ' + String(c).slice(5) : COMP[c] || c);
const fmtD = (d) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const STATUS = { draft: ['Draft', 'bg-slate-100 text-slate-700'], awaiting_crp: ['Waiting for the CRP', 'bg-amber-100 text-amber-800'], certified: ['Certified', 'bg-emerald-100 text-emerald-800'], not_yet_competent: ['Not yet competent', 'bg-rose-100 text-rose-800'] };
const StatusPill = ({ s }) => { const [t, c] = STATUS[s] || [s, 'bg-slate-100']; return <span data-ind-status={s} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c}`}>{t}</span>; };
const errText = (e) => (e && (e.message || e.error_description || e.error)) || String(e || 'Something went wrong');

function Section({ n, title, children, hint }) {
  return (
    <section className="border border-slate-200 rounded-xl p-4 space-y-3">
      <h3 className="font-bold text-slate-800 text-sm">{n ? <span className="text-violet-600 mr-1.5">{n}.</span> : null}{title}</h3>
      {hint && <p className="text-xs text-slate-500 -mt-2">{hint}</p>}
      {children}
    </section>
  );
}
function Tick({ checked, onChange, children, testid, disabled }) {
  return (
    <label className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-white'} ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-1 w-4 h-4 accent-emerald-600" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} data-testid={testid} />
      <span className="text-sm text-slate-800">{children}</span>
    </label>
  );
}
function HelpList({ title, items }) {
  return (
    <details className="text-xs text-slate-600 mt-1">
      <summary className="cursor-pointer text-violet-700 font-semibold">{title}</summary>
      <ul className="list-disc ml-5 mt-1 space-y-0.5">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </details>
  );
}

async function signedUrl(sb, path) {
  if (!path) return null;
  const { data } = await sb.storage.from('crew-docs').createSignedUrl(path, 600);
  return data && data.signedUrl;
}
function DocLink({ sb, path, label }) {
  const [busy, setBusy] = useState(false);
  if (!path) return <span className="text-sm text-slate-400">{label}: not uploaded</span>;
  return <button type="button" data-doc={label} disabled={busy} onClick={async () => { setBusy(true); const u = await signedUrl(sb, path); setBusy(false); if (u) window.open(u, '_blank', 'noopener'); }}
    className="text-sm text-violet-700 underline">{label} <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></button>;
}

// ── Part 1: the pilot ──────────────────────────────────────────────────────────────────────────
export function PilotInduction({ sb, me }) {
  const [state, setState] = useState({ loading: true });
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const { data: person } = await sb.from('people').select('*').eq('user_id', me.id).maybeSingle();
    if (!person) { setState({ loading: false, person: null }); return; }
    const [{ data: recs }, { data: certs }] = await Promise.all([
      sb.from('signoff_records').select('*').eq('person_id', person.id).eq('type', 'pilot_induction').order('created_at', { ascending: false }),
      sb.from('certifications').select('competency, check_date, next_due').eq('person_id', person.id).order('next_due'),
    ]);
    setState({ loading: false, person, rec: (recs || [])[0] || null, certs: certs || [] });
  }, [sb, me.id]);
  useEffect(() => { load(); }, [load]);
  if (state.loading) return <p className="text-sm text-slate-500">Loading your induction…</p>;
  if (!state.person) return <p className="text-sm text-slate-500">Your crew record isn't set up yet. Ask the CRP.</p>;
  const { rec, certs } = state;
  const s = rec ? rec.status : null;
  return (
    <div className="border border-violet-200 rounded-xl p-4 space-y-3" data-testid="pilot-induction">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="font-semibold text-violet-900 text-sm flex-1"><i className="fa-solid fa-id-card-clip mr-1.5"></i>Pilot induction</div>
        {s && <StatusPill s={s} />}
      </div>
      {(!s || s === 'draft' || s === 'not_yet_competent') && (
        <>
          <p className="text-sm text-slate-600">{!s ? 'Before you fly for us, complete the induction (about 10 minutes). The CRP then checks it and certifies you.'
            : s === 'draft' ? 'You started your induction. Pick up where you left off.'
            : 'Your last induction was recorded as not yet competent' + (rec.answers && rec.answers.crp && rec.answers.crp.notes ? ': ' + rec.answers.crp.notes : '.') + ' You can start a new one when you\'re ready.'}</p>
          <button type="button" data-testid="ind-open" onClick={() => setOpen(true)} className={btn + ' bg-violet-600 text-white hover:bg-violet-700'}>{s === 'draft' ? 'Continue my induction' : 'Start my induction'}</button>
        </>
      )}
      {s === 'awaiting_crp' && <p className="text-sm text-slate-600">Submitted {fmtD(rec.person_signed_at)}. The CRP will check it and you'll get an email when you're certified.</p>}
      {certs.length > 0 && (
        <div>
          <div className={lbl}>Your certifications</div>
          <ul className="text-sm space-y-1" data-testid="my-certs">{certs.map((c, i) => <li key={i} className="flex justify-between gap-2"><span>{compLabel(c.competency)}</span><span className="text-slate-500">checked {fmtD(c.check_date)} · due {fmtD(c.next_due)}</span></li>)}</ul>
        </div>
      )}
      {open && <PilotForm sb={sb} me={me} person={state.person} rec={s === 'draft' ? rec : null} onClose={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function FullScreen({ title, onClose, children, testid }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[5000] bg-slate-900/60 overflow-y-auto print:hidden" data-testid={testid}>
      <div className="bg-white max-w-3xl mx-auto sm:my-6 sm:rounded-2xl shadow-2xl min-h-full sm:min-h-0">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur flex items-center gap-3 px-5 py-3 border-b border-slate-200 sm:rounded-t-2xl">
          <h2 className="font-bold text-slate-800 flex-1">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl px-1" aria-label="Close"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function PilotForm({ sb, me, person, rec, onClose }) {
  const a0 = (rec && rec.answers) || {};
  const [p, setP] = useState({ full_name: person.full_name || '', phone: person.phone || '', address: person.address || '', arn: person.arn || '', repl_no: person.repl_no || '',
    nok_name: person.nok_name || '', nok_relationship: person.nok_relationship || '', nok_phone: person.nok_phone || '', total_hours: person.total_hours ?? '' });
  const [types, setTypes] = useState(a0.types || []);
  const [hours, setHours] = useState(a0.typeHours || {});
  const [approvals, setApprovals] = useState(a0.approvals || []);
  const [decl, setDecl] = useState(!!a0.declaration), [conf, setConf] = useState(!!a0.confidentiality);
  const [sig, setSig] = useState((rec && rec.person_signature) || null);
  const [docs, setDocs] = useState(a0.docs || {});
  const [fleet, setFleet] = useState([]), [manual, setManual] = useState('');
  const [busy, setBusy] = useState(''), [msg, setMsg] = useState(null);
  const [recId, setRecId] = useState(rec && rec.id);
  useEffect(() => { (async () => {
    const [{ data: ft }, { data: mv }, { data: ex }] = await Promise.all([
      sb.from('fleet_types').select('name').eq('active', true).order('name'),
      sb.from('app_settings').select('value').eq('key', 'manual_version').maybeSingle(),
      sb.from('experience').select('rpa_type, hours').eq('person_id', person.id),
    ]);
    setFleet((ft || []).map(x => x.name)); setManual((mv && mv.value) || '');
    if (ex && ex.length && !a0.typeHours) { const h = {}; ex.forEach(x => { h[x.rpa_type] = x.hours; }); setHours(h); }
  })(); }, []); // eslint-disable-line
  const set = (k) => (e) => setP(v => ({ ...v, [k]: e.target.value }));
  const missing = useMemo(() => [
    !p.full_name.trim() && 'your name', !p.phone.trim() && 'phone', !p.arn.trim() && 'ARN', !p.repl_no.trim() && 'RePL number',
    !(p.nok_name.trim() && p.nok_phone.trim()) && 'next of kin', String(p.total_hours).trim() === '' && 'total hours',
    !types.length && 'the types you\'ll fly', !docs.repl && 'RePL photo', !docs.logbook && 'logbook summary',
    !decl && 'the declaration', !conf && 'the confidentiality agreement', !sig && 'your signature',
  ].filter(Boolean), [p, types, docs, decl, conf, sig]);

  const upload = async (kind, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setMsg({ ok: false, t: 'That file is over 10 MB. Try a smaller photo or PDF.' }); return; }
    setBusy(kind); setMsg(null);
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${person.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('crew-docs').upload(path, file, { contentType: file.type || undefined, upsert: false });
    setBusy('');
    if (error) setMsg({ ok: false, t: 'Upload failed: ' + errText(error) }); else setDocs(d => ({ ...d, [kind]: path, [kind + 'Name']: file.name }));
  };

  const answers = () => ({ types, typeHours: Object.fromEntries(types.map(t => [t, hours[t] === '' || hours[t] == null ? null : Number(hours[t])])), approvals, declaration: decl, confidentiality: conf, docs,
    declarationText: DECLARATION_TITLE, declarationItems: DECLARATION_ITEMS, confidentialityText: CONFIDENTIALITY });
  const save = async () => {
    const pd = { ...p, total_hours: String(p.total_hours).trim() === '' ? null : Number(p.total_hours) };
    const r1 = await sb.from('people').update(pd).eq('id', person.id);
    if (r1.error) throw r1.error;
    const rows = types.filter(t => hours[t] !== '' && hours[t] != null).map(t => ({ person_id: person.id, rpa_type: t, hours: Number(hours[t]) }));
    if (rows.length) { const r2 = await sb.from('experience').upsert(rows, { onConflict: 'person_id,rpa_type' }); if (r2.error) throw r2.error; }
    const body = { answers: answers(), person_signature: sig ? { ...sig, name: p.full_name } : null, manual_version: manual || null };
    if (recId) { const r3 = await sb.from('signoff_records').update(body).eq('id', recId); if (r3.error) throw r3.error; return recId; }
    const r4 = await sb.from('signoff_records').insert({ ...body, person_id: person.id, type: 'pilot_induction' }).select('id').single();
    if (r4.error) throw r4.error; setRecId(r4.data.id); return r4.data.id;
  };
  const doSave = async () => { setBusy('save'); setMsg(null); try { await save(); setMsg({ ok: true, t: 'Saved. You can come back and finish it later.' }); } catch (e) { setMsg({ ok: false, t: errText(e) }); } setBusy(''); };
  const doSubmit = async () => {
    if (missing.length) { setMsg({ ok: false, t: 'Still needed: ' + missing.join(', ') + '.' }); return; }
    setBusy('submit'); setMsg(null);
    try {
      const id = await save();
      const { error } = await sb.rpc('submit_induction', { p_id: id });
      if (error) throw error;
      try { await sb.functions.invoke('notify', { body: { event: 'induction_submitted', signoff_id: id } }); } catch (e) { /* the CRP still sees it in the planner */ }
      alert('Submitted. The CRP has been notified and will check your induction. You\'ll get an email when you\'re certified.');
      onClose();
    } catch (e) { setMsg({ ok: false, t: errText(e) }); }
    setBusy('');
  };

  return (
    <FullScreen title="Pilot induction — Part 1" onClose={onClose} testid="ind-form">
      <div className="rounded-xl bg-violet-50 border border-violet-200 p-4" data-testid="ind-tldr">
        <div className="text-xs font-black uppercase tracking-widest text-violet-700 mb-1">In short</div>
        <ol className="list-decimal ml-5 text-sm text-violet-950 space-y-0.5">{TLDR.map((t, i) => <li key={i}>{t}</li>)}</ol>
      </div>
      <Section n="1" title="Your details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={lbl}>Full name</label><input className={input} value={p.full_name} onChange={set('full_name')} data-f="full_name" /></div>
          <div><label className={lbl}>Email</label><input className={input + ' bg-slate-50'} value={person.email || me.email || ''} readOnly /></div>
          <div><label className={lbl}>Mobile</label><input className={input} type="tel" value={p.phone} onChange={set('phone')} data-f="phone" /></div>
          <div><label className={lbl}>ARN</label><input className={input} value={p.arn} onChange={set('arn')} data-f="arn" /></div>
          <div><label className={lbl}>RePL number</label><input className={input} value={p.repl_no} onChange={set('repl_no')} data-f="repl_no" /></div>
          <div className="sm:col-span-2"><label className={lbl}>Address</label><input className={input} value={p.address} onChange={set('address')} data-f="address" /></div>
        </div>
      </Section>
      <Section n="2" title="Next of kin" hint="Who we contact in an emergency (form F.3).">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label className={lbl}>Name</label><input className={input} value={p.nok_name} onChange={set('nok_name')} data-f="nok_name" /></div>
          <div><label className={lbl}>Relationship</label><input className={input} value={p.nok_relationship} onChange={set('nok_relationship')} data-f="nok_relationship" /></div>
          <div><label className={lbl}>Phone</label><input className={input} type="tel" value={p.nok_phone} onChange={set('nok_phone')} data-f="nok_phone" /></div>
        </div>
      </Section>
      <Section n="3" title="Experience" hint="Your total RPA hours, the company aircraft types you'll fly, and your hours on each.">
        <div className="max-w-xs"><label className={lbl}>Total RPA hours</label><input className={input} type="number" min="0" step="0.1" value={p.total_hours} onChange={set('total_hours')} data-f="total_hours" /></div>
        <div>
          <label className={lbl}>Types you'll fly for us</label>
          {fleet.length === 0 && <p className="text-sm text-slate-400">No aircraft types published yet. Ask the CRP.</p>}
          <div className="space-y-1.5" data-testid="ind-types">
            {fleet.map(t => { const on = types.includes(t); return (
              <div key={t} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${on ? 'border-violet-300 bg-violet-50' : 'border-slate-200'}`}>
                <label className="flex items-center gap-2 flex-1 cursor-pointer text-sm"><input type="checkbox" className="w-4 h-4 accent-violet-600" checked={on} data-type={t}
                  onChange={e => setTypes(v => e.target.checked ? [...v, t] : v.filter(x => x !== t))} />{t}</label>
                {on && <span className="flex items-center gap-1.5 text-xs text-slate-500"><input type="number" min="0" step="0.1" className="w-20 px-2 py-1 border border-slate-300 rounded" value={hours[t] ?? ''} data-type-hours={t}
                  onChange={e => setHours(h => ({ ...h, [t]: e.target.value }))} /> hrs on type</span>}
              </div>); })}
          </div>
        </div>
      </Section>
      <Section n="4" title="Approvals being assessed" hint="Induction and type are always assessed. Tick any extra approvals you're being checked for.">
        <div className="space-y-1.5">{APPROVALS.map(x => (
          <Tick key={x.id} checked={approvals.includes(x.id)} testid={'appr-' + x.id} onChange={c => setApprovals(v => c ? [...v, x.id] : v.filter(y => y !== x.id))}>{x.label}</Tick>
        ))}</div>
      </Section>
      <Section n="5" title="Documents" hint="A clear photo of your RePL (both sides if needed) and a summary of your logbook. Only you and the CRP can see them.">
        {[['repl', 'RePL photo', 'image/*,application/pdf'], ['logbook', 'Logbook summary', 'image/*,application/pdf,.csv,.xlsx,.xls']].map(([k, l, acc]) => (
          <div key={k} className="flex items-center gap-3 flex-wrap">
            <label className={btn + ' border border-slate-300 text-slate-700 cursor-pointer hover:bg-slate-50'}>
              <i className="fa-solid fa-upload mr-1.5"></i>{docs[k] ? 'Replace ' : 'Upload '}{l}
              <input type="file" accept={acc} className="hidden" data-upload={k} onChange={e => upload(k, e.target.files && e.target.files[0])} />
            </label>
            {busy === k ? <span className="text-xs text-slate-500">Uploading…</span> : docs[k] ? <span className="text-xs text-emerald-700"><i className="fa-solid fa-check mr-1"></i>{docs[k + 'Name'] || 'Uploaded'}</span> : <span className="text-xs text-slate-400">Not uploaded</span>}
          </div>
        ))}
      </Section>
      <Section n="6" title="Declaration">
        <Tick checked={decl} onChange={setDecl} testid="ind-decl">{DECLARATION_TITLE}</Tick>
        <HelpList title="What you're declaring (full list)" items={DECLARATION_ITEMS} />
        <Tick checked={conf} onChange={setConf} testid="ind-conf">{CONFIDENTIALITY}</Tick>
        {manual && <p className="text-xs text-slate-500">Operations Manual version: <b>{manual}</b></p>}
      </Section>
      <Section n="7" title="Sign">
        <SignaturePad name={p.full_name} value={sig} onChange={setSig} testid="ind-sig" />
      </Section>
      {msg && <div data-testid="ind-msg" className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{msg.t}</div>}
      <div className="flex flex-wrap gap-2 justify-end sticky bottom-0 bg-white py-3 border-t border-slate-100">
        <button type="button" onClick={doSave} disabled={!!busy} className={btn + ' border border-slate-300 text-slate-700'} data-testid="ind-save">{busy === 'save' ? 'Saving…' : 'Save and finish later'}</button>
        <button type="button" onClick={doSubmit} disabled={!!busy} className={btn + ' bg-violet-600 text-white hover:bg-violet-700'} data-testid="ind-submit">{busy === 'submit' ? 'Submitting…' : 'Submit to the CRP'}</button>
      </div>
    </FullScreen>
  );
}

// ── Part 2: the CRP ────────────────────────────────────────────────────────────────────────────
export function CrpInductions({ sb, me, onCount }) {
  const [list, setList] = useState(null), [err, setErr] = useState(''), [open, setOpen] = useState(null);
  const [manual, setManual] = useState(''), [mvMsg, setMvMsg] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await sb.from('signoff_records')
      .select('id, status, created_at, person_signed_at, crp_signed_at, person_id, people:person_id (full_name, email)')
      .eq('type', 'pilot_induction').order('created_at', { ascending: false });
    if (error) { setErr(errText(error)); return; }
    setList(data || []); onCount && onCount((data || []).filter(r => r.status === 'awaiting_crp').length);
    const { data: mv } = await sb.from('app_settings').select('value').eq('key', 'manual_version').maybeSingle();
    setManual((mv && mv.value) || '');
  }, [sb, onCount]);
  useEffect(() => { load(); }, [load]);
  const saveManual = async () => {
    const { error } = await sb.from('app_settings').upsert({ key: 'manual_version', value: manual.trim(), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setMvMsg(error ? errText(error) : 'Saved'); setTimeout(() => setMvMsg(''), 2000);
  };
  const awaiting = (list || []).filter(r => r.status === 'awaiting_crp');
  const others = (list || []).filter(r => r.status !== 'awaiting_crp').slice(0, 8);
  const Row = ({ r }) => (
    <div className="flex items-center gap-3 px-3 py-2 text-sm" data-ind-row={r.people && r.people.email}>
      <div className="flex-1 min-w-0"><div className="font-semibold text-slate-800 truncate">{(r.people && r.people.full_name) || '—'}</div>
        <div className="text-xs text-slate-500 truncate">{r.people && r.people.email} · {r.status === 'awaiting_crp' ? 'submitted ' + fmtD(r.person_signed_at) : r.crp_signed_at ? 'checked ' + fmtD(r.crp_signed_at) : 'started ' + fmtD(r.created_at)}</div></div>
      <StatusPill s={r.status} />
      {r.status !== 'draft' && <button type="button" onClick={() => setOpen(r.id)} data-review={r.people && r.people.email} className={btn + ' py-1 ' + (r.status === 'awaiting_crp' ? 'bg-violet-600 text-white' : 'border border-slate-300 text-slate-600')}>{r.status === 'awaiting_crp' ? 'Review' : 'View'}</button>}
    </div>
  );
  return (
    <div className="space-y-3" data-testid="crp-inductions">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex-1">Pilot inductions</div>
        <label className="text-xs text-slate-500 flex items-center gap-1.5">Ops Manual version
          <input value={manual} onChange={e => setManual(e.target.value)} placeholder="e.g. v3.2 (Aug 2026)" className="px-2 py-1 border border-slate-300 rounded text-xs w-36" data-testid="manual-version" />
          <button type="button" onClick={saveManual} className="text-xs text-violet-700 underline">Save</button>{mvMsg && <span className="text-emerald-700">{mvMsg}</span>}
        </label>
      </div>
      {err && <div className="text-sm text-rose-700">Couldn't load inductions: {err}</div>}
      {list && !list.length && <p className="text-sm text-slate-500">No inductions yet. Invite a pilot; they'll see "Start my induction" when they sign in.</p>}
      {awaiting.length > 0 && <div className="border border-amber-300 bg-amber-50/40 rounded-xl divide-y divide-amber-100 overflow-hidden" data-testid="ind-awaiting"><div className="px-3 py-1.5 text-xs font-bold text-amber-800">Waiting for you ({awaiting.length})</div>{awaiting.map(r => <Row key={r.id} r={r} />)}</div>}
      {others.length > 0 && <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">{others.map(r => <Row key={r.id} r={r} />)}</div>}
      {open && <CrpReview sb={sb} me={me} id={open} onClose={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function CrpReview({ sb, me, id, onClose }) {
  const [rec, setRec] = useState(null), [person, setPerson] = useState(null), [exp, setExp] = useState([]), [err, setErr] = useState('');
  const [assessed, setAssessed] = useState([]), [ticks, setTicks] = useState({}), [oonpHrs, setOonpHrs] = useState(false);
  const [checkDate, setCheckDate] = useState(new Date().toISOString().slice(0, 10)), [notes, setNotes] = useState('');
  const [certifies, setCertifies] = useState(false), [sig, setSig] = useState(null), [busy, setBusy] = useState(''), [msg, setMsg] = useState(null);
  useEffect(() => { (async () => {
    const { data: r, error } = await sb.from('signoff_records').select('*').eq('id', id).single();
    if (error) { setErr(errText(error)); return; }
    const [{ data: pe }, { data: ex }] = await Promise.all([
      sb.from('people').select('*').eq('id', r.person_id).single(),
      sb.from('experience').select('rpa_type, hours').eq('person_id', r.person_id),
    ]);
    setRec(r); setPerson(pe); setExp(ex || []);
    const a = r.answers || {};
    setAssessed(a.types || []);
    setTicks({ induction: true, type: true, evlos: (a.approvals || []).includes('evlos'), oonp: (a.approvals || []).includes('oonp'), night: (a.approvals || []).includes('night') });
  })(); }, [sb, id]);
  if (err) return <FullScreen title="Induction" onClose={onClose}><p className="text-rose-700 text-sm">{err}</p></FullScreen>;
  if (!rec || !person) return <FullScreen title="Induction" onClose={onClose}><p className="text-sm text-slate-500">Loading…</p></FullScreen>;
  const a = rec.answers || {}, done = rec.status !== 'awaiting_crp', crp = a.crp || {};
  const typeHours = (t) => { const h = (a.typeHours || {})[t]; const e = exp.find(x => x.rpa_type === t); return h ?? (e ? e.hours : null); };
  const comps = () => [
    ticks.induction && 'induction',
    ...(ticks.type ? assessed.map(t => 'type:' + t) : []),
    ticks.evlos && 'evlos', ticks.oonp && 'oonp', ticks.night && 'night',
  ].filter(Boolean);
  const finish = async (result) => {
    setMsg(null);
    if (!certifies) { setMsg({ ok: false, t: 'Tick the CRP certification first.' }); return; }
    if (!sig) { setMsg({ ok: false, t: 'Sign as CRP first.' }); return; }
    if (result === 'certified' && !comps().length) { setMsg({ ok: false, t: 'Tick at least one competency, or record not yet competent.' }); return; }
    if (result === 'certified' && ticks.oonp && !oonpHrs) { setMsg({ ok: false, t: 'OONP needs 10+ hours on type verified.' }); return; }
    if (result === 'not_yet_competent' && !notes.trim()) { setMsg({ ok: false, t: 'Add a note saying what needs to happen next.' }); return; }
    const list = result === 'certified' ? comps() : [];
    if (!window.confirm(result === 'certified' ? `Certify ${person.full_name} for:\n\n${list.map(compLabel).join('\n')}\n\nDue again 12 months after ${checkDate}. This locks the record.` : `Record ${person.full_name} as not yet competent? This locks the record.`)) return;
    setBusy(result);
    const p_crp = { typesAssessed: assessed, checks: ticks, oonpHoursVerified: oonpHrs, checkDate, notes: notes.trim(), crpCertifies: certifies, competencies: list, certifyText: CRP_CERTIFY };
    const { error } = await sb.rpc('certify_induction', { p_id: id, p_result: result, p_crp, p_signature: { ...sig, name: me.full_name || me.email } });
    if (error) { setBusy(''); setMsg({ ok: false, t: errText(error) }); return; }
    let mailNote = '';
    try { const { data } = await sb.functions.invoke('notify', { body: { event: 'induction_certified', signoff_id: id } }); mailNote = data && data.sent ? ' They\'ve been emailed.' : ''; } catch (e) { /* ok */ }
    setBusy(''); alert((result === 'certified' ? `${person.full_name} is certified.` : `Recorded as not yet competent.`) + mailNote); onClose();
  };
  const sb2 = sb;
  return (
    <FullScreen title={`Pilot induction — ${person.full_name}`} onClose={onClose} testid="ind-review">
      <div className="flex items-center gap-2"><StatusPill s={rec.status} />{rec.manual_version && <span className="text-xs text-slate-500">Manual {rec.manual_version}</span>}</div>
      <Section title="Part 1 — completed by the pilot">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {[['Name', person.full_name], ['Email', person.email], ['Mobile', person.phone], ['ARN', person.arn], ['RePL', person.repl_no], ['Address', person.address],
            ['Next of kin', [person.nok_name, person.nok_relationship && '(' + person.nok_relationship + ')', person.nok_phone].filter(Boolean).join(' ')], ['Total hours', person.total_hours]].map(([k, v]) => (
            <div key={k} className="flex gap-2"><dt className="text-slate-500 w-24 flex-shrink-0">{k}</dt><dd className="text-slate-800 font-medium">{v || '—'}</dd></div>))}
        </dl>
        <div className="text-sm"><span className="text-slate-500">Types and hours:</span> {(a.types || []).map(t => `${t} (${typeHours(t) ?? '—'} h)`).join(', ') || '—'}</div>
        <div className="text-sm"><span className="text-slate-500">Approvals sought:</span> Induction &amp; type{(a.approvals || []).map(x => ', ' + compLabel(x)).join('')}</div>
        <div className="flex gap-4 flex-wrap"><DocLink sb={sb2} path={(a.docs || {}).repl} label="RePL photo" /><DocLink sb={sb2} path={(a.docs || {}).logbook} label="Logbook summary" /></div>
        <div className="text-sm space-y-1">
          <div>{a.declaration ? '✅' : '❌'} {a.declarationText || DECLARATION_TITLE}</div>
          <div>{a.confidentiality ? '✅' : '❌'} Confidentiality agreed</div>
        </div>
        <SignatureView sig={rec.person_signature} at={rec.person_signed_at} />
      </Section>
      <Section title="Part 2 — CRP check">
        {done ? (
          <div className="text-sm space-y-1.5" data-testid="ind-done">
            <div><span className="text-slate-500">Checked:</span> {fmtD(crp.checkDate)} · {(crp.competencies || []).map(compLabel).join(', ') || 'no competencies'}</div>
            {crp.notes && <div><span className="text-slate-500">Notes:</span> {crp.notes}</div>}
            <SignatureView sig={rec.crp_signature} at={rec.crp_signed_at} />
            <div className="text-xs text-slate-500"><i className="fa-solid fa-lock mr-1"></i>Locked. Corrections are made as a new version (Chunk 5).</div>
          </div>
        ) : (
          <>
            <div>
              <div className={lbl}>Types assessed</div>
              <div className="flex flex-wrap gap-2">{(a.types || []).map(t => (
                <label key={t} className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-2.5 py-1"><input type="checkbox" className="accent-violet-600" checked={assessed.includes(t)} data-assess={t}
                  onChange={e => setAssessed(v => e.target.checked ? [...v, t] : v.filter(x => x !== t))} />{t}</label>))}</div>
            </div>
            <div className="space-y-2">{CRP_CHECKS.map(c => (
              <div key={c.id}>
                <Tick checked={ticks[c.id]} onChange={v => setTicks(t => ({ ...t, [c.id]: v }))} testid={'chk-' + c.id}>
                  <b>{c.label}</b> <span className="text-slate-500">({c.refs})</span>{c.id === 'type' && assessed.length ? ' — ' + assessed.join(', ') : ''}
                </Tick>
                <div className="ml-7"><HelpList title="What's checked" items={c.items} /></div>
                {c.id === 'oonp' && ticks.oonp && <div className="ml-7 mt-1"><Tick checked={oonpHrs} onChange={setOonpHrs} testid="chk-oonp-hrs">10+ hours on type verified ({assessed.map(t => `${t}: ${typeHours(t) ?? '—'} h`).join(', ') || 'no type selected'})</Tick></div>}
              </div>))}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={lbl}>Check date</label><input type="date" className={input} value={checkDate} onChange={e => setCheckDate(e.target.value)} data-testid="check-date" /></div>
              <div><label className={lbl}>Notes</label><input className={input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional (required for not yet competent)" data-testid="crp-notes" /></div>
            </div>
            <Tick checked={certifies} onChange={setCertifies} testid="crp-certifies">{CRP_CERTIFY}</Tick>
            <SignaturePad name={me.full_name || me.email} value={sig} onChange={setSig} testid="crp-sig" />
            {msg && <div data-testid="crp-msg" className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{msg.t}</div>}
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" disabled={!!busy} onClick={() => finish('not_yet_competent')} className={btn + ' border border-rose-300 text-rose-700'} data-testid="crp-nyc">{busy === 'not_yet_competent' ? 'Saving…' : 'Not yet competent'}</button>
              <button type="button" disabled={!!busy} onClick={() => finish('certified')} className={btn + ' bg-emerald-600 text-white hover:bg-emerald-700'} data-testid="crp-certify">{busy === 'certified' ? 'Certifying…' : 'Certify'}</button>
            </div>
          </>
        )}
      </Section>
    </FullScreen>
  );
}
