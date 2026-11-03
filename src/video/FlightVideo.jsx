// Flight video replay (v7.6): link the DJI low-res video (.LRF / .MP4) recorded by the O4 air unit to a logged flight,
// play it in sync with the telemetry (OSD readouts, GPS map, altitude/speed chart), and export one flight as a video
// with the telemetry burned in. The video is never copied into the plan: we keep its name, size, start time and
// sync offset, and (in Chrome / Edge) a file handle so it can be reopened from the same place on this computer.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Start time of a video ───────────────────────────────────────────────────────────────────────
const be32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const be64 = (b, o) => be32(b, o) * 4294967296 + be32(b, o + 4);
const typ = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const readBytes = async (file, off, len) => new Uint8Array(await file.slice(off, off + len).arrayBuffer());
const MP4_EPOCH = 2082844800; // seconds from 1904-01-01 to 1970-01-01

async function mp4Times(file) {
  let off = 0;
  for (let guard = 0; off + 8 <= file.size && guard < 64; guard++) {
    const h = await readBytes(file, off, 16);
    let size = be32(h, 0), hdr = 8; const t = typ(h, 4);
    if (size === 1) { size = be64(h, 8); hdr = 16; } else if (size === 0) size = file.size - off;
    if (size < 8) break;
    if (t === 'moov') {
      const m = await readBytes(file, off + hdr, Math.min(size - hdr, 32 * 1024 * 1024));
      for (let p = 0; p + 8 <= m.length;) {
        const s = be32(m, p), tt = typ(m, p + 4);
        if (tt === 'mvhd') {
          const v = m[p + 8];
          const created = v === 1 ? be64(m, p + 12) : be32(m, p + 12);
          const scale = v === 1 ? be32(m, p + 28) : be32(m, p + 20);
          const dur = v === 1 ? be64(m, p + 32) : be32(m, p + 24);
          return { startMs: created > MP4_EPOCH ? (created - MP4_EPOCH) * 1000 : null, durationSec: scale ? dur / scale : null };
        }
        if (s < 8) break; p += s;
      }
      return null;
    }
    off += size;
  }
  return null;
}
// DJI_20261025204553_0009_D.LRF → camera's local time 2026-10-25 20:45:53
const nameTime = (name) => { const m = /(20\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})/.exec(name || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null; };

export async function videoInfo(file) {
  let mp = null; try { mp = await mp4Times(file); } catch (e) { /* not an MP4 we can read */ }
  const fromName = nameTime(file.name);
  const startMs = (mp && mp.startMs) || fromName || null;
  return { name: file.name, size: file.size, startMs, durationSec: mp && mp.durationSec ? Math.round(mp.durationSec * 10) / 10 : null,
    how: mp && mp.startMs ? 'video metadata' : fromName ? 'file name' : 'unknown' };
}

// Pair videos with flights by start time (the O4 starts recording when you arm). Returns [{ flightId, file, info, offsetSec, gapSec }].
export function matchVideos(flights, items, maxGapSec = 120) {
  const pairs = [];
  items.forEach(it => { if (!it.info.startMs) return;
    flights.forEach(f => { const t = f.telemetry; if (!t || !t.startMs) return;
      // the camera and the radio can disagree about the time zone (one in local time, one in UTC): try both
      const tz = new Date(t.startMs).getTimezoneOffset() * 60, g0 = (it.info.startMs - t.startMs) / 1000;
      const gap = [g0, g0 + tz, g0 - tz].reduce((b, g) => (Math.abs(g) < Math.abs(b) ? g : b), g0);
      if (Math.abs(gap) <= maxGapSec) pairs.push({ flightId: f.id, it, gap }); }); });
  pairs.sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
  const usedF = new Set(), usedV = new Set(), out = [];
  pairs.forEach(p => { if (usedF.has(p.flightId) || usedV.has(p.it)) return; usedF.add(p.flightId); usedV.add(p.it);
    out.push({ flightId: p.flightId, file: p.it.file, handle: p.it.handle, info: p.it.info, offsetSec: Math.round(p.gap * 10) / 10, gapSec: p.gap }); });
  return out;
}

