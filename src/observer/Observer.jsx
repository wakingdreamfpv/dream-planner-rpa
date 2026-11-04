// Chunk 4 (v7.7): EVLOS Class 1 observer sign-off.
// Three ways in: a one-time QR / link on the observer's own phone (no login), on the CRP's device (works offline,
// synced later), or a logged-in observer on the job (after reviewing the full plan). The CRP countersigns.
import { kindStyle as opsKindStyle, zoneTag as opsZoneTag, zoneBuffer as opsZoneBuffer } from '../opsmap/geo.js';
import React, { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import SignaturePad, { SignatureView } from '../cloud/SignaturePad.jsx';
import { getSupabase } from '../cloud/client.js';
import { ManualViewer } from '../cloud/Manual.jsx';

export const OBS_TLDR = [
  'Stand beside the pilot and watch the drone. Nothing else while it flies: no phone, no filming, no radio.',
  'Call out hazards early: aircraft, birds, people, vehicles, weather, obstacles.',
  'Say "Area clear" before every take-off and landing, once you have checked.',
  'Say "Land now" if you lose sight of the drone or anything is unsafe. The pilot lands straight away.',
];
export const OBS_DECLARATION = [
  'The Operations Manual as it applies to my role (s1.3.1)',
  'Induction for this operation (s1.5.2, G1.1)',
  'Fitness for duty: no alcohol in the 8 hours before, not fatigued or impaired (s1.7)',
  'The pre-operation briefing (s2.3.2)',
  'Standard calls (D6.8)',
  'Observer duties (D6.4.3, MOS 5.04)',
  'EVLOS Class 1 observer theory (G6.1.2)',
];
export const CRP_CHECKS = [
  'Eyesight sighted: driver licence or equivalent (D6.4.2)',
  'The observer will not operate the radio / controls (D6.4.1)',
  'Practical demonstrated: scanning, calls and hand-over (G6.1.3, G6.3)',
  'EVLOS brief given, callsign agreed and comms check done (D6.6)',
];
const fmtD = (d) => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? String(d) : x.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); };
const fmtDT = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const input = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-base sm:text-sm bg-white';
const btn = 'px-4 py-2.5 rounded-xl font-semibold text-sm';

function Tick({ checked, onChange, children, testid }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border px-3 py-3 cursor-pointer ${checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-white'}`}>
      <input type="checkbox" className="mt-1 w-5 h-5 accent-emerald-600 shrink-0" checked={!!checked} onChange={e => onChange(e.target.checked)} data-testid={testid} />
      <span className="text-sm text-slate-800">{children}</span>
    </label>
  );
}

// The manual version / extract for signed-in users (link viewers get them with the form)
export function useManualInfo(enabled = true) {
  const [m, setM] = useState(null);
  useEffect(() => { if (!enabled) return; const sb = getSupabase(); try { sb.from('app_settings').select('key,value').in('key', ['manual_file', 'manual_version', 'observer_extract']).then(({ data }) => {
    const o = {}; (data || []).forEach(r => { o[r.key] = r.value; }); setM({ available: !!(o.manual_file && o.manual_file.path), version: o.manual_version || '', extract: o.observer_extract || '' }); }, () => setM({ available: false })); } catch (e) { setM({ available: false }); } }, [enabled]);
  return m;
}

// The job's map for the job pack: operating area, launch / landing points, signage and any geo-referenced zones
export function JobMap({ s }) {
  const el = React.useRef(null);
  useEffect(() => {
    const L = window.L, d = el.current; if (!L || !d || !s) return;
    const md = s.mapData || {}, pts = [], ll = (p) => (p && p.lat != null && p.lng != null ? [+p.lat, +p.lng] : null);
    const parse = (t) => { const m = String(t || '').match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/); return m ? [+m[1], +m[2]] : null; };
    const m = L.map(d, { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19 }).addTo(m);
    const area = (md.areaPolygon || []).map(ll).filter(Boolean); if (area.length > 2) { L.polygon(area, { color: '#2563eb', weight: 2, fillOpacity: 0.12 }).bindTooltip('Operating area').addTo(m); pts.push(...area); }
    const zone = (z, color, label) => { const ps = (z.points || []).map(ll).filter(Boolean); if (ps.length > 2) { L.polygon(ps, { color, weight: 2, fillOpacity: 0.2 }).bindTooltip(label).addTo(m); pts.push(...ps); } };
    (md.exclusionZones || []).forEach(z => zone(z, '#dc2626', 'Exclusion zone')); (md.crowdZones || []).forEach(z => zone(z, '#16a34a', 'People / crowd'));
    const dot = (p, color, label) => { const q = ll(p); if (!q) return; L.circleMarker(q, { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(label).addTo(m); pts.push(q); };
    (md.launches || []).forEach((p, i) => dot(p, '#16a34a', p.label || 'Launch ' + (i + 1))); (md.recoveries || []).forEach((p, i) => dot(p, '#dc2626', p.label || 'Landing ' + (i + 1)));
    (md.signage || []).forEach(p => dot(p, '#f59e0b', p.label || 'Sign'));
    // v7.9 advanced ops map (outdoor): zones with their limits, buffers, flight paths, TLZ / E-LZ and cautions
    const om = s.opsMap;
    if (om && om.mode !== 'plan') {
      const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      [...(om.zones || [])].sort((a, b) => (a.kind === 'exclusion') - (b.kind === 'exclusion')).forEach(z => {
        const k = opsKindStyle(z.kind, om.settings), st = { color: k.stroke, weight: 2, fillColor: k.color, fillOpacity: k.fill, dashArray: z.kind === 'near' ? '8 6' : null };
        const b = opsZoneBuffer(z);
        if (z.shape === 'circle' && z.c) { if (b > 0) L.circle(z.c, { radius: z.r + b, color: '#d97706', weight: 1.5, dashArray: '8 6', fill: false }).addTo(m); L.circle(z.c, { radius: z.r, ...st }).bindTooltip(esc(z.name) + '<br>' + esc(opsZoneTag(z, om.settings))).addTo(m); pts.push(z.c); }
        else if ((z.pts || []).length > 2) { L.polygon(z.pts, st).bindTooltip(esc(z.name) + '<br>' + esc(opsZoneTag(z, om.settings))).addTo(m); pts.push(...z.pts); }
      });
      (om.paths || []).forEach(p => { const q = (p.pts || []).map(x => [x[0], x[1]]); if (q.length > 1) { L.polyline(q, { color: '#fff', weight: 6 }).addTo(m); L.polyline(q, { color: '#0f172a', weight: 3 }).bindTooltip(esc(p.name)).addTo(m); pts.push(...q); } });
      (om.points || []).forEach(p => { const c = p.kind === 'tlz' ? '#0f172a' : p.kind === 'elz' ? '#ea580c' : p.kind === 'poi' ? '#facc15' : '#ffffff';
        L.circleMarker([p.lat, p.lng], { radius: 8, color: '#0f172a', weight: 2, fillColor: c, fillOpacity: 1 }).bindTooltip('<b>' + esc(p.title) + '</b>' + (p.text ? '<br>' + esc(p.text) : '')).addTo(m); pts.push([p.lat, p.lng]); });
    }
    const ov = s.overview || {}; [...(ov.launchSites || []).map(x => [parse(x.coords), x.name || 'Launch']), ...(ov.recoverySites || []).map(x => [parse(x.coords), x.name || 'Landing'])].forEach(([q, n]) => { if (q && !pts.some(p => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6)) { L.circleMarker(q, { radius: 6, color: '#fff', weight: 2, fillColor: '#7c3aed', fillOpacity: 1 }).bindTooltip(n).addTo(m); pts.push(q); } });
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 19 }); else if (pts.length === 1) m.setView(pts[0], 17); else { m.remove(); d.dataset.empty = '1'; return; }
    setTimeout(() => m.invalidateSize(), 150);
    return () => { try { m.remove(); } catch (e) {} };
  }, [s]);
  return <div ref={el} data-obs-map="1" className="w-full h-64 rounded-xl overflow-hidden bg-slate-200" />;
}

