// Advanced ops map (v7.9): a full-screen editor for multi-zone operations (OONP direct over crowds, near-people
// buffers, clear-of-people areas, exclusion zones), flight paths with heights, points of interest with notes, and a
// PDF / image floor plan laid over the satellite map (or used on its own indoors). Zone limits come from the drone's
// kinetic energy at 15 J or 34 J and are saved per drone so they're ready next job.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KINDS, POINT_KINDS, kindStyle, emptyOpsMap, makeProj, refOf, zoneTag, zoneBuffer, zoneArea, checkOps,
  presetLimits, speedAt, keAt, simpleKe, DEFAULT_BUFFER, hasOpsContent, smoothStroke, chaikin, rdp, toKph, fromKph, fmtSpeed, autoZoneLimit,
} from './geo.js';
import { loadPdfJs } from '../cloud/Manual.jsx';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const r1 = (x) => Math.round(x * 10) / 10;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATUS = { ok: '#0f172a', warn: '#d97706', stop: '#dc2626' };
const offsetEast = (mode, ll, m) => mode === 'plan' ? [ll[0], ll[1] + m] : [ll[0], ll[1] + m / (111320 * Math.cos(ll[0] * Math.PI / 180))];
const llArr = (ll) => [ll.lat, ll.lng];

const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors';
const lbl = 'block text-[11px] font-semibold text-slate-600 mb-1';
const inp = 'w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white';

// v7.12: enter speeds in m/s or kph (remembered on this device); stored in m/s and always shown in both
function useSpeedUnit() {
  const get = () => { try { return localStorage.getItem('wd_ops_speedunit') === 'kph' ? 'kph' : 'ms'; } catch (e) { return 'ms'; } };
  const [u, setU] = useState(get);
  useEffect(() => { const h = () => setU(get()); window.addEventListener('wd-speedunit', h); return () => window.removeEventListener('wd-speedunit', h); }, []);
  const set = (v) => { try { localStorage.setItem('wd_ops_speedunit', v); } catch (e) {} setU(v); window.dispatchEvent(new Event('wd-speedunit')); };
  return [u, set];
}
const UnitToggle = ({ unit, setUnit }) => (
  <span className="inline-flex ml-1 rounded border border-slate-300 overflow-hidden align-middle" role="group" aria-label="Speed unit">
    {[['ms', 'm/s'], ['kph', 'kph']].map(([k, l]) => <button key={k} type="button" data-speed-unit={k} onClick={() => setUnit(k)} className={`px-1.5 text-[10px] font-bold ${unit === k ? 'bg-violet-700 text-white' : 'bg-white text-slate-600'}`}>{l}</button>)}
  </span>);
// a speed box: typed in the chosen unit, saved as m/s, with the other unit shown underneath
function SpeedField({ id, label, ms, onMs, disabled, placeholder }) {
  const [unit, setUnit] = useSpeedUnit();
  const shown = ms == null || ms === '' ? '' : String(unit === 'kph' ? toKph(ms) : Math.round(Number(ms) * 100) / 100);
  const [txt, setTxt] = useState(shown);
  useEffect(() => { // follow outside changes (another path, the other unit) without fighting what's being typed
    const t = parseFloat(txt), asMs = unit === 'kph' ? fromKph(t) : t;
    if (!(isFinite(t) && ms != null && ms !== '' && Math.abs(asMs - Number(ms)) < 0.02) && !(txt === '' && (ms == null || ms === ''))) setTxt(shown);
  }, [shown, unit]); // eslint-disable-line
  return (<div>
    <label className={lbl} htmlFor={id}>{label}<UnitToggle unit={unit} setUnit={setUnit} /></label>
    <input id={id} type="number" min="0" step={unit === 'kph' ? 1 : 0.5} className={inp} disabled={disabled} value={txt} placeholder={placeholder}
      onChange={(e) => { setTxt(e.target.value); const v = e.target.value; if (v === '') onMs(null); else if (isFinite(parseFloat(v))) onMs(unit === 'kph' ? fromKph(parseFloat(v)) : Math.round(parseFloat(v) * 100) / 100); }} />
    {ms != null && ms !== '' && <div className="text-[10px] text-slate-500 mt-0.5" data-speed-both={id}>{fmtSpeed(ms)}</div>}
  </div>);
}

// ── PDF / image → one JPEG for the overlay ──
async function fileToOverlay(file, page) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  let canvas;
  if (isPdf) {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const n = Math.min(Math.max(1, page || 1), pdf.numPages);
    const pg = await pdf.getPage(n);
    const v1 = pg.getViewport({ scale: 1 }), scale = Math.min(4, 2400 / Math.max(v1.width, v1.height));
    const vp = pg.getViewport({ scale });
    canvas = document.createElement('canvas'); canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    return { canvas, pages: pdf.numPages, page: n };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image could not be read.')); i.src = url; });
    const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas = document.createElement('canvas'); canvas.width = Math.round(img.naturalWidth * s); canvas.height = Math.round(img.naturalHeight * s);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas, pages: 1, page: 1 };
  } finally { URL.revokeObjectURL(url); }
}