// ── Where the file is: a handle kept in this browser (Chrome / Edge), or this session's picked file ──────────
const session = new Map(); // key → File
const idb = () => new Promise((res, rej) => { const q = indexedDB.open('wd_video_links', 1); q.onupgradeneeded = () => q.result.createObjectStore('h'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
export const linkKey = (flightId) => 'f:' + flightId;
export async function rememberVideo(key, file, handle) {
  session.set(key, file);
  if (handle) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('h', 'readwrite'); tx.objectStore('h').put(handle, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) { /* handles not storable here */ } }
}
async function storedHandle(key) {
  try { const db = await idb(); return await new Promise((res) => { const g = db.transaction('h').objectStore('h').get(key); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); }); } catch (e) { return null; }
}
export const canPickWithHandles = () => typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
const ACCEPT = '.lrf,.LRF,.mp4,.MP4,.mov,.MOV';
export async function pickVideos(multiple = true) {
  if (canPickWithHandles()) {
    try {
      const hs = await window.showOpenFilePicker({ multiple, types: [{ description: 'Flight video (DJI .LRF / .MP4)', accept: { 'video/mp4': ['.lrf', '.mp4', '.mov'] } }], excludeAcceptAllOption: false });
      return Promise.all(hs.map(async h => ({ file: await h.getFile(), handle: h })));
    } catch (e) { if (e && e.name === 'AbortError') return []; }
  }
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = ACCEPT; inp.multiple = multiple;
    inp.onchange = () => res([...(inp.files || [])].map(file => ({ file, handle: null }))); inp.click();
  });
}
// Open the linked file: this session's copy, else the remembered handle (may ask permission), else ask the person to find it.
export async function openLinkedVideo(key, video) {
  const s = session.get(key); if (s) return s;
  const h = await storedHandle(key);
  if (h) {
    try {
      let p = h.queryPermission ? await h.queryPermission({ mode: 'read' }) : 'granted';
      if (p !== 'granted' && h.requestPermission) p = await h.requestPermission({ mode: 'read' });
      if (p === 'granted') { const f = await h.getFile(); session.set(key, f); return f; }
    } catch (e) { /* moved or deleted */ }
  }
  if (!window.confirm(`Find the video for this flight on your computer:\n\n${video.name}${video.size ? ' (' + (video.size / 1048576).toFixed(0) + ' MB)' : ''}\n\nIt isn't copied into the plan, only linked.`)) return null;
  const got = await pickVideos(false); if (!got.length) return null;
  const f = got[0].file;
  if (video.size && f.size !== video.size && !window.confirm(`That file (${f.name}) isn't the same size as the linked one (${video.name}). Use it anyway?`)) return null;
  await rememberVideo(key, f, got[0].handle);
  return f;
}

// ── Telemetry at a moment ───────────────────────────────────────────────────────────────────────────
// trace rows: [tSec, altM, kmh, lat, lng, volts, amps, RQ%, sats]
const hav = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
export function telemetryAt(t, sec, kg) {
  const tr = (t && t.trace) || []; if (!tr.length) return null;
  let lo = 0, hi = tr.length - 1;
  if (sec <= tr[0][0]) hi = 0; else if (sec >= tr[hi][0]) lo = hi; else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr[m][0] <= sec) lo = m; else hi = m; } }
  const a = tr[lo], b = tr[hi], f = hi === lo ? 0 : (sec - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const ip = (i) => (a[i] == null ? b[i] : b[i] == null ? a[i] : a[i] + (b[i] - a[i]) * f);
  const alt = ip(1), kmh = ip(2), lat = ip(3), lng = ip(4), v = ip(5);
  const dist = t.home && lat != null ? hav(t.home[0], t.home[1], lat, lng) : null;
  const ms = (kmh || 0) / 3.6, ke = kg > 0 ? 0.5 * kg * (ms * ms + 2 * 9.81 * Math.max(0, alt || 0)) : null;
  return { sec, alt, kmh, lat, lng, volts: v, cell: v != null && t.cells ? v / t.cells : null, amps: ip(6), rq: (f < 0.5 ? a : b)[7], sats: (f < 0.5 ? a : b)[8], dist, ke };
}
const fmt = (x, d = 0, u = '') => (x == null || Number.isNaN(x) ? '—' : (+x).toFixed(d) + u);
const mmss = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); };
const keColour = (ke) => (ke == null ? '#e2e8f0' : ke > 34 ? '#f87171' : ke > 15 ? '#fbbf24' : '#4ade80');

