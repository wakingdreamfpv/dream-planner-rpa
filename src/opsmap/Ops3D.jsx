// 3D view of the advanced ops map (v7.9): zones raised to their ceilings, exclusion zones as red walls, flight paths
// at their planned heights (coloured by the checks), take-off / emergency landing / caution markers with labels, and
// the plan overlay as the ground. three.js is loaded from the CDN the first time someone opens this view.
import React, { useEffect, useRef, useState } from 'react';
import { makeProj, refOf, kindStyle, zoneBuffer, fmtSpeed, terrainRefPoint } from './geo.js';
import { elevations, satelliteCanvas, lngToX, latToY } from './terrain.js';
// v7.27: outdoors, the ground is satellite imagery draped over the real terrain (heights relative to the take-off),
// with the site plan overlay blended on top; paths are clean lines with a start flag instead of a label on every point.

let threeP = null;
const loadThree = () => threeP || (threeP = new Promise((res, rej) => {
  if (window.THREE) return res(window.THREE);
  const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s.onload = () => (window.THREE ? res(window.THREE) : rej(new Error('three.js did not load')));
  s.onerror = () => { threeP = null; rej(new Error('The 3D view needs an internet connection the first time.')); };
  document.head.appendChild(s);
}));
const STATUS = { ok: 0x0f172a, warn: 0xd97706, stop: 0xdc2626 };