// Plan summary for an observer (the "simple viewer"): what, where, when, who, the hazards and who to call
export function JobSummary({ s }) {
  if (!s) return null;
  const ov = s.overview || {}, jsa = s.jsa || {}, risks = s.risks || [];
  const rows = [['Job', s.job && s.job.title], ['Date', fmtD((s.job && s.job.start_date) || ov.operationDate) + (ov.startTime ? ' · ' + ov.startTime + (ov.endTime ? '–' + ov.endTime : '') : '')],
    ['Location', ov.location], ['RPIC', ov.rpic], ['Aircraft', (ov.rpaTypes || []).join(', ')], ['Max height', ov.maxHeight ? ov.maxHeight + ' ft AGL' : ''],
    ['Operation', (jsa.operationTypes || []).join(', ')]].filter(r => r[1]);
  const ec = ((jsa.emergencyContacts && jsa.emergencyContacts.rows) || []).filter(r => r && (r.phone || r.name));
  return (
    <div className="space-y-3" data-obs-summary="1">
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm">{rows.map(([k, v]) => <React.Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="text-slate-800 font-medium">{v}</dd></React.Fragment>)}</dl>
      {s.overview && s.overview.taskOverview ? <p className="text-sm text-slate-700 whitespace-pre-line" data-obs-task="1">{s.overview.taskOverview}</p> : null}
      {(s.mapData || s.opsMap || (s.overview && (s.overview.launchSites || []).length)) && typeof window !== 'undefined' && window.L ? <JobMap s={s} /> : null}
      {s.opsMap && ((s.opsMap.zones || []).length > 0 || (s.opsMap.points || []).some(p => p.text || p.kind === 'poi')) && <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm" data-obs-opsmap="1">
        <div className="text-xs font-bold uppercase tracking-wide text-violet-900 mb-1">Zones and cautions</div>
        <ul className="space-y-1">{(s.opsMap.zones || []).map((z, i) => <li key={'z' + i} className="flex gap-2"><span className="w-3 h-3 mt-1 rounded-sm shrink-0" style={{ background: opsKindStyle(z.kind, s.opsMap.settings).color }}></span><span><b>{z.name}</b> <span className="text-slate-600">{opsZoneTag(z, s.opsMap.settings)}</span>{z.note ? <span className="block text-xs text-slate-600">{z.note}</span> : null}</span></li>)}
          {(s.opsMap.points || []).filter(p => p.text || p.kind === 'poi').map((p, i) => <li key={'p' + i} className="flex gap-2"><span className="w-3 text-center font-black text-amber-600 shrink-0">{p.kind === 'poi' ? '!' : '•'}</span><span><b>{p.title}</b>{p.text ? <span className="text-slate-600"> · {p.text}</span> : null}</span></li>)}</ul>
      </div>}
      {risks.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2" open={risks.length <= 6}>
        <summary className="text-sm font-semibold text-amber-900 cursor-pointer">Hazards for this job ({risks.length})</summary>
        <ul className="mt-2 space-y-1.5 text-sm" data-obs-hazards="1">{risks.map((r, i) => <li key={i}><b className="text-slate-800">{r.hazard}</b>{r.risk ? <span className="block text-xs text-slate-600">{r.risk}</span> : null}{r.controls ? <span className="block text-xs text-slate-600 whitespace-pre-line">{r.controls}</span> : null}</li>)}</ul>
      </details>}
      {ec.length > 0 && <div className="text-sm"><div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Emergency contacts</div>
        {ec.map((r, i) => <div key={i} className="flex gap-2"><span className="text-slate-500 w-40 shrink-0 truncate">{r.role}</span><span className="text-slate-800">{[r.name, r.phone].filter(Boolean).join(' · ')}</span></div>)}</div>}
    </div>
  );
}