// ── Overlay drawing shared by the replay and the export ────────────────────────────────────────────────
function drawOsd(g, x, y, w, h, s, opt) {
  const sc = Math.max(0.6, Math.min(1.6, h / 720));
  g.save(); g.font = `700 ${Math.round(30 * sc)}px ui-monospace, Menlo, Consolas, monospace`; g.textBaseline = 'alphabetic';
  const sh = (txt, tx, ty, col = '#fff', align = 'left') => { g.textAlign = align; g.lineWidth = 5 * sc; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(txt, tx, ty); g.fillStyle = col; g.fillText(txt, tx, ty); };
  const pad = 22 * sc;
  if (s) {
    sh(fmt(s.alt, 1, ' m'), x + pad, y + h - pad - 40 * sc); sh('ALT', x + pad, y + h - pad - 74 * sc, '#a5f3fc');
    sh(fmt(s.kmh, 0, ' km/h'), x + w - pad, y + h - pad - 40 * sc, '#fff', 'right'); sh('SPEED', x + w - pad, y + h - pad - 74 * sc, '#a5f3fc', 'right');
    g.font = `700 ${Math.round(20 * sc)}px ui-monospace, Menlo, Consolas, monospace`;
    sh(`${fmt(s.cell, 2, ' V/cell')}  ${fmt(s.dist, 0, ' m')} home`, x + pad, y + h - pad, '#fff');
    sh(`RQ ${fmt(s.rq, 0, '%')}  ${fmt(s.sats, 0)} sats`, x + w - pad, y + h - pad, '#fff', 'right');
    if (s.ke != null) sh(`KE ${fmt(s.ke, 1, ' J')}`, x + w - pad, y + pad + 20 * sc, keColour(s.ke), 'right');
  }
  g.font = `700 ${Math.round(18 * sc)}px ui-monospace, Menlo, Consolas, monospace`;
  if (opt && opt.clock) sh(opt.clock, x + pad, y + pad + 18 * sc, '#fff');
  g.restore();
}
function drawPanel(g, x, y, w, h, t, s, cur, opt) {
  g.save(); g.fillStyle = '#0f172a'; g.fillRect(x, y, w, h);
  const P = 16; let yy = y + P;
  g.fillStyle = '#c4b5fd'; g.font = '700 12px system-ui, sans-serif'; g.fillText((opt.company || 'DREAM FLIGHT RPA').toUpperCase(), x + P, yy + 10); yy += 22;
  g.fillStyle = '#fff'; g.font = '800 17px system-ui, sans-serif'; g.fillText(opt.title || 'Flight', x + P, yy + 14, w - 2 * P); yy += 22;
  g.fillStyle = '#94a3b8'; g.font = '12px system-ui, sans-serif'; g.fillText(opt.sub || '', x + P, yy + 10, w - 2 * P); yy += 24;
  const box = (lab, val, bx, by, col) => { g.fillStyle = '#1e293b'; g.fillRect(bx, by, (w - 3 * P) / 2, 46); g.fillStyle = '#94a3b8'; g.font = '700 10px system-ui'; g.fillText(lab, bx + 8, by + 15); g.fillStyle = col || '#fff'; g.font = '700 18px ui-monospace, Menlo, monospace'; g.fillText(val, bx + 8, by + 37); };
  const bw = (w - 3 * P) / 2;
  box('ALTITUDE', fmt(s && s.alt, 1, ' m'), x + P, yy); box('SPEED', fmt(s && s.kmh, 0, ' km/h'), x + 2 * P + bw, yy); yy += 54;
  box('FROM HOME', fmt(s && s.dist, 0, ' m'), x + P, yy); box('BATTERY', fmt(s && s.cell, 2, ' V/cell'), x + 2 * P + bw, yy); yy += 54;
  box('LINK', `RQ ${fmt(s && s.rq, 0, '%')}`, x + P, yy); box('KINETIC ENERGY', fmt(s && s.ke, 1, ' J'), x + 2 * P + bw, yy, keColour(s && s.ke)); yy += 62;
  // track
  const tr = (t.trace || []).filter(p => p[3] != null), mh = Math.min(170, h - (yy - y) - 130);
  if (tr.length > 1 && mh > 60) {
    g.fillStyle = '#1e293b'; g.fillRect(x + P, yy, w - 2 * P, mh);
    const k = Math.cos(tr[0][3] * Math.PI / 180), xs = tr.map(p => p[4] * k), ys = tr.map(p => p[3]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), span = Math.max(maxX - minX, maxY - minY, 1e-6);
    const S = (Math.min(w - 2 * P, mh) - 20) / span, ox = x + P + (w - 2 * P - (maxX - minX) * S) / 2, oy = yy + (mh - (maxY - minY) * S) / 2;
    const px = (lng) => ox + (lng * k - minX) * S, py = (lat) => oy + (maxY - lat) * S;
    g.strokeStyle = '#38bdf8'; g.lineWidth = 2; g.beginPath(); tr.forEach((p, i) => { const X = px(p[4]), Y = py(p[3]); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
    if (t.home) { g.fillStyle = '#22c55e'; g.beginPath(); g.arc(px(t.home[1]), py(t.home[0]), 4, 0, 7); g.fill(); }
    if (s && s.lat != null) { g.fillStyle = '#f43f5e'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(px(s.lng), py(s.lat), 6, 0, 7); g.fill(); g.stroke(); }
    yy += mh + 10;
  }
  // altitude / speed chart
  const all = t.trace || [], ch = Math.max(60, h - (yy - y) - P - 14);
  if (all.length > 1) {
    const dur = Math.max(1, t.durationSec || all[all.length - 1][0]), topA = Math.max(10, (t.maxAltM || 0) * 1.15), topS = Math.max(20, (t.maxSpeedKmh || 0) * 1.1);
    const cx = x + P, cw = w - 2 * P, X = (sec) => cx + (sec / dur) * cw, YA = (m) => yy + ch - (Math.max(0, m) / topA) * ch, YS = (k) => yy + ch - (Math.max(0, k) / topS) * ch;
    g.fillStyle = '#1e293b'; g.fillRect(cx, yy, cw, ch);
    g.strokeStyle = '#60a5fa'; g.lineWidth = 2; g.beginPath(); all.filter(p => p[1] != null).forEach((p, i) => { i ? g.lineTo(X(p[0]), YA(p[1])) : g.moveTo(X(p[0]), YA(p[1])); }); g.stroke();
    g.strokeStyle = '#f59e0b'; g.lineWidth = 1.5; g.beginPath(); all.filter(p => p[2] != null).forEach((p, i) => { i ? g.lineTo(X(p[0]), YS(p[2])) : g.moveTo(X(p[0]), YS(p[2])); }); g.stroke();
    if (cur != null) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(Math.min(dur, Math.max(0, cur))), yy); g.lineTo(X(Math.min(dur, Math.max(0, cur))), yy + ch); g.stroke(); }
    g.fillStyle = '#94a3b8'; g.font = '10px system-ui'; g.fillText('altitude', cx + 4, yy + ch + 12); g.fillStyle = '#f59e0b'; g.fillText('speed', cx + 54, yy + ch + 12);
    g.fillStyle = '#94a3b8'; g.textAlign = 'right'; g.fillText(mmss(cur) + ' / ' + mmss(dur), cx + cw, yy + ch + 12); g.textAlign = 'left';
  }
  g.restore();
}

