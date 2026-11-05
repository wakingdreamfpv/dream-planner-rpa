// v7.18: comments on each section of a plan, suggested edits the CRP accepts or declines, and live plan links.
//   CommentsPanel  — inside the planner (CRP and crew with a login)
//   SharePanel     — the CRP makes / revokes live links (client or crew), each showing one PDF view
//   PlanLinkApp    — the page behind a live link (no login): the plan view plus comments on each section
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '../cloud/client.js';
import qrcode from 'qrcode-generator';
import PlanViewer from './PlanViewer.jsx';

export const SECTIONS = [
  ['overview', 'Operation overview'], ['sites', 'Launch, recovery & sites'], ['map', 'Operations area map'], ['advmap', 'Advanced ops map'],
  ['prelim', 'Preliminary checklist'], ['jsa', 'JSA'], ['emergency', 'Emergency contacts'], ['rf', 'RF coordination'], ['oonp', 'OONP'],
  ['risks', 'Risk assessment register'], ['approval', 'Approval & NOTAMs'], ['postflight', 'Post-flight log'], ['flightlog', 'Flight log'], ['general', 'General'],
];
export const secLabel = (k) => (SECTIONS.find((s) => s[0] === k) || [k, k])[1];
// fields a crew member can suggest a new value for (anything else: a written suggestion the CRP does by hand)
export const SUGGEST_FIELDS = {
  overview: [['overview.operationName', 'Operation name'], ['overview.location', 'Location'], ['overview.operationDate', 'Date'], ['overview.startTime', 'Start time'], ['overview.endTime', 'End time'],
    ['overview.taskOverview', 'Task overview'], ['overview.maxHeightPlanned', 'Planned max height'], ['overview.supportPersonnel', 'Visual observer / support']],
  jsa: [['jsa.maxOperatingHeightAgl', 'Max height (ft AGL)'], ['jsa.airspaceClass', 'Airspace class'], ['jsa.airspaceHazards', 'Airspace hazards'], ['jsa.groundHazards', 'Ground hazards'], ['jsa.radioFrequencies', 'Radio frequencies']],
  approval: [['approval.notams', 'NOTAMs'], ['approval.otherRestrictions', 'Other restrictions']],
};
export const RISK_FIELDS = [['hazard', 'Hazard'], ['riskDescription', 'Risk description'], ['existingControls', 'Existing controls'], ['additionalControls', 'Additional controls'], ['resL', 'Residual likelihood (1–5)'], ['resC', 'Residual consequence (A–E)']];

const fmtT = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
const ROLE = { crp: 'CRP', pilot: 'Pilot', observer: 'Observer', client: 'Client', 'crew-link': 'Crew', crew: 'Crew' };
const roleTone = (r) => r === 'crp' ? 'bg-violet-100 text-violet-800' : r === 'client' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700';
const STATUS = { open: ['Open', 'bg-amber-100 text-amber-900'], resolved: ['Resolved', 'bg-slate-100 text-slate-600'], accepted: ['Accepted', 'bg-emerald-100 text-emerald-800'], declined: ['Declined', 'bg-rose-100 text-rose-800'] };
const inp = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white';

export function sugText(s) {
  if (!s) return '';
  if (s.kind === 'new_risk') return 'Add a risk: ' + ((s.risk && s.risk.hazard) || '') + (s.risk && s.risk.controls ? ' · controls: ' + s.risk.controls : '');
  if (s.free) return s.to || '';
  return (s.label || s.path) + ' → “' + (s.to == null ? '' : s.to) + '”';
}

function threads(list) {
  const roots = list.filter((c) => !c.parent_id);
  return roots.map((r) => ({ ...r, replies: list.filter((c) => c.parent_id === r.id) }));
}

