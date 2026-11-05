// v7.19: the live link shows the plan in the planner's own look (read-only): cards per section, the 2D map you can pan
// and zoom, the advanced ops map in 3D you can turn, the risk register with its ratings, signatures. Only the sections of
// the chosen view are in the data (the planner leaves the rest out before it's shared).
import React, { Suspense, useState } from 'react';
import { JobMap } from '../observer/Observer.jsx';

const Ops3D = React.lazy(() => import('../opsmap/Ops3D.jsx'));
const GROUPS = { 1: ['Section 1', 'Operations Overview & Preliminary Assessment', 'fa-clipboard-list'], 2: ['Section 2', 'Job Safety Assessment & Risk', 'fa-triangle-exclamation'],
  3: ['Section 3', 'Approval & Flight Authorisation', 'fa-file-signature'], 4: ['Section 4', 'Post-Flight Log', 'fa-plane-arrival'], A: ['Appendix', 'Attachments', 'fa-paperclip'] };
const fmtT = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const script = { fontFamily: '"Brush Script MT","Segoe Script","Snell Roundhand",cursive' };

function Block({ b }) {
  switch (b.t) {
    case 'kv': return (
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2" data-pv-kv="1">{b.rows.map(([l, v, wide], i) => (
        <div key={i} className={wide ? 'sm:col-span-2' : ''}><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</dt><dd className="text-sm text-slate-800 whitespace-pre-wrap break-words">{v}</dd></div>))}</dl>);
    case 'text': return <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{b.label}</div><p className="text-sm text-slate-800 whitespace-pre-wrap">{b.text}</p></div>;
    case 'mono': return <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{b.label}</div><pre className="text-xs text-slate-800 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono max-h-80 overflow-y-auto">{b.text}</pre></div>;
    case 'agreed': return <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-3"><div className="font-bold text-emerald-900 text-sm mb-1"><i className="fa-solid fa-circle-check mr-1"></i>RF plan agreed</div><p className="text-sm text-emerald-950 whitespace-pre-wrap font-semibold">{b.text}</p></div>;
    case 'status': return <div className={`rounded-xl border-2 px-4 py-3 text-center font-bold ${b.ok ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-amber-400 bg-amber-50 text-amber-900'}`} data-pv-status={b.ok ? 'approved' : 'pending'}><i className={`fa-solid ${b.ok ? 'fa-circle-check' : 'fa-hourglass-half'} mr-2`}></i>{b.text}</div>;
    case 'list': return <ul className="text-sm text-slate-700 list-disc ml-5">{b.items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case 'sites': return (
      <div className="grid sm:grid-cols-2 gap-3">
        {[['Launch / TOLZ sites', b.launch, 'border-blue-200 bg-blue-50', 'text-blue-700'], ['Recovery sites', b.recovery, 'border-violet-200 bg-violet-50', 'text-violet-700']].map(([t, L, c, tc]) => (
          <div key={t} className={`rounded-xl border p-3 ${c}`}><div className={`text-[11px] font-bold uppercase tracking-wide mb-1 ${tc}`}>{t}</div>
            {(L || []).length ? L.map(([n, co], i) => <div key={i} className="text-sm py-0.5"><b className="text-slate-800">{n}</b> <span className="font-mono text-xs text-slate-500">{co || '—'}</span></div>) : <div className="text-sm text-slate-500">—</div>}</div>))}
      </div>);
    case 'checklist': return (
      <div>{b.title && <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{b.title}</div>}
        <div className="grid sm:grid-cols-2 gap-1.5">{b.items.map((it, i) => { const m = { yes: ['fa-check', 'text-emerald-600 bg-emerald-50 border-emerald-200'], covered: ['fa-check', 'text-emerald-600 bg-emerald-50 border-emerald-200'], no: ['fa-xmark', 'text-amber-700 bg-amber-50 border-amber-200'], na: ['fa-minus', 'text-slate-400 bg-slate-50 border-slate-200'], open: ['fa-circle', 'text-slate-300 bg-white border-slate-200'] }[it.st] || ['fa-circle', ''];
          return <div key={i} className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${m[1]}`}><i className={`fa-solid ${m[0]} mt-1 text-xs`}></i><div className="text-slate-800">{it.label}{it.note ? <div className="text-xs text-emerald-800">Covered by: {it.note}</div> : null}</div></div>; })}</div></div>);
    case 'table': return (
      <div>{b.title && <div className="text-sm font-bold text-slate-800 mb-1">{b.title}</div>}
        <div className="overflow-x-auto border border-slate-200 rounded-xl"><table className="w-full text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr>{b.head.map((h) => <th key={h} className="text-left px-3 py-2">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 align-top whitespace-pre-wrap">{b.tel === j && c ? <a href={'tel:' + String(c).replace(/[^\d+]/g, '')} className="text-violet-700 font-semibold">{c}</a> : c}</td>)}</tr>)}</tbody></table></div></div>);
    case 'risks': return b.rows.length === 0 ? <p className="text-sm text-slate-500">No risks recorded.</p> : (
      <div className="space-y-2" data-pv-risks={b.rows.length}>{b.rows.map((r, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-3" data-pv-risk={r.ref}>
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-xs font-mono text-slate-400 pt-0.5">{r.ref}</span><b className="text-slate-800 flex-1 min-w-[10rem]">{r.hazard}</b>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: r.init.bg, color: r.init.fg }} title="Before controls">{r.init.code} {r.init.label}</span>
            <i className="fa-solid fa-arrow-right text-slate-400 text-xs pt-1"></i>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: r.res.bg, color: r.res.fg }} title="After controls">{r.res.code} {r.res.label}</span>
          </div>
          {r.risk && <p className="text-sm text-slate-600 mt-1">{r.risk}</p>}
          {(r.existing || r.extra) && <div className="mt-1.5 text-sm"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Controls</span><p className="text-slate-800 whitespace-pre-wrap">{[r.existing, r.extra].filter(Boolean).join('\n')}</p></div>}
          {r.owner && <div className="text-xs text-slate-500 mt-1">Owner: {r.owner}</div>}
        </div>))}</div>);
    case 'sigs': return (
      <div className="space-y-3">
        {b.sigs.length > 0 && <div className="grid sm:grid-cols-2 gap-3">{b.sigs.map((g, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3" data-pv-sig={g.signed ? 'signed' : 'unsigned'}>
            <div className="text-xs font-bold text-slate-700">{g.who}</div>
            <div className="text-sm text-slate-800">{g.name || '—'}{g.arn ? <span className="text-slate-500"> · ARN {g.arn}</span> : null}</div>
            <div className="h-14 flex items-end border-b border-slate-300 mt-1">{!g.signed ? <span className="text-sm text-slate-400">Not signed yet</span> : g.image ? <img src={g.image} alt="Signature" className="max-h-12" /> : g.typed ? <span className="text-2xl" style={script}>{g.typed}</span> : <span className="text-sm font-semibold text-emerald-700"><i className="fa-solid fa-fingerprint mr-1"></i>Digitally signed</span>}</div>
            <div className="text-[11px] text-slate-500 mt-1">{g.signed ? (g.date ? 'Signed ' + g.date : 'Signed') + (g.by ? ' · ' + g.by : '') : ''}</div>
          </div>))}</div>}
        {b.obs && b.obs.length > 0 && <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs font-bold text-slate-700 mb-1">{b.obsTitle || 'Observers signed on for this job'}</div>
          {b.obs.map((o, i) => <div key={i} className="flex items-center gap-3 py-1 border-t border-slate-100 first:border-0"><div className="w-28">{o.image ? <img src={o.image} alt="" className="h-8" /> : <span className="text-xl" style={script}>{o.typed || o.name}</span>}</div><div className="text-xs text-slate-600"><b className="text-slate-800">{o.name}</b> · {fmtT(o.at)}{o.note ? ' · ' + o.note : ''}</div></div>)}</div>}
      </div>);
    case 'map2d': return <div className="rounded-xl overflow-hidden border border-slate-200" data-pv-map2d="1"><div className="[&>div]:!h-[22rem] sm:[&>div]:!h-[28rem]"><JobMap s={b.s} /></div><div className="text-[11px] text-slate-500 px-3 py-1.5 bg-slate-50">Drag to move, pinch or use + / − to zoom. Hover or tap a zone or pin for its name.</div></div>;
    case 'map3d': return <Map3D doc={b.doc} checks={b.checks} />;
    case 'sub': return <div className="text-sm font-bold text-slate-800 pt-1">{b.text}</div>;
    case 'ke': return <div className="space-y-4">{b.drones.map((d) => <KeTool key={d.rpa} d={d} />)}</div>;
    default: return null;
  }
}

// the same physics as the planner's KE chart: energy at a height and ground speed, with or without air drag
const G = 9.81;
function keEnergy(d, h, v) { const fall = d.aero && d.rho > 0 && d.cd > 0 && d.area > 0 ? (() => { const vt2 = (2 * d.w * G) / (d.rho * d.area * d.cd); return vt2 * (1 - Math.exp(-(2 * G * h) / vt2)); })() : 2 * G * h; return 0.5 * d.w * (v * v + fall); }
const kph = (ms) => ms == null ? '—' : (ms * 3.6).toFixed(1) + ' kph';
function KeTool({ d }) {
  const maxH = Math.max(5, Math.ceil((d.h34 || 20) * 1.3)), maxV = Math.max(5, Math.ceil((d.s34 || 10) * 1.3));
  const [h, setH] = useState(Math.min(maxH, Math.round((d.h15 || 5) * 0.8 * 10) / 10)), [v, setV] = useState(Math.min(maxV, Math.round((d.s15 || 5) * 0.6 * 10) / 10));
  const e = keEnergy(d, h, v), band = e <= 15 ? ['≤ 15 J — no consent needed', 'bg-emerald-100 text-emerald-800 border-emerald-300'] : e <= 34 ? ['15–34 J — informed consent', 'bg-amber-100 text-amber-900 border-amber-300'] : ['Over 34 J — not permitted over people', 'bg-red-100 text-red-800 border-red-300'];
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden" data-pv-ke={d.rpa}>
      <div className="px-3 py-2 bg-slate-900 text-white flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><b>{d.rpa}</b><span className="text-white/70">{(d.w * 1000).toFixed(0)} g{d.aero ? ' · with air drag' : ''}</span>
        <span className="text-emerald-300">15 J: {d.h15 != null ? d.h15 + ' m' : '—'} hover · {kph(d.s15)} at ground</span><span className="text-amber-300">34 J: {d.h34 != null ? d.h34 + ' m' : 'not reached'} hover · {kph(d.s34)} at ground</span></div>
      <div className="p-3 grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Try a height and speed</div>
          <label className="block text-sm">Height <b>{h.toFixed(1)} m</b> ({Math.round(h * 3.281)} ft)<input type="range" min="0" max={maxH} step="0.1" value={h} onChange={(e2) => setH(parseFloat(e2.target.value))} className="w-full accent-violet-600" data-pv-ke-h="1" /></label>
          <label className="block text-sm">Ground speed <b>{v.toFixed(1)} m/s</b> ({(v * 3.6).toFixed(1)} kph)<input type="range" min="0" max={maxV} step="0.1" value={v} onChange={(e2) => setV(parseFloat(e2.target.value))} className="w-full accent-violet-600" data-pv-ke-v="1" /></label>
          <div className={`rounded-xl border-2 px-3 py-2 ${band[1]}`} data-pv-ke-e={e.toFixed(1)}><div className="text-2xl font-extrabold">{e.toFixed(1)} J</div><div className="text-sm font-semibold">{band[0]}</div></div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="text-left py-1">Height</th><th className="text-left bg-emerald-50 px-2">Max speed ≤ 15 J</th><th className="text-left bg-amber-50 px-2">Max speed ≤ 34 J</th></tr></thead>
          <tbody>{d.rows.map(([hh, a, b2], i) => { const ceil = (d.h15 != null && Math.abs(hh - d.h15) < 0.01) || (d.h34 != null && Math.abs(hh - d.h34) < 0.01);
            return <tr key={i} className={`border-t border-slate-100 ${ceil ? 'font-bold' : ''}`}><td className="py-1">{hh} m <span className="text-slate-400 text-xs">({Math.round(hh * 3.281)} ft)</span>{ceil ? <span className="text-[10px] ml-1 text-slate-500">ceiling</span> : null}</td>
              <td className="px-2 bg-emerald-50/50">{a == null ? <span className="text-red-500">—</span> : kph(a)}</td><td className="px-2 bg-amber-50/50">{b2 == null ? <span className="text-red-500">—</span> : kph(b2)}</td></tr>; })}</tbody></table>
          <p className="text-[11px] text-slate-500 mt-1">Limits rounded down. Same calculation as the planner's KE chart.</p></div>
      </div>
    </div>
  );
}

function Map3D({ doc, checks }) {
  const [on, setOn] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900" data-pv-map3d="1">
      <div className="relative h-[22rem] sm:h-[30rem]">
        {on ? <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-white/70 text-sm">Loading 3D…</div>}><div className="absolute inset-0" data-pv-3d-on="1"><Ops3D doc={doc} checks={checks} /></div></Suspense>
          : <button type="button" data-pv-3d-open="1" onClick={() => setOn(true)} className="absolute inset-0 grid place-items-center text-white"><span className="px-4 py-2 rounded-xl bg-white/15 font-semibold"><i className="fa-solid fa-cube mr-2"></i>Open the 3D view</span></button>}
      </div>
      <div className="text-[11px] text-slate-300 px-3 py-1.5">Drag to turn, right-drag to move, scroll or pinch to zoom. Zones rise to their height limits; exclusion zones are red.</div>
    </div>
  );
}

export default function PlanViewer({ model, counts = {}, onComment, commentsOpen }) {
  const groups = [];
  model.sections.forEach((s) => { let g = groups.find((x) => x.id === s.group); if (!g) { g = { id: s.group, items: [] }; groups.push(g); } g.items.push(s); });
  const go = (key) => { const el = document.getElementById('pv-' + key); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-5" data-plan-viewer="1">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-violet-700">{model.company}{model.reoc ? ' · ' + model.reoc : ''}</div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mt-0.5">{model.title}</h1>
        <div className="text-sm text-slate-500 mt-0.5">{[model.opId, model.when, model.location].filter(Boolean).join(' · ')}</div>
        <div className="flex flex-wrap gap-1.5 mt-3 sticky">{model.sections.map((s) => <button key={s.key} type="button" onClick={() => go(s.key)} data-pv-nav={s.key} className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-800">{s.title}{counts[s.key] ? <span className="ml-1 text-violet-700 font-bold">· {counts[s.key]}</span> : null}</button>)}</div>
      </div>
      {groups.map((g) => { const G = GROUPS[g.id] || ['', g.id, 'fa-file']; return (
        <div key={g.id} className="space-y-3">
          <div className="flex items-center gap-2 px-1"><i className={`fa-solid ${G[2]} text-violet-600`}></i><h2 className="text-lg font-semibold text-slate-800">{G[0] ? G[0] + ': ' : ''}{G[1]}</h2></div>
          {g.items.map((s) => (
            <section key={s.key} id={'pv-' + s.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-20" data-pv-section={s.key}>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 flex-1 min-w-0">{s.title}</h3>
                <button type="button" data-pv-comment={s.key} onClick={() => onComment(s.key)} className="text-xs font-semibold px-2.5 py-1 rounded-full border border-violet-200 text-violet-700 hover:bg-violet-50"><i className="fa-regular fa-comment mr-1"></i>{counts[s.key] ? counts[s.key] + ' · ' : ''}Comment</button>
              </div>
              <div className="p-4 space-y-4">{s.blocks.map((b, i) => <Block key={i} b={b} />)}</div>
            </section>))}
        </div>); })}
      <p className="text-center text-xs text-slate-400 pb-6">Shared from Dream Planner RPA{model.view ? ' · ' + model.view : ''}. This page updates when the plan is saved.</p>
    </div>
  );
}