// ── Export: video + telemetry composited on a canvas, recorded in real time ────────────────────────────────
export function pickRecorderType() {
  const c = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return (typeof MediaRecorder !== 'undefined' && c.find(x => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x))) || '';
}
async function exportVideo({ url, t, kg, offsetSec, opt, onProgress, cancelRef }) {
  const type = pickRecorderType(); if (!type) throw new Error('This browser can\'t record video. Try Chrome or Edge.');
  const v = document.createElement('video'); v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('Could not open the video')); });
  const vw = v.videoWidth || 960, vh = v.videoHeight || 720, H = 720, VW = Math.round(vw * H / vh), PW = 360, W = VW + PW;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const stream = c.captureStream(30), chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8000000 });
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(res => { rec.onstop = res; });
  const draw = () => {
    const sec = v.currentTime + offsetSec, s = t ? telemetryAt(t, sec, kg) : null;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.drawImage(v, 0, 0, VW, H);
    const clock = t && t.startMs ? new Date(t.startMs + sec * 1000).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    drawOsd(g, 0, 0, VW, H, s, { clock });
    if (t) drawPanel(g, VW, 0, PW, H, t, s, sec, opt); else { g.fillStyle = '#0f172a'; g.fillRect(VW, 0, PW, H); }
  };
  let raf = 0; const loop = () => { draw(); onProgress && onProgress(v.duration ? v.currentTime / v.duration : 0); if (cancelRef.current) { v.pause(); rec.stop(); return; } raf = requestAnimationFrame(loop); };
  v.currentTime = 0; await new Promise(r => { v.onseeked = r; setTimeout(r, 400); });
  draw(); rec.start(500); await v.play(); loop();
  await new Promise(res => { v.onended = res; const iv = setInterval(() => { if (cancelRef.current) { clearInterval(iv); res(); } }, 200); });
  cancelAnimationFrame(raf); draw(); if (rec.state !== 'inactive') rec.stop(); await done;
  stream.getTracks().forEach(tr => tr.stop());
  if (cancelRef.current) return null;
  return new Blob(chunks, { type: type.split(';')[0] });
}

