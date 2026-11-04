// Advanced ops map (v7.9): geometry, zone limits and path checks. Pure functions so they can be tested on their own.
// Coordinates are stored as [lat, lng]. In 'plan' mode (indoor, floor plan only) lat = y metres (north up) and
// lng = x metres. All checking is done in local metres around a reference point.

export const KINDS = {
  exclusion: { label: 'Exclusion', short: 'EXCLUSION', color: '#dc2626', stroke: '#b91c1c', fill: 0.35 },
  oonp: { label: 'Over people (direct)', short: 'OVER PEOPLE', color: '#16a34a', stroke: '#15803d', fill: 0.2, limits: true },
  near: { label: 'Near people', short: 'NEAR PEOPLE', color: '#f59e0b', stroke: '#b45309', fill: 0.18, limits: true },
  clear: { label: 'Clear of people', short: 'CLEAR', color: '#b9a6f2', stroke: '#7c5fd6', fill: 0.4 },
};
export const OONP_BLUE = { color: '#2563eb', stroke: '#1d4ed8' };
export const kindStyle = (kind, settings) => {
  const k = KINDS[kind] || KINDS.clear;
  if (kind === 'oonp' && settings && settings.oonpColour === 'blue') return { ...k, ...OONP_BLUE };
  return k;
};
export const POINT_KINDS = {
  tlz: { label: 'Take-off / landing (TLZ)' },
  elz: { label: 'Emergency landing (E-LZ)' },
  poi: { label: 'Caution !' },
  note: { label: 'Text note' },
};
export const DEFAULT_BUFFER = 30;
// v7.12: speeds are kept in m/s and always shown in both units
export const toKph = (ms) => Math.round(Number(ms) * 3.6 * 10) / 10;
export const fromKph = (k) => Math.round((Number(k) / 3.6) * 100) / 100;
export const fmtSpeed = (ms) => (ms == null || ms === '' || !isFinite(Number(ms)) ? '—' : Math.round(Number(ms) * 10) / 10 + ' m/s (' + toKph(ms) + ' kph)');
export const G = 9.81;

export const emptyOpsMap = (mode = 'geo') => ({ v: 1, mode, zones: [], paths: [], points: [], overlay: null, settings: { oonpColour: 'green' } });
export const hasOpsContent = (m) => !!m && ((m.zones || []).length + (m.paths || []).length + (m.points || []).length > 0 || !!m.overlay);

// ── local metres ──
export const makeProj = (mode, ref) => {
  if (mode === 'plan') return { to: (ll) => ({ x: ll[1], y: ll[0] }), from: (p) => [p.y, p.x], dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) };
  const lat0 = ref ? ref[0] : 0, lng0 = ref ? ref[1] : 0, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
  const to = (ll) => ({ x: (ll[1] - lng0) * kx, y: (ll[0] - lat0) * ky });
  const from = (p) => [lat0 + p.y / ky, lng0 + p.x / kx];
  return { to, from, dist: (a, b) => { const p = to(a), q = to(b); return Math.hypot(p.x - q.x, p.y - q.y); } };
};
export const refOf = (m) => {
  const all = [];
  (m.zones || []).forEach((z) => { if (z.shape === 'circle' && z.c) all.push(z.c); (z.pts || []).forEach((p) => all.push(p)); });
  (m.paths || []).forEach((p) => (p.pts || []).forEach((q) => all.push(q)));
  (m.points || []).forEach((p) => all.push([p.lat, p.lng]));
  if (m.overlay && m.overlay.center) all.push(m.overlay.center);
  if (!all.length) return null;
  return [all.reduce((t, p) => t + p[0], 0) / all.length, all.reduce((t, p) => t + p[1], 0) / all.length];
};

export const pointInPoly = (p, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};
export const segPointDist = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
};
// distance from p to the zone (0 when inside); local metres
export const zoneDistance = (p, zl) => {
  if (zl.circle) return Math.max(0, Math.hypot(p.x - zl.c.x, p.y - zl.c.y) - zl.r);
  if (zl.poly.length < 3) return Infinity;
  if (pointInPoly(p, zl.poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < zl.poly.length; i++) d = Math.min(d, segPointDist(p, zl.poly[i], zl.poly[(i + 1) % zl.poly.length]));
  return d;
};
export const zoneLocal = (z, proj) => z.shape === 'circle'
  ? { circle: true, c: proj.to(z.c), r: Number(z.r) || 0 }
  : { circle: false, poly: (z.pts || []).map(proj.to) };
export const zoneArea = (z, proj) => {
  if (z.shape === 'circle') return Math.PI * (Number(z.r) || 0) ** 2;
  const p = (z.pts || []).map(proj.to); let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; }
  return Math.abs(a) / 2;
};