// what the composer can attach as a suggestion
function SuggestPicker({ section, risks = [], value, onChange, current }) {
  const fields = SUGGEST_FIELDS[section] || [];
  const kind = value ? (value.kind === 'new_risk' ? 'new_risk' : value.free ? 'free' : value.riskRef ? 'risk' : 'field') : '';
  const set = (v) => onChange(v ? { ...v } : null);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-1.5 text-xs" data-suggest="1">
      <div className="flex flex-wrap gap-1">
        {fields.length > 0 && <button type="button" data-suggest-kind="field" onClick={() => set({ path: fields[0][0], label: fields[0][1], to: '' })} className={`px-2 py-1 rounded border ${kind === 'field' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-amber-300'}`}>Change a field</button>}
        {section === 'risks' && risks.length > 0 && <button type="button" data-suggest-kind="risk" onClick={() => set({ riskRef: risks[0].refNo, field: 'additionalControls', label: 'Risk ' + risks[0].refNo + ' · Additional controls', to: '' })} className={`px-2 py-1 rounded border ${kind === 'risk' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-amber-300'}`}>Change a risk</button>}
        {section === 'risks' && <button type="button" data-suggest-kind="new_risk" onClick={() => set({ kind: 'new_risk', risk: { hazard: '', riskDescription: '', controls: '' } })} className={`px-2 py-1 rounded border ${kind === 'new_risk' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-amber-300'}`}>Add a risk</button>}
        <button type="button" data-suggest-kind="free" onClick={() => set({ free: true, label: 'Suggested change', to: '' })} className={`px-2 py-1 rounded border ${kind === 'free' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-amber-300'}`}>Describe a change</button>
      </div>
      {kind === 'field' && <>
        <select className={inp} data-suggest-field="1" value={value.path} onChange={(e) => set({ ...value, path: e.target.value, label: (fields.find((f) => f[0] === e.target.value) || [])[1] })}>{fields.map(([p, l]) => <option key={p} value={p}>{l}</option>)}</select>
        {current && current(value.path) != null && <div className="text-slate-600">Now: <span className="text-slate-800">{String(current(value.path)) || '—'}</span></div>}
        <textarea className={inp} rows={2} data-suggest-to="1" placeholder="Suggested new value" value={value.to} onChange={(e) => set({ ...value, to: e.target.value })} />
      </>}
      {kind === 'risk' && <>
        <div className="grid grid-cols-2 gap-1">
          <select className={inp} data-suggest-risk="1" value={value.riskRef} onChange={(e) => set({ ...value, riskRef: e.target.value, label: 'Risk ' + e.target.value + ' · ' + (RISK_FIELDS.find((f) => f[0] === value.field) || [])[1] })}>{risks.map((r) => <option key={r.refNo} value={r.refNo}>{r.refNo} {String(r.hazard || '').slice(0, 30)}</option>)}</select>
          <select className={inp} data-suggest-rfield="1" value={value.field} onChange={(e) => set({ ...value, field: e.target.value, label: 'Risk ' + value.riskRef + ' · ' + (RISK_FIELDS.find((f) => f[0] === e.target.value) || [])[1] })}>{RISK_FIELDS.map(([f, l]) => <option key={f} value={f}>{l}</option>)}</select>
        </div>
        {(() => { const r = risks.find((x) => x.refNo === value.riskRef); return r ? <div className="text-slate-600">Now: <span className="text-slate-800">{String(r[value.field] || '') || '—'}</span></div> : null; })()}
        <textarea className={inp} rows={2} data-suggest-to="1" placeholder="Suggested new value" value={value.to} onChange={(e) => set({ ...value, to: e.target.value })} />
      </>}
      {kind === 'new_risk' && <>
        <input className={inp} data-suggest-hazard="1" placeholder="Hazard" value={value.risk.hazard} onChange={(e) => set({ ...value, risk: { ...value.risk, hazard: e.target.value } })} />
        <input className={inp} placeholder="What could happen" value={value.risk.riskDescription} onChange={(e) => set({ ...value, risk: { ...value.risk, riskDescription: e.target.value } })} />
        <input className={inp} placeholder="Controls" value={value.risk.controls} onChange={(e) => set({ ...value, risk: { ...value.risk, controls: e.target.value } })} />
      </>}
      {kind === 'free' && <textarea className={inp} rows={2} data-suggest-to="1" placeholder="What should change" value={value.to} onChange={(e) => set({ ...value, to: e.target.value })} />}
      {value && <button type="button" onClick={() => set(null)} className="text-slate-500 underline">No suggestion, just a comment</button>}
    </div>
  );
}
const sugOk = (s) => !s || (s.kind === 'new_risk' ? !!String(s.risk.hazard || '').trim() : !!String(s.to || '').trim());
const sugOut = (s) => {
  if (!s) return null;
  if (s.kind === 'new_risk') return { kind: 'new_risk', risk: s.risk };
  if (s.riskRef) return { path: 'risks:' + s.riskRef + '.' + s.field, label: s.label, to: s.to };
  if (s.free) return { free: true, label: 'Suggested change', to: s.to };
  return { path: s.path, label: s.label, to: s.to };
};