// The observer's part. mode: 'link' (own phone, no login), 'device' (CRP's device), 'login' (signed-in observer)
export function ObserverPart({ mode, summary, defaults = {}, onSubmit, busy, error, onOpenPlan, manual, token, training }) {
  const [f, setF] = useState(() => ({ name: defaults.name || '', phone: defaults.phone || '', email: defaults.email || '', declaration: false, reviewedPlan: false, manualRead: false, sig: null }));
  const [reading, setReading] = useState(false);
  const needManual = !!(manual && (manual.available || manual.extract));
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const missing = [!f.name.trim() && 'your name', mode !== 'login' && !f.phone.trim() && 'your phone', mode === 'login' && !f.reviewedPlan && 'confirm you reviewed the plan', needManual && !f.manualRead && 'confirm you read the manual extract', !f.declaration && 'the declaration', !f.sig && 'your signature'].filter(Boolean);
  return (
    <div className="space-y-4" data-obs-part={mode}>
      <div className="rounded-xl bg-violet-50 border border-violet-200 p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-violet-700 mb-1.5">Your job in one minute</div>
        <ul className="space-y-1.5 text-sm text-violet-950" data-obs-tldr="1">{OBS_TLDR.map((t, i) => <li key={i} className="flex gap-2"><span className="text-violet-500 font-bold">{i + 1}.</span><span>{t}</span></li>)}</ul>
      </div>
      {summary && <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">The job</div><JobSummary s={summary} /></div>}
      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Your details</div>
        <input className={input} placeholder="Full name" value={f.name} onChange={e => set('name', e.target.value)} disabled={mode === 'login'} data-obs-f="name" autoComplete="name" />
        {mode !== 'login' && <input className={input} placeholder="Mobile" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} data-obs-f="phone" autoComplete="tel" />}
        {mode !== 'login' && <input className={input} placeholder="Email (optional)" type="email" value={f.email} onChange={e => set('email', e.target.value)} data-obs-f="email" autoComplete="email" />}
      </div>
      {needManual && <div className="rounded-xl border border-slate-200 p-4 space-y-2" data-obs-manual="1">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Operations Manual{manual.version ? ' · version ' + manual.version : ''}</div>
        {manual.extract ? <div className="text-sm text-slate-700 whitespace-pre-line bg-slate-50 rounded-lg p-3 max-h-72 overflow-y-auto" data-obs-extract="1">{manual.extract}</div> : null}
        {manual.available && <button type="button" data-obs-open-manual="1" onClick={() => setReading(true)} className="px-3 py-2 rounded-lg border border-violet-300 text-violet-800 text-sm font-semibold hover:bg-violet-50"><i className="fa-solid fa-book mr-1"></i>Read the full manual (read-only)</button>}
        <Tick checked={f.manualRead} onChange={v => set('manualRead', v)} testid="obs-manual-read">I have read the observer sections of the Operations Manual{manual.version ? ' (version ' + manual.version + ')' : ''} and understand them.</Tick>
        {reading && <ManualViewer token={token} viewer={f.name || 'Observer'} onClose={() => setReading(false)} />}
      </div>}
      {mode === 'login' && <Tick checked={f.reviewedPlan} onChange={v => set('reviewedPlan', v)} testid="obs-reviewed">I have reviewed this job's flight plan and risk assessment in the planner{onOpenPlan && <> (<button type="button" onClick={e => { e.preventDefault(); onOpenPlan(); }} className="underline text-violet-700">open the plan</button>)</>}.</Tick>}
      <div>
        <Tick checked={f.declaration} onChange={v => set('declaration', v)} testid="obs-declaration">I have been briefed and trained as an EVLOS Class 1 observer for this operation, I understand my duties and the standard calls, and I am fit to do this role.</Tick>
        <details className="text-xs text-slate-600 mt-1 ml-1"><summary className="cursor-pointer text-violet-700 font-semibold">What this covers</summary>
          <ul className="list-disc ml-5 mt-1 space-y-0.5">{OBS_DECLARATION.map((t, i) => <li key={i}>{t}</li>)}</ul></details>
      </div>
      <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Your signature</div>
        <SignaturePad name={f.name} value={f.sig} onChange={v => set('sig', v)} testid="obs-sig" /></div>
      {error && <div className="text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700" data-obs-error="1">{error}</div>}
      <button type="button" data-obs-submit="1" disabled={!!missing.length || busy} onClick={() => onSubmit({ name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), answers: { declaration: true, reviewedPlan: !!f.reviewedPlan, items: OBS_DECLARATION, tldr: true, date: new Date().toISOString().slice(0, 10), manualRead: !!f.manualRead, manualVersion: (manual && manual.version) || '', training: !!training }, signature: { ...f.sig, name: f.name.trim() } })}
        className={btn + ' w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-base py-3'}>{busy ? 'Sending…' : mode === 'device' ? 'Done: hand back to the CRP' : 'Sign and send to the CRP'}</button>
      {missing.length > 0 && <p className="text-xs text-slate-500 text-center">Still needed: {missing.join(', ')}.</p>}
    </div>
  );
}