export default function Ops3D({ doc, checks, apiRef, camRef: camProp }) {
  const ownCam = useRef(null), camRef = camProp || ownCam; // the view survives the scene being rebuilt
  const host = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true, cleanup = () => {};
    loadThree().then((THREE) => { if (!alive || !host.current) return; cleanup = build(THREE, host.current, doc, checks, camRef, apiRef); }).catch((e) => setErr(e.message || String(e)));
    return () => { alive = false; cleanup(); };
  }, [doc, checks]);
  return (
    <div className="absolute inset-0 bg-slate-200" data-ops-3d="1">
      <div ref={host} className="absolute inset-0"></div>
      {err && <div className="absolute inset-0 flex items-center justify-center text-sm text-red-700 p-6 text-center">{err}</div>}
      <div className="absolute top-2 left-2 bg-white/95 border border-slate-300 rounded-lg px-3 py-2 text-[11px] text-slate-700 max-w-[260px]" data-ops-noprint="1">Drag to turn · right-drag or Shift-drag to pan · scroll or pinch to zoom. Zones rise to their height limit above their own ground.<span data-ops-3d-ground="1" className="block mt-1 text-slate-500"></span></div>
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

function build(THREE, el, doc, checks, camRef, apiRef) {
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

  // ground: the plan overlay, else a grid (outdoors this is replaced by the satellite / terrain ground once it loads)
  let flatOverlay = null;
  if (doc.overlay && doc.overlay.src) {
    const o = doc.overlay, c = P(o.center);
    const tex = keep(new THREE.TextureLoader().load(o.src)); tex.minFilter = THREE.LinearFilter;
    const g = keep(new THREE.PlaneGeometry(o.widthM, o.widthM * (o.aspect || 1)));
    const m = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: Math.max(0.5, (o.opacity == null ? 60 : o.opacity) / 100) }));
    const mesh = new THREE.Mesh(g, m); mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = -((o.rot || 0) * Math.PI) / 180; mesh.position.set(c.x, -0.02, c.z); scene.add(mesh); flatOverlay = mesh;
  }
  const grid = new THREE.GridHelper(span * 1.6, 32, 0x94a3b8, 0xcbd5e1); grid.position.set(cx, -0.05, cz); scene.add(grid);
  let alive = true;
  const groundNote = (t) => { const n = el.parentNode && el.parentNode.querySelector('[data-ops-3d-ground]'); if (n) n.textContent = t; };
  if (doc.mode !== 'plan') (async () => {
    const half = span * 0.8, N = 48;
    const corner = (dx, dz) => prj.from({ x: cx + dx, y: -(cz + dz) });
    const sw = corner(-half, half), ne = corner(half, -half); // [lat, lng]
    const [sat, terr] = await Promise.all([
      satelliteCanvas([sw[0], sw[1], ne[0], ne[1]]).catch(() => null),
      (async () => { const lls = [], rp = (doc.terrain && doc.terrain.ref) || terrainRefPoint(doc); for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) lls.push(corner(-half + (2 * half * i) / N, -half + (2 * half * j) / N));
        const r = await elevations(rp ? [rp, ...lls] : lls); const ref = rp ? r.elev[0] : Math.min(...r.elev); return { h: (rp ? r.elev.slice(1) : r.elev).map((e) => e - ref), src: r.src }; })().catch(() => null),
    ]);
    if (!alive || (!sat && !terr && !(doc.overlay && doc.overlay.src))) { groundNote('Satellite and terrain need an internet connection.'); return; }
    // texture: the satellite picture (or plain), with the plan overlay blended in at its place, size and turn
    const z = sat ? sat.z : 19, x0 = sat ? sat.x0 : lngToX(sw[1], 19) * 256, y0 = sat ? sat.y0 : latToY(ne[0], 19) * 256;
    let canvas = sat && sat.canvas;
    if (!canvas) { canvas = document.createElement('canvas'); const w = lngToX(ne[1], z) * 256 - x0, h = latToY(sw[0], z) * 256 - y0; const k = Math.min(1, 2048 / Math.max(w, h)); canvas.width = Math.max(2, w * k); canvas.height = Math.max(2, h * k); const g = canvas.getContext('2d'); g.fillStyle = '#e2e8f0'; g.fillRect(0, 0, canvas.width, canvas.height); canvas._k = k; }
    const kpx = canvas._k || 1, toPx = (ll) => ({ x: (lngToX(ll[1], z) * 256 - x0) * kpx, y: (latToY(ll[0], z) * 256 - y0) * kpx });
    if (doc.overlay && doc.overlay.src) {
      try {
        const o = doc.overlay, img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = o.src; });
        const c0 = toPx(o.center), mpp = (156543.03392 * Math.cos((o.center[0] * Math.PI) / 180)) / 2 ** z / kpx;
        const wpx = o.widthM / mpp, hpx = wpx * (o.aspect || 1), g = canvas.getContext('2d');
        g.save(); g.globalAlpha = (o.opacity == null ? 60 : o.opacity) / 100; g.translate(c0.x, c0.y); g.rotate(((o.rot || 0) * Math.PI) / 180); g.drawImage(img, -wpx / 2, -hpx / 2, wpx, hpx); g.restore();
      } catch (e) { /* the overlay stays as the flat plane */ }
    }
    if (!alive) return;
    // v7.28: zone floors (and exclusion buffers) painted onto the ground picture, so they lie exactly on the terrain
    { const g = canvas.getContext('2d'), hexA = (c, a) => { const n = parseInt(String(c).replace('#', ''), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
      const outline = (z, grow) => { g.beginPath(); if (z.shape === 'circle') { const c0 = toPx(z.c), mpp = (156543.03392 * Math.cos((z.c[0] * Math.PI) / 180)) / 2 ** z0 / kpx; g.arc(c0.x, c0.y, ((Number(z.r) || 0) + grow) / mpp, 0, Math.PI * 2); } else z.pts.forEach((q, i) => { const p = toPx(q); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }); g.closePath(); };
      const z0 = z, toHex = (v) => typeof v === 'number' ? '#' + v.toString(16).padStart(6, '0') : v;
      [...doc.zones].sort((a, b) => (a.kind === 'exclusion') - (b.kind === 'exclusion')).forEach((zz) => { if (zz.shape !== 'circle' && (zz.pts || []).length < 3) return; const k = kindStyle(zz.kind, doc.settings);
        if (zz.kind === 'exclusion' && zz.shape === 'circle') { const b = zoneBuffer(zz); if (b > 0) { outline(zz, b); g.fillStyle = 'rgba(245,158,11,0.28)'; g.fill(); } }
        outline(zz, 0); g.fillStyle = hexA(toHex(k.color), zz.kind === 'exclusion' ? 0.38 : 0.3); g.fill(); g.lineWidth = Math.max(2, canvas.width / 600); g.strokeStyle = toHex(k.stroke); g.stroke(); }); }
    const tex = keep(new THREE.CanvasTexture(canvas)); tex.minFilter = THREE.LinearFilter;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const dx = -half + (2 * half * i) / N, dz = -half + (2 * half * j) / N, ll = corner(dx, dz), q = toPx(ll);
      pos.push(cx + dx, terr ? terr.h[j * (N + 1) + i] - 0.05 : -0.03, cz + dz); uv.push(q.x / canvas.width, 1 - q.y / canvas.height);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = keep(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));
    scene.add(mesh); grid.visible = false; if (flatOverlay) flatOverlay.visible = false;
    if (terr) { // walls, tops and markers follow the ground (bilinear on the same grid as the terrain mesh)
      const H = terr.h, gAt = (x, zz) => { const fi = ((x - cx + half) / (2 * half)) * N, fj = ((zz - cz + half) / (2 * half)) * N; if (!(fi >= 0 && fj >= 0 && fi <= N && fj <= N)) return null;
        const i0 = Math.min(N - 1, Math.floor(fi)), j0 = Math.min(N - 1, Math.floor(fj)), ti = fi - i0, tj = fj - j0, v = (i, j) => H[j * (N + 1) + i];
        return (v(i0, j0) * (1 - ti) + v(i0 + 1, j0) * ti) * (1 - tj) + (v(i0, j0 + 1) * (1 - ti) + v(i0 + 1, j0 + 1) * ti) * tj; };
      placeOnGround(gAt); if (window.__WD_3D) window.__WD_3D.onTerrain = true;
    }
    groundNote((sat ? 'Satellite imagery' : 'Plan overlay') + (terr ? ' on the terrain (' + terr.src + '), heights from the take-off.' : ' (flat: terrain data unavailable).'));
    req();
  })();

  // zones and markers. v7.28: on real terrain each zone's walls follow the ground along its edge (bottom on the ground,
  // top at its height limit above that ground) and its floor is painted onto the ground picture; TLZ / E-LZ / caution
  // markers sit on the ground too. Until terrain loads (or without it) they stand on a flat ground as before.
  const onGround = new THREE.Group(); scene.add(onGround);
  const zoneTops = (z) => z.kind === 'exclusion' ? Math.max(maxAlt * 1.3, 10) : Math.min(Number(z.h) > 0 ? Number(z.h) : (z.kind === 'clear' ? Math.max(maxAlt * 1.3, 10) : 2), maxAlt * 2 + 10);
  const ringOf = (z) => { // the zone's edge in scene x/z, a point every few metres
    const step = Math.max(0.5, span / 90);
    if (z.shape === 'circle') { const c = P(z.c), r = Number(z.r) || 0.1, n = Math.max(48, Math.min(160, Math.ceil((2 * Math.PI * r) / step))); return { pts: Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), z: c.z + r * Math.sin((2 * Math.PI * i) / n) })), corners: [] }; }
    const q = z.pts.map(P), out = [], corners = [];
    q.forEach((p0, i) => { const p1 = q[(i + 1) % q.length], L = Math.hypot(p1.x - p0.x, p1.z - p0.z), n = Math.max(1, Math.ceil(L / step)); corners.push(out.length); for (let k = 0; k < n; k++) out.push({ x: p0.x + ((p1.x - p0.x) * k) / n, z: p0.z + ((p1.z - p0.z) * k) / n }); });
    return { pts: out, corners };
  };
  const clearGroup = () => { [...onGround.children].forEach((o) => { onGround.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); };
  const placeOnGround = (gAt) => { // gAt(x, z) → ground height there, or null for the flat ground
    clearGroup();
    const G = (x, zz, dflt) => { const g = gAt ? gAt(x, zz) : null; return g == null ? dflt : g; };
    const add = (o) => { onGround.add(o); return o; };
    const sorted = [...doc.zones].sort((a, b) => (a.kind === 'exclusion') - (b.kind === 'exclusion'));
    sorted.forEach((z) => {
      if (z.shape !== 'circle' && (z.pts || []).length < 3) return;
      const k = kindStyle(z.kind, doc.settings), base = Number(z.ground) || 0, h = zoneTops(z);
      const mat = new THREE.MeshLambertMaterial({ color: k.color, transparent: true, opacity: z.kind === 'exclusion' ? 0.32 : 0.22, depthWrite: false, side: THREE.DoubleSide });
      const line = new THREE.LineBasicMaterial({ color: k.stroke });
      const cen = z.shape === 'circle' ? P(z.c) : (() => { const q = z.pts.map(P); return { x: q.reduce((t, p) => t + p.x, 0) / q.length, z: q.reduce((t, p) => t + p.z, 0) / q.length }; })();
      let topY = base + h;
      if (!gAt) { // flat: one solid block
        const geo = new THREE.ExtrudeGeometry(shapeOf(z), { depth: h, bevelEnabled: false, curveSegments: 48 }); geo.rotateX(-Math.PI / 2);
        add(new THREE.Mesh(geo, mat)).position.y = base;
        add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), line)).position.y = base;
        if (z.kind === 'exclusion') { const b = zoneBuffer(z); if (b > 0 && z.shape === 'circle') { const c = P(z.c); const ring = add(new THREE.Mesh(new THREE.RingGeometry(z.r, z.r + b, 64), new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }))); ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, base + 0.03, c.z); } }
      } else { // on the terrain: walls that follow the ground, a top that follows it too (height limit above own ground)
        const { pts: R, corners } = ringOf(z), n = R.length, gy = R.map((p) => G(p.x, p.z, base) + 0.05);
        const pos = [], idx = [];
        R.forEach((p, i) => { pos.push(p.x, gy[i], p.z, p.x, gy[i] + h, p.z); });
        for (let i = 0; i < n; i++) { const j = (i + 1) % n, a0 = 2 * i, a1 = 2 * i + 1, b0 = 2 * j, b1 = 2 * j + 1; idx.push(a0, b0, a1, a1, b0, b1); }
        const tri = THREE.ShapeUtils.triangulateShape(R.map((p) => new THREE.Vector2(p.x, p.z)), []);
        tri.forEach(([u, v, w]) => idx.push(2 * u + 1, 2 * v + 1, 2 * w + 1));
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
        add(new THREE.Mesh(geo, mat));
        const lp = []; const seg = (a, b) => lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; seg({ x: R[i].x, y: gy[i], z: R[i].z }, { x: R[j].x, y: gy[j], z: R[j].z }); seg({ x: R[i].x, y: gy[i] + h, z: R[i].z }, { x: R[j].x, y: gy[j] + h, z: R[j].z }); }
        (corners.length ? corners : [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)]).forEach((i) => seg({ x: R[i].x, y: gy[i], z: R[i].z }, { x: R[i].x, y: gy[i] + h, z: R[i].z }));
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); add(new THREE.LineSegments(lg, line));
        topY = G(cen.x, cen.z, base) + h;
      }
      // label at the zone's top
      const t = z.name + (z.kind === 'exclusion' ? '' : z.h != null && z.h !== '' ? '\n≤ ' + z.h + ' m' + (z.v != null && z.v !== '' ? ' · ' + fmtSpeed(z.v) : '') : '');
      const sp = label(THREE, t, { border: k.stroke }); { const hh = 0.03 * t.split('\n').length + 0.012; sp.scale.set(hh * sp.userData.aspect, hh, 1); } sp.position.set(cen.x, topY + lblScale * 0.3, cen.z); add(sp);
    });
    // markers
    doc.points.forEach((p) => {
      const c = P([p.lat, p.lng]), g0 = G(c.x, c.z, 0);
      let mesh = null, txt = p.title || '', top = 1;
      if (p.kind === 'tlz') { const s = Number(p.size) || 5; mesh = new THREE.Mesh(new THREE.BoxGeometry(s, 0.15, s), new THREE.MeshLambertMaterial({ color: 0x0f172a })); mesh.position.set(c.x, g0 + 0.08, c.z); }
      else if (p.kind === 'elz') { const r = Number(p.size) || 4; mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.15, 40), new THREE.MeshLambertMaterial({ color: 0xea580c })); mesh.position.set(c.x, g0 + 0.08, c.z); }
      else if (p.kind === 'poi') { const h = Math.max(1.5, span / 40); mesh = new THREE.Mesh(new THREE.ConeGeometry(h * 0.45, h, 3), new THREE.MeshLambertMaterial({ color: 0xfacc15 })); mesh.position.set(c.x, g0 + h / 2, c.z); top = h; txt = '! ' + txt; }
      else { mesh = new THREE.Mesh(new THREE.SphereGeometry(rad * 2, 12, 8), new THREE.MeshLambertMaterial({ color: 0xffffff })); mesh.position.set(c.x, g0 + rad * 2, c.z); }
      add(mesh); mesh.userData.marker = p.kind;
      if (p.text) txt += '\n' + String(p.text).split('\n').slice(0, 3).join('\n');
      const sp = label(THREE, txt, { size: 24, border: p.kind === 'poi' ? '#a16207' : '#0f172a' }); { const hh = 0.026 * txt.split('\n').length + 0.01; sp.scale.set(hh * sp.userData.aspect, hh, 1); } sp.position.set(c.x, g0 + top + lblScale * 0.4, c.z); add(sp);
    });
  };
  const shapeOf = (z) => {
    const s = new THREE.Shape();
    if (z.shape === 'circle') { const c = prj.to(z.c); s.absarc(c.x, c.y, Number(z.r) || 0.1, 0, Math.PI * 2, false); return s; }
    z.pts.map(prj.to).forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y))); s.closePath(); return s;
  };
  const rad = Math.max(0.12, span / 500);
  placeOnGround(null);
  if (typeof window !== 'undefined') window.__WD_3D = { group: onGround, scene };

  // paths
  doc.paths.forEach((path) => {
    const res = checks && checks.paths[path.id];
    const V = path.pts.map((q) => { const p = P(q); return new THREE.Vector3(p.x, Number(q[2]) || 0, p.z); });
    for (let i = 0; i < V.length - 1; i++) {
      const st = res && res.legs[i] ? res.legs[i].status : 'ok';
      const tube = keep(new THREE.TubeGeometry(new THREE.LineCurve3(V[i], V[i + 1]), 1, rad, 8, false));
      scene.add(new THREE.Mesh(tube, keep(new THREE.MeshLambertMaterial({ color: STATUS[st] }))));
    }
    if (V.length) {
      [0, V.length - 1].filter((i, k, a) => a.indexOf(i) === k).forEach((i) => {
        const v = V[i], gy = path.pts[i][3] != null ? Number(path.pts[i][3]) : 0;
        const s = new THREE.Mesh(keep(new THREE.SphereGeometry(rad * 2.6, 16, 12)), keep(new THREE.MeshLambertMaterial({ color: i === 0 ? 0x16a34a : 0xffffff }))); s.position.copy(v); scene.add(s);
        const drop = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([v, new THREE.Vector3(v.x, gy, v.z)])), keep(new THREE.LineDashedMaterial({ color: 0x334155, dashSize: span / 120, gapSize: span / 160 }))); drop.computeLineDistances(); scene.add(drop);
      });
      const t = (path.name || 'Path') + (path.follow ? ' · ' + (Number(path.agl) || 0) + ' m above ground' : '');
      const sp = label(THREE, t, { size: 24 }); sp.scale.set(0.032 * sp.userData.aspect, 0.032, 1); sp.position.set(V[0].x, V[0].y + lblScale * 0.25, V[0].z); scene.add(sp); disposables.push(sp.material.map, sp.material);
    }
  });

  // camera + orbit
  const cam = new THREE.PerspectiveCamera(45, W / H, 0.1, span * 40);
  const target = new THREE.Vector3(cx, maxAlt / 3, cz);
  let theta = -Math.PI / 4, phi = 1.0, dist = span * 1.25;
  const saved = camRef && camRef.current;
  if (saved && isFinite(saved.dist)) { theta = saved.theta; phi = saved.phi; dist = saved.dist; target.set(saved.tx, saved.ty, saved.tz); }
  const place = () => { cam.position.set(target.x + dist * Math.sin(phi) * Math.sin(theta), target.y + dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.cos(theta)); cam.lookAt(target); if (camRef) camRef.current = { theta, phi, dist, tx: target.x, ty: target.y, tz: target.z }; };
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
  // v7.12: the planner takes a picture of this view for the plan and the PDF
  if (apiRef) apiRef.current = {
    capture: (maxW = 1800) => { renderer.render(scene, cam); const src = renderer.domElement; const k = Math.min(1, maxW / src.width);
      const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#e2e8f0'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.85); },
    camera: () => ({ theta, phi, dist, tx: target.x, ty: target.y, tz: target.z }),
    setCamera: (cv) => { if (!cv) return; theta = cv.theta; phi = cv.phi; dist = cv.dist; target.set(cv.tx, cv.ty, cv.tz); place(); req(); },
  };
  return () => {
    clearTimeout(t1); clearTimeout(t2); if (raf) cancelAnimationFrame(raf); ro.disconnect();
    cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); cv.removeEventListener('wheel', wheel); cv.removeEventListener('contextmenu', ctx);
    if (apiRef) apiRef.current = null;
    alive = false; clearGroup(); disposables.forEach((d) => { try { d.dispose(); } catch (e) {} }); grid.geometry.dispose(); renderer.dispose(); if (cv.parentNode) cv.parentNode.removeChild(cv);
  };
}