function Thread({ t, canDecide, canReply, onReply, onDecide, current }) {
  const [rep, setRep] = useState(''), [open, setOpen] = useState(false), [note, setNote] = useState('');
  const st = STATUS[t.status] || STATUS.open;
  const sug = t.kind === 'suggestion' ? t.suggestion : null;
  const now = sug && sug.path && current ? current(sug.path) : null;
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${sug && t.status === 'open' ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`} data-thread={t.id} data-thread-kind={t.kind} data-thread-status={t.status}>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <b className="text-slate-800">{t.author_name || 'Someone'}</b>
        <span className={`px-1.5 py-0.5 rounded font-semibold ${roleTone(t.author_role)}`}>{ROLE[t.author_role] || t.author_role}</span>
        <span className="text-slate-400">{fmtT(t.created_at)}</span>
        {t.link_id && t.author_role === 'client' && <span className="text-sky-700"><i className="fa-solid fa-lock mr-0.5"></i>private with the client</span>}
        <span className={`ml-auto px-1.5 py-0.5 rounded font-semibold ${st[1]}`}>{sug ? (t.status === 'open' ? 'Suggested edit' : st[0]) : st[0]}</span>
      </div>
      {t.body && <div className="text-sm text-slate-800 whitespace-pre-wrap">{t.body}</div>}
      {sug && <div className="text-sm rounded-lg bg-white border border-amber-200 px-2.5 py-1.5" data-sug="1">
        <i className="fa-solid fa-pen-to-square text-amber-600 mr-1"></i>{sugText(sug)}
        {now != null && t.status === 'open' && <div className="text-xs text-slate-500 mt-0.5">Now: {String(now) || '—'}</div>}
      </div>}
      {t.decided_by && <div className="text-[11px] text-slate-500">{STATUS[t.status] ? STATUS[t.status][0] : t.status} by {t.decided_by}{t.decision_note ? ': ' + t.decision_note : ''}</div>}
      {t.replies.map((r) => <div key={r.id} className="ml-3 pl-3 border-l-2 border-slate-200 text-sm" data-reply={r.id}>
        <div className="text-xs"><b>{r.author_name}</b> <span className={`px-1 rounded ${roleTone(r.author_role)}`}>{ROLE[r.author_role] || r.author_role}</span> <span className="text-slate-400">{fmtT(r.created_at)}</span></div>
        <div className="text-slate-800 whitespace-pre-wrap">{r.body}</div></div>)}
      <div className="flex items-center gap-2 flex-wrap">
        {canReply && <button type="button" onClick={() => setOpen(!open)} className="text-xs text-violet-700 font-semibold" data-reply-open={t.id}>Reply</button>}
        {canDecide && t.status === 'open' && (sug && !sug.free ? <>
          <button type="button" data-accept={t.id} onClick={() => onDecide(t, 'accepted', note)} className="text-xs px-2.5 py-1 rounded-md bg-emerald-600 text-white font-semibold"><i className="fa-solid fa-check mr-1"></i>Accept &amp; apply</button>
          <button type="button" data-decline={t.id} onClick={() => onDecide(t, 'declined', note)} className="text-xs px-2.5 py-1 rounded-md border border-slate-300">Decline</button>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="text-xs px-2 py-1 border border-slate-200 rounded-md flex-1 min-w-[8rem]" />
        </> : <button type="button" data-resolve={t.id} onClick={() => onDecide(t, sug ? 'accepted' : 'resolved', '')} className="text-xs px-2.5 py-1 rounded-md border border-slate-300">{sug ? 'Mark done' : 'Resolve'}</button>)}
      </div>
      {open && <div className="flex gap-2"><input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Reply…" className={inp} data-reply-text={t.id} />
        <button type="button" data-reply-send={t.id} disabled={!rep.trim()} onClick={async () => { if (await onReply(t, rep.trim())) { setRep(''); setOpen(false); } }} className="px-3 rounded-lg bg-violet-700 text-white text-sm font-semibold disabled:opacity-40">Send</button></div>}
    </div>
  );
}

function Composer({ section, setSection, canSuggest, risks, current, onSend, sections = SECTIONS, nameBox }) {
  const [body, setBody] = useState(''), [sug, setSug] = useState(null), [busy, setBusy] = useState(false);
  const ok = (body.trim() || (sug && sugOk(sug))) && sugOk(sug);
  return (
    <div className="space-y-2 border-t border-slate-200 pt-3" data-composer="1">
      {nameBox}
      <div className="flex gap-2 items-center"><span className="text-xs text-slate-500 shrink-0">On</span>
        <select className={inp} value={section} onChange={(e) => { setSection(e.target.value); setSug(null); }} data-composer-section="1">{sections.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <textarea className={inp} rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={canSuggest ? 'Comment, question or reason for a change…' : 'Your comment or question…'} data-composer-body="1" />
      {canSuggest && !sug && <button type="button" data-suggest-open="1" onClick={() => setSug(SUGGEST_FIELDS[section] ? { path: SUGGEST_FIELDS[section][0][0], label: SUGGEST_FIELDS[section][0][1], to: '' } : section === 'risks' ? { kind: 'new_risk', risk: { hazard: '', riskDescription: '', controls: '' } } : { free: true, label: 'Suggested change', to: '' })} className="text-xs font-semibold text-amber-700"><i className="fa-solid fa-pen-to-square mr-1"></i>Suggest an edit to the plan</button>}
      {canSuggest && sug && <SuggestPicker section={section} risks={risks} value={sug} onChange={setSug} current={current} />}
      <button type="button" data-composer-send="1" disabled={!ok || busy} onClick={async () => { setBusy(true); const done = await onSend({ section, body: body.trim(), suggestion: sugOut(sug) }); setBusy(false); if (done) { setBody(''); setSug(null); } }}
        className="w-full px-4 py-2 rounded-lg bg-violet-700 text-white font-bold text-sm disabled:opacity-40">{busy ? 'Sending…' : sug ? 'Send suggestion' : 'Post comment'}</button>
    </div>
  );
}

// ── Inside the planner ───────────────────────────────────────────────────────────────────────────
export function CommentsPanel({ jobId, jobTitle, me, isCrp, startSection, risks, current, onApply, onClose }) {
  const sb = getSupabase();
  const [list, setList] = useState(null), [err, setErr] = useState(''), [filter, setFilter] = useState(startSection || 'all'), [showDone, setShowDone] = useState(false);
  const [section, setSection] = useState(startSection && startSection !== 'all' ? startSection : 'general');
  const load = async () => {
    try { const { data, error } = await sb.from('plan_comments').select('*').eq('job_id', jobId).order('created_at', { ascending: true }); if (error) throw error; setList(data || []);
      window.wdComments = { jobId, list: data || [] }; window.dispatchEvent(new Event('wd-comments')); }
    catch (e) { setErr(String((e && e.message) || e) + (/relation|does not exist/i.test(String(e && e.message)) ? ' (run the Supabase migration 0010)' : '')); setList([]); }
  };
  useEffect(() => { if (jobId) load(); const iv = setInterval(() => { if (jobId) load(); }, 45000); return () => clearInterval(iv); }, [jobId]); // eslint-disable-line
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const th = useMemo(() => threads(list || []), [list]);
  const shown = th.filter((t) => (filter === 'all' || t.section === filter) && (showDone || t.status === 'open'));
  const counts = {}; th.filter((t) => t.status === 'open').forEach((t) => { counts[t.section] = (counts[t.section] || 0) + 1; });
  const post = async (row) => { setErr('');
    const { error } = await sb.from('plan_comments').insert({ job_id: jobId, ...row, author_name: (me && me.name) || '' });
    if (error) { setErr('Not sent: ' + error.message); return false; } await load(); return true; };
  const reply = (t, body) => post({ section: t.section, parent_id: t.id, body, link_id: isCrp ? t.link_id || null : null });
  const decide = async (t, status, note) => {
    if (status === 'accepted' && t.kind === 'suggestion' && t.suggestion && !t.suggestion.free) {
      const res = onApply ? onApply(t.suggestion, t) : 'No plan open';
      if (res !== true) { setErr(res || 'Couldn\'t apply that change.'); return; }
    }
    const { error } = await sb.from('plan_comments').update({ status, decided_by: (me && me.name) || 'CRP', decided_at: new Date().toISOString(), decision_note: note || null }).eq('id', t.id);
    if (error) { setErr('Not saved: ' + error.message); return; }
    load();
  };
  return (
    <div className="fixed inset-0 z-[5050] bg-slate-900/40 flex justify-end print:hidden" data-testid="comments-panel" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-slate-50 w-full max-w-md h-full flex flex-col shadow-2xl">
        <div className="px-4 py-3 text-white flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 60%,#4c1d95 100%)' }}>
          <div className="flex-1 min-w-0"><div className="text-[11px] uppercase tracking-widest opacity-75">Comments &amp; suggested edits</div><div className="font-bold truncate">{jobTitle}</div></div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/80 hover:text-white text-2xl px-2"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="px-3 py-2 border-b border-slate-200 bg-white flex flex-wrap gap-1 text-xs">
          <button type="button" onClick={() => setFilter('all')} className={`px-2 py-1 rounded-full border ${filter === 'all' ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-300'}`}>All {th.filter((t) => t.status === 'open').length ? '(' + th.filter((t) => t.status === 'open').length + ')' : ''}</button>
          {SECTIONS.filter(([k]) => counts[k] || filter === k).map(([k, l]) => <button key={k} type="button" data-filter={k} onClick={() => { setFilter(k); setSection(k); }} className={`px-2 py-1 rounded-full border ${filter === k ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-300'}`}>{l}{counts[k] ? ' (' + counts[k] + ')' : ''}</button>)}
          <label className="ml-auto flex items-center gap-1 text-slate-500"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show resolved</label>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2" data-comments-list="1">
          {list === null ? <p className="text-sm text-slate-500">Loading…</p> : shown.length === 0 ? <p className="text-sm text-slate-500" data-comments-empty="1">{th.length ? 'Nothing open here.' : 'No comments yet.'}{isCrp ? ' Share a live link (Share button) to get comments from your client or crew.' : ''}</p>
            : shown.map((t) => <Thread key={t.id} t={t} canDecide={isCrp} canReply onReply={reply} onDecide={decide} current={current} />)}
        </div>
        <div className="p-3 bg-white">
          {err && <p className="text-xs text-red-700 mb-2" data-comments-err="1">{err}</p>}
          <Composer section={section} setSection={setSection} canSuggest={!isCrp} risks={risks} current={current} onSend={(o) => post({ section: o.section, body: o.body, kind: o.suggestion ? 'suggestion' : 'comment', suggestion: o.suggestion })} />
        </div>
      </div>
    </div>
  );
}

// ── The CRP shares a live link ──────────────────────────────────────────────────────────────────────
export const linkUrl = (token) => location.origin + location.pathname + '#plan=' + token;
export function markSections(html) { if (/^\s*\{/.test(String(html || ''))) return html; return String(html || '').replace(/<!--S:(\w+)-->/g, '<a data-wd-sec="$1"></a>'); }

export function SharePanel({ jobId, jobTitle, views, makeSnapshot, onClose }) {
  const sb = getSupabase();
  const [links, setLinks] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [made, setMade] = useState(null);
  const [f, setF] = useState({ audience: 'client', label: '', email: '', view: (views.find((v) => v.id === 'client') || views[0] || {}).id, days: 30 });
  const load = async () => { try { const { data, error } = await sb.from('plan_links').select('id,audience,label,email,view_id,view_name,created_at,expires_at,revoked,snapshot_at').eq('job_id', jobId).order('created_at', { ascending: false }); if (error) throw error; setLinks(data || []); }
    catch (e) { setErr(String((e && e.message) || e) + (/relation|does not exist/i.test(String(e && e.message)) ? ' (run the Supabase migration 0010)' : '')); setLinks([]); } };
  useEffect(() => { load(); }, [jobId]); // eslint-disable-line
  const setAud = (a) => setF((x) => ({ ...x, audience: a, view: (views.find((v) => v.id === (a === 'client' ? 'client' : 'whs')) || views[0] || {}).id }));
  const make = async () => {
    setBusy(true); setErr('');
    try {
      const v = views.find((x) => x.id === f.view) || views[0];
      const snap = markSections(makeSnapshot(v));
      const { data, error } = await sb.rpc('create_plan_link', { p_job_id: jobId, p_audience: f.audience, p_label: f.label, p_email: f.email, p_days: Number(f.days) || 30, p_view_id: v.id, p_view_name: v.name, p_snapshot: snap });
      if (error) throw error;
      const url = linkUrl(data.token); let qr = '';
      try { const q = qrcode(0, 'L'); q.addData(url, 'Byte'); q.make(); qr = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); } catch (e) { qr = ''; }
      setMade({ url, qr, label: f.label, email: f.email, audience: f.audience });
      if (f.email) { try { await sb.functions.invoke('notify', { body: { event: 'plan_link', email: f.email, link: url, title: jobTitle, audience: f.audience, name: f.label } }); } catch (e) { /* the link still works */ } }
      load();
    } catch (e) { setErr('Not shared: ' + ((e && e.message) || e)); }
    setBusy(false);
  };
  const revoke = async (l) => { if (!window.confirm(`Stop the link for ${l.label || 'this person'}? It stops working straight away.`)) return; await sb.from('plan_links').update({ revoked: true }).eq('id', l.id); load(); };
  const sel = 'px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white w-full';
  return (
    <div className="fixed inset-0 z-[5050] bg-slate-900/50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto print:hidden" data-testid="share-panel" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-2 overflow-hidden">
        <div className="px-5 py-3 text-white flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 60%,#4c1d95 100%)' }}>
          <h3 className="text-lg font-bold flex-1"><i className="fa-solid fa-link mr-2"></i>Share a live link</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/80 hover:text-white text-2xl px-2"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500">They open the plan in their browser, no login, and comment on each section. It updates when you save the job. Clients only see their own comments and your replies; crew see each other's and can suggest edits for you to accept.</p>
          {made ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2" data-share-made="1">
            <div className="text-sm font-semibold text-emerald-900">Link ready{made.label ? ' for ' + made.label : ''}{made.email ? ' · emailed to ' + made.email : ''}</div>
            <div className="flex gap-2"><input readOnly value={made.url} className={sel + ' text-xs'} data-share-url="1" onFocus={(e) => e.target.select()} />
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(made.url); } catch (e) {} }} className="px-3 rounded-md bg-emerald-700 text-white text-xs font-semibold">Copy</button></div>
            {made.qr && <div className="w-32 h-32 bg-white p-1 rounded" dangerouslySetInnerHTML={{ __html: made.qr }} />}
            <div className="flex gap-2 text-xs"><a className="underline text-emerald-800" href={'sms:?&body=' + encodeURIComponent(jobTitle + ': ' + made.url)}>Text it</a><a className="underline text-emerald-800" href={'mailto:' + (made.email || '') + '?subject=' + encodeURIComponent(jobTitle) + '&body=' + encodeURIComponent('The flight plan for ' + jobTitle + ': ' + made.url + '\n\nYou can comment on any section.')}>Email it yourself</a>
              <button type="button" onClick={() => setMade(null)} className="ml-auto underline text-slate-600">Make another</button></div>
          </div> : <div className="space-y-2" data-share-form="1">
            <div className="grid grid-cols-2 gap-1.5">
              {[['client', 'Client', 'fa-handshake'], ['crew', 'Crew / VO', 'fa-users']].map(([k, l, ic]) => <button key={k} type="button" data-share-aud={k} onClick={() => setAud(k)} className={`px-3 py-2 rounded-lg border text-sm font-semibold ${f.audience === k ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-300'}`}><i className={`fa-solid ${ic} mr-1`}></i>{l}</button>)}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-slate-600">Their name<input className={sel + ' mt-1'} data-share-label="1" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. Sarah, events manager" /></label>
              <label className="text-xs font-semibold text-slate-600">Email (optional, sends it)<input className={sel + ' mt-1'} type="email" data-share-email="1" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
              <label className="text-xs font-semibold text-slate-600">What they see<select className={sel + ' mt-1'} data-share-view="1" value={f.view} onChange={(e) => setF({ ...f, view: e.target.value })}>{views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Works for<select className={sel + ' mt-1'} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })}>{[[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, 'A year']].map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select></label>
            </div>
            <button type="button" data-share-make="1" disabled={busy} onClick={make} className="w-full px-4 py-2.5 rounded-lg bg-violet-700 text-white font-bold text-sm disabled:opacity-50"><i className="fa-solid fa-link mr-1.5"></i>{busy ? 'Making the link…' : 'Make the link'}</button>
          </div>}
          {err && <p className="text-xs text-red-700" data-share-err="1">{err}</p>}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Links for this job</div>
            {links === null ? <p className="text-xs text-slate-500">Loading…</p> : links.length === 0 ? <p className="text-xs text-slate-500">None yet.</p> :
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl" data-share-list="1">{links.map((l) => { const dead = l.revoked || Date.parse(l.expires_at) < Date.now(); return (
                <div key={l.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${dead ? 'opacity-50' : ''}`} data-share-link={l.id}>
                  <div className="flex-1 min-w-0"><div className="font-medium truncate">{l.label || (l.audience === 'client' ? 'Client' : 'Crew')} <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{l.audience === 'client' ? 'Client' : 'Crew'} · {l.view_name}</span></div>
                    <div className="text-[11px] text-slate-500">{l.revoked ? 'Stopped' : dead ? 'Expired' : 'Until ' + new Date(l.expires_at).toLocaleDateString('en-AU')}{l.snapshot_at ? ' · updated ' + fmtT(l.snapshot_at) : ''}</div></div>
                  {!dead && <button type="button" data-share-revoke={l.id} onClick={() => revoke(l)} className="text-xs text-rose-600">Stop</button>}
                </div>); })}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// refresh every live link of a job with the plan as it is now (called after the CRP saves)
export async function refreshLinkSnapshots(jobId, makeSnapshot, views) {
  const sb = getSupabase(); if (!sb || !jobId) return 0;
  try {
    const { data } = await sb.from('plan_links').select('id,view_id,revoked,expires_at').eq('job_id', jobId);
    const live = (data || []).filter((l) => !l.revoked && Date.parse(l.expires_at) > Date.now());
    for (const l of live) {
      const v = views.find((x) => x.id === l.view_id) || views[0];
      await sb.from('plan_links').update({ snapshot: markSections(makeSnapshot(v)), snapshot_at: new Date().toISOString(), view_name: v.name }).eq('id', l.id);
    }
    return live.length;
  } catch (e) { return 0; }
}

// ── The page behind a live link (no login) ─────────────────────────────────────────────────────────
export const planTokenFromHash = () => { const m = /^#plan=([a-f0-9]{40,80})$/i.exec((typeof location !== 'undefined' && location.hash) || ''); return m ? m[1] : null; };
const FRAME_JS = `<script>(function(){var L=${JSON.stringify(Object.fromEntries(SECTIONS))};
function add(){document.querySelectorAll('a[data-wd-sec]').forEach(function(a){if(a.nextSibling&&a.nextSibling.dataset&&a.nextSibling.dataset.wdBtn)return;var k=a.getAttribute('data-wd-sec');if(k==='end')return;var b=document.createElement('button');b.dataset.wdBtn=k;b.textContent='\\u{1F4AC} Comment on '+(L[k]||k);
b.style.cssText='display:inline-block;margin:6px 0;padding:5px 10px;border-radius:14px;border:1px solid #c4b5fd;background:#f5f3ff;color:#5b21b6;font:600 12px system-ui;cursor:pointer;';
b.onclick=function(){parent.postMessage({wdSec:k},'*')};a.parentNode.insertBefore(b,a.nextSibling);});}
window.print=function(){};document.addEventListener('DOMContentLoaded',add);setTimeout(add,800);
window.addEventListener('message',function(e){if(e.data&&e.data.wdCounts){document.querySelectorAll('button[data-wd-btn]').forEach(function(b){var n=e.data.wdCounts[b.dataset.wdBtn]||0;b.textContent='\\u{1F4AC} '+(n?n+' comment'+(n>1?'s':'')+' · ':'')+'Comment on '+(L[b.dataset.wdBtn]||b.dataset.wdBtn);});}});})();</script>
<style>@media screen{body{max-width:820px;margin:0 auto!important;padding:12px!important;background:#fff}.pdfhdr{margin:-12px -12px 14px!important}}</style>`;

export function PlanLinkApp({ token }) {
  const sb = getSupabase();
  const [st, setSt] = useState({ loading: true }), [section, setSection] = useState('general'), [panel, setPanel] = useState(false), [err, setErr] = useState('');
  const [name, setName] = useState(() => { try { return localStorage.getItem('wd_plan_name') || ''; } catch (e) { return ''; } });
  const frame = useRef(null);
  const load = async () => { try { const { data, error } = await sb.rpc('plan_link_open', { p_token: token }); if (error) throw error; setSt({ loading: false, d: data }); } catch (e) { setSt({ loading: false, d: { error: 'Couldn\'t open the plan: ' + ((e && e.message) || e) } }); } };
  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [token]); // eslint-disable-line
  useEffect(() => { const h = (e) => { if (e.data && e.data.wdSec) { setSection(e.data.wdSec); setPanel(true); } }; window.addEventListener('message', h); return () => window.removeEventListener('message', h); }, []);
  const d = st.d || {};
  const th = threads(d.comments || []);
  const counts = {}; th.forEach((t) => { counts[t.section] = (counts[t.section] || 0) + 1 + t.replies.length; });
  useEffect(() => { try { frame.current && frame.current.contentWindow && frame.current.contentWindow.postMessage({ wdCounts: counts }, '*'); } catch (e) {} }); // keep the frame's buttons counted
  const model = useMemo(() => { try { const m = /^\s*\{/.test(String(d.snapshot || '')) ? JSON.parse(d.snapshot) : null; return m && m.v === 2 ? m : null; } catch (e) { return null; } }, [d.snapshot]);
  const html = useMemo(() => d.snapshot && !model ? String(d.snapshot).replace('</head>', FRAME_JS + '</head>').replace('<head>', '<head><meta name="viewport" content="width=840">') : '', [d.snapshot, model]);
  const send = async (o, parent) => {
    setErr('');
    if (!name.trim()) { setErr('Add your name first.'); return false; }
    try { localStorage.setItem('wd_plan_name', name.trim()); } catch (e) {}
    const { data, error } = await sb.rpc('plan_link_comment', { p_token: token, p_name: name.trim(), p_section: parent ? parent.section : o.section, p_anchor: null, p_body: parent ? o : o.body, p_parent: parent ? parent.id : null, p_suggestion: parent ? null : o.suggestion || null });
    if (error) { setErr('Not sent: ' + error.message); return false; }
    setSt((s) => ({ ...s, d: { ...s.d, comments: data.comments } })); return true;
  };
  const here = th.filter((t) => t.section === section);
  return (
    <div className="h-[100dvh] flex flex-col bg-slate-100" data-plan-link-app="1">
      <div className="text-white px-4 py-3 flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 60%,#4c1d95 100%)' }}>
        <div className="flex-1 min-w-0"><div className="text-[11px] uppercase tracking-widest opacity-75">{d.company || 'Flight plan'}{d.view_name ? ' · ' + d.view_name : ''}</div>
          <div className="font-bold truncate">{d.title || 'Flight plan'}</div>
          {d.snapshot_at && <div className="text-[11px] opacity-75">Updated {fmtT(d.snapshot_at)}</div>}</div>
        {!d.error && !st.loading && <button type="button" data-plan-comments-open="1" onClick={() => setPanel(!panel)} className="px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-semibold"><i className="fa-solid fa-comments mr-1"></i>Comments{th.length ? ' (' + th.length + ')' : ''}</button>}
      </div>
      {st.loading ? <p className="p-6 text-slate-500">Loading the plan…</p> : d.error ? <div className="p-6"><div className="bg-white rounded-2xl p-6 text-center text-slate-700" data-plan-link-error="1">{d.error}</div></div> :
        <div className="flex-1 flex min-h-0 relative">
          {model ? <div className="flex-1 min-w-0 overflow-y-auto" data-plan-scroll="1"><PlanViewer model={model} counts={counts} onComment={(k) => { setSection(k); setPanel(true); }} /></div>
            : <iframe ref={frame} title="Flight plan" sandbox="allow-scripts allow-popups" srcDoc={html} className="flex-1 bg-white border-0 min-w-0" data-plan-frame="1" />}
          {panel && <div className="absolute md:static inset-0 md:inset-auto md:w-[380px] bg-slate-50 border-l border-slate-200 flex flex-col z-10" data-plan-comments="1">
            <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center gap-2">
              <select value={section} onChange={(e) => setSection(e.target.value)} className={inp} data-plan-section="1">{(model ? [...model.sections.map((x) => [x.key, x.title]), ['general', 'General']] : SECTIONS).map(([k, l]) => <option key={k} value={k}>{l}{counts[k] ? ' (' + counts[k] + ')' : ''}</option>)}</select>
              <button type="button" onClick={() => setPanel(false)} aria-label="Close comments" className="text-slate-500 text-xl px-2"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {here.length === 0 ? <p className="text-sm text-slate-500">No comments on {secLabel(section).toLowerCase()} yet.</p> : here.map((t) => <Thread key={t.id} t={t} canDecide={false} canReply onReply={(tt, body) => send(body, tt)} onDecide={() => {}} />)}
            </div>
            <div className="p-3 bg-white">
              {err && <p className="text-xs text-red-700 mb-2" data-plan-err="1">{err}</p>}
              <Composer section={section} setSection={setSection} canSuggest={!!d.can_suggest} risks={[]} onSend={(o) => send(o)}
                nameBox={<input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" data-plan-name="1" autoComplete="name" />} />
              <p className="text-[11px] text-slate-400 mt-2">{d.audience === 'client' ? 'Your comments go to the Chief Remote Pilot. Only you and they can see them.' : 'Seen by the CRP and the crew on this job.'}</p>
            </div>
          </div>}
        </div>}
    </div>
  );
}