// The CRP's part
export function CrpPart({ crpName, onSubmit, busy, error }) {
  const [f, setF] = useState({ checks: false, callsign: '', notes: '', result: 'certified', sig: null });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const ok = (f.result === 'not_yet_competent' || f.checks) && f.sig;
  return (
    <div className="space-y-4" data-crp-part="1">
      <div>
        <Tick checked={f.checks} onChange={v => set('checks', v)} testid="crp-obs-checks">I have checked the observer: eyesight, they won't operate the controls, practical demonstrated, and the EVLOS brief, callsign and comms check are done.</Tick>
        <details className="text-xs text-slate-600 mt-1 ml-1"><summary className="cursor-pointer text-violet-700 font-semibold">What this covers</summary>
          <ul className="list-disc ml-5 mt-1 space-y-0.5">{CRP_CHECKS.map((t, i) => <li key={i}>{t}</li>)}</ul></details>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input className={input} placeholder="Callsign (optional)" value={f.callsign} onChange={e => set('callsign', e.target.value)} data-crp-obs="callsign" />
        <select className={input} value={f.result} onChange={e => set('result', e.target.value)} data-crp-obs="result"><option value="certified">Certified (12 months)</option><option value="not_yet_competent">Not yet competent</option></select>
      </div>
      <textarea className={input} rows={2} placeholder="Notes (optional)" value={f.notes} onChange={e => set('notes', e.target.value)} data-crp-obs="notes" />
      <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">CRP signature</div>
        <SignaturePad name={crpName} value={f.sig} onChange={v => set('sig', v)} testid="crp-obs-sig" /></div>
      {error && <div className="text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700">{error}</div>}
      <button type="button" data-crp-obs-submit="1" disabled={!ok || busy} onClick={() => onSubmit({ result: f.result, crp: { crpCertifies: true, checks: f.checks ? CRP_CHECKS : [], callsign: f.callsign.trim(), notes: f.notes.trim(), assessor: crpName },
        signature: { ...f.sig, name: crpName } })} className={btn + ' w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-base py-3'}>{busy ? 'Saving…' : f.result === 'certified' ? 'Certify the observer' : 'Record as not yet competent'}</button>
    </div>
  );
}