// ── kinetic energy (same physics as the planner's KE chart; the planner can pass its own, with aero drag) ──
export const simpleKe = (w) => {
  if (!(w > 0)) return null;
  return { w, energy: (h, s) => 0.5 * w * (s * s + 2 * G * h), h15: 15 / (w * G), h34: 34 / (w * G) };
};
export const speedAt = (K, E, h) => {
  if (!K) return null;
  const v2 = (2 * E - 2 * K.energy(h, 0)) / K.w;
  return v2 > 0 ? Math.floor(Math.sqrt(v2) * 10) / 10 : null;
};
export const keAt = (K, h, v) => (K ? K.energy(Math.max(0, h), Math.max(0, v)) : null);
// ready-made limits for a drone + energy level: three heights through its range, each with the top speed allowed there
export const presetLimits = (K, E) => {
  if (!K) return [];
  const hMax = E === 15 ? K.h15 : K.h34;
  if (!isFinite(hMax) || hMax <= 0) return [];
  const top = Math.min(hMax, 120);
  const hs = [0.25, 0.5, 0.8].map((f) => Math.max(0.5, Math.floor(top * f * 2) / 2));
  return hs.filter((h, i) => hs.indexOf(h) === i).map((h) => ({ id: 'p' + E + '-' + h, h, v: speedAt(K, E, h), e: E, preset: true })).filter((p) => p.v);
};
export const limitOk = (K, l) => K && keAt(K, l.h, l.v) <= (l.e || 34) + 0.05;

// the limits a zone imposes: ceiling (height above the zone's ground) and speed
export const zoneLimits = (z) => {
  if (z.kind === 'exclusion') return { noEntry: true };
  const h = z.h != null && z.h !== '' ? Number(z.h) : null;
  const v = z.v != null && z.v !== '' ? Number(z.v) : null;
  return { h: isFinite(h) ? h : null, v: isFinite(v) ? v : null };
};
export const zoneBuffer = (z) => {
  if (z.kind !== 'exclusion') return 0;
  if (z.shielded) return Math.max(0, Number(z.shieldBuffer) || 0);
  return z.buffer != null && z.buffer !== '' ? Math.max(0, Number(z.buffer) || 0) : DEFAULT_BUFFER;
};
export const zoneTag = (z, settings) => {
  const k = kindStyle(z.kind, settings), L = zoneLimits(z), parts = [k.short];
  if (L.h != null) parts.push('≤ ' + L.h + ' m');
  if (L.v != null) parts.push(fmtSpeed(L.v));
  if (z.kind === 'exclusion') { const b = zoneBuffer(z); parts.push(z.shielded ? 'shielded ' + b + ' m' : b + ' m buffer'); }
  return parts.join(' · ');
};

// ── path checks ──
// Each path point is [lat, lng, alt] with alt = height above the take-off point. A zone's ground (m above take-off)
// lets the plan follow changes in elevation: height above the zone's ground = alt − ground.
export const pathLegs = (path) => {
  const pts = path.pts || [], legs = [];
  for (let i = 0; i < pts.length - 1; i++) legs.push([pts[i], pts[i + 1]]);
  return legs;
};
export const checkOps = (m, keFor) => {
  const ref = refOf(m) || [0, 0], proj = makeProj(m.mode, ref);
  const zones = (m.zones || []).map((z) => ({ z, l: zoneLocal(z, proj), lim: zoneLimits(z), buf: zoneBuffer(z) }))
    .filter((q) => q.l.circle ? q.l.r > 0 : q.l.poly.length > 2);
  const flyZones = zones.filter((q) => q.z.kind !== 'exclusion');
  const out = { paths: {}, issues: [], counts: { stop: 0, warn: 0 } };
  (m.paths || []).forEach((path) => {
    const K = keFor ? keFor(path.drone) : null;
    const speed = Number(path.speed) || 0;
    const res = { legs: [], profile: [], length: 0 };
    let dist0 = 0;
    pathLegs(path).forEach(([A, B], i) => {
      const a = proj.to(A), b = proj.to(B), len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(2, Math.min(240, Math.ceil(len / 1)));
      const msgs = new Map(); let status = 'ok';
      const add = (lvl, key, text) => { if (!msgs.has(key)) msgs.set(key, { lvl, text }); if (lvl === 'stop') status = 'stop'; else if (status === 'ok') status = 'warn'; };
      for (let s = 0; s <= n; s++) {
        const t = s / n, p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        const alt = (Number(A[2]) || 0) + t * ((Number(B[2]) || 0) - (Number(A[2]) || 0));
        let ceil = null, ground = 0, inFly = false, inExcl = false;
        zones.forEach(({ z, l, lim, buf }) => {
          const d = zoneDistance(p, l);
          if (z.kind === 'exclusion') {
            if (d === 0) { inExcl = true; add('stop', 'ex' + z.id, 'enters exclusion zone "' + (z.name || 'Exclusion') + '"'); }
            else if (d < buf - 0.05) add('warn', 'buf' + z.id, 'comes ' + Math.floor(d) + ' m from exclusion "' + (z.name || 'Exclusion') + '" (needs ' + buf + ' m' + (z.shielded ? ', shielded' : '') + ')');
            return;
          }
          if (d > 0) return;
          inFly = true;
          const g = Number(z.ground) || 0; ground = Math.max(ground, g);
          const agl = alt - g;
          if (lim.h != null) { ceil = ceil == null ? g + lim.h : Math.min(ceil, g + lim.h); if (agl > lim.h + 0.01) add('stop', 'h' + z.id, 'is ' + agl.toFixed(1) + ' m above ground in "' + (z.name || KINDS[z.kind].label) + '" (limit ' + lim.h + ' m)'); }
          if (lim.v != null && speed > lim.v + 0.01) add('stop', 'v' + z.id, 'speed ' + fmtSpeed(speed) + ' is over ' + fmtSpeed(lim.v) + ' in "' + (z.name || KINDS[z.kind].label) + '"');
          if ((z.kind === 'oonp' || z.kind === 'near') && K && speed > 0) {
            const E = Number(z.energy) || 34, ke = keAt(K, agl, speed);
            if (ke > E + 0.05) add('stop', 'ke' + z.id, 'impact energy ' + ke.toFixed(1) + ' J is over ' + E + ' J in "' + (z.name || KINDS[z.kind].label) + '" (' + (path.drone || 'drone') + ')');
          }
        });
        if (flyZones.length && !inFly && !inExcl) add('warn', 'out', 'leaves the planned zones');
        if (s < n || i === pathLegs(path).length - 1) res.profile.push({ d: dist0 + t * len, alt, ceil, ground, excl: inExcl, leg: i });
      }
      dist0 += len;
      const list = [...msgs.values()];
      res.legs.push({ i, status, msgs: list, len });
      list.forEach((q) => { out.issues.push({ lvl: q.lvl, path: path.id, leg: i, text: (path.name || 'Path') + ', leg ' + (i + 1) + '→' + (i + 2) + ' ' + q.text }); out.counts[q.lvl]++; });
    });
    res.length = dist0;
    out.paths[path.id] = res;
  });
  zones.forEach(({ z }) => {
    if ((z.kind === 'oonp' || z.kind === 'near') && (z.h == null || z.h === '')) {
      out.issues.push({ lvl: 'warn', zone: z.id, text: '"' + (z.name || KINDS[z.kind].label) + '" has no height / speed limit yet' }); out.counts.warn++;
    }
    if (z.kind === 'exclusion' && z.shielded && !String(z.shieldNote || '').trim()) {
      out.issues.push({ lvl: 'warn', zone: z.id, text: '"' + (z.name || 'Exclusion') + '" is shielded: add what shields it' }); out.counts.warn++;
    }
  });
  return out;
};

