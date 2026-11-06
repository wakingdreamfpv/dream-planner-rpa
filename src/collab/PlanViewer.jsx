// v7.20: laid out like the planner itself — the side menu (Preliminary, JSA & Risk, Authorisation, Flight Log), one card per
// section with the planner's header bar, sub-headings in the planner's style, and the risk register as the planner's table.
// v7.19: the live link shows the plan in the planner's own look (read-only): cards per section, the 2D map you can pan
// and zoom, the advanced ops map in 3D you can turn, the risk register with its ratings, signatures. Only the sections of
// the chosen view are in the data (the planner leaves the rest out before it's shared).
import React, { Suspense, useEffect, useState } from 'react';
import { JobMap } from '../observer/Observer.jsx';

const Ops3D = React.lazy(() => import('../opsmap/Ops3D.jsx'));
// [menu label, menu icon, card title, card icon] — the same as the planner's side menu and section headers
const GROUPS = { 1: ['Preliminary', 'fa-circle-check', 'Section 1: Operations Overview & Preliminary Assessment', 'fa-file-lines text-blue-600'],
  2: ['JSA & Risk', 'fa-triangle-exclamation', 'Section 2: Job Safety Assessment (JSA)', 'fa-shield-halved text-slate-600'],
  3: ['Authorisation', 'fa-file-signature', 'Section 3: Approval & Flight Authorisation', 'fa-file-signature text-blue-600'],
  4: ['Flight Log', 'fa-clipboard-list', 'Section 4: Post-Flight Log', 'fa-clipboard-list text-blue-600'],
  A: ['Attachments', 'fa-paperclip', 'Appendix: Site Attachments', 'fa-paperclip text-blue-600'] };
const LMAP = { 5: 'Frequent', 4: 'Occasional', 3: 'Remote', 2: 'Improbable', 1: 'Ext. Impr.' }, CMAP = { A: 'Catastrophic', B: 'Hazardous', C: 'Moderate', D: 'Minor', E: 'Negligible' };
const TH = ({ w, bg, col, center } = {}) => ({ padding: '5px 6px', fontWeight: 700, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #94a3b8', background: bg || '#e2e8f0', color: col || '#1e293b', verticalAlign: 'middle', textAlign: center ? 'center' : 'left', ...(w ? { width: w } : {}) });
const TD = (extra = {}) => ({ padding: '4px 5px', border: '1px solid #e2e8f0', verticalAlign: 'top', fontSize: '0.72rem', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...extra });
const LC = (v, map, border, tint) => <div style={{ border: '1px solid ' + border, borderRadius: 4, background: 'white', padding: '3px 2px 2px', minHeight: '2.4rem' }}><div style={{ fontSize: '0.95rem', fontWeight: 800, color: tint, lineHeight: 1.1 }}>{v || '–'}</div><div style={{ fontSize: '0.55rem', color: '#475569', lineHeight: 1.15 }}>{map[v] || ''}</div></div>;
const Rating = (r) => <div style={{ background: r.bg, color: r.fg, fontWeight: 700, padding: '4px 2px', borderRadius: 4, fontSize: '0.7rem' }}>{r.code}<div style={{ fontSize: '0.58rem', fontWeight: 400 }}>{r.label}</div></div>;
function RiskTable({ rows }) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm" data-pv-risks={rows.length}>
      <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr><th rowSpan={2} style={TH({ w: '4%' })}>Ref</th><th rowSpan={2} style={TH({ w: '7%' })}>Date Added</th><th rowSpan={2} style={TH({ w: '10%' })}>Hazard</th><th rowSpan={2} style={TH({ w: '10%' })}>Risk Description</th><th rowSpan={2} style={TH({ w: '12%' })}>Existing Controls</th>
            <th colSpan={3} style={TH({ bg: '#c7d2fe', col: '#1e3a8a', center: true })}>Initial Risk</th><th rowSpan={2} style={TH({ w: '12%' })}>Additional Controls</th><th colSpan={3} style={TH({ bg: '#bbf7d0', col: '#14532d', center: true })}>Residual Risk</th><th rowSpan={2} style={TH({ w: '7%' })}>Risk Owner</th></tr>
          <tr>{[['#dde4fb', '#1e3a8a'], ['#dcfce7', '#14532d']].flatMap(([bg, col], g) => [['L', '6.5%'], ['C', '6.5%'], ['Rating', '5.5%']].map(([t, w]) => <th key={g + t} style={TH({ w, bg, col, center: true })}>{t}</th>))}</tr>
        </thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} data-pv-risk={r.ref} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
            <td style={TD({ textAlign: 'center', fontSize: '0.65rem' })}>{r.ref}</td><td style={TD({ fontSize: '0.62rem' })}>{r.date}</td>
            <td style={TD()}>{r.hazard}</td><td style={TD()}>{r.risk}</td><td style={TD()}>{r.existing}</td>
            <td style={TD({ background: '#eef2ff', textAlign: 'center' })}>{LC(r.iL, LMAP, '#c7d2fe', '#1e3a8a')}</td><td style={TD({ background: '#eef2ff', textAlign: 'center' })}>{LC(r.iC, CMAP, '#c7d2fe', '#1e3a8a')}</td><td style={TD({ textAlign: 'center' })}>{Rating(r.init)}</td>
            <td style={TD()}>{r.extra}</td>
            <td style={TD({ background: '#f0fdf4', textAlign: 'center' })}>{LC(r.rL, LMAP, '#86efac', '#14532d')}</td><td style={TD({ background: '#f0fdf4', textAlign: 'center' })}>{LC(r.rC, CMAP, '#86efac', '#14532d')}</td><td style={TD({ textAlign: 'center' })}>{Rating(r.res)}</td>
            <td style={TD({ fontSize: '0.65rem' })}>{r.owner}</td>
          </tr>))}</tbody>
      </table>
    </div>);
}
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
    case 'risks': return b.rows.length === 0 ? <p className="text-sm text-slate-500">No risks recorded.</p> : <RiskTable rows={b.rows} />;
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