function Sheet({ title, sub, onClose, children, testid, z = 'z-[5100]' }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape' && onClose) onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className={`fixed inset-0 ${z} bg-slate-900/70 flex items-stretch sm:items-center justify-center sm:p-4 print:hidden`} data-testid={testid}>
      <div className="bg-white w-full sm:max-w-xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[100dvh] sm:max-h-[94dvh]">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3"><i className="fa-solid fa-binoculars text-violet-600"></i>
          <div className="flex-1 min-w-0"><div className="font-bold text-slate-800 truncate">{title}</div>{sub && <div className="text-xs text-slate-500 truncate">{sub}</div>}</div>
          {onClose && <button type="button" onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-800 font-semibold text-sm px-2 py-1 rounded-lg border border-slate-200"><i className="fa-solid fa-xmark mr-1"></i>Close</button>}</div>
        <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Offline queue for sign-offs done on the CRP's device ─────────────────────────────────────────────
const QKEY = 'wd_obs_queue';
const qGet = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { return []; } };
const qSet = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {} window.dispatchEvent(new Event('wd-obs-queue')); };
export async function syncObserverQueue(sb) {
  const q = qGet(); if (!q.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { synced: 0, left: q.length };
  const left = []; let synced = 0;
  for (const it of q) {
    try {
      let jobId = it.jobId;
      if (!jobId && it.jobUid) { const { data } = await sb.from('jobs').select('id').eq('plan_uid', it.jobUid).maybeSingle(); jobId = data && data.id;
        if (!jobId) { left.push({ ...it, note: 'Waiting for the job to be saved to the cloud' }); continue; } }
      const { error } = await sb.rpc('record_observer_signoff', { p_job_id: jobId || null, p_person: it.person, p_answers: it.answers, p_person_sig: it.personSig, p_signed_at: it.signedAt, p_result: it.result, p_crp: it.crp, p_crp_sig: it.crpSig });
      if (error) throw error;
      synced++;
    } catch (e) { left.push({ ...it, note: String((e && e.message) || e) }); }
  }
  qSet(left); return { synced, left: left.length };
}

// The link / QR sheet (a job link, or a training link with no job), with copy, text and email
export function LinkSheet({ qr, setQr, title, training }) {
  const sb = getSupabase();
  const [em, setEm] = useState(''), [sent, setSent] = useState('');
  const email = async () => {
    setSent('Sending…');
    const { data, error } = await sb.functions.invoke('notify', { body: { event: 'observer_link', email: em.trim().toLowerCase(), link: qr.link, title: title || '', training: !!training } });
    setSent(error || (data && data.error) ? 'Couldn\'t send: ' + ((data && data.error) || error.message) : (data && data.sent ? 'Sent to ' + em.trim() : (data && data.message) || 'Not sent'));
  };
  return (
    <Sheet title={training ? 'Observer training link' : 'Job link for crew without a login'} sub={title} onClose={() => setQr(null)} testid="obs-qr-sheet">
      <div className="space-y-3 text-sm text-center">
        <p className="text-slate-600">{training ? 'The observer opens this on their phone, reads the observer extract and the manual, and signs. No login needed.'
          : 'They scan or tap this on their phone: the job pack (plan, map, hazards, emergency contacts), the manual, and their EVLOS observer sign-off. No login needed.'} It works for 7 days and up to 5 people.</p>
        {qr.svg ? <div className="mx-auto w-56 h-56" data-obs-qr-svg="1" dangerouslySetInnerHTML={{ __html: qr.svg }} /> : null}
        <div className="flex gap-2 justify-center flex-wrap">
          <button type="button" className={btn + ' border border-slate-300'} data-obs-copy="1" onClick={() => { try { navigator.clipboard.writeText(qr.link); } catch (e) {} setQr({ ...qr, copied: true }); }}>{qr.copied ? 'Copied' : 'Copy link'}</button>
          <a className={btn + ' border border-slate-300'} href={'sms:?&body=' + encodeURIComponent((training ? 'EVLOS observer training: ' : 'Your job pack and EVLOS observer sign-off for ' + title + ': ') + qr.link)}>Text it</a>
        </div>
        <div className="flex gap-2 max-w-sm mx-auto"><input type="email" value={em} onChange={e => setEm(e.target.value)} placeholder="or email it to…" className={input} data-obs-email="1" />
          <button type="button" disabled={!/\S+@\S+\.\S+/.test(em)} onClick={email} className={btn + ' bg-violet-600 text-white disabled:opacity-40'} data-obs-email-send="1">Email</button></div>
        {sent && <p className="text-xs text-violet-800" data-obs-email-msg="1">{sent}</p>}
        <p className="text-xs text-slate-500">Their sign-off appears in Awaiting action on Home for you to countersign.</p>
      </div>
    </Sheet>
  );
}
export const makeLinkQr = (token) => { const link = location.origin + location.pathname + '#observer=' + token; let svg = '';
  try { const q = qrcode(0, 'M'); q.addData(link, 'Byte'); q.make(); svg = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch (e) {} return { link, svg, copied: false }; };

// ── The CRP's panel on a job ─────────────────────────────────────────────────────────────────────────
export function ObserverPanel({ jobUid, jobId, jobTitle, summary, crpName, refreshKey, onChanged }) {
  const sb = getSupabase();
  const [list, setList] = useState(null), [queue, setQueue] = useState(qGet), [qr, setQr] = useState(null), [device, setDevice] = useState(null), [review, setReview] = useState(null), [msg, setMsg] = useState('');
  const load = async () => {
    if (!jobId) { setList([]); return; }
    const { data } = await sb.from('signoff_records').select('id,status,answers,person_signature,person_signed_at,crp_signature,crp_signed_at,people:person_id (full_name, phone, email)').eq('type', 'evlos_observer').eq('job_id', jobId).order('created_at', { ascending: false });
    setList(data || []);
  };
  useEffect(() => { load(); }, [jobId, refreshKey]); // eslint-disable-line
  useEffect(() => { const h = () => setQueue(qGet()); const on = () => syncObserverQueue(sb).then(() => { setQueue(qGet()); load(); });
    window.addEventListener('wd-obs-queue', h); window.addEventListener('online', on); on();
    return () => { window.removeEventListener('wd-obs-queue', h); window.removeEventListener('online', on); }; }, [jobId]); // eslint-disable-line
  const mine = queue.filter(q => q.jobUid === jobUid);
  const manual = useManualInfo();
  const makeQr = async () => {
    setMsg('');
    if (!jobId) { setMsg('Save the job first so it is in the cloud, then make the link.'); return; }
    const { data, error } = await sb.rpc('create_observer_token', { p_job_id: jobId, p_days: 7 });
    if (error || !data) { setMsg('Couldn\'t make the link: ' + ((error && error.message) || 'unknown error')); return; }
    setQr(makeLinkQr(data));
  };
  const saveDevice = (obs) => (crp) => {
    const it = { id: 'o' + Date.now(), jobUid, jobId: jobId || null, title: jobTitle, person: { name: obs.name, phone: obs.phone, email: obs.email }, answers: obs.answers, personSig: obs.signature,
      signedAt: obs.at, result: crp.result, crp: crp.crp, crpSig: crp.signature, savedAt: new Date().toISOString() };
    qSet([...qGet(), it]); setDevice(null);
    syncObserverQueue(sb).then(r => { setQueue(qGet()); load(); onChanged && onChanged();
      setMsg(r.left && qGet().some(x => x.id === it.id) ? 'Saved on this device. It will upload when you are online and the job is saved.' : `${obs.name} is ${crp.result === 'certified' ? 'certified' : 'recorded as not yet competent'}.`); });
  };
  const S = { awaiting_crp: ['Waiting for you', 'bg-amber-100 text-amber-900'], certified: ['Certified', 'bg-emerald-100 text-emerald-800'], not_yet_competent: ['Not yet competent', 'bg-rose-100 text-rose-800'], draft: ['Draft', 'bg-slate-100 text-slate-600'] };
  return (
    <div className="rounded-xl border border-violet-200 bg-white overflow-hidden print:hidden" data-obs-panel="1">
      <div className="px-4 py-3 bg-violet-50 border-b border-violet-200 flex items-center gap-2 flex-wrap">
        <i className="fa-solid fa-binoculars text-violet-600"></i><h4 className="font-semibold text-violet-900 text-sm flex-1">EVLOS observer sign-off</h4>
        <button type="button" data-obs-device="1" onClick={() => setDevice({ step: 1 })} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700"><i className="fa-solid fa-tablet-screen-button mr-1"></i>Sign off on this device</button>
        <button type="button" data-obs-qr="1" onClick={makeQr} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-violet-300 text-violet-800 hover:bg-violet-100"><i className="fa-solid fa-qrcode mr-1"></i>Job link / QR (no login)</button>
      </div>
      <div className="p-4 space-y-2 text-sm">
        <p className="text-xs text-slate-500">Crew with a login open this job from My jobs (full plan and risk assessment) and sign there. Crew without one: send the job link (they get the job pack, the manual and the sign-off), or hand them this device (works offline).</p>
        {msg && <div className="text-xs rounded-lg px-3 py-2 bg-violet-50 text-violet-900" data-obs-msg="1">{msg}</div>}
        {mine.map(q => <div key={q.id} className="flex items-center gap-2 border border-dashed border-amber-300 rounded-lg px-3 py-2" data-obs-queued="1"><i className="fa-solid fa-cloud-arrow-up text-amber-600"></i><span className="flex-1"><b>{q.person.name}</b> · signed on this device {fmtDT(q.signedAt)}<span className="block text-[11px] text-amber-800">{q.note || 'Not uploaded yet'}</span></span></div>)}
        {list === null ? <p className="text-xs text-slate-400">Loading…</p> : list.length === 0 && !mine.length ? <p className="text-xs text-slate-400" data-obs-none="1">No observer sign-offs for this job yet.</p>
          : list.map(r => { const s = S[r.status] || [r.status, 'bg-slate-100']; const p = r.people || {};
            return <div key={r.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2" data-obs-row={r.status}>
              <span className="flex-1 min-w-0"><b className="text-slate-800">{p.full_name || (r.answers && r.answers.name)}</b><span className="text-xs text-slate-500"> · {r.answers && r.answers.via === 'login' ? 'signed in the planner' : r.answers && r.answers.via === 'link' ? 'signed on their phone' : 'signed on your device'} {fmtDT(r.person_signed_at)}</span></span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s[1]}`}>{s[0]}</span>
              {r.status === 'awaiting_crp' && <button type="button" data-obs-countersign={r.id} onClick={() => setReview(r)} className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-600 text-white">Countersign</button>}
            </div>; })}
      </div>
      {qr && <LinkSheet qr={qr} setQr={setQr} title={jobTitle} />}
      {device && <Sheet title={device.step === 1 ? 'Hand this device to the observer' : 'CRP check and signature'} sub={jobTitle} onClose={() => { if (device.step === 1 || window.confirm('Discard this observer sign-off?')) setDevice(null); }} testid="obs-device-sheet">
        {device.step === 1 ? <ObserverPart mode="device" summary={summary} manual={manual} onSubmit={(o) => setDevice({ step: 2, obs: { ...o, at: new Date().toISOString() } })} />
          : <div className="space-y-3"><div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm" data-obs-device-summary="1"><b>{device.obs.name}</b> · {device.obs.phone} signed {fmtDT(device.obs.at)}<div className="mt-2"><SignatureView sig={device.obs.signature} at={device.obs.at} /></div></div>
            <CrpPart crpName={crpName} onSubmit={saveDevice(device.obs)} /></div>}
      </Sheet>}
      {review && <CrpObserverReview rec={review} crpName={crpName} onClose={(changed) => { setReview(null); if (changed) { load(); onChanged && onChanged(); } }} />}
    </div>
  );
}

// The CRP countersigns a sign-off made on a phone or by a logged-in observer
export function CrpObserverReview({ rec, crpName, onClose }) {
  const sb = getSupabase();
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const p = rec.people || {}, a = rec.answers || {};
  const submit = async ({ result, crp, signature }) => {
    setBusy(true); setErr('');
    const { error } = await sb.rpc('certify_observer', { p_id: rec.id, p_result: result, p_crp: crp, p_signature: signature });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    window.dispatchEvent(new Event('wd-cloud-refresh')); onClose(true);
  };
  return (
    <Sheet title={'Countersign: ' + (p.full_name || a.name || 'observer')} sub={rec.job_title || ''} onClose={() => onClose(false)} testid="obs-review-sheet" z="z-[5200]">
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1" data-obs-review-observer="1">
          <div><b>{p.full_name || a.name}</b>{(p.phone || a.phone) ? ' · ' + (p.phone || a.phone) : ''}{p.email ? ' · ' + p.email : ''}</div>
          <div className="text-xs text-slate-600">{a.via === 'login' ? 'Signed in the planner after reviewing the plan and risk assessment' : 'Signed on their own phone (link)'} · {fmtDT(rec.person_signed_at)}</div>
          <div className="text-xs text-emerald-700"><i className="fa-solid fa-check mr-1"></i>Observer declaration ticked{a.reviewedPlan ? ' · reviewed the flight plan and risks' : ''}</div>
          <SignatureView sig={rec.person_signature} at={rec.person_signed_at} />
        </div>
        <CrpPart crpName={crpName} onSubmit={submit} busy={busy} error={err} />
      </div>
    </Sheet>
  );
}

// A logged-in observer signs for a job they're on
export function SelfObserverSheet({ jobId, jobTitle, summary, name, onOpenPlan, onClose }) {
  const sb = getSupabase();
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [done, setDone] = useState(false);
  const manual = useManualInfo();
  const submit = async (o) => {
    setBusy(true); setErr('');
    const { error } = await sb.rpc('submit_observer_self', { p_job_id: jobId, p_answers: o.answers, p_signature: o.signature });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true); window.dispatchEvent(new Event('wd-obs-self-signed'));
  };
  return (
    <Sheet title="EVLOS observer sign-off" sub={jobTitle} onClose={onClose} testid="obs-self-sheet">
      {done ? <div className="text-center space-y-3 py-6" data-obs-self-done="1"><i className="fa-solid fa-circle-check text-emerald-500 text-4xl"></i><p className="font-semibold text-slate-800">Signed and sent to the CRP.</p><p className="text-sm text-slate-500">They'll check and countersign before the job.</p><button type="button" onClick={onClose} className={btn + ' bg-slate-800 text-white'}>Close</button></div>
        : <ObserverPart mode="login" summary={summary} manual={manual} defaults={{ name }} onSubmit={submit} busy={busy} error={err} onOpenPlan={onOpenPlan ? () => { onClose(); onOpenPlan(); } : null} />}
    </Sheet>
  );
}

// ── Standalone page for the QR / link (no login, observer's own phone) ───────────────────────────────
export function ObserverLinkApp({ token }) {
  const sb = getSupabase();
  const [st, setSt] = useState({ loading: true }), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [done, setDone] = useState(null);
  const pendKey = 'wd_obs_pending:' + token.slice(0, 16);
  useEffect(() => { (async () => {
    try { const { data, error } = await sb.rpc('get_observer_form', { p_token: token }); if (error) throw error; setSt({ loading: false, data });
      try { localStorage.setItem('wd_obs_form:' + token.slice(0, 16), JSON.stringify(data)); } catch (e) {} }
    catch (e) { let cached = null; try { cached = JSON.parse(localStorage.getItem('wd_obs_form:' + token.slice(0, 16)) || 'null'); } catch (x) {}
      setSt({ loading: false, data: cached, offline: true, error: cached ? '' : 'No signal. Open this link again when you have reception, or ask the CRP to sign you off on their device.' }); }
  })(); }, [token]); // eslint-disable-line
  const send = async (o) => {
    setBusy(true); setErr('');
    try { localStorage.setItem(pendKey, JSON.stringify(o)); } catch (e) {}
    try {
      const { error } = await sb.rpc('submit_observer_signoff', { p_token: token, p_name: o.name, p_phone: o.phone, p_email: o.email || null, p_answers: o.answers, p_signature: o.signature });
      if (error) throw error;
      try { localStorage.removeItem(pendKey); } catch (e) {}
      setDone(o.name);
    } catch (e) { setErr((navigator.onLine === false ? 'No signal: your sign-off is saved on this phone. Tap the button again when you have reception.' : (e && e.message) || 'Couldn\'t send.')); }
    setBusy(false);
  };
  const d = st.data;
  return (
    <div className="min-h-[100dvh] bg-slate-100" data-observer-app="1">
      <div className="text-white px-4 py-4" style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 60%,#4c1d95 100%)' }}>
        <div className="text-xs uppercase tracking-widest opacity-75">{(d && d.company) || 'Dream Planner RPA'}</div>
        <h1 className="text-xl font-bold mt-0.5">{d && d.training ? 'EVLOS observer training sign-off' : 'EVLOS observer sign-off'}</h1>
        {d && d.job && <div className="text-sm opacity-85">{d.job.title}</div>}
      </div>
      <div className="max-w-xl mx-auto p-4">
        {st.loading ? <p className="text-slate-500 text-sm">Loading…</p>
          : done ? <div className="bg-white rounded-2xl p-6 text-center space-y-2" data-obs-link-done="1"><i className="fa-solid fa-circle-check text-emerald-500 text-5xl"></i><h2 className="text-lg font-bold text-slate-800">Thanks, {done.split(' ')[0]}.</h2><p className="text-sm text-slate-600">Your sign-off has gone to the Chief Remote Pilot, who will check it with you before the flight.</p></div>
          : d && d.error ? <div className="bg-white rounded-2xl p-6 text-center text-slate-700" data-obs-link-error="1">{d.error}</div>
          : !d ? <div className="bg-white rounded-2xl p-6 text-center text-slate-700" data-obs-link-error="1">{st.error}</div>
          : <div className="bg-white rounded-2xl p-4 sm:p-5">{st.offline && <div className="text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-900 mb-3">No signal: showing the job saved on this phone. You can fill it in; it sends when you have reception.</div>}
              <ObserverPart mode="link" summary={d.training ? null : d} manual={{ ...(d.manual || {}), extract: d.extract || '' }} token={token} training={!!d.training} onSubmit={send} busy={busy} error={err} /></div>}
      </div>
    </div>
  );
}

// A logged-in crew member on a job: their observer sign-off status and the button to sign
export function CrewObserverBar({ jobId, jobTitle, summary, name, onOpenPlan }) {
  const sb = getSupabase();
  const [rec, setRec] = useState(undefined), [open, setOpen] = useState(false);
  const load = async () => { if (!jobId) return; const { data } = await sb.from('signoff_records').select('id,status,person_signed_at,crp_signed_at').eq('type', 'evlos_observer').eq('job_id', jobId).order('created_at', { ascending: false }).limit(1); setRec((data && data[0]) || null); };
  useEffect(() => { load(); const h = () => load(); window.addEventListener('wd-obs-self-signed', h); return () => window.removeEventListener('wd-obs-self-signed', h); }, [jobId]); // eslint-disable-line
  if (rec === undefined) return null;
  const st = rec && rec.status;
  return (
    <div className="print:hidden mx-4 sm:mx-6 mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 flex items-center gap-3 flex-wrap" data-obs-crew-bar={st || 'none'}>
      <i className="fa-solid fa-binoculars text-violet-600 text-lg"></i>
      <div className="flex-1 min-w-[12rem] text-sm text-violet-900">{!st || st === 'not_yet_competent' ? <><b>You're an observer on this job.</b> Review the plan and risk assessment, then sign your EVLOS observer sign-off.</>
        : st === 'awaiting_crp' ? <><b>Observer sign-off sent</b> {fmtDT(rec.person_signed_at)}. The CRP will countersign.</> : <><b>Observer sign-off certified</b> {fmtDT(rec.crp_signed_at)}.</>}</div>
      {(!st || st === 'not_yet_competent') && <button type="button" data-obs-self-open="1" onClick={() => setOpen(true)} className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"><i className="fa-solid fa-signature mr-1"></i>Sign as observer</button>}
      {open && <SelfObserverSheet jobId={jobId} jobTitle={jobTitle} summary={summary} name={name} onOpenPlan={onOpenPlan} onClose={() => { setOpen(false); load(); }} />}
    </div>
  );
}

// ── EVLOS observer register (CRP) ───────────────────────────────────────────────────────────────────
export function ObserverRegister({ crpName }) {
  const sb = getSupabase();
  const [rows, setRows] = useState(null), [err, setErr] = useState(''), [q, setQ] = useState(''), [qr, setQr] = useState(null), [device, setDevice] = useState(null), [review, setReview] = useState(null), [msg, setMsg] = useState('');
  const manual = useManualInfo();
  const load = async () => { try { const { data, error } = await sb.rpc('observer_register'); if (error) setErr(error.message); else { setErr(''); setRows(data || []); } } catch (e) { setErr(String(e.message || e)); } };
  useEffect(() => { load(); const h = () => load(); window.addEventListener('wd-cloud-refresh', h); return () => window.removeEventListener('wd-cloud-refresh', h); }, []); // eslint-disable-line
  const today = Date.now();
  const stOf = (r) => r.status === 'awaiting_crp' ? ['Waiting for you', 'bg-amber-100 text-amber-900', 'waiting'] : r.status === 'not_yet_competent' ? ['Not yet competent', 'bg-rose-100 text-rose-800', 'nyc']
    : !r.next_due ? ['Certified', 'bg-emerald-100 text-emerald-800', 'current'] : Date.parse(r.next_due) < today ? ['Expired', 'bg-rose-100 text-rose-800', 'expired'] : Date.parse(r.next_due) - today < 60 * 864e5 ? ['Due soon', 'bg-amber-100 text-amber-900', 'soon'] : ['Current', 'bg-emerald-100 text-emerald-800', 'current'];
  // newest record per person first
  const list = (rows || []).filter(r => !q || (r.full_name + ' ' + (r.phone || '') + ' ' + (r.job_title || '')).toLowerCase().includes(q.toLowerCase()));
  const trainLink = async () => { setMsg(''); const { data, error } = await sb.rpc('create_observer_token', { p_job_id: null, p_days: 7 }); if (error || !data) { setMsg('Couldn\'t make the link: ' + ((error && error.message) || '')); return; } setQr(makeLinkQr(data)); };
  const csv = () => {
    const head = ['Name', 'Phone', 'Email', 'Status', 'Certified', 'Next due', 'Assessor', 'Callsign', 'Manual version', 'Job', 'Signed via'];
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const body = list.map(r => [r.full_name, r.phone, r.email, stOf(r)[0], r.certified_at ? new Date(r.certified_at).toISOString().slice(0, 10) : '', r.next_due ? String(r.next_due).slice(0, 10) : '', r.assessor, r.callsign, r.manual_version, r.job_title || (r.training ? 'Training' : ''), r.via].map(esc).join(','));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' })); a.download = 'EVLOS-observer-register-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  };
  const saveDevice = (obs) => (crp) => {
    const it = { id: 'o' + Date.now(), jobUid: null, jobId: null, title: 'Training', person: { name: obs.name, phone: obs.phone, email: obs.email }, answers: obs.answers, personSig: obs.signature, signedAt: obs.at, result: crp.result, crp: crp.crp, crpSig: crp.signature, savedAt: new Date().toISOString() };
    qSet([...qGet(), it]); setDevice(null);
    syncObserverQueue(sb).then(() => { load(); setMsg(qGet().some(x => x.id === it.id) ? 'Saved on this device; it uploads when you are online.' : obs.name + ' added to the register.'); });
  };
  return (
    <div className="space-y-3 text-sm" data-obs-register="1">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone or job" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm flex-1 min-w-[10rem]" />
        <button type="button" data-reg-train-device="1" onClick={() => setDevice({ step: 1 })} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white"><i className="fa-solid fa-tablet-screen-button mr-1"></i>Train &amp; assess on this device</button>
        <button type="button" data-reg-train-link="1" onClick={trainLink} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-violet-300 text-violet-800"><i className="fa-solid fa-qrcode mr-1"></i>Training link / QR</button>
        <button type="button" data-reg-csv="1" onClick={csv} disabled={!list.length} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 disabled:opacity-40"><i className="fa-solid fa-file-csv mr-1"></i>CSV</button>
      </div>
      {msg && <div className="text-xs rounded-lg px-3 py-2 bg-violet-50 text-violet-900" data-reg-msg="1">{msg}</div>}
      {err && <div className="text-xs text-red-700">Couldn't load the register: {err}. (Run migration 0006 in Supabase.)</div>}
      {rows === null && !err ? <p className="text-xs text-slate-400">Loading…</p> : list.length === 0 ? <p className="text-xs text-slate-500" data-reg-empty="1">No EVLOS observers yet. Train and assess one on this device, or send a training link.</p>
        : <div className="overflow-x-auto"><table className="w-full text-xs" data-reg-table="1"><thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="py-1.5 pr-2">Observer</th><th className="pr-2">Status</th><th className="pr-2">Certified</th><th className="pr-2">Next due</th><th className="pr-2">Assessor · callsign</th><th className="pr-2">Manual</th><th className="pr-2">Job</th><th></th></tr></thead>
          <tbody>{list.map(r => { const st = stOf(r); return (
            <tr key={r.signoff_id} className="border-b border-slate-100 align-top" data-reg-row={st[2]}>
              <td className="py-1.5 pr-2"><div className="font-semibold text-slate-800">{r.full_name}</div><div className="text-slate-500">{[r.phone, r.email].filter(Boolean).join(' · ')}</div></td>
              <td className="pr-2"><span className={`font-bold px-2 py-0.5 rounded-full ${st[1]}`}>{st[0]}</span></td>
              <td className="pr-2">{fmtD(r.certified_at)}</td><td className="pr-2">{fmtD(r.next_due)}</td>
              <td className="pr-2">{[r.assessor, r.callsign].filter(Boolean).join(' · ')}</td><td className="pr-2">{r.manual_version || '—'}</td>
              <td className="pr-2">{r.job_title || (r.training ? <span className="text-violet-700">Training</span> : '')}</td>
              <td>{r.status === 'awaiting_crp' && <button type="button" data-reg-countersign={r.signoff_id} onClick={async () => { const { data } = await sb.from('signoff_records').select('id,status,answers,person_signature,person_signed_at,people:person_id (full_name, phone, email)').eq('id', r.signoff_id).single(); if (data) setReview({ ...data, job_title: r.job_title || 'Training' }); }} className="font-semibold px-2 py-1 rounded bg-emerald-600 text-white">Countersign</button>}</td>
            </tr>); })}</tbody></table></div>}
      {qr && <LinkSheet qr={qr} setQr={setQr} title="EVLOS observer training" training />}
      {device && <Sheet title={device.step === 1 ? 'Hand this device to the observer' : 'CRP assessment and signature'} sub="Training and assessment (not tied to a job)" onClose={() => { if (device.step === 1 || window.confirm('Discard this sign-off?')) setDevice(null); }} testid="reg-device-sheet">
        {device.step === 1 ? <ObserverPart mode="device" manual={manual} training onSubmit={(o) => setDevice({ step: 2, obs: { ...o, at: new Date().toISOString() } })} />
          : <div className="space-y-3"><div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm"><b>{device.obs.name}</b> · {device.obs.phone} signed {fmtDT(device.obs.at)}<div className="mt-2"><SignatureView sig={device.obs.signature} at={device.obs.at} /></div></div>
            <CrpPart crpName={crpName} onSubmit={saveDevice(device.obs)} /></div>}
      </Sheet>}
      {review && <CrpObserverReview rec={review} crpName={crpName} onClose={(ch) => { setReview(null); if (ch) load(); }} />}
    </div>
  );
}

export const observerTokenFromHash = () => { const m = /^#observer=([a-f0-9]{40,80})$/i.exec((typeof location !== 'undefined' && location.hash) || ''); return m ? m[1] : null; };
