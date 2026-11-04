// 3D view of the advanced ops map (v7.9): zones raised to their ceilings, exclusion zones as red walls, flight paths
// at their planned heights (coloured by the checks), take-off / emergency landing / caution markers with labels, and
// the plan overlay as the ground. three.js is loaded from the CDN the first time someone opens this view.
import React, { useEffect, useRef, useState } from 'react';
import { makeProj, refOf, kindStyle, zoneBuffer } from './geo.js';

let threeP = null;
const loadThree = () => threeP || (threeP = new Promise((res, rej) => {
  if (window.THREE) return res(window.THREE);
  const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s.onload = () => (window.THREE ? res(window.THREE) : rej(new Error('three.js did not load')));
  s.onerror = () => { threeP = null; rej(new Error('The 3D view needs an internet connection the first time.')); };
  document.head.appendChild(s);
}));
const STATUS = { ok: 0x0f172a, warn: 0xd97706, stop: 0xdc2626 };

export default function Ops3D({ doc, checks }) {
  const host = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true, cleanup = () => {};
    loadThree().then((THREE) => { if (!alive || !host.current) return; cleanup = build(THREE, host.current, doc, checks); }).catch((e) => setErr(e.message || String(e)));
    return () => { alive = false; cleanup(); };
  }, [doc, checks]);
  return (
    <div className="absolute inset-0 bg-slate-200" data-ops-3d="1">
      <div ref={host} className="absolute inset-0"></div>
      {err && <div className="absolute inset-0 flex items-center justify-center text-sm text-red-700 p-6 text-center">{err}</div>}
      <div className="absolute top-2 left-2 bg-white/95 border border-slate-300 rounded-lg px-3 py-2 text-[11px] text-slate-700 max-w-[260px]" data-ops-noprint="1">Drag to turn · right-drag or Shift-drag to pan · scroll or pinch to zoom. Zones rise to their height limit above their own ground.</div>
    </div>
  );
}

function label(THREE, text, { bg = 'rgba(255,255,255,0.94)', fg = '#0f172a', border = '#0f172a', size = 28 } = {}) {
  const lines = String(text).split('\n').slice(0, 4);
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  const w = Math.min(900, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28), h = lines.length * size * 1.3 + 18;
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = bg; ctx.strokeStyle = border; ctx.lineWidth = 3;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(1.5, 1.5, c.width - 3, c.height - 3, 10); else ctx.rect(1.5, 1.5, c.width - 3, c.height - 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = fg; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, 14, 9 + i * size * 1.3));
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  sp.userData.aspect = c.width / c.height; sp.renderOrder = 10;
  return sp;
}