// v7.27: one continuous page, every section one after the other; the menu jumps to a section and highlights the one
// being read, instead of switching tabs.
export default function PlanViewer({ model, counts = {}, onComment }) {
  const groups = [];
  model.sections.forEach((s) => { let g = groups.find((x) => x.id === s.group); if (!g) { g = { id: s.group, items: [] }; groups.push(g); } g.items.push(s); });
  const [tab, setTab] = useState(groups[0] ? groups[0].id : '1');
  const gCount = (g) => g.items.reduce((t, s) => t + (counts[s.key] || 0), 0);
  const scroller = () => document.querySelector('[data-plan-scroll]');
  const pick = (id) => { setTab(id); try { const el = document.getElementById('pvg-' + id), sc = scroller(); if (!el) return;
    if (sc) sc.scrollTo({ top: el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 12, behavior: 'smooth' }); else el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ok */ } };
  useEffect(() => { // highlight the section being read
    const sc = scroller() || window, on = () => { let best = groups[0] && groups[0].id; groups.forEach((g) => { const el = document.getElementById('pvg-' + g.id); if (el && el.getBoundingClientRect().top < 160) best = g.id; }); setTab(best); };
    sc.addEventListener('scroll', on, { passive: true }); return () => sc.removeEventListener('scroll', on);
  }, [model]); // eslint-disable-line
  const navBtn = (g, wide) => { const G = GROUPS[g.id] || [g.id, 'fa-file'], on = g.id === tab, n = gCount(g); return (
    <button key={g.id} type="button" data-pv-tab={g.id} onClick={() => pick(g.id)}
      className={wide ? `w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${on ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`
        : `shrink-0 flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg ${on ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>
      <i className={`fa-solid ${G[1]} ${wide ? 'text-lg w-6' : ''}`}></i> {G[0]}
      {n > 0 && <span className="ml-auto bg-violet-100 text-violet-700 py-0.5 px-2 rounded-full text-xs font-bold">{n}</span>}
    </button>); };
  return (
    <div data-plan-viewer="1">
      <div className="bg-white border-b border-slate-200 shadow-sm md:static sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-violet-700">{model.company}{model.reoc ? ' · ' + model.reoc : ''}</div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-800">{model.title}</h1>
          <div className="text-sm text-slate-500">{[model.opId, model.when, model.location].filter(Boolean).join(' · ')}</div>
        </div>
        <nav className="md:hidden flex gap-1 overflow-x-auto px-2 pb-2" data-pv-tabs-mobile="1">{groups.map((g) => navBtn(g, false))}</nav>
      </div>
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 mt-3 md:mt-8 grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-8 pb-10">
        <div className="hidden md:block md:col-span-1">
          <nav className="md:sticky md:top-4 space-y-1 bg-white p-3 rounded-xl shadow-sm border border-slate-200" data-pv-nav-side="1">{groups.map((g) => navBtn(g, true))}</nav>
        </div>
        <div className="md:col-span-3 min-w-0 space-y-6">
          {groups.map((cur) => { const G = GROUPS[cur.id] || [cur.id, 'fa-file', cur.id, 'fa-file text-blue-600']; return (
            <div key={cur.id} id={'pvg-' + cur.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden scroll-mt-4" data-pv-group={cur.id}>
              <div className="bg-slate-50 px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <i className={`fa-solid ${G[3]} text-lg`}></i><h2 className="text-lg font-semibold text-slate-800">{G[2]}</h2>
              </div>
              <div className="p-4 sm:p-6 space-y-8">
                {cur.items.map((s) => (
                  <section key={s.key} id={'pv-' + s.key} className="scroll-mt-20" data-pv-section={s.key}>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-200">
                      <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2 flex-1 min-w-0">{s.title}
                        <button type="button" data-pv-comment={s.key} onClick={() => onComment(s.key)} title="Comments on this section" className="ml-2 align-middle text-xs font-semibold px-2 py-0.5 rounded-full border border-violet-200 text-violet-700 hover:bg-violet-50"><i className="fa-regular fa-comment mr-1"></i>{counts[s.key] ? counts[s.key] : 'Comment'}</button>
                      </h3>
                    </div>
                    <div className="space-y-4">{s.blocks.map((b, i) => <Block key={i} b={b} />)}</div>
                  </section>))}
              </div>
            </div>); })}
          <p className="text-center text-xs text-slate-400 py-6">Shared from Dream Planner RPA{model.view ? ' · ' + model.view : ''}. This page updates when the plan is saved.</p>
        </div>
      </div>
    </div>
  );
}