// ── limits for a zone: tap to apply, type to add (saved against the drone) ──
function LimitPicker({ zone, setZone, drones, fleet, keFor, onSaveDroneLimits, readOnly }) {
  const [hIn, setHIn] = useState(''), [vIn, setVIn] = useState('');
  const [unit, setUnit] = useSpeedUnit();
  const drone = zone.drone || drones[0] || '';
  const E = Number(zone.energy) === 15 ? 15 : 34;
  const K = keFor(drone);
  const saved = ((fleet || {})[drone] || {}).oonpLimits || { custom: [], hidden: [] };
  const hidden = new Set(saved.hidden || []);
  const all = [...presetLimits(K, E).filter((p) => !hidden.has(p.id)), ...(saved.custom || []).filter((c) => (c.e || 34) === E)];
  const save = (next) => onSaveDroneLimits && onSaveDroneLimits(drone, { custom: next.custom || [], hidden: next.hidden || [] });
  const hN = parseFloat(hIn), vRaw = parseFloat(vIn), vN = unit === 'kph' ? fromKph(vRaw) : vRaw, valid = isFinite(hN) && isFinite(vN) && hN >= 0 && vN >= 0;
  const add = () => {
    if (!valid || readOnly) return;
    const c = { id: 'c' + uid(), h: r1(hN), v: Math.round(vN * 100) / 100, e: E };
    save({ custom: [...(saved.custom || []), c], hidden: saved.hidden });
    if (K && keAt(K, c.h, c.v) <= E + 0.05) setZone({ h: c.h, v: c.v, limitId: c.id });
    setHIn(''); setVIn('');
  };
  const drop = (c) => c.preset ? save({ custom: saved.custom, hidden: [...(saved.hidden || []), c.id] }) : save({ custom: (saved.custom || []).filter((x) => x.id !== c.id), hidden: saved.hidden });
  let preview = 'Type a height and speed, then Add. It becomes a limit you can tap, saved for ' + (drone || 'this drone') + '.', pc = 'text-slate-500';
  if (valid && K) { const k = keAt(K, hN, vN); const ok = k <= E + 0.05; preview = hN + ' m at ' + fmtSpeed(vN) + ' = ' + k.toFixed(1) + ' J ' + (ok ? '(within ' + E + ' J)' : '(over ' + E + ' J: at ' + hN + ' m the most is ' + fmtSpeed(speedAt(K, E, hN) || 0) + ')'); pc = ok ? 'text-emerald-700' : 'text-red-700'; }
  return (
    <div className="space-y-2" data-limit-picker="1">
      <div>
        <label className={lbl} htmlFor="ops-drone">Drone flying this zone</label>
        <select id="ops-drone" className={inp} value={drone} disabled={readOnly} onChange={(e) => setZone({ drone: e.target.value, limitId: null })}>
          {!drones.includes(drone) && drone && <option value={drone}>{drone}</option>}
          {drones.map((d) => <option key={d} value={d}>{d}{(fleet[d] || {}).weight ? ' · ' + Math.round(fleet[d].weight * 1000) + ' g' : ''}</option>)}
        </select>
        {!K && <p className="text-[11px] text-amber-700 mt-1">No weight for this drone in the fleet database, so limits can't be worked out. Add its weight in Database &amp; Settings.</p>}
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Energy limit">
        {[15, 34].map((e) => (
          <button key={e} type="button" disabled={readOnly} data-energy={e} onClick={() => setZone({ energy: e, limitId: null })}
            className={`${btn} flex-1 justify-center ${E === e ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-slate-300 bg-white text-slate-700'}`}>
            ≤ {e} J · {e === 15 ? 'no consent' : 'consent'}
          </button>))}
      </div>
      <div className="flex items-baseline justify-between"><span className="text-[11px] font-semibold text-slate-600">Limits saved for this drone</span><span className="text-[10px] text-slate-400">tap to apply</span></div>
      <div className="flex flex-wrap gap-1.5">
        {all.length === 0 && <span className="text-xs text-slate-400">None yet.</span>}
        {all.map((c) => {
          const k = K ? keAt(K, c.h, c.v) : null, ok = k != null && k <= E + 0.05;
          const on = zone.limitId === c.id || (!zone.limitId && Number(zone.h) === c.h && Number(zone.v) === c.v);
          return (
            <div key={c.id} data-limit-chip={c.id} className={`flex items-stretch rounded-lg border overflow-hidden ${on ? 'border-violet-600 bg-violet-50' : ok ? 'border-slate-300 bg-white' : 'border-red-300 bg-red-50'}`}>
              <button type="button" disabled={readOnly || !ok} onClick={() => setZone({ h: c.h, v: c.v, limitId: c.id })} aria-pressed={on} className="px-2 py-1 text-left">
                <div className="text-xs font-bold text-slate-800">{c.h} m · {c.v} m/s</div><div className="text-[10px] text-slate-600">{toKph(c.v)} kph</div>
                <div className={`text-[10px] ${ok ? 'text-slate-500' : 'text-red-700'}`}>{c.preset ? 'from weight' : 'yours'}{k != null ? ' · ' + k.toFixed(1) + ' J' : ''}{ok ? '' : ' · over ' + E + ' J'}</div>
              </button>
              {!readOnly && <button type="button" aria-label="Edit this limit" title="Edit" onClick={() => { setHIn(String(c.h)); setVIn(String(unit === 'kph' ? toKph(c.v) : c.v)); drop(c); }} className="px-1.5 border-l border-slate-200 text-slate-500 hover:text-slate-800"><i className="fa-solid fa-pen text-[10px]"></i></button>}
              {!readOnly && <button type="button" aria-label="Remove this limit" title="Remove" onClick={() => drop(c)} className="px-1.5 border-l border-slate-200 text-slate-500 hover:text-red-700"><i className="fa-solid fa-xmark text-[11px]"></i></button>}
            </div>);
        })}
      </div>
      {!readOnly && <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
        <div><label className={lbl} htmlFor="ops-lh">Max height (m)</label><input id="ops-lh" type="number" inputMode="decimal" min="0" step="0.5" className={inp} value={hIn} onChange={(e) => setHIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="e.g. 4" /></div>
        <div><label className={lbl} htmlFor="ops-lv">Max speed<UnitToggle unit={unit} setUnit={(u) => { if (vIn !== '' && isFinite(parseFloat(vIn)) && u !== unit) setVIn(String(u === 'kph' ? toKph(parseFloat(vIn)) : fromKph(parseFloat(vIn)))); setUnit(u); }} /></label><input id="ops-lv" type="number" inputMode="decimal" min="0" step="0.5" className={inp} value={vIn} onChange={(e) => setVIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder={unit === 'kph' ? 'e.g. 30' : 'e.g. 8'} /></div>
        <button type="button" data-limit-add="1" onClick={add} disabled={!valid} className={`${btn} border-violet-700 bg-violet-700 text-white disabled:opacity-40 h-[34px]`}>Add</button>
      </div>}
      {!readOnly && <p className={`text-[11px] ${pc}`} data-limit-preview="1">{preview}</p>}
      <div className="grid grid-cols-2 gap-2 bg-violet-50 border border-violet-200 rounded-lg p-2" data-zone-applied="1">
        <div><div className="text-[10px] text-slate-500">Max height</div><div className="text-base font-bold">{zone.h != null && zone.h !== '' ? zone.h + ' m' : '—'}</div></div>
        <div><div className="text-[10px] text-slate-500">Max speed</div><div className="text-base font-bold" data-applied-speed="1">{zone.v != null && zone.v !== '' ? zone.v + ' m/s' : '—'}</div>{zone.v != null && zone.v !== '' && <div className="text-[11px] text-slate-600">{toKph(zone.v)} kph</div>}</div>
        <div className="col-span-2 text-[11px] text-slate-600">{K && zone.h != null && zone.v != null && zone.h !== '' ? 'Impact energy ' + keAt(K, Number(zone.h), Number(zone.v)).toFixed(1) + ' J of ' + E + ' J · ' + (E === 34 ? 'informed consent needed' : 'no consent needed') : 'Pick or add a limit.'}</div>
      </div>
    </div>
  );
}

// ── side-on profile of a path: drag a point up or down to change its height ──
function Profile({ path, res, readOnly, onAlt, onPick, onStart, selPt }) {
  const svgRef = useRef(null), dragRef = useRef(null);
  if (!path || !res || !res.profile.length) return <p className="text-xs text-slate-500 p-3">Draw a flight path to see its side-on profile.</p>;
  const W = 1000, H = 170, X0 = 44, X1 = 990, Y0 = 140, Y1 = 14;
  const prof = res.profile, total = Math.max(1, res.length);
  const maxAlt = Math.max(5, ...prof.map((p) => Math.max(p.alt, p.ceil || 0, p.ground || 0)), ...(path.pts || []).map((p) => Number(p[2]) || 0)) * 1.2;
  const X = (d) => X0 + (X1 - X0) * (d / total), Y = (h) => Y0 - (Y0 - Y1) * (Math.max(0, h) / maxAlt);
  const dists = [0]; for (let i = 0; i < res.legs.length; i++) dists.push(dists[i] + res.legs[i].len);
  const groundPts = prof.map((p) => X(p.d) + ',' + Y(p.ground)).join(' ');
  const ceilSegs = []; let cur = [];
  prof.forEach((p) => { if (p.ceil != null) cur.push(X(p.d) + ',' + Y(p.ceil)); else if (cur.length) { ceilSegs.push(cur); cur = []; } }); if (cur.length) ceilSegs.push(cur);
  const exBands = prof.filter((p) => p.excl).map((p) => X(p.d));
  const toAlt = (clientY) => { const r = svgRef.current.getBoundingClientRect(); const y = ((clientY - r.top) / r.height) * H; return Math.max(0, Math.round(((Y0 - y) / (Y0 - Y1)) * maxAlt * 2) / 2); };
  const ticks = [0, maxAlt / 2, maxAlt].map((h) => Math.round(h));
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-[170px] select-none touch-none" data-ops-profile="1" role="img" aria-label="Path height against distance, with zone ceilings and ground"
      onPointerMove={(e) => { if (dragRef.current != null && !readOnly) onAlt(dragRef.current, toAlt(e.clientY)); }}
      onPointerUp={() => { dragRef.current = null; }} onPointerLeave={() => { dragRef.current = null; }}>
      <rect x={X0} y={Y1} width={X1 - X0} height={Y0 - Y1} fill="#f8fafc" />
      {exBands.map((x, i) => <rect key={i} x={x - 2} y={Y1} width="4" height={Y0 - Y1} fill="#dc2626" opacity="0.25" />)}
      <polygon points={`${X0},${Y0} ${groundPts} ${X1},${Y0}`} fill="#cbd5e1" opacity="0.7" />
      {ceilSegs.map((s, i) => <polyline key={i} points={s.join(' ')} fill="none" stroke="#16a34a" strokeWidth="2" strokeDasharray="7 5" />)}
      {ticks.map((t, i) => <g key={i}><line x1={X0} x2={X1} y1={Y(t)} y2={Y(t)} stroke="#e2e8f0" /><text x={X0 - 6} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{t} m</text></g>)}
      {res.legs.map((l, i) => { const a = path.pts[i], b = path.pts[i + 1]; return <line key={i} x1={X(dists[i])} y1={Y(Number(a[2]) || 0)} x2={X(dists[i + 1])} y2={Y(Number(b[2]) || 0)} stroke={STATUS[l.status]} strokeWidth="3.5" strokeLinecap="round" />; })}
      {(path.pts || []).map((p, i) => (
        <g key={i} style={{ cursor: readOnly ? 'default' : 'ns-resize' }} data-profile-pt={i}
          onPointerDown={(e) => { e.preventDefault(); onPick(i); if (!readOnly) { if (onStart) onStart(); dragRef.current = i; try { svgRef.current.setPointerCapture(e.pointerId); } catch (er) {} } }}>
          <circle cx={X(dists[i])} cy={Y(Number(p[2]) || 0)} r="11" fill={selPt === i ? '#ede9fe' : '#ffffff'} stroke="#0f172a" strokeWidth="2.5" />
          <text x={X(dists[i])} y={Y(Number(p[2]) || 0) + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">{i + 1}</text>
          <text x={X(dists[i])} y={H - 6} textAnchor="middle" fontSize="11" fill="#64748b">{Math.round(dists[i])} m</text>
        </g>))}
    </svg>
  );
}

export default function OpsMap({ value, onChange, onClose, center, fleet = {}, jobDrones = [], keFor: keForProp, onSaveDroneLimits, readOnly, title, airspace, viewImages = {}, onViewImage, plannedHeightM = 0, reviewer = '' }) {
  const [toast, setToast] = useState('');
  const [ackOpen, setAckOpen] = useState(null); // { key, note }
  const api3d = useRef(null), cam3d = useRef(null);
  const [viewMsg, setViewMsg] = useState('');
  const [doc, setDoc] = useState(() => value || null);
  const docRef = useRef(doc); docRef.current = doc;
  const hist = useRef([]);
  const [tool, setTool] = useState('select');
  const [zoneKind, setZoneKind] = useState('oonp');
  const [zoneShape, setZoneShape] = useState('poly');
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(draft); draftRef.current = draft;
  const [hover, setHover] = useState(null);
  const [sel, setSel] = useState(null);
  const [selPt, setSelPt] = useState(null);
  const [view, setView] = useState('2d');
  const [show, setShow] = useState({ zones: true, buffers: true, points: true, paths: true, overlay: true, airspace: true });
  const showRef = useRef(show); showRef.current = show;
  const [busy, setBusy] = useState('');
  const [scaleAsk, setScaleAsk] = useState(null);
  const [measure, setMeasure] = useState(null);
  const [panel, setPanel] = useState(true);
  const [mob, setMob] = useState(null); // small screens: 'tools' | 'details' drawer
  const mapEl = useRef(null), mapRef = useRef(null), groupRef = useRef(null), imgRef = useRef(null), fileRef = useRef(null);
  const toolRef = useRef(tool); toolRef.current = tool;
  // v7.12: flight paths are drawn freehand (press and drag) and smoothed, or clicked point by point
  const [pathMode, setPathMode] = useState(() => { try { return localStorage.getItem('wd_ops_pathmode') || 'draw'; } catch (e) { return 'draw'; } });
  const [smoothLevel, setSmoothLevel] = useState(() => { try { const v = parseInt(localStorage.getItem('wd_ops_smooth'), 10); return isFinite(v) ? v : 2; } catch (e) { return 2; } });
  useEffect(() => { try { localStorage.setItem('wd_ops_pathmode', pathMode); localStorage.setItem('wd_ops_smooth', String(smoothLevel)); } catch (e) {} }, [pathMode, smoothLevel]);
  const pathModeRef = useRef(pathMode); pathModeRef.current = pathMode;
  const [stroke, setStroke] = useState(null); // the line being drawn, as [lat, lng]
  const noClickUntil = useRef(0);

  const drones = useMemo(() => {
    const job = (jobDrones || []).filter((d) => d && d !== 'Custom');
    const rest = Object.keys(fleet || {}).filter((d) => !job.includes(d) && (fleet[d] || {}).weight > 0).sort();
    return [...job, ...rest];
  }, [jobDrones, fleet]);
  const keForRef = useRef(null);
  const keFor = useCallback((d) => {
    const viaProp = keForProp ? keForProp(d) : null;
    if (viaProp) return viaProp;
    return simpleKe(parseFloat(((fleet || {})[d] || {}).weight) || 0);
  }, [keForProp, fleet]);
  keForRef.current = keFor;

  const commit = useCallback((next) => {
    if (readOnly) return;
    if (docRef.current) { hist.current.push(docRef.current); if (hist.current.length > 60) hist.current.shift(); }
    docRef.current = next; setDoc(next); onChange && onChange(next);
  }, [onChange, readOnly]);
  const undo = useCallback(() => { const p = hist.current.pop(); if (p) { docRef.current = p; setDoc(p); onChange && onChange(p); } }, [onChange]);
  const patch = (fn) => { const d = docRef.current; if (d) commit(fn(d)); };
  const setZone = (id, ch) => patch((d) => ({ ...d, zones: d.zones.map((z) => (z.id === id ? { ...z, ...ch } : z)) }));
  // v7.12: heights and speeds come from the drone's energy (KE) table until the pilot picks or reviews them
  const autoFor = (z) => { const E = Number(z.energy) === 15 ? 15 : 34; const a = autoZoneLimit(keForRef.current(z.drone), E, plannedHeightM); return a ? { h: a.h, v: a.v, limitId: null, autoLimit: { energy: E, drone: z.drone, from: a.from, at: new Date().toISOString() }, limitReviewed: null } : null; };
  const setZoneLimits = (z, ch) => {
    if ('h' in ch || 'v' in ch) return setZone(z.id, { ...ch, autoLimit: null, limitReviewed: null }); // the pilot chose a limit
    if (('drone' in ch || 'energy' in ch) && (z.autoLimit || z.h == null || z.h === '')) { const a = autoFor({ ...z, ...ch }); if (a) { setZone(z.id, { ...ch, ...a }); setToast('Height and speed filled in from the ' + a.autoLimit.energy + ' J energy table for ' + (ch.drone || z.drone) + '. Pilot: review them.'); return; } }
    setZone(z.id, ch);
  };
  const setPath = (id, ch) => patch((d) => ({ ...d, paths: d.paths.map((p) => (p.id === id ? { ...p, ...ch } : p)) }));
  const setPoint = (id, ch) => patch((d) => ({ ...d, points: d.points.map((p) => (p.id === id ? { ...p, ...ch } : p)) }));
  const setOverlay = (ch) => patch((d) => ({ ...d, overlay: d.overlay ? { ...d.overlay, ...ch } : d.overlay }));

  const checks = useMemo(() => (doc ? checkOps(doc, keFor) : null), [doc, keFor]);
  // zones drawn before limits were filled in automatically get them now (once, when the map opens)
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoDone.current || !doc || readOnly) return; autoDone.current = true;
    const todo = (doc.zones || []).filter((z) => KINDS[z.kind] && KINDS[z.kind].limits && (z.h == null || z.h === ''));
    if (!todo.length) return;
    let n = 0; const zones = doc.zones.map((z) => { if (!todo.includes(z)) return z; const a = autoFor(z); if (!a) return z; n++; return { ...z, ...a }; });
    if (n) { commit({ ...doc, zones }); setToast('Heights and speeds filled in from the energy table for ' + n + ' zone' + (n === 1 ? '' : 's') + '. Pilot: review each one (Checks).'); }
  }, [!!doc]); // eslint-disable-line
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 9000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (sel && window.innerWidth < 1024) setMob('details'); }, [sel && sel.t, sel && sel.id]); // eslint-disable-line
  const mode = doc ? doc.mode : 'geo';
  const settings = (doc && doc.settings) || {};

  useEffect(() => { const k = (e) => {
    if (e.key === 'Escape') { if (draftRef.current) setDraft(null); else if (toolRef.current !== 'select') setTool('select'); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) { e.preventDefault(); undo(); }
    if (e.key === 'Enter' && draftRef.current && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) finishDraft();
  }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });

  // ── finish what's being drawn ──
  const finishDraft = () => {
    const d = draftRef.current; if (!d) return;
    const cur = docRef.current;
    if (d.type === 'zone') {
      if (d.shape === 'poly' && d.pts.length < 3) return;
      if (d.shape === 'circle' && !(d.r > 0)) return;
      const n = cur.zones.filter((z) => z.kind === d.kind).length + 1;
      const z = { id: uid(), kind: d.kind, shape: d.shape, name: KINDS[d.kind].label + ' ' + n, ground: 0,
        ...(d.shape === 'circle' ? { c: d.c, r: Math.round(d.r * 10) / 10 } : { pts: d.pts }),
        ...(KINDS[d.kind].limits ? { drone: drones[0] || '', energy: 34 } : {}),
        ...(d.kind === 'exclusion' ? { buffer: DEFAULT_BUFFER } : {}) };
      if (KINDS[d.kind].limits) { const a = autoFor(z); if (a) { Object.assign(z, a); setToast('Height and speed filled in from the ' + a.autoLimit.energy + ' J energy table for ' + z.drone + ' (' + a.h + ' m · ' + fmtSpeed(a.v) + '). Pilot: review them.'); } }
      commit({ ...cur, zones: [...cur.zones, z] }); setSel({ t: 'zone', id: z.id });
    } else if (d.type === 'path') {
      if (d.pts.length < 2) return;
      if (d.extend && cur.paths.some((p) => p.id === d.extend)) { commit({ ...cur, paths: cur.paths.map((p) => (p.id === d.extend ? { ...p, pts: d.pts } : p)) }); setSel({ t: 'path', id: d.extend }); setDraft(null); setTool('select'); return; }
      const n = cur.paths.length + 1;
      const p = { id: uid(), name: 'Path ' + String.fromCharCode(64 + Math.min(26, n)), drone: drones[0] || '', speed: 5, pts: d.pts };
      commit({ ...cur, paths: [...cur.paths, p] }); setSel({ t: 'path', id: p.id }); setSelPt(null);
    }
    setDraft(null); setTool('select');
  };

  // ── v7.12: views kept for the plan and the PDF ──
  // 2D: the map area on screen (re-drawn sharp in the PDF); 3D: a picture of the scene from this angle.
  const addView = () => {
    const cur = docRef.current; if (!cur || readOnly) return;
    const views = cur.views || [], id = 'v' + uid(), n = views.filter((v) => v.kind === view).length + 1;
    if (view === '2d') {
      const m = mapRef.current; if (!m) return; const bb = m.getBounds();
      commit({ ...cur, views: [...views, { id, kind: '2d', title: (cur.mode === 'plan' ? 'Floor plan view ' : 'Map view ') + n, bounds: [[bb.getSouth(), bb.getWest()], [bb.getNorth(), bb.getEast()]], at: new Date().toISOString() }] });
    } else {
      const api = api3d.current; if (!api) { setViewMsg('The 3D view is still loading.'); return; }
      const src = api.capture();
      if (onViewImage) onViewImage(id, src);
      commit({ ...cur, views: [...views, { id, kind: '3d', title: '3D view ' + n, camera: api.camera(), at: new Date().toISOString() }] });
    }
    setViewMsg((view === '2d' ? 'Map view' : '3D view') + ' added. It prints in the PDF under the advanced ops map.'); setSel(null);
  };
  const showView = (v) => {
    if (v.kind === '2d') { if (view !== '2d') { setView('2d'); setTimeout(() => { const m = mapRef.current; if (m) m.fitBounds(v.bounds, { animate: false }); }, 250); } else if (mapRef.current) mapRef.current.fitBounds(v.bounds); }
    else { cam3d.current = v.camera; if (view !== '3d') setView('3d'); else if (api3d.current) api3d.current.setCamera(v.camera); }
  };
  const retakeView = (v) => {
    const cur = docRef.current;
    if (v.kind === '2d') { const m = mapRef.current; if (!m || view !== '2d') { setViewMsg('Switch to 2D, frame the map, then press Retake.'); return; } const bb = m.getBounds(); commit({ ...cur, views: cur.views.map((x) => x.id === v.id ? { ...x, bounds: [[bb.getSouth(), bb.getWest()], [bb.getNorth(), bb.getEast()]], at: new Date().toISOString() } : x) }); }
    else { const api = api3d.current; if (!api || view !== '3d') { setViewMsg('Switch to 3D, turn it to the angle you want, then press Retake.'); return; } if (onViewImage) onViewImage(v.id, api.capture()); commit({ ...cur, views: cur.views.map((x) => x.id === v.id ? { ...x, camera: api.camera(), at: new Date().toISOString() } : x) }); }
    setViewMsg('View updated.');
  };
  const setViews = (fn) => patch((d) => ({ ...d, views: fn(d.views || []) }));

  // ── start: outdoor (satellite) or indoor (floor plan only) ──
  const start = (m) => { const d = emptyOpsMap(m); docRef.current = d; setDoc(d); onChange && onChange(d); };

  // ── Leaflet ──
  useEffect(() => {
    if (!doc || view !== '2d' || !mapEl.current || !window.L) return;
    const L = window.L;
    const plan = doc.mode === 'plan';
    const m = L.map(mapEl.current, plan
      ? { crs: L.CRS.Simple, minZoom: -3, maxZoom: 7, zoomSnap: 0.25, doubleClickZoom: false, attributionControl: false }
      : { maxZoom: 22, doubleClickZoom: false, zoomControl: true });
    mapRef.current = m;
    if (!plan) {
      let ok = 0, err = 0, sw = false;
      const g = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}', { subdomains: ['0', '1', '2', '3'], attribution: 'Imagery © Google', maxZoom: 22, maxNativeZoom: 21 }).addTo(m);
      g.on('tileload', () => { ok++; });
      g.on('tileerror', () => { err++; if (!sw && ok === 0 && err >= 4) { sw = true; m.removeLayer(g); L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Imagery © Esri', maxZoom: 22, maxNativeZoom: 19 }).addTo(m); } });
    }
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);
    const pane = m.createPane('wdPlan'); pane.style.zIndex = 350; pane.style.pointerEvents = 'none';
    const img = document.createElement('img'); img.className = 'leaflet-zoom-animated'; img.alt = ''; img.draggable = false;
    img.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;user-select:none;'; pane.appendChild(img); imgRef.current = img;
    groupRef.current = L.layerGroup().addTo(m);
    // first view: everything drawn, else the plan overlay, else the job location
    const d = docRef.current, ref = refOf(d);
    const all = [];
    d.zones.forEach((z) => { if (z.shape === 'circle') { all.push(z.c); } else all.push(...z.pts); });
    d.paths.forEach((p) => all.push(...p.pts.map((q) => [q[0], q[1]]))); d.points.forEach((p) => all.push([p.lat, p.lng]));
    if (d.overlay) { const o = d.overlay, prj = makeProj(d.mode, o.center), hw = o.widthM / 2, hh = (o.widthM * (o.aspect || 1)) / 2; [[-hw, -hh], [hw, hh]].forEach(([x, y]) => all.push(prj.from({ x, y }))); }
    if (all.length > 1) m.fitBounds(L.latLngBounds(all).pad(0.15), { maxZoom: plan ? 4 : 20 });
    else if (ref) m.setView(ref, plan ? 2 : 19);
    else if (plan) m.setView([0, 0], 2);
    else m.setView(center ? [center.lat, center.lng] : [-27.4698, 153.0251], center ? 18 : 12);
    m.on('click', (e) => onMapClick(e.latlng));
    m.on('dblclick', () => finishDraft());
    m.on('mousemove', (e) => { if (draftRef.current) setHover(llArr(e.latlng)); });
    m.on('zoomend viewreset resize', () => { placeOverlay(); setTick((t) => t + 1); });
    m.on('zoomanim', (e) => placeOverlay(e));
    setTimeout(() => { m.invalidateSize(); placeOverlay(); setTick((t) => t + 1); }, 60);
    return () => { m.remove(); mapRef.current = null; groupRef.current = null; imgRef.current = null; };
  }, [doc ? doc.mode : null, view, !!doc]); // eslint-disable-line
  const [tick, setTick] = useState(0);

  const ppm = () => { const m = mapRef.current; if (!m) return 1; const c = m.getCenter(), mo = docRef.current.mode; const a = m.latLngToLayerPoint(c), b = m.latLngToLayerPoint(offsetEast(mo, llArr(c), 100)); return Math.hypot(b.x - a.x, b.y - a.y) / 100; };
  const placeOverlay = (anim) => {
    const m = mapRef.current, img = imgRef.current, d = docRef.current; if (!m || !img || !d) return;
    const o = d.overlay;
    if (!o || !o.src || !showRef.current.overlay) { img.style.display = 'none'; return; }
    if (img.getAttribute('src') !== o.src) img.setAttribute('src', o.src);
    img.style.display = ''; img.style.opacity = String((o.opacity == null ? 60 : o.opacity) / 100);
    const c = o.center;
    const p = anim ? m._latLngToNewLayerPoint(window.L.latLng(c), anim.zoom, anim.center) : m.latLngToLayerPoint(c);
    const a = m.latLngToLayerPoint(c), b = m.latLngToLayerPoint(offsetEast(d.mode, c, 100));
    let wpx = (Math.hypot(b.x - a.x, b.y - a.y) / 100) * o.widthM; if (anim) wpx *= m.getZoomScale(anim.zoom, m.getZoom());
    const hpx = wpx * (o.aspect || 1);
    img.style.width = wpx + 'px'; img.style.height = hpx + 'px';
    img.style.transform = `translate(${p.x}px,${p.y}px) rotate(${o.rot || 0}deg) translate(${-wpx / 2}px,${-hpx / 2}px)`;
  };
  useEffect(() => { placeOverlay(); }); // after every render (cheap)

  // map clicks by tool
  const onMapClick = (latlng) => {
    if (readOnly || Date.now() < noClickUntil.current) return;
    const t = toolRef.current, ll = llArr(latlng), d = draftRef.current, cur = docRef.current;
    if (t === 'select') { setSel(null); setSelPt(null); return; }
    if (t === 'zone') {
      const shape = zoneShapeRef.current, kind = zoneKindRef.current;
      if (shape === 'circle') {
        if (!d) setDraft({ type: 'zone', shape, kind, c: ll, r: 0 });
        else { const r = makeProj(cur.mode, d.c).dist(d.c, ll); setDraft(null); draftRef.current = { ...d, r }; finishDraft(); }
        return;
      }
      if (d && d.pts.length >= 3) { const m = mapRef.current, a = m.latLngToContainerPoint(d.pts[0]), b = m.latLngToContainerPoint(ll); if (Math.hypot(a.x - b.x, a.y - b.y) < 14) { finishDraft(); return; } }
      setDraft(d ? { ...d, pts: [...d.pts, ll] } : { type: 'zone', shape, kind, pts: [ll] }); return;
    }
    if (t === 'path') {
      if (pathModeRef.current === 'draw' || Date.now() < noClickUntil.current) return; // drawn with press-and-drag instead
      const alt = d && d.pts.length ? d.pts[d.pts.length - 1][2] : 0;
      const nextAlt = d ? (d.pts.length === 1 ? 5 : alt) : 0;
      setDraft(d ? { ...d, pts: [...d.pts, [ll[0], ll[1], nextAlt]] } : { type: 'path', pts: [[ll[0], ll[1], 0]] }); return;
    }
    if (POINT_KINDS[t]) {
      const n = cur.points.filter((p) => p.kind === t).length + 1;
      const p = { id: uid(), kind: t, lat: ll[0], lng: ll[1], title: t === 'tlz' ? 'TLZ' + (n > 1 ? ' ' + n : '') : t === 'elz' ? 'E-LZ' + (n > 1 ? ' ' + n : '') : t === 'poi' ? 'Caution' : 'Note', text: '', size: t === 'tlz' ? 5 : t === 'elz' ? 4 : undefined };
      commit({ ...cur, points: [...cur.points, p] }); setSel({ t: 'point', id: p.id }); setTool('select'); return;
    }
    if (t === 'measure' || t === 'scale') {
      if (!d) { setDraft({ type: t, pts: [ll] }); setMeasure(null); return; }
      const dist = makeProj(cur.mode, d.pts[0]).dist(d.pts[0], ll);
      setDraft(null); setTool('select');
      if (t === 'measure') setMeasure({ a: d.pts[0], b: ll, d: dist });
      else setScaleAsk({ a: d.pts[0], b: ll, d: dist, real: '' });
    }
  };
  const zoneKindRef = useRef(zoneKind); zoneKindRef.current = zoneKind;
  const zoneShapeRef = useRef(zoneShape); zoneShapeRef.current = zoneShape;

  // ── freehand drawing of a flight path ──
  useEffect(() => {
    const m = mapRef.current, el = mapEl.current;
    if (!m || !el || view !== '2d' || readOnly || tool !== 'path' || pathMode !== 'draw') return;
    m.dragging.disable(); const ta = el.style.touchAction; el.style.touchAction = 'none';
    let pts = null, pid = null, raf = 0;
    const cp = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const toLL = (q) => llArr(m.containerPointToLatLng([q.x, q.y]));
    const show = () => { raf = 0; if (pts) setStroke(pts.map(toLL)); };
    const down = (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest && e.target.closest('.leaflet-control, .leaflet-marker-icon, button, a')) return;
      e.preventDefault(); e.stopPropagation(); pid = e.pointerId; try { el.setPointerCapture(pid); } catch (er) {}
      pts = [cp(e)]; setStroke([toLL(pts[0])]);
    };
    const move = (e) => {
      if (!pts || e.pointerId !== pid) return; e.preventDefault();
      const q = cp(e), l = pts[pts.length - 1]; if (Math.hypot(q.x - l.x, q.y - l.y) < 2) return;
      pts.push(q); if (!raf) raf = requestAnimationFrame(show);
    };
    const up = (e) => {
      if (!pts || e.pointerId !== pid) return;
      const raw = pts; pts = null; pid = null; noClickUntil.current = Date.now() + 450; setStroke(null);
      const len = raw.reduce((t, q, i) => (i ? t + Math.hypot(q.x - raw[i - 1].x, q.y - raw[i - 1].y) : 0), 0);
      if (raw.length < 3 || len < 12) return; // a tap, not a line
      const sm = smoothStroke(raw, smoothLevel).map(toLL);
      const cur = docRef.current, d = draftRef.current, base = d && d.extend ? (cur.paths.find((p) => p.id === d.extend) || {}).pts || [] : [];
      const prj = makeProj(cur.mode, sm[0]), alt = base.length ? Number(base[base.length - 1][2]) || 5 : 5;
      const back = !base.length && prj.dist(sm[0], sm[sm.length - 1]) < 12; // drawn back to where it started: lands there
      const next = sm.map((q, i) => [q[0], q[1], !base.length && i === 0 ? 0 : back && i === sm.length - 1 ? 0 : alt]);
      draftRef.current = { type: 'path', pts: [...base, ...(base.length ? next.slice(1) : next)], extend: d && d.extend };
      finishDraft();
    };
    el.addEventListener('pointerdown', down, true); el.addEventListener('pointermove', move, true); el.addEventListener('pointerup', up, true); el.addEventListener('pointercancel', up, true);
    return () => { if (raf) cancelAnimationFrame(raf); el.removeEventListener('pointerdown', down, true); el.removeEventListener('pointermove', move, true); el.removeEventListener('pointerup', up, true); el.removeEventListener('pointercancel', up, true);
      el.style.touchAction = ta; try { m.dragging.enable(); } catch (e) {} setStroke(null); };
  }, [tool, pathMode, smoothLevel, view, readOnly, doc ? doc.mode : null]); // eslint-disable-line

  // smooth / thin an existing path (heights are smoothed with it)
  const smoothPath = (path, how) => {
    const prj = makeProj(docRef.current.mode, [path.pts[0][0], path.pts[0][1]]);
    let q = path.pts.map((p) => ({ ...prj.to(p), z: Number(p[2]) || 0 }));
    q = how === 'thin' ? rdp(q, 1.5) : rdp(chaikin(q, 1), 0.3);
    setPath(path.id, { pts: q.map((v) => { const ll = prj.from(v); return [ll[0], ll[1], Math.round(v.z * 2) / 2]; }) });
  };

  // ── draw everything ──
  useEffect(() => {
    const m = mapRef.current, g = groupRef.current, L = window.L; if (!m || !g || !doc) return;
    g.clearLayers();
    const px = ppm();
    const pick = (t, id) => (e) => { if (toolRef.current !== 'select') return; L.DomEvent.stopPropagation(e); setSel({ t, id }); setSelPt(null); };
    const vtx = (ll, onMove, title, onCtx) => {
      const mk = L.marker(ll, { draggable: !readOnly, icon: L.divIcon({ className: '', html: '<div style="width:12px;height:12px;background:#fff;border:2px solid #0f172a;border-radius:2px;margin:-6px 0 0 -6px"></div>', iconSize: [0, 0] }), title, zIndexOffset: 1000 });
      mk.on('dragend', (e) => onMove(llArr(e.target.getLatLng())));
      if (onCtx) mk.on('contextmenu', (e) => { L.DomEvent.preventDefault(e); onCtx(); });
      mk.addTo(g); return mk;
    };
    const selZone = sel && sel.t === 'zone' ? sel.id : null, selPath = sel && sel.t === 'path' ? sel.id : null;
    // v7.10: airspace from openAIP (outdoor only), drawn under everything as outlines
    if (show.airspace && doc.mode !== 'plan' && (airspace || []).length) airspace.forEach((a) => {
      const ctl = a.cls && a.cls !== 'G' && !a.special;
      if (!ctl && !a.special) return;
      const lay = L.geoJSON(a.geometry, { interactive: true, style: { color: a.special ? '#be185d' : '#1d4ed8', weight: 2, dashArray: a.special ? '4 4' : '10 6', fill: a.special, fillOpacity: 0.05 } });
      lay.bindTooltip(esc((a.cls ? 'Class ' + a.cls + ' · ' : '') + a.type + ' ' + a.name) + '<br>' + esc(a.lower + ' to ' + a.upper), { sticky: true, className: 'wd-ops-tag' });
      lay.addTo(g);
    });
    if (show.zones) {
      // fly zones first, exclusion on top
      const order = [...doc.zones].sort((a, b) => (a.kind === 'exclusion') - (b.kind === 'exclusion'));
      order.forEach((z) => {
        const k = kindStyle(z.kind, settings), on = z.id === selZone;
        const st = { color: k.stroke, weight: on ? 4 : 2.5, fillColor: k.color, fillOpacity: k.fill, dashArray: z.kind === 'near' ? '8 6' : null };
        const buf = zoneBuffer(z);
        if (show.buffers && z.kind === 'exclusion' && buf > 0) {
          if (z.shape === 'circle') L.circle(z.c, { radius: z.r + buf, color: '#d97706', weight: 2, dashArray: '10 7', fillColor: '#f59e0b', fillOpacity: 0.1, interactive: false }).addTo(g);
          else if (z.pts.length > 2) { L.polygon(z.pts, { fill: false, color: '#f59e0b', opacity: 0.22, weight: Math.max(2, 2 * buf * px), lineJoin: 'round', lineCap: 'round', interactive: false }).addTo(g); }
        }
        const lay = z.shape === 'circle' ? L.circle(z.c, { radius: z.r, ...st }) : L.polygon(z.pts, st);
        lay.on('click', pick('zone', z.id)); lay.addTo(g);
        lay.bindTooltip(esc(z.name) + '<br><b>' + esc(zoneTag(z, settings)) + '</b>', { permanent: true, direction: 'center', className: 'wd-ops-tag' });
        if (on && !readOnly && tool === 'select') {
          if (z.shape === 'circle') {
            vtx(z.c, (ll) => setZone(z.id, { c: ll }), 'Drag to move');
            const edge = offsetEast(doc.mode, z.c, z.r);
            vtx(edge, (ll) => setZone(z.id, { r: Math.round(makeProj(doc.mode, z.c).dist(z.c, ll) * 10) / 10 }), 'Drag to resize');
          } else {
            z.pts.forEach((p, i) => vtx(p, (ll) => setZone(z.id, { pts: z.pts.map((q, j) => (j === i ? ll : q)) }), 'Drag to move · right-click to delete',
              z.pts.length > 3 ? () => setZone(z.id, { pts: z.pts.filter((q, j) => j !== i) }) : null));
            // midpoints: drag to add a corner
            z.pts.forEach((p, i) => { const q = z.pts[(i + 1) % z.pts.length]; const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
              const mk = L.marker(mid, { draggable: true, opacity: 0.6, icon: L.divIcon({ className: '', html: '<div style="width:10px;height:10px;background:#ede9fe;border:2px solid #6d28d9;border-radius:50%;margin:-5px 0 0 -5px"></div>', iconSize: [0, 0] }), title: 'Drag to add a corner' });
              mk.on('dragend', (e) => { const n = [...z.pts]; n.splice(i + 1, 0, llArr(e.target.getLatLng())); setZone(z.id, { pts: n }); }); mk.addTo(g); });
          }
        }
      });
    }
    if (show.points) doc.points.forEach((p) => {
      const on = sel && sel.t === 'point' && sel.id === p.id;
      let html;
      if (p.kind === 'tlz') { const s = Math.max(14, (Number(p.size) || 5) * px); html = `<div style="width:${s}px;height:${s}px;margin:${-s / 2}px 0 0 ${-s / 2}px;background:#0f172a;border:3px solid ${on ? '#a78bfa' : '#fff'};box-sizing:border-box"></div><div style="position:absolute;left:${-30}px;top:${s / 2 + 2}px;width:60px;text-align:center;font:800 11px Inter,sans-serif;color:#0f172a;text-shadow:0 0 3px #fff,0 0 3px #fff">${esc(p.title || 'TLZ')}</div>`; }
      else if (p.kind === 'elz') { const s = Math.max(28, (Number(p.size) || 4) * 2 * px); html = `<div style="width:${s}px;height:${s}px;margin:${-s / 2}px 0 0 ${-s / 2}px;border-radius:50%;background:#ea580c;border:3px solid ${on ? '#a78bfa' : '#fff'};box-sizing:border-box;display:flex;align-items:center;justify-content:center;font:800 10px Inter,sans-serif;color:#fff">${esc(p.title || 'E-LZ')}</div>`; }
      else if (p.kind === 'poi') html = `<div style="margin:-26px 0 0 -14px;width:28px;height:26px;position:relative"><svg width="28" height="26" viewBox="0 0 28 26"><path d="M14 2 L26 24 L2 24 Z" fill="#facc15" stroke="${on ? '#6d28d9' : '#0f172a'}" stroke-width="2.5" stroke-linejoin="round"/><text x="14" y="21" text-anchor="middle" font-size="14" font-weight="900" font-family="Inter,sans-serif" fill="#0f172a">!</text></svg></div>`
        + `<div style="position:absolute;left:18px;top:-30px;min-width:120px;max-width:220px;background:#fff;border:1.5px solid #0f172a;border-radius:6px;padding:4px 7px;font:12px/1.3 Inter,sans-serif;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,.2);white-space:pre-wrap"><b>${esc(p.title || 'Caution')}</b>${p.text ? '<br>' + esc(p.text) : ''}</div>`;
      else html = `<div style="position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #0f172a"></div><div style="position:absolute;left:10px;top:-14px;min-width:100px;max-width:220px;background:#ffffffee;border:1.5px solid ${on ? '#6d28d9' : '#64748b'};border-radius:6px;padding:4px 7px;font:12px/1.3 Inter,sans-serif;color:#0f172a;white-space:pre-wrap"><b>${esc(p.title || 'Note')}</b>${p.text ? '<br>' + esc(p.text) : ''}</div>`;
      const mk = L.marker([p.lat, p.lng], { draggable: !readOnly && tool === 'select', icon: L.divIcon({ className: 'wd-ops-pt', html, iconSize: [0, 0] }), title: POINT_KINDS[p.kind].label });
      mk.on('click', pick('point', p.id)); mk.on('dragend', (e) => { const ll = e.target.getLatLng(); setPoint(p.id, { lat: ll.lat, lng: ll.lng }); });
      mk.addTo(g);
    });
    if (show.paths) doc.paths.forEach((path) => {
      const res = checks && checks.paths[path.id], on = path.id === selPath;
      path.pts.slice(0, -1).forEach((a, i) => {
        const b = path.pts[i + 1], stt = res && res.legs[i] ? res.legs[i].status : 'ok';
        L.polyline([a, b], { color: '#ffffff', weight: on ? 10 : 8, opacity: 0.9, interactive: false }).addTo(g);
        const ln = L.polyline([a, b], { color: STATUS[stt], weight: on ? 5 : 4, dashArray: stt === 'warn' ? '10 6' : null });
        ln.on('click', pick('path', path.id)); ln.addTo(g);
        if (res && res.legs[i] && res.legs[i].msgs.length) ln.bindTooltip(res.legs[i].msgs.map((q) => esc(q.text)).join('<br>'));
      });
      path.pts.forEach((p, i) => {
        const html = `<div style="margin:-11px 0 0 -11px;width:22px;height:22px;border-radius:50%;background:${on && selPt === i ? '#ede9fe' : '#fff'};border:2.5px solid #0f172a;font:700 11px/17px Inter,sans-serif;text-align:center;color:#0f172a">${i + 1}</div>`
          + `<div style="position:absolute;left:12px;top:-20px;font:700 10px Inter,sans-serif;color:#0f172a;background:#ffffffd9;border-radius:4px;padding:0 3px;white-space:nowrap">${r1(Number(p[2]) || 0)} m</div>`;
        const mk = L.marker([p[0], p[1]], { draggable: on && !readOnly && tool === 'select', icon: L.divIcon({ className: '', html, iconSize: [0, 0] }), zIndexOffset: 900 });
        mk.on('click', (e) => { if (toolRef.current !== 'select') return; L.DomEvent.stopPropagation(e); setSel({ t: 'path', id: path.id }); setSelPt(i); });
        mk.on('dragend', (e) => { const ll = e.target.getLatLng(); setPath(path.id, { pts: path.pts.map((q, j) => (j === i ? [ll.lat, ll.lng, q[2]] : q)) }); });
        if (on && !readOnly && path.pts.length > 2) mk.on('contextmenu', (e) => { L.DomEvent.preventDefault(e); setPath(path.id, { pts: path.pts.filter((q, j) => j !== i) }); });
        mk.addTo(g);
      });
    });
    // overlay handles
    if (doc.overlay && sel && sel.t === 'overlay' && !doc.overlay.locked && !readOnly) {
      const o = doc.overlay, prj = makeProj(doc.mode, o.center), r = ((o.rot || 0) * Math.PI) / 180;
      const mv = L.marker(o.center, { draggable: true, icon: L.divIcon({ className: '', html: '<div style="margin:-16px 0 0 -16px;width:32px;height:32px;border-radius:50%;background:#6d28d9;color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"><i class="fa-solid fa-up-down-left-right"></i></div>', iconSize: [0, 0] }), title: 'Drag to move the plan', zIndexOffset: 2000 });
      mv.on('drag', (e) => { docRef.current = { ...docRef.current, overlay: { ...docRef.current.overlay, center: llArr(e.target.getLatLng()) } }; placeOverlay(); });
      mv.on('dragend', (e) => setOverlay({ center: llArr(e.target.getLatLng()) }));
      mv.addTo(g);
      // v7.12: drag a corner to resize (keeps the shape, about the centre); drag the knob above the top edge to turn it
      const hw = o.widthM / 2, hh = (o.widthM * (o.aspect || 1)) / 2, diag = Math.hypot(hw, hh);
      const at = (a, b) => prj.from({ x: a * Math.cos(r) - b * Math.sin(r), y: -(a * Math.sin(r) + b * Math.cos(r)) }); // image frame (x right, y down) → map
      const live = (ch) => { docRef.current = { ...docRef.current, overlay: { ...docRef.current.overlay, ...ch } }; placeOverlay(); };
      const sizeFrom = (ll) => { const v = prj.to(ll); return { widthM: Math.max(1, Math.round(o.widthM * (Math.hypot(v.x, v.y) / diag) * 10) / 10) }; };
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
        const ck = L.marker(at(sx * hw, sy * hh), { draggable: true, icon: L.divIcon({ className: '', html: '<div data-ops-corner="' + i + '" style="margin:-9px 0 0 -9px;width:18px;height:18px;background:#fff;border:3px solid #6d28d9;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:nwse-resize"></div>', iconSize: [0, 0] }), title: 'Drag to resize the plan', zIndexOffset: 2000 });
        ck.on('drag', (e) => live(sizeFrom(llArr(e.target.getLatLng()))));
        ck.on('dragend', (e) => setOverlay(sizeFrom(llArr(e.target.getLatLng()))));
        ck.addTo(g);
      });
      const knobOff = hh + Math.max(4, 28 / Math.max(0.01, px)); // a little above the top edge
      const rs = L.marker(at(0, -knobOff), { draggable: true, icon: L.divIcon({ className: '', html: '<div data-ops-rotate="1" style="margin:-14px 0 0 -14px;width:28px;height:28px;border-radius:50%;background:#fff;color:#6d28d9;display:flex;align-items:center;justify-content:center;border:2px solid #6d28d9;box-shadow:0 1px 4px rgba(0,0,0,.4)"><i class="fa-solid fa-rotate"></i></div>', iconSize: [0, 0] }), title: 'Drag to turn the plan', zIndexOffset: 2000 });
      const rotFrom = (ll) => { const v = prj.to(ll); return { rot: Math.round(((Math.atan2(v.x, v.y) * 180) / Math.PI) * 10) / 10 }; };
      rs.on('drag', (e) => live(rotFrom(llArr(e.target.getLatLng()))));
      rs.on('dragend', (e) => setOverlay(rotFrom(llArr(e.target.getLatLng()))));
      rs.addTo(g);
    }
    // drawing in progress
    if (draft) {
      const pts = draft.pts || [], h = hover;
      if (draft.type === 'zone' && draft.shape === 'circle' && draft.c) {
        const r = h ? makeProj(doc.mode, draft.c).dist(draft.c, h) : 0; const k = kindStyle(draft.kind, settings);
        L.circle(draft.c, { radius: r, color: k.stroke, dashArray: '6 5', fillColor: k.color, fillOpacity: 0.15, interactive: false }).addTo(g);
        if (h) L.tooltip({ permanent: true, direction: 'right', className: 'wd-ops-tag' }).setLatLng(h).setContent(r1(r) + ' m radius').addTo(g);
      } else if (pts.length) {
        const k = draft.type === 'zone' ? kindStyle(draft.kind, settings) : { stroke: draft.type === 'path' ? '#0f172a' : '#6d28d9' };
        const line = h ? [...pts.map((p) => [p[0], p[1]]), h] : pts.map((p) => [p[0], p[1]]);
        L.polyline(line, { color: k.stroke, weight: 3, dashArray: '6 5', interactive: false }).addTo(g);
        pts.forEach((p) => L.circleMarker([p[0], p[1]], { radius: 5, color: k.stroke, fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false }).addTo(g));
        if (h && (draft.type === 'measure' || draft.type === 'scale')) L.tooltip({ permanent: true, direction: 'right', className: 'wd-ops-tag' }).setLatLng(h).setContent(r1(makeProj(doc.mode, pts[0]).dist(pts[0], h)) + ' m').addTo(g);
      }
    }
    if (stroke && stroke.length > 1) L.polyline(stroke, { color: '#6d28d9', weight: 4, opacity: 0.85, interactive: false }).addTo(g);
    if (measure) {
      L.polyline([measure.a, measure.b], { color: '#6d28d9', weight: 3, dashArray: '4 4', interactive: false }).addTo(g);
      L.tooltip({ permanent: true, direction: 'top', className: 'wd-ops-tag' }).setLatLng(measure.b).setContent(r1(measure.d) + ' m').addTo(g);
    }
  }, [doc, sel, selPt, draft, hover, show, tool, checks, measure, tick, readOnly, airspace, stroke]); // eslint-disable-line

  // cursor
  useEffect(() => { if (mapEl.current) mapEl.current.style.cursor = tool === 'select' ? '' : 'crosshair'; }, [tool]);

  // ── overlay file ──
  const loadOverlay = async (file, page) => {
    if (!file || readOnly) return;
    setBusy('Reading the plan…');
    try {
      const r = await fileToOverlay(file, page);
      let q = 0.78, src = r.canvas.toDataURL('image/jpeg', q);
      while (src.length > 1600000 && q > 0.4) { q -= 0.12; src = r.canvas.toDataURL('image/jpeg', q); }
      const aspect = r.canvas.height / r.canvas.width, cur = docRef.current, m = mapRef.current;
      let center = cur.overlay ? cur.overlay.center : null, widthM = cur.overlay ? cur.overlay.widthM : null;
      if (!center) {
        if (m) { const c = m.getCenter(); center = llArr(c); const b = m.getBounds(); const pj = makeProj(cur.mode, center), vw = pj.dist([c.lat, b.getWest()], [c.lat, b.getEast()]), vh = pj.dist([b.getSouth(), c.lng], [b.getNorth(), c.lng]); widthM = Math.min(vw, vh / aspect) * 0.7; /* fits on screen, corners included */ }
        else { center = [0, 0]; widthM = 100; }
        if (cur.mode === 'plan' && !cur.overlay) { center = [0, 0]; widthM = 100; }
      }
      commit({ ...cur, overlay: { src, name: file.name, page: r.page, pages: r.pages, aspect, center, widthM: Math.round(widthM * 10) / 10, rot: cur.overlay ? cur.overlay.rot || 0 : 0, opacity: cur.overlay ? cur.overlay.opacity : 60, locked: false } });
      setSel({ t: 'overlay' });
      if (cur.mode === 'plan' && m) setTimeout(() => { const o = docRef.current.overlay; const prj = makeProj('plan'); const hw = o.widthM / 2, hh = (o.widthM * o.aspect) / 2; m.fitBounds([prj.from({ x: -hw, y: -hh }), prj.from({ x: hw, y: hh })]); }, 50);
      fileRef.current && (fileRef.current.value = '');
      fileRef.current && (fileRef.current._file = file);
    } catch (e) { alert('Could not use that file: ' + (e.message || e)); }
    setBusy('');
  };

  const delSel = () => {
    if (!sel || readOnly) return;
    if (sel.t === 'zone') patch((d) => ({ ...d, zones: d.zones.filter((z) => z.id !== sel.id) }));
    if (sel.t === 'path') patch((d) => ({ ...d, paths: d.paths.filter((p) => p.id !== sel.id) }));
    if (sel.t === 'point') patch((d) => ({ ...d, points: d.points.filter((p) => p.id !== sel.id) }));
    if (sel.t === 'overlay') patch((d) => ({ ...d, overlay: null }));
    setSel(null);
  };

  // ── start screen ──
  if (!doc) return (
    <div className="fixed inset-0 z-[4800] bg-slate-900/70 flex items-center justify-center p-4" data-opsmap="start">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4">
        <div className="flex items-start gap-3"><h3 className="text-lg font-bold flex-1">Advanced ops map</h3><button type="button" onClick={onClose} aria-label="Close" className="text-slate-500 text-xl px-2"><i className="fa-solid fa-xmark"></i></button></div>
        <p className="text-sm text-slate-600">Draw exclusion, over-people, near-people and clear zones with their own height and speed limits, plan flight paths with heights, mark take-off, emergency landing and cautions, and lay a venue PDF over the map.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <button type="button" data-ops-start="geo" onClick={() => start('geo')} className="text-left border-2 border-slate-200 hover:border-violet-500 rounded-xl p-4"><div className="font-bold"><i className="fa-solid fa-earth-oceania mr-2 text-violet-700"></i>Outdoor</div><div className="text-xs text-slate-500 mt-1">Satellite map at the job location. Lay a site plan over it if you have one.</div></button>
          <button type="button" data-ops-start="plan" onClick={() => start('plan')} className="text-left border-2 border-slate-200 hover:border-violet-500 rounded-xl p-4"><div className="font-bold"><i className="fa-solid fa-building mr-2 text-violet-700"></i>Indoor / floor plan</div><div className="text-xs text-slate-500 mt-1">No GPS map: work on the venue's floor plan, set to scale with a known distance.</div></button>
        </div>
      </div>
    </div>);

  const selZone = sel && sel.t === 'zone' ? doc.zones.find((z) => z.id === sel.id) : null;
  const selPathO = sel && sel.t === 'path' ? doc.paths.find((p) => p.id === sel.id) : null;
  const selPoint = sel && sel.t === 'point' ? doc.points.find((p) => p.id === sel.id) : null;
  const profPath = selPathO || doc.paths[0] || null;
  const area = selZone ? zoneArea(selZone, makeProj(doc.mode, refOf(doc) || [0, 0])) : 0;
  const ToolBtn = ({ id, icon, label, sw, onClick, testid }) => (
    <button type="button" data-ops-tool={testid || id} disabled={readOnly && id !== 'select' && id !== 'measure'} onClick={onClick || (() => { setTool(id); setDraft(null); setMeasure(null); })}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left border ${tool === id && !onClick ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-transparent hover:bg-slate-100 text-slate-700'} disabled:opacity-40`}>
      {sw ? <span className="w-5 h-5 rounded flex-shrink-0 border-2" style={sw}></span> : <i className={`fa-solid ${icon} w-5 text-center text-slate-600`}></i>}<span className="flex-1">{label}</span>
    </button>);
  const zoneTool = (kind) => { const k = kindStyle(kind, settings); return (
    <ToolBtn key={kind} id={'zone-' + kind} testid={'zone-' + kind} label={k.label} sw={{ background: kind === 'near' ? '#fff7e6' : k.color, borderColor: k.stroke, borderStyle: kind === 'near' ? 'dashed' : 'solid' }}
      onClick={() => { setZoneKind(kind); setTool('zone'); setDraft(null); setMeasure(null); }} />); };
  const zoneToolActive = (kind) => tool === 'zone' && zoneKind === kind;

  return (
    <div className="fixed inset-0 z-[4800] bg-slate-100 flex flex-col" data-opsmap="editor" data-ops-mode={doc.mode}>
      <style>{`.wd-ops-tag{background:#fff;border:1px solid #0f172a33;border-radius:6px;font:600 11px/1.25 Inter,system-ui,sans-serif;color:#0f172a;padding:2px 6px;box-shadow:none;text-align:center}.wd-ops-tag:before{display:none}.wd-ops-plan .leaflet-container{background:#f8fafc;background-image:linear-gradient(#e2e8f0 1px,transparent 1px),linear-gradient(90deg,#e2e8f0 1px,transparent 1px);background-size:24px 24px}
      @media print{body *{visibility:hidden!important}[data-opsmap="editor"],[data-opsmap="editor"] *{visibility:visible!important}[data-opsmap="editor"]{position:absolute!important;inset:0!important}[data-ops-noprint]{display:none!important}}`}</style>
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 text-white" style={{ background: '#1e0b45' }} data-ops-noprint="1">
        <div className="flex-1 min-w-[200px]"><div className="text-[10px] uppercase tracking-widest text-violet-300">Advanced ops map · {doc.mode === 'plan' ? 'indoor / floor plan' : 'outdoor'}</div><div className="font-semibold truncate">{title || 'This job'}</div></div>
        <div className="flex bg-white/10 rounded-lg p-0.5" role="group" aria-label="View">
          {['2d', '3d'].map((v) => <button key={v} type="button" data-ops-view={v} onClick={() => { setView(v); setDraft(null); }} className={`px-3 py-1.5 rounded-md text-xs font-bold ${view === v ? 'bg-violet-300 text-violet-950' : 'text-violet-100'}`}>{v === '2d' ? '2D plan' : '3D view'}</button>)}
        </div>
        <div className="flex lg:hidden gap-1">{[['tools', 'fa-pen-ruler', 'Tools'], ['details', 'fa-sliders', 'Details']].map(([k, ic, l]) => <button key={k} type="button" data-ops-mob={k} onClick={() => setMob((m) => (m === k ? null : k))} className={`${btn} ${mob === k ? 'bg-violet-300 text-violet-950 border-violet-300' : 'border-white/30 text-white'} ${k === 'tools' ? 'md:hidden' : ''}`}><i className={`fa-solid ${ic}`}></i>{l}</button>)}</div>
        {!readOnly && <button type="button" data-ops-addview="1" onClick={addView} disabled={(doc.views || []).length >= 8} className={`${btn} border-emerald-300 bg-emerald-500 text-white disabled:opacity-40`} title="Keep this view (2D or 3D) in the plan and the PDF"><i className="fa-solid fa-camera"></i> Add this view to the plan</button>}
        {!readOnly && <button type="button" onClick={undo} disabled={!hist.current.length} className={`${btn} border-white/30 text-white disabled:opacity-40`} title="Undo (Ctrl+Z)"><i className="fa-solid fa-rotate-left"></i> Undo</button>}
        <button type="button" onClick={() => window.print()} className={`${btn} border-white/30 text-white`}><i className="fa-solid fa-print"></i> Print / PDF</button>
        <button type="button" data-ops-close="1" onClick={onClose} className={`${btn} border-violet-300 bg-violet-300 text-violet-950`}><i className="fa-solid fa-check"></i> {readOnly ? 'Close' : 'Done'}</button>
      </header>
      {readOnly && <div className="bg-amber-50 text-amber-900 text-xs px-3 py-1.5 border-b border-amber-200" data-ops-noprint="1"><i className="fa-solid fa-lock mr-1"></i>This plan is approved, so the map is view-only. Amend the plan to change it.</div>}
      <div className="flex-1 min-h-0 flex relative">
        <aside className={`w-[210px] shrink-0 bg-white border-r border-slate-200 overflow-y-auto p-2 space-y-3 md:block md:static ${mob === 'tools' ? 'block absolute left-0 top-0 bottom-0 z-[900] shadow-2xl' : 'hidden'}`} data-ops-noprint="1" aria-label="Drawing tools" onClick={(e) => { if (e.target.closest && e.target.closest('[data-ops-tool]')) setMob(null); }}>
          <div className="space-y-0.5"><ToolBtn id="select" icon="fa-arrow-pointer" label="Select / move" /><ToolBtn id="measure" icon="fa-ruler" label="Measure" /></div>
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-1">Zones</div>
            <div className="space-y-0.5">{['exclusion', 'oonp', 'near', 'clear'].map((k) => <div key={k} className={zoneToolActive(k) ? 'rounded-md ring-2 ring-violet-500' : ''}>{zoneTool(k)}</div>)}</div>
            {tool === 'zone' && <div className="flex gap-1 mt-1 px-1">{[['poly', 'fa-draw-polygon', 'Shape'], ['circle', 'fa-circle', 'Circle']].map(([s, ic, l]) => <button key={s} type="button" data-ops-shape={s} onClick={() => { setZoneShape(s); setDraft(null); }} className={`${btn} flex-1 justify-center ${zoneShape === s ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-slate-300 text-slate-600'}`}><i className={`fa-solid ${ic}`}></i>{l}</button>)}</div>}
          </div>
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-1">Paths</div><ToolBtn id="path" icon="fa-route" label="Flight path" />
            {tool === 'path' && <div className="mt-1 px-1 space-y-1.5" data-ops-pathopts="1">
              <div className="flex gap-1">{[['draw', 'fa-pencil', 'Draw'], ['click', 'fa-arrow-pointer', 'Click points']].map(([k, ic, l]) => <button key={k} type="button" data-ops-pathmode={k} onClick={() => { setPathMode(k); setDraft((d) => (d && d.extend ? d : null)); }} className={`${btn} flex-1 justify-center ${pathMode === k ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-slate-300 text-slate-600'}`}><i className={`fa-solid ${ic}`}></i>{l}</button>)}</div>
              {pathMode === 'draw' && <label className="block text-[11px] text-slate-600">Smoothing: <b>{['Off', 'Light', 'Medium', 'Strong'][smoothLevel]}</b>
                <input type="range" min="0" max="3" step="1" value={smoothLevel} data-ops-smooth="1" onChange={(e) => setSmoothLevel(Number(e.target.value))} className="w-full accent-violet-700" /></label>}
            </div>}</div>
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-1">Points &amp; notes</div>
            <div className="space-y-0.5">
              <ToolBtn id="tlz" label="Take-off / landing" sw={{ background: '#0f172a', borderColor: '#0f172a', borderRadius: 2 }} />
              <ToolBtn id="elz" label="Emergency LZ" sw={{ background: '#ea580c', borderColor: '#ea580c', borderRadius: '50%' }} />
              <ToolBtn id="poi" icon="fa-triangle-exclamation" label="Caution !" />
              <ToolBtn id="note" icon="fa-font" label="Text note" />
            </div></div>
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-1">Plan overlay</div>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" data-ops-file="1" onChange={(e) => loadOverlay(e.target.files && e.target.files[0], 1)} />
            {!doc.overlay ? <button type="button" disabled={readOnly} onClick={() => fileRef.current && fileRef.current.click()} className={`${btn} w-full justify-center border-slate-300 text-slate-700`}><i className="fa-solid fa-file-pdf"></i> Add PDF or image</button>
              : <button type="button" onClick={() => setSel({ t: 'overlay' })} className={`w-full text-left text-xs border rounded-md p-2 ${sel && sel.t === 'overlay' ? 'border-violet-600 bg-violet-50' : 'border-slate-200'}`}><b className="block truncate">{doc.overlay.name}</b><span className="text-slate-500">{doc.overlay.locked ? 'Locked' : 'Not locked'} · {doc.overlay.widthM} m wide</span></button>}
          </div>
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-1">Show</div>
            {[['zones', 'Zones'], ['buffers', 'Buffers'], ['paths', 'Paths'], ['points', 'Points & notes'], ['overlay', 'Plan overlay'], ...((airspace || []).length && doc.mode !== 'plan' ? [['airspace', 'Airspace (openAIP)']] : [])].map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm px-1 py-0.5"><input type="checkbox" checked={!!show[k]} onChange={() => setShow((s) => ({ ...s, [k]: !s[k] }))} />{l}</label>)}
          </div>
          <div className="px-1"><label className={lbl}>Over-people colour</label><div className="flex gap-1">{['green', 'blue'].map((c) => <button key={c} type="button" disabled={readOnly} onClick={() => patch((d) => ({ ...d, settings: { ...(d.settings || {}), oonpColour: c } }))} className={`${btn} flex-1 justify-center ${(settings.oonpColour || 'green') === c ? 'border-violet-600 bg-violet-50' : 'border-slate-300'}`}><span className="w-3 h-3 rounded-sm" style={{ background: c === 'blue' ? '#2563eb' : '#16a34a' }}></span>{c === 'blue' ? 'Blue' : 'Green'}</button>)}</div></div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          <div className={`relative flex-1 min-h-[260px] ${doc.mode === 'plan' ? 'wd-ops-plan' : ''}`}>
            {view === '2d' ? <div ref={mapEl} className="absolute inset-0" data-ops-map="1"></div> : <Ops3DLazy doc={doc} checks={checks} apiRef={api3d} camRef={cam3d} />}
            {view === '2d' && <div className="absolute top-2 right-2 z-[500] bg-white/95 border border-slate-300 rounded-md px-1.5 py-1 flex flex-col items-center" aria-hidden="true"><svg width="16" height="20" viewBox="0 0 18 22"><path d="M9 1 L16 20 L9 15 L2 20 Z" fill="#0f172a"></path></svg><span className="text-[10px] font-bold">N</span></div>}
            {draft && <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[600] bg-slate-900 text-white text-xs rounded-lg px-3 py-2 flex items-center gap-2 shadow-lg" data-ops-noprint="1" data-ops-drawing="1">
              <span>{draft.type === 'zone' ? (draft.shape === 'circle' ? (draft.c ? 'Click the edge to set the radius' : 'Click the centre') : 'Click each corner · click the first point or double-click to finish') : draft.type === 'path' ? (pathMode === 'draw' && draft.extend ? 'Press and drag from the end of the path to carry on drawing' : 'Click each point · double-click or Finish to end') : 'Click the second point'}</span>
              {(draft.type === 'zone' && draft.shape === 'poly' && draft.pts.length >= 3) || (draft.type === 'path' && draft.pts.length >= 2) ? <button type="button" data-ops-finish="1" onClick={finishDraft} className="bg-violet-400 text-violet-950 font-bold rounded px-2 py-1">Finish</button> : null}
              <button type="button" onClick={() => setDraft(null)} className="underline">Cancel</button></div>}
            {!draft && tool !== 'select' && view === '2d' && <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[600] bg-slate-900/85 text-white text-xs rounded-lg px-3 py-2" data-ops-noprint="1">{tool === 'zone' ? (zoneShape === 'circle' ? 'Click the centre of the ' : 'Click the first corner of the ') + KINDS[zoneKind].label.toLowerCase() + ' zone' : tool === 'path' ? (pathMode === 'draw' ? 'Press and drag to draw the path (start at the TLZ). It\'s smoothed when you let go' : 'Click where the path starts (usually the TLZ)') : tool === 'measure' ? 'Click two points to measure' : tool === 'scale' ? 'Click both ends of a distance you know on the plan' : 'Click to place it'}</div>}
            {scaleAsk && <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[650] bg-white border border-slate-300 rounded-xl shadow-xl p-3 w-[300px] space-y-2" data-ops-scale="1">
              <div className="text-sm">Measured <b>{r1(scaleAsk.d)} m</b> on the plan. What is the real distance?</div>
              <div className="flex gap-2"><input autoFocus type="number" min="0" step="0.1" className={inp} value={scaleAsk.real} onChange={(e) => setScaleAsk({ ...scaleAsk, real: e.target.value })} placeholder="metres" aria-label="Real distance in metres" />
                <button type="button" data-ops-scale-apply="1" className={`${btn} border-violet-700 bg-violet-700 text-white`} onClick={() => { const real = parseFloat(scaleAsk.real); if (real > 0 && scaleAsk.d > 0 && doc.overlay) { const f = real / scaleAsk.d; const o = doc.overlay; const prj = makeProj(doc.mode, o.center);
                  // scale about the plan's centre so the measured points stay on the same features
                  setOverlay({ widthM: Math.round(o.widthM * f * 100) / 100 }); void prj; } setScaleAsk(null); }}>Apply</button></div>
              <button type="button" className="text-xs underline text-slate-500" onClick={() => setScaleAsk(null)}>Cancel</button></div>}
            {toast && <div className="absolute top-14 right-3 z-[680] max-w-[340px] bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded-xl shadow-lg px-3 py-2 flex gap-2" role="status" data-ops-toast="1" data-ops-noprint="1"><i className="fa-solid fa-circle-info mt-0.5"></i><span className="flex-1">{toast}</span><button type="button" aria-label="Close" onClick={() => setToast('')}><i className="fa-solid fa-xmark"></i></button></div>}
            {busy && <div className="absolute inset-0 z-[700] bg-white/60 flex items-center justify-center text-sm font-semibold">{busy}</div>}
            {view === '2d' && <div className="absolute bottom-2 right-2 z-[500] bg-white/95 border border-slate-300 rounded-lg p-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] pointer-events-none" data-ops-legend="1">
              {[...((airspace || []).length && show.airspace && doc.mode !== 'plan' ? [['Controlled airspace', { border: '2px dashed #1d4ed8' }], ['Restricted / danger', { border: '2px dashed #be185d' }]] : []), ['Exclusion', { background: '#dc2626' }], ['Over people', { background: kindStyle('oonp', settings).color }], ['Near people', { border: '2px dashed #b45309', background: '#fff7e6' }], ['Clear of people', { background: '#b9a6f2' }], ['Buffer', { border: '2px dashed #d97706' }], ['Emergency LZ', { background: '#ea580c', borderRadius: '50%' }]].map(([l, s]) => <span key={l} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={s}></span>{l}</span>)}
            </div>}
          </div>
          <section className="bg-white border-t border-slate-200" aria-label="Height profile">
            <div className="flex items-center gap-2 px-3 py-1.5" data-ops-noprint="1">
              <button type="button" onClick={() => setPanel((p) => !p)} className="text-xs font-bold text-slate-700"><i className={`fa-solid ${panel ? 'fa-chevron-down' : 'fa-chevron-up'} mr-1`}></i>Side-on profile{profPath ? ' · ' + profPath.name : ''}</button>
              {profPath && checks && checks.paths[profPath.id] && <span className="text-[11px] text-slate-500">{Math.round(checks.paths[profPath.id].length)} m · {profPath.pts.length} points · {fmtSpeed(profPath.speed || 0)} · {profPath.drone || 'no drone'}</span>}
              <span className="ml-auto text-[11px] text-slate-400 hidden sm:inline">Drag a point up or down to set its height</span>
            </div>
            {panel && <div className="px-2 pb-2"><Profile path={profPath} res={profPath && checks ? checks.paths[profPath.id] : null} readOnly={readOnly} selPt={profPath && selPathO ? selPt : null}
              onPick={(i) => { setSel({ t: 'path', id: profPath.id }); setSelPt(i); }}
              onStart={() => { if (docRef.current) { hist.current.push(docRef.current); if (hist.current.length > 60) hist.current.shift(); } }}
              onAlt={(i, alt) => { const p = docRef.current.paths.find((q) => q.id === profPath.id); if (!p || Number(p.pts[i][2]) === alt) return; const next = { ...docRef.current, paths: docRef.current.paths.map((q) => q.id === p.id ? { ...q, pts: q.pts.map((x, j) => j === i ? [x[0], x[1], alt] : x) } : q) }; docRef.current = next; setDoc(next); onChange && onChange(next); }} /></div>}
          </section>
        </main>

        <aside className={`w-[320px] max-w-[92vw] shrink-0 bg-white border-l border-slate-200 overflow-y-auto p-3 space-y-4 lg:block lg:static ${mob === 'details' ? 'block absolute right-0 top-0 bottom-0 z-[900] shadow-2xl' : 'hidden'}`} data-ops-inspector="1" aria-label="Details">
          {selZone && <div className="space-y-3" data-ops-zone={selZone.id}>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded" style={{ background: kindStyle(selZone.kind, settings).color }}></span><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex-1">Zone · {KINDS[selZone.kind].label}</span>{!readOnly && <button type="button" onClick={delSel} className="text-xs text-red-600"><i className="fa-solid fa-trash-can mr-1"></i>Delete</button>}</div>
            <div><label className={lbl} htmlFor="oz-name">Name</label><input id="oz-name" className={inp} disabled={readOnly} value={selZone.name || ''} onChange={(e) => setZone(selZone.id, { name: e.target.value })} /></div>
            <div><label className={lbl} htmlFor="oz-kind">Type</label><select id="oz-kind" className={inp} disabled={readOnly} value={selZone.kind} onChange={(e) => setZone(selZone.id, { kind: e.target.value, ...(KINDS[e.target.value].limits && !selZone.drone ? { drone: drones[0] || '', energy: 34 } : {}) })}>{Object.keys(KINDS).map((k) => <option key={k} value={k}>{KINDS[k].label}</option>)}</select></div>
            <div className="text-[11px] text-slate-500">{selZone.shape === 'circle' ? 'Circle, ' + selZone.r + ' m radius' : selZone.pts.length + ' corners'} · {Math.round(area).toLocaleString()} m²{selZone.shape !== 'circle' && !readOnly ? ' · drag corners, drag a midpoint to add one, right-click a corner to delete' : ''}</div>
            {KINDS[selZone.kind].limits && selZone.autoLimit && <div className={`rounded-lg px-3 py-2 text-xs ${selZone.limitReviewed ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-amber-50 text-amber-900 border border-amber-300'}`} data-ops-review={selZone.limitReviewed ? 'done' : 'todo'}>
              {selZone.limitReviewed ? <span><i className="fa-solid fa-circle-check mr-1"></i>Filled in from the {selZone.autoLimit.energy} J energy table; reviewed by {selZone.limitReviewed.by || 'the pilot'}.</span>
                : <><b>Pilot to review:</b> {selZone.h} m · {fmtSpeed(selZone.v)} was filled in from the {selZone.autoLimit.energy} J energy table for {selZone.autoLimit.drone || 'this drone'}{selZone.autoLimit.from === 'planned height' ? ' at the job\'s planned height' : ''}. Check it suits this zone, or pick another limit.
                  {!readOnly && <button type="button" data-ops-reviewed="1" onClick={() => setZone(selZone.id, { limitReviewed: { by: reviewer || 'Pilot', at: new Date().toISOString() } })} className="mt-1.5 block px-2.5 py-1 rounded-md bg-amber-600 text-white font-semibold">I've reviewed it</button>}</>}
            </div>}
            {KINDS[selZone.kind].limits && <LimitPicker zone={selZone} setZone={(ch) => setZoneLimits(selZone, ch)} drones={drones} fleet={fleet} keFor={keFor} onSaveDroneLimits={onSaveDroneLimits} readOnly={readOnly} />}
            {selZone.kind === 'clear' && <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl} htmlFor="oz-ch">Max height (m)</label><input id="oz-ch" type="number" min="0" className={inp} disabled={readOnly} value={selZone.h == null ? '' : selZone.h} onChange={(e) => setZone(selZone.id, { h: e.target.value === '' ? null : Number(e.target.value) })} placeholder="120" /></div>
              <SpeedField id="oz-cv" label="Max speed" ms={selZone.v} disabled={readOnly} placeholder="any" onMs={(v) => setZone(selZone.id, { v })} /></div>}
            {selZone.kind === 'exclusion' && <div className="space-y-2" data-ops-buffer="1">
              <div><label className={lbl} htmlFor="oz-buf">Buffer around it (m)</label><input id="oz-buf" type="number" min="0" className={inp} disabled={readOnly || selZone.shielded} value={selZone.buffer == null ? DEFAULT_BUFFER : selZone.buffer} onChange={(e) => setZone(selZone.id, { buffer: e.target.value === '' ? null : Number(e.target.value) })} /></div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={readOnly} checked={!!selZone.shielded} onChange={(e) => setZone(selZone.id, { shielded: e.target.checked, shieldBuffer: selZone.shieldBuffer == null ? 0 : selZone.shieldBuffer })} /><span>Shielded: people are protected (roof, netting, barrier, building), so a smaller buffer applies</span></label>
              {selZone.shielded && <div className="grid grid-cols-[90px_1fr] gap-2">
                <div><label className={lbl} htmlFor="oz-sb">Buffer (m)</label><input id="oz-sb" type="number" min="0" className={inp} disabled={readOnly} value={selZone.shieldBuffer == null ? 0 : selZone.shieldBuffer} onChange={(e) => setZone(selZone.id, { shieldBuffer: Number(e.target.value) || 0 })} /></div>
                <div><label className={lbl} htmlFor="oz-sn">What shields it</label><input id="oz-sn" className={inp} disabled={readOnly} value={selZone.shieldNote || ''} onChange={(e) => setZone(selZone.id, { shieldNote: e.target.value })} placeholder="e.g. stand roof, safety net" /></div></div>}
            </div>}
            {selZone.kind !== 'exclusion' && <div><label className={lbl} htmlFor="oz-g">Ground level (m above take-off)</label><input id="oz-g" type="number" step="0.5" className={inp} disabled={readOnly} value={selZone.ground || 0} onChange={(e) => setZone(selZone.id, { ground: Number(e.target.value) || 0 })} /><p className="text-[10px] text-slate-500 mt-1">For raised stages, stands or hills: heights in this zone are measured from this level.</p></div>}
            <div><label className={lbl} htmlFor="oz-note">Notes</label><textarea id="oz-note" rows={2} className={inp} disabled={readOnly} value={selZone.note || ''} onChange={(e) => setZone(selZone.id, { note: e.target.value })} /></div>
          </div>}

          {selPathO && <div className="space-y-3" data-ops-path={selPathO.id}>
            <div className="flex items-center gap-2"><i className="fa-solid fa-route text-slate-600"></i><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex-1">Flight path</span>{!readOnly && <button type="button" onClick={delSel} className="text-xs text-red-600"><i className="fa-solid fa-trash-can mr-1"></i>Delete</button>}</div>
            <div><label className={lbl} htmlFor="op-name">Name</label><input id="op-name" className={inp} disabled={readOnly} value={selPathO.name || ''} onChange={(e) => setPath(selPathO.id, { name: e.target.value })} /></div>
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <div><label className={lbl} htmlFor="op-drone">Drone</label><select id="op-drone" className={inp} disabled={readOnly} value={selPathO.drone || ''} onChange={(e) => setPath(selPathO.id, { drone: e.target.value })}>{drones.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
              <SpeedField id="op-speed" label="Speed" ms={selPathO.speed == null ? '' : selPathO.speed} disabled={readOnly} onMs={(v) => setPath(selPathO.id, { speed: v || 0 })} />
            </div>
            <div><div className={lbl}>Points (height above take-off)</div>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-52 overflow-y-auto">{selPathO.pts.map((p, i) => (
                <div key={i} className={`flex items-center gap-2 px-2 py-1 text-sm ${selPt === i ? 'bg-violet-50' : ''}`} data-ops-pt={i}>
                  <span className="w-6 font-bold text-slate-600">{i + 1}</span>
                  <input type="number" step="0.5" min="0" aria-label={'Height of point ' + (i + 1)} className="w-20 px-1.5 py-1 border border-slate-300 rounded text-sm" disabled={readOnly} value={p[2] == null ? 0 : p[2]} onFocus={() => setSelPt(i)} onChange={(e) => setPath(selPathO.id, { pts: selPathO.pts.map((q, j) => j === i ? [q[0], q[1], Number(e.target.value) || 0] : q) })} /><span className="text-xs text-slate-500">m</span>
                  {checks && checks.paths[selPathO.id] && checks.paths[selPathO.id].legs[i] && <span className="ml-auto w-2.5 h-2.5 rounded-full" title={'Leg ' + (i + 1) + '→' + (i + 2)} style={{ background: STATUS[checks.paths[selPathO.id].legs[i].status] }}></span>}
                  {!readOnly && selPathO.pts.length > 2 && <button type="button" aria-label={'Delete point ' + (i + 1)} onClick={() => setPath(selPathO.id, { pts: selPathO.pts.filter((q, j) => j !== i) })} className={`${checks && checks.paths[selPathO.id] && checks.paths[selPathO.id].legs[i] ? '' : 'ml-auto'} text-slate-400 hover:text-red-600`}><i className="fa-solid fa-xmark"></i></button>}
                </div>))}</div>
              {!readOnly && <div className="flex flex-wrap gap-2 mt-2"><button type="button" className={`${btn} border-slate-300`} onClick={() => setPath(selPathO.id, { pts: [...selPathO.pts].reverse() })}><i className="fa-solid fa-arrow-right-arrow-left"></i>Reverse</button>
                <button type="button" className={`${btn} border-slate-300`} onClick={() => { setTool('path'); setDraft({ type: 'path', pts: selPathO.pts, extend: selPathO.id }); }}><i className="fa-solid fa-plus"></i>{pathMode === 'draw' ? 'Draw more from the end' : 'Add points at the end'}</button>
                <button type="button" data-ops-smoothpath="1" className={`${btn} border-slate-300`} disabled={selPathO.pts.length < 3} onClick={() => smoothPath(selPathO, 'smooth')}><i className="fa-solid fa-bezier-curve"></i>Smooth</button>
                <button type="button" data-ops-thinpath="1" className={`${btn} border-slate-300`} disabled={selPathO.pts.length < 4} onClick={() => smoothPath(selPathO, 'thin')}><i className="fa-solid fa-compress"></i>Fewer points</button></div>}
            </div>
          </div>}

          {selPoint && <div className="space-y-3" data-ops-point={selPoint.id}>
            <div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex-1">{POINT_KINDS[selPoint.kind].label}</span>{!readOnly && <button type="button" onClick={delSel} className="text-xs text-red-600"><i className="fa-solid fa-trash-can mr-1"></i>Delete</button>}</div>
            <div><label className={lbl} htmlFor="opt-kind">Type</label><select id="opt-kind" className={inp} disabled={readOnly} value={selPoint.kind} onChange={(e) => setPoint(selPoint.id, { kind: e.target.value })}>{Object.keys(POINT_KINDS).map((k) => <option key={k} value={k}>{POINT_KINDS[k].label}</option>)}</select></div>
            <div><label className={lbl} htmlFor="opt-title">Label</label><input id="opt-title" className={inp} disabled={readOnly} value={selPoint.title || ''} onChange={(e) => setPoint(selPoint.id, { title: e.target.value })} /></div>
            {(selPoint.kind === 'poi' || selPoint.kind === 'note' || selPoint.kind === 'tlz' || selPoint.kind === 'elz') && <div><label className={lbl} htmlFor="opt-text">Text shown on the map</label><textarea id="opt-text" rows={3} className={inp} disabled={readOnly} value={selPoint.text || ''} onChange={(e) => setPoint(selPoint.id, { text: e.target.value })} placeholder={selPoint.kind === 'poi' ? 'e.g. Lighting truss 14 m, keep 3 m clear' : 'e.g. 5 × 5 m, security guard at entry'} /></div>}
            {(selPoint.kind === 'tlz' || selPoint.kind === 'elz') && <div><label className={lbl} htmlFor="opt-size">{selPoint.kind === 'tlz' ? 'Size (m square)' : 'Radius (m)'}</label><input id="opt-size" type="number" min="1" className={inp} disabled={readOnly} value={selPoint.size || ''} onChange={(e) => setPoint(selPoint.id, { size: Number(e.target.value) || null })} /></div>}
          </div>}

          {sel && sel.t === 'overlay' && doc.overlay && <div className="space-y-3" data-ops-overlay="1">
            <div className="flex items-center gap-2"><i className="fa-solid fa-file-pdf text-slate-600"></i><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex-1">Plan overlay</span>{!readOnly && <button type="button" onClick={delSel} className="text-xs text-red-600"><i className="fa-solid fa-trash-can mr-1"></i>Remove</button>}</div>
            <div className="text-sm font-semibold truncate">{doc.overlay.name}{doc.overlay.pages > 1 ? ' · page ' + doc.overlay.page + ' of ' + doc.overlay.pages : ''}</div>
            <div><label className={lbl} htmlFor="oo-op">Opacity {doc.overlay.opacity == null ? 60 : doc.overlay.opacity}%</label><input id="oo-op" type="range" min="10" max="100" className="w-full accent-violet-700" value={doc.overlay.opacity == null ? 60 : doc.overlay.opacity} onChange={(e) => { const v = Number(e.target.value); docRef.current = { ...docRef.current, overlay: { ...docRef.current.overlay, opacity: v } }; setDoc(docRef.current); if (onChange && !readOnly) onChange(docRef.current); }} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={readOnly} checked={!!doc.overlay.locked} onChange={(e) => setOverlay({ locked: e.target.checked })} />Locked (stops it moving by accident)</label>
            {!doc.overlay.locked && !readOnly && <p className="text-[11px] text-slate-500">Drag the purple handle to move the plan, a corner to resize it, and the round knob to turn it. Or use the sliders. Then <b>Set scale</b> from a distance you know.</p>}
            {!readOnly && <div className="space-y-2" data-ops-ovsliders="1">
              <label className="block text-[11px] font-semibold text-slate-600">Size · {doc.overlay.widthM} m wide
                <input type="range" data-ops-ovsize="1" min={Math.log(5)} max={Math.log(5000)} step="0.002" disabled={doc.overlay.locked} value={Math.log(Math.max(5, doc.overlay.widthM))} className="w-full accent-violet-700"
                  onPointerDown={() => { if (docRef.current) hist.current.push(docRef.current); }}
                  onChange={(e) => { const w = Math.round(Math.exp(Number(e.target.value)) * 10) / 10; docRef.current = { ...docRef.current, overlay: { ...docRef.current.overlay, widthM: w } }; setDoc(docRef.current); onChange && onChange(docRef.current); }} /></label>
              <label className="block text-[11px] font-semibold text-slate-600">Turn · {doc.overlay.rot || 0}°
                <input type="range" data-ops-ovrot="1" min="-180" max="180" step="0.5" disabled={doc.overlay.locked} value={doc.overlay.rot || 0} className="w-full accent-violet-700"
                  onPointerDown={() => { if (docRef.current) hist.current.push(docRef.current); }}
                  onChange={(e) => { docRef.current = { ...docRef.current, overlay: { ...docRef.current.overlay, rot: Number(e.target.value) } }; setDoc(docRef.current); onChange && onChange(docRef.current); }} /></label>
              <div className="flex gap-1">{[['−1%', 0.99], ['+1%', 1.01], ['↺ 1°', -1], ['↻ 1°', 1]].map(([l, v]) => <button key={l} type="button" disabled={doc.overlay.locked} onClick={() => setOverlay(Math.abs(v) === 1 ? { rot: Math.round(((doc.overlay.rot || 0) + v) * 10) / 10 } : { widthM: Math.round(doc.overlay.widthM * v * 100) / 100 })} className={`${btn} flex-1 justify-center border-slate-300 disabled:opacity-40`}>{l}</button>)}</div>
            </div>}
            <details className="text-[11px] text-slate-500"><summary className="cursor-pointer">Exact numbers</summary>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div><label className={lbl} htmlFor="oo-w">Width (m)</label><input id="oo-w" type="number" min="1" step="0.5" className={inp} disabled={readOnly || doc.overlay.locked} value={doc.overlay.widthM} onChange={(e) => setOverlay({ widthM: Math.max(1, Number(e.target.value) || 1) })} /></div>
              <div><label className={lbl} htmlFor="oo-r">Turn (°)</label><input id="oo-r" type="number" step="0.5" className={inp} disabled={readOnly || doc.overlay.locked} value={doc.overlay.rot || 0} onChange={(e) => setOverlay({ rot: Number(e.target.value) || 0 })} /></div>
            </div></details>
            {!readOnly && <div className="flex flex-wrap gap-2">
              <button type="button" data-ops-tool="scale" disabled={doc.overlay.locked} onClick={() => { setTool('scale'); setDraft(null); }} className={`${btn} border-slate-300 disabled:opacity-40`}><i className="fa-solid fa-ruler-combined"></i>Set scale</button>
              <button type="button" onClick={() => fileRef.current && fileRef.current.click()} className={`${btn} border-slate-300`}><i className="fa-solid fa-file-arrow-up"></i>Replace</button>
              {doc.overlay.pages > 1 && fileRef.current && fileRef.current._file && <select aria-label="PDF page" className="px-2 py-1 border border-slate-300 rounded-md text-xs" value={doc.overlay.page} onChange={(e) => loadOverlay(fileRef.current._file, Number(e.target.value))}>{Array.from({ length: doc.overlay.pages }, (_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}</select>}
            </div>}
          </div>}

          {!sel && <div className="space-y-3">
            <div data-ops-views="1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Views in the plan &amp; PDF</div>
              {viewMsg && <p className="text-xs text-emerald-700 mb-1" data-ops-viewmsg="1">{viewMsg}</p>}
              {!(doc.views || []).length && <p className="text-xs text-slate-500">Frame the map (2D) or turn the 3D view to the angle you want, then press <b>Add this view to the plan</b>.</p>}
              <div className="space-y-2">{(doc.views || []).map((v, i) => (
                <div key={v.id} data-ops-viewrow={v.kind} className="border border-slate-200 rounded-lg p-2 flex gap-2 items-start">
                  {v.kind === '3d' && viewImages[v.id] ? <img src={viewImages[v.id]} alt="" className="w-16 h-12 object-cover rounded border border-slate-200 shrink-0" /> : <span className="w-16 h-12 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 shrink-0"><i className={`fa-solid ${v.kind === '3d' ? 'fa-cube' : 'fa-map'}`}></i></span>}
                  <div className="flex-1 min-w-0 space-y-1">
                    <input aria-label="View title" value={v.title} disabled={readOnly} onChange={(e) => setViews((vs) => vs.map((x) => x.id === v.id ? { ...x, title: e.target.value } : x))} className="w-full px-1.5 py-0.5 text-xs font-semibold border border-slate-200 rounded" />
                    <div className="flex flex-wrap gap-x-2 text-[11px]">
                      <span className="text-slate-500">{v.kind === '3d' ? '3D' : '2D'}</span>
                      <button type="button" className="underline text-violet-700" onClick={() => showView(v)}>Show</button>
                      {!readOnly && <button type="button" className="underline text-violet-700" onClick={() => retakeView(v)}>Retake</button>}
                      {!readOnly && i > 0 && <button type="button" className="underline text-slate-600" onClick={() => setViews((vs) => { const n = [...vs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>Up</button>}
                      {!readOnly && <button type="button" data-ops-viewdel="1" className="underline text-red-600" onClick={() => setViews((vs) => vs.filter((x) => x.id !== v.id))}>Remove</button>}
                    </div>
                  </div>
                </div>))}</div>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Checks</div>
            {checks && checks.issues.length === 0 && <div className="text-sm bg-emerald-50 text-emerald-900 rounded-lg px-3 py-2" data-ops-checks="clear">{doc.paths.length ? 'All paths are inside their zone limits.' : 'Draw zones and a flight path to check them.'}</div>}
            {checks && checks.issues.map((q, i) => (
              <div key={q.key || i} data-ops-issue={q.ack ? 'ack' : q.lvl} className={`text-xs rounded-lg px-3 py-2 ${q.ack ? 'bg-slate-50 text-slate-600 border border-slate-200' : q.lvl === 'stop' ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`}>
                <button type="button" className="w-full text-left" onClick={() => { if (q.path) { setSel({ t: 'path', id: q.path }); setSelPt(q.leg); } else if (q.zone) setSel({ t: 'zone', id: q.zone }); }}>
                  <b className="mr-1">{q.ack ? 'Acknowledged' : q.lvl === 'stop' ? 'Fix' : 'Check'}</b>{q.text}</button>
                {q.ack && <div className="mt-1 text-[11px]">“{q.ack.note || 'OK'}” · {q.ack.by || ''}{!readOnly && <button type="button" className="ml-2 underline" onClick={() => patch((d) => { const a = { ...(d.acks || {}) }; delete a[q.key]; return { ...d, acks: a }; })}>Undo</button>}</div>}
                {!q.ack && !readOnly && q.key && (ackOpen && ackOpen.key === q.key
                  ? <div className="mt-1.5 flex gap-1" data-ops-ackform="1"><input autoFocus aria-label="Why it's OK" value={ackOpen.note} onChange={(e) => setAckOpen({ ...ackOpen, note: e.target.value })} placeholder={q.lvl === 'stop' ? 'Why it\'s OK (required)' : 'Note (optional)'} className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-xs text-slate-800 bg-white" />
                      <button type="button" data-ops-ackok="1" disabled={q.lvl === 'stop' && ackOpen.note.trim().length < 5} onClick={() => { patch((d) => ({ ...d, acks: { ...(d.acks || {}), [q.key]: { note: ackOpen.note.trim(), by: reviewer || 'Pilot', at: new Date().toISOString() } } })); setAckOpen(null); }} className="px-2 py-1 rounded bg-slate-800 text-white font-semibold disabled:opacity-40">OK</button>
                      <button type="button" onClick={() => setAckOpen(null)} className="underline">Cancel</button></div>
                  : <div className="mt-1 flex gap-3">{q.review && <button type="button" data-ops-reviewed-check="1" className="underline font-semibold" onClick={() => setZone(q.zone, { limitReviewed: { by: reviewer || 'Pilot', at: new Date().toISOString() } })}>I've reviewed it</button>}
                      {!q.review && <button type="button" data-ops-ack="1" className="underline" onClick={() => setAckOpen({ key: q.key, note: '' })}>Acknowledge</button>}</div>)}
              </div>))}
            {checks && checks.issues.length > 0 && <div className="text-[11px] text-slate-600" data-ops-pdfchecks="1"><span className="font-semibold">In the PDF:</span>
              {[['all', 'All checks'], ['open', 'Only open ones'], ['none', 'Leave out']].map(([k, l]) => <label key={k} className="ml-2 inline-flex items-center gap-1"><input type="radio" name="ops-pdfchecks" disabled={readOnly} checked={(settings.pdfChecks || 'all') === k} onChange={() => patch((d) => ({ ...d, settings: { ...(d.settings || {}), pdfChecks: k } }))} />{l}</label>)}</div>}
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pt-2">On this map</div>
            <div className="space-y-1 text-sm">
              {doc.zones.map((z) => <button key={z.id} type="button" onClick={() => setSel({ t: 'zone', id: z.id })} className="w-full flex items-center gap-2 text-left hover:bg-slate-50 rounded px-1 py-0.5"><span className="w-3 h-3 rounded-sm" style={{ background: kindStyle(z.kind, settings).color }}></span><span className="flex-1 truncate">{z.name}</span><span className="text-[10px] text-slate-500">{z.h != null && z.h !== '' ? z.h + ' m' : ''}</span></button>)}
              {doc.paths.map((p) => <button key={p.id} type="button" onClick={() => setSel({ t: 'path', id: p.id })} className="w-full flex items-center gap-2 text-left hover:bg-slate-50 rounded px-1 py-0.5"><i className="fa-solid fa-route text-xs text-slate-500 w-3"></i><span className="flex-1 truncate">{p.name}</span></button>)}
              {doc.points.map((p) => <button key={p.id} type="button" onClick={() => setSel({ t: 'point', id: p.id })} className="w-full flex items-center gap-2 text-left hover:bg-slate-50 rounded px-1 py-0.5"><i className={`fa-solid ${p.kind === 'poi' ? 'fa-triangle-exclamation text-amber-500' : p.kind === 'note' ? 'fa-font' : p.kind === 'elz' ? 'fa-circle text-orange-600' : 'fa-square'} text-xs w-3`}></i><span className="flex-1 truncate">{p.title}</span></button>)}
              {!hasOpsContent(doc) && <p className="text-xs text-slate-500">Nothing drawn yet. Pick a tool on the left.</p>}
            </div>
            {measure && <div className="text-xs text-violet-900 bg-violet-50 rounded-lg px-3 py-2">Measured {r1(measure.d)} m <button type="button" className="underline ml-1" onClick={() => setMeasure(null)}>clear</button></div>}
          </div>}
        </aside>
      </div>
    </div>
  );
}

// 3D is loaded only when asked for (it pulls in three.js)
function Ops3DLazy(props) {
  const [C, setC] = useState(null), [err, setErr] = useState('');
  useEffect(() => { let on = true; import('./Ops3D.jsx').then((m) => { if (on) setC(() => m.default); }).catch((e) => setErr(String(e.message || e))); return () => { on = false; }; }, []);
  if (err) return <div className="absolute inset-0 flex items-center justify-center text-sm text-red-700">3D view couldn't load: {err}</div>;
  if (!C) return <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">Loading 3D…</div>;
  return <C {...props} />;
}