function build(THREE, el, doc, checks) {
  const ref = refOf(doc) || [0, 0], prj = makeProj(doc.mode, ref);
  const P = (ll) => { const p = prj.to(ll); return { x: p.x, z: -p.y }; };
  const W = el.clientWidth || 800, H = el.clientHeight || 500;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W, H); renderer.setClearColor(0xe2e8f0);
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.75)); const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(60, 120, 40); scene.add(sun);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  // extent
  const pts = [];
  doc.zones.forEach((z) => { if (z.shape === 'circle') { const c = P(z.c); pts.push(c, { x: c.x + z.r, z: c.z + z.r }, { x: c.x - z.r, z: c.z - z.r }); } else z.pts.forEach((q) => pts.push(P(q))); });
  doc.paths.forEach((p) => p.pts.forEach((q) => pts.push(P(q)))); doc.points.forEach((p) => pts.push(P([p.lat, p.lng])));
  if (doc.overlay) { const c = P(doc.overlay.center), hw = doc.overlay.widthM / 2; pts.push({ x: c.x - hw, z: c.z - hw }, { x: c.x + hw, z: c.z + hw }); }
  if (!pts.length) pts.push({ x: -50, z: -50 }, { x: 50, z: 50 });
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x)), minZ = Math.min(...pts.map((p) => p.z)), maxZ = Math.max(...pts.map((p) => p.z));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, span = Math.max(20, maxX - minX, maxZ - minZ);
  const maxAlt = Math.max(5, ...doc.paths.flatMap((p) => p.pts.map((q) => Number(q[2]) || 0)), ...doc.zones.map((z) => (Number(z.ground) || 0) + (Number(z.h) || 0)).filter((x) => x < 200));
  const lblScale = span / 22;

  // ground: the plan overlay, else a grid
  if (doc.overlay && doc.overlay.src) {
    const o = doc.overlay, c = P(o.center);
    const tex = keep(new THREE.TextureLoader().load(o.src)); tex.minFilter = THREE.LinearFilter;
    const g = keep(new THREE.PlaneGeometry(o.widthM, o.widthM * (o.aspect || 1)));
    const m = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: Math.max(0.5, (o.opacity == null ? 60 : o.opacity) / 100) }));
    const mesh = new THREE.Mesh(g, m); mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = -((o.rot || 0) * Math.PI) / 180; mesh.position.set(c.x, -0.02, c.z); scene.add(mesh);
  }
  const grid = new THREE.GridHelper(span * 1.6, 32, 0x94a3b8, 0xcbd5e1); grid.position.set(cx, -0.05, cz); scene.add(grid);

  // zones
  const shapeOf = (z) => {
    const s = new THREE.Shape();
    if (z.shape === 'circle') { const c = prj.to(z.c); s.absarc(c.x, c.y, Number(z.r) || 0.1, 0, Math.PI * 2, false); return s; }
    z.pts.map(prj.to).forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y))); s.closePath(); return s;
  };
  const sorted = [...doc.zones].sort((a, b) => (a.kind === 'exclusion') - (b.kind === 'exclusion'));
  sorted.forEach((z) => {
    if (z.shape !== 'circle' && (z.pts || []).length < 3) return;
    const k = kindStyle(z.kind, doc.settings);
    const ground = Number(z.ground) || 0;
    const h = z.kind === 'exclusion' ? Math.max(maxAlt * 1.3, 10) : Math.min(Number(z.h) > 0 ? Number(z.h) : (z.kind === 'clear' ? Math.max(maxAlt * 1.3, 10) : 2), maxAlt * 2 + 10);
    const geo = keep(new THREE.ExtrudeGeometry(shapeOf(z), { depth: h, bevelEnabled: false, curveSegments: 48 })); geo.rotateX(-Math.PI / 2);
    const mat = keep(new THREE.MeshLambertMaterial({ color: k.color, transparent: true, opacity: z.kind === 'exclusion' ? 0.32 : 0.22, depthWrite: false, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(geo, mat); mesh.position.y = ground; scene.add(mesh);
    const edges = new THREE.LineSegments(keep(new THREE.EdgesGeometry(geo, 30)), keep(new THREE.LineBasicMaterial({ color: k.stroke }))); edges.position.y = ground; scene.add(edges);
    if (z.kind === 'exclusion') { const b = zoneBuffer(z); if (b > 0 && z.shape === 'circle') { const c = P(z.c); const ring = new THREE.Mesh(keep(new THREE.RingGeometry(z.r, z.r + b, 64)), keep(new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }))); ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, 0.03, c.z); scene.add(ring); } }
    // label at the zone's top
    const cen = z.shape === 'circle' ? P(z.c) : (() => { const q = z.pts.map(P); return { x: q.reduce((t, p) => t + p.x, 0) / q.length, z: q.reduce((t, p) => t + p.z, 0) / q.length }; })();
    const t = z.name + (z.kind === 'exclusion' ? '' : z.h != null && z.h !== '' ? '\n≤ ' + z.h + ' m' + (z.v != null && z.v !== '' ? ' · ' + z.v + ' m/s' : '') : '');
    const sp = label(THREE, t, { border: k.stroke }); { const hh = 0.03 * t.split('\n').length + 0.012; sp.scale.set(hh * sp.userData.aspect, hh, 1); } sp.position.set(cen.x, ground + h + lblScale * 0.3, cen.z); scene.add(sp); disposables.push(sp.material.map, sp.material);
  });

  // paths
  const rad = Math.max(0.12, span / 500);
  doc.paths.forEach((path) => {
    const res = checks && checks.paths[path.id];
    const V = path.pts.map((q) => { const p = P(q); return new THREE.Vector3(p.x, Number(q[2]) || 0, p.z); });
    for (let i = 0; i < V.length - 1; i++) {
      const st = res && res.legs[i] ? res.legs[i].status : 'ok';
      const tube = keep(new THREE.TubeGeometry(new THREE.LineCurve3(V[i], V[i + 1]), 1, rad, 8, false));
      scene.add(new THREE.Mesh(tube, keep(new THREE.MeshLambertMaterial({ color: STATUS[st] }))));
    }
    V.forEach((v, i) => {
      const s = new THREE.Mesh(keep(new THREE.SphereGeometry(rad * 2.6, 16, 12)), keep(new THREE.MeshLambertMaterial({ color: 0xffffff }))); s.position.copy(v); scene.add(s);
      const drop = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([v, new THREE.Vector3(v.x, 0, v.z)])), keep(new THREE.LineDashedMaterial({ color: 0x334155, dashSize: span / 120, gapSize: span / 160 }))); drop.computeLineDistances(); scene.add(drop);
      const sp = label(THREE, (i + 1) + ' · ' + (Math.round((Number(path.pts[i][2]) || 0) * 10) / 10) + ' m', { size: 24 }); sp.scale.set(0.034 * sp.userData.aspect, 0.034, 1); sp.position.set(v.x, v.y + lblScale * 0.22, v.z); scene.add(sp); disposables.push(sp.material.map, sp.material);
    });
  });

  // points
  doc.points.forEach((p) => {
    const c = P([p.lat, p.lng]);
    let mesh = null, txt = p.title || '', top = 1;
    if (p.kind === 'tlz') { const s = Number(p.size) || 5; mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(s, 0.15, s)), keep(new THREE.MeshLambertMaterial({ color: 0x0f172a }))); mesh.position.set(c.x, 0.08, c.z); }
    else if (p.kind === 'elz') { const r = Number(p.size) || 4; mesh = new THREE.Mesh(keep(new THREE.CylinderGeometry(r, r, 0.15, 40)), keep(new THREE.MeshLambertMaterial({ color: 0xea580c }))); mesh.position.set(c.x, 0.08, c.z); }
    else if (p.kind === 'poi') { const h = Math.max(1.5, span / 40); mesh = new THREE.Mesh(keep(new THREE.ConeGeometry(h * 0.45, h, 3)), keep(new THREE.MeshLambertMaterial({ color: 0xfacc15 }))); mesh.position.set(c.x, h / 2, c.z); top = h; txt = '! ' + txt; }
    else { mesh = new THREE.Mesh(keep(new THREE.SphereGeometry(rad * 2, 12, 8)), keep(new THREE.MeshLambertMaterial({ color: 0xffffff }))); mesh.position.set(c.x, rad * 2, c.z); }
    scene.add(mesh);
    if (p.text) txt += '\n' + String(p.text).split('\n').slice(0, 3).join('\n');
    const sp = label(THREE, txt, { size: 24, border: p.kind === 'poi' ? '#a16207' : '#0f172a' }); { const hh = 0.026 * txt.split('\n').length + 0.01; sp.scale.set(hh * sp.userData.aspect, hh, 1); } sp.position.set(c.x, top + lblScale * 0.4, c.z); scene.add(sp); disposables.push(sp.material.map, sp.material);
  });

  // camera + orbit
  const cam = new THREE.PerspectiveCamera(45, W / H, 0.1, span * 40);
  const target = new THREE.Vector3(cx, maxAlt / 3, cz);
  let theta = -Math.PI / 4, phi = 1.0, dist = span * 1.25;
  const place = () => { cam.position.set(target.x + dist * Math.sin(phi) * Math.sin(theta), target.y + dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.cos(theta)); cam.lookAt(target); };
  place();
  let raf = 0; const draw = () => { raf = 0; renderer.render(scene, cam); }; const req = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const cv = renderer.domElement; cv.style.touchAction = 'none';
  let drag = null; const ptrs = new Map(); let pinch = 0;
  const down = (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } };
  const move = (e) => {
    if (!drag) return; const prev = ptrs.get(e.pointerId); if (prev) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) { dist = Math.max(span * 0.05, Math.min(span * 8, dist * (pinch / d))); } pinch = d; place(); req(); return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) { const s = dist / 600; const right = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta)), fwd = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta)); target.addScaledVector(right, -dx * s).addScaledVector(fwd, -dy * s); }
    else { theta -= dx * 0.008; phi = Math.max(0.08, Math.min(Math.PI / 2 - 0.02, phi - dy * 0.008)); }
    place(); req();
  };
  const up = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) drag = null; pinch = 0; };
  const wheel = (e) => { e.preventDefault(); dist = Math.max(span * 0.05, Math.min(span * 8, dist * (e.deltaY > 0 ? 1.12 : 0.89))); place(); req(); };
  const ctx = (e) => e.preventDefault();
  cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('contextmenu', ctx);
  const ro = new ResizeObserver(() => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); req(); });
  ro.observe(el);
  // textures load asynchronously: redraw a few times
  req(); const t1 = setTimeout(req, 300), t2 = setTimeout(req, 1200);
  return () => {
    clearTimeout(t1); clearTimeout(t2); if (raf) cancelAnimationFrame(raf); ro.disconnect();
    cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); cv.removeEventListener('wheel', wheel); cv.removeEventListener('contextmenu', ctx);
    disposables.forEach((d) => { try { d.dispose(); } catch (e) {} }); grid.geometry.dispose(); renderer.dispose(); if (cv.parentNode) cv.parentNode.removeChild(cv);
  };
}