// ── Replay window ─────────────────────────────────────────────────────────────────────────────────────
export function FlightReplay({ file, video, flight, kg, title, sub, company, onClose, onSaveOffset }) {
  const t = flight.telemetry || null;
  const url = useMemo(() => URL.createObjectURL(file.type ? file : new Blob([file], { type: 'video/mp4' })), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const vref = useRef(null), mapDiv = useRef(null), mapRef = useRef(null), dotRef = useRef(null), osdRef = useRef(null);
  const [cur, setCur] = useState(0), [offset, setOffset] = useState(video.offsetSec || 0), [vdur, setVdur] = useState(video.durationSec || 0);
  const [exp, setExp] = useState(null); const cancelRef = useRef(false);
  const s = t ? telemetryAt(t, cur + offset, kg) : null;
  useEffect(() => { const k = (e) => { if (e.key === 'Escape' && !exp) onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose, exp]);
  // per-frame updates without re-rendering React on every frame
  useEffect(() => { const v = vref.current; if (!v) return; let raf = 0; const tick = () => { setCur(v.currentTime); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, []);
  // OSD on a canvas over the video
  useEffect(() => { const c = osdRef.current, v = vref.current; if (!c || !v) return; const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    const clock = t && t.startMs ? new Date(t.startMs + (cur + offset) * 1000).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    drawOsd(g, 0, 0, r.width, r.height, s, { clock }); });
  // map
  useEffect(() => {
    const Lf = window.L, el = mapDiv.current; if (!Lf || !el || !t) return;
    const pts = (t.trace || []).filter(p => p[3] != null).map(p => [p[3], p[4]]); if (pts.length < 2) return;
    const m = Lf.map(el, { zoomControl: true, attributionControl: false });
    Lf.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19 }).addTo(m);
    Lf.polyline(pts, { color: '#38bdf8', weight: 3 }).addTo(m);
    if (t.home) Lf.circleMarker(t.home, { radius: 6, color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }).addTo(m);
    dotRef.current = Lf.circleMarker(pts[0], { radius: 7, color: '#fff', weight: 2, fillColor: '#f43f5e', fillOpacity: 1 }).addTo(m);
    m.fitBounds(Lf.latLngBounds(pts).pad(0.25), { maxZoom: 19 }); mapRef.current = m;
    setTimeout(() => m.invalidateSize(), 200);
    return () => { m.remove(); mapRef.current = null; };
  }, [t]);
  useEffect(() => { if (dotRef.current && s && s.lat != null) dotRef.current.setLatLng([s.lat, s.lng]); });
  const seekTel = (sec) => { const v = vref.current; if (v) v.currentTime = Math.max(0, sec - offset); };
  const nudge = (d) => setOffset(o => Math.round((o + d) * 10) / 10);
  const dur = t ? Math.max(1, t.durationSec || 1) : 1, tr = (t && t.trace) || [];
  const W = 600, H = 110, X = (sec) => (Math.max(0, Math.min(dur, sec)) / dur) * W;
  const topA = Math.max(10, ((t && t.maxAltM) || 0) * 1.15), topS = Math.max(20, ((t && t.maxSpeedKmh) || 0) * 1.1);
  const aPts = tr.filter(p => p[1] != null).map(p => X(p[0]).toFixed(1) + ',' + (H - p[1] / topA * H).toFixed(1)).join(' ');
  const sPts = tr.filter(p => p[2] != null).map(p => X(p[0]).toFixed(1) + ',' + (H - p[2] / topS * H).toFixed(1)).join(' ');
  const doExport = async () => {
    cancelRef.current = false; setExp({ p: 0 }); vref.current && vref.current.pause();
    try {
      const blob = await exportVideo({ url, t, kg, offsetSec: offset, opt: { title, sub, company }, onProgress: (p) => setExp({ p }), cancelRef });
      if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        a.download = (title || 'Flight').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') + '_telemetry.' + ext; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
      setExp(null);
    } catch (e) { setExp(null); alert('Export failed: ' + (e.message || e)); }
  };
  const btn = 'px-2.5 py-1 rounded text-xs font-semibold';
  return (
    <div className="fixed inset-0 z-[5200] bg-slate-950/95 overflow-y-auto text-white print:hidden" data-replay="1">
      <div className="max-w-7xl mx-auto p-3 sm:p-5 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0"><div className="text-xs uppercase tracking-widest text-violet-300 font-bold">Flight replay</div><div className="font-bold text-lg truncate">{title}</div><div className="text-xs text-slate-400 truncate">{sub} · {video.name}</div></div>
          <button onClick={doExport} disabled={!!exp} data-replay-export="1" className={btn + ' bg-violet-600 hover:bg-violet-500 disabled:opacity-50 py-2'}><i className="fa-solid fa-file-video mr-1.5"></i>Export video with telemetry</button>
          <button onClick={onClose} disabled={!!exp} className="text-slate-400 hover:text-white text-2xl px-2" aria-label="Close"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 relative bg-black rounded-xl overflow-hidden">
            <video ref={vref} src={url} controls playsInline className="w-full block" data-replay-video="1" onLoadedMetadata={e => setVdur(e.currentTarget.duration)} />
            <canvas ref={osdRef} className="absolute inset-0 w-full pointer-events-none" style={{ height: 'calc(100% - 44px)' }} />
          </div>
          <div className="space-y-3">
            <div ref={mapDiv} className="h-64 lg:h-80 rounded-xl overflow-hidden bg-slate-800" data-replay-map="1">{!t && <div className="p-4 text-sm text-slate-400">No telemetry on this flight, so there's no GPS track. Attach the EdgeTX CSV to see it.</div>}</div>
            <div className="grid grid-cols-2 gap-2 text-sm" data-replay-readouts="1">
              {[['Altitude', fmt(s && s.alt, 1, ' m')], ['Speed', fmt(s && s.kmh, 0, ' km/h')], ['From home', fmt(s && s.dist, 0, ' m')], ['Battery', fmt(s && s.cell, 2, ' V/cell')], ['Link', 'RQ ' + fmt(s && s.rq, 0, '%')], ['KE', fmt(s && s.ke, 1, ' J')]].map(([k, v]) => (
                <div key={k} className="bg-slate-800 rounded-lg px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{k}</div><div className="font-mono font-bold" style={k === 'KE' ? { color: keColour(s && s.ke) } : undefined}>{v}</div></div>))}
            </div>
          </div>
        </div>
        {t && (
          <div className="bg-slate-900 rounded-xl p-3">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 cursor-pointer" preserveAspectRatio="none" data-replay-chart="1"
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); seekTel((e.clientX - r.left) / r.width * dur); }}>
              <polyline points={aPts} fill="none" stroke="#60a5fa" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <polyline points={sPts} fill="none" stroke="#f59e0b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <rect x={X(offset)} y="0" width={Math.max(0, X(offset + (vdur || 0)) - X(offset))} height={H} fill="#a78bfa" opacity="0.12" />
              <line x1={X(cur + offset)} x2={X(cur + offset)} y1="0" y2={H} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-slate-400 mt-1">
              <span><span className="text-sky-400">— altitude</span> · <span className="text-amber-400">— speed</span> · shaded = the video · click the chart to jump</span>
              <span className="flex items-center gap-1.5" data-replay-sync="1">Sync: telemetry is <b className="text-white font-mono">{offset >= 0 ? '+' : ''}{offset.toFixed(1)} s</b> ahead of the video
                {[-1, -0.1, 0.1, 1].map(d => <button key={d} onClick={() => nudge(d)} className={btn + ' bg-slate-700 hover:bg-slate-600'}>{d > 0 ? '+' : ''}{d}s</button>)}
                <button onClick={() => onSaveOffset(offset)} disabled={offset === (video.offsetSec || 0)} className={btn + ' bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40'} data-replay-save-sync="1">Save sync</button>
              </span>
            </div>
          </div>
        )}
      </div>
      {exp && (
        <div className="fixed inset-0 z-[5300] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl p-6 w-full max-w-md space-y-3" data-replay-exporting="1">
            <div className="font-bold">Exporting the flight video…</div>
            <p className="text-sm text-slate-400">It records in real time ({mmss(vdur)}), so keep this tab open and in front until it finishes.</p>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-violet-500" style={{ width: Math.round((exp.p || 0) * 100) + '%' }} /></div>
            <button onClick={() => { cancelRef.current = true; }} className={btn + ' bg-slate-700'}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Sync offset for one video against one flight's telemetry (seconds of telemetry at video 0:00)
export function offsetFor(info, t) {
  if (!info || !info.startMs || !t || !t.startMs) return 0;
  const tz = new Date(t.startMs).getTimezoneOffset() * 60, g0 = (info.startMs - t.startMs) / 1000;
  const g = [g0, g0 + tz, g0 - tz].reduce((b, x) => (Math.abs(x) < Math.abs(b) ? x : b), g0);
  return Math.abs(g) <= 600 ? Math.round(g * 10) / 10 : 0;
}
if (typeof window !== 'undefined') window.__wdVideo = { videoInfo, matchVideos, offsetFor, telemetryAt };