// one-line summary for Section 1 and the PDF
export const opsSummary = (m, chk) => {
  if (!hasOpsContent(m)) return '';
  const n = (a, w) => a.length + ' ' + w + (a.length === 1 ? '' : 's');
  const z = m.zones || [], p = m.paths || [], pts = m.points || [];
  const bits = [n(z, 'zone'), n(p, 'path'), n(pts, 'marker')];
  if (m.overlay) bits.push('plan overlay');
  if (chk) bits.push(chk.counts.stop ? chk.counts.stop + ' to fix' : chk.counts.warn ? chk.counts.warn + ' to check' : 'checks clear');
  return bits.join(' · ');
};

// what goes into the RPIC / CRP signature fingerprint: everything except the overlay picture itself
export const opsSignable = (m) => {
  if (!hasOpsContent(m)) return undefined;
  const { overlay, ...rest } = m;
  return { ...rest, overlay: overlay ? { name: overlay.name, page: overlay.page, center: overlay.center, widthM: overlay.widthM, rot: overlay.rot, size: (overlay.src || '').length } : null };
};

// ── v7.12: freehand flight paths ──
// A drawn stroke is simplified (Ramer–Douglas–Peucker), rounded off (Chaikin corner cutting) and thinned again, so a
// shaky hand-drawn line becomes a smooth path with a sensible number of points. Works on {x, y[, z]} in any units.
export const rdp = (pts, eps) => {
  if (pts.length < 3) return pts.slice();
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, max = 0;
    for (let i = a + 1; i < b; i++) { const d = segPointDist(pts[i], pts[a], pts[b]); if (d > max) { max = d; idx = i; } }
    if (idx > 0 && max > eps) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((p, i) => keep[i]);
};
export const chaikin = (pts, iter = 2) => {
  let p = pts.slice();
  for (let k = 0; k < iter && p.length > 2; k++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1], q = {}, r = {};
      Object.keys(a).forEach((key) => { if (typeof a[key] === 'number') { q[key] = 0.75 * a[key] + 0.25 * b[key]; r[key] = 0.25 * a[key] + 0.75 * b[key]; } });
      out.push(q, r);
    }
    out.push(p[p.length - 1]); p = out;
  }
  return p;
};
// stroke in screen pixels → smooth path in screen pixels (tolerance grows with the smoothing level 0–3)
export const smoothStroke = (pts, level = 2, maxPts = 60) => {
  if (pts.length < 2) return pts.slice();
  const tol = [1.5, 3, 5, 8][Math.max(0, Math.min(3, level))];
  let p = rdp(pts, tol);
  if (level > 0) p = chaikin(p, level >= 2 ? 2 : 1);
  p = rdp(p, Math.max(0.6, tol / 5));
  let e = tol / 5; while (p.length > maxPts && e < 200) { e *= 1.5; p = rdp(p, e); }
  return p;
};
