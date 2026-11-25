// Advanced ops map (v7.9): geometry, zone limits and path checks. Pure functions so they can be tested on their own.
// Coordinates are stored as [lat, lng]. In 'plan' mode (indoor, floor plan only) lat = y metres (north up) and
// lng = x metres. All checking is done in local metres around a reference point.

export const KINDS = {
  exclusion: { label: 'Exclusion', short: 'EXCLUSION', color: '#dc2626', stroke: '#b91c1c', fill: 0.35 },
  oonp: { label: 'Over people (direct)', short: 'OVER PEOPLE', color: '#16a34a', stroke: '#15803d', fill: 0.2, limits: true },
  near: { label: 'Near people', short: 'NEAR PEOPLE', color: '#f59e0b', stroke: '#b45309', fill: 0.18, limits: true },
  clear: { label: 'Clear of people', short: 'CLEAR', color: '#b9a6f2', stroke: '#7c5fd6', fill: 0.4 },
  // v7.27: a bridge or raised deck. Paths that follow the ground ride over it instead of dipping to the water below.
  surface: { label: 'Bridge / raised surface', short: 'BRIDGE', color: '#94a3b8', stroke: '#334155', fill: 0.35 },
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
// v7.12: fill a zone's height and speed from the drone's energy table: the job's planned height (if it fits under the
// energy limit), else half the highest allowed height, with the top speed allowed at that height. The pilot reviews it.
export const autoZoneLimit = (K, E, plannedM) => {
  if (!K) return null;
  const hMax = E === 15 ? K.h15 : K.h34; if (!isFinite(hMax) || hMax <= 0) return null;
  const cap = Math.floor(Math.min(hMax, 120) * 0.8 * 2) / 2;
  let h = plannedM > 0 ? Math.min(Math.floor(plannedM * 2) / 2, cap) : Math.max(0.5, Math.floor(Math.min(hMax, 120) * 0.5 * 2) / 2);
  if (!(h > 0)) h = 0.5;
  const v = speedAt(K, E, h); if (!v) return null;
  return { h, v, energy: E, from: plannedM > 0 && h === Math.floor(plannedM * 2) / 2 ? 'planned height' : 'energy table' };
};
export const limitOk = (K, l) => K && keAt(K, l.h, l.v) <= (l.e || 34) + 0.05;

// the limits a zone imposes: ceiling (height above the zone's ground) and speed
export const zoneLimits = (z) => {
  if (z.kind === 'exclusion') return { noEntry: true };
  const h = z.h != null && z.h !== '' ? Number(z.h) : null;
  const v = z.v != null && z.v !== '' ? Number(z.v) : null;
  return { h: isFinite(h) ? h : null, v: isFinite(v) ? v : null };
};
// v7.47: an exclusion zone can start above the ground (e.g. from 20 m) and / or stop at a height (e.g. up to 400 ft);
// heights are metres above the zone's own ground. hi null = all the way up.
export const exBand = (z) => {
  const lo = Math.max(0, Number(z && z.exFloor) || 0), t = z && z.exTop;
  const hi = t != null && t !== '' && isFinite(Number(t)) && Number(t) > lo ? Number(t) : null;
  return { lo, hi };
};
export const fmtHt = (m, unit) => unit === 'ft' ? Math.round(m * 3.28084) + ' ft' : (Math.round(m * 10) / 10) + ' m';
export const zoneBuffer = (z) => {
  if (z.kind !== 'exclusion') return 0;
  if (z.shielded) return Math.max(0, Number(z.shieldBuffer) || 0);
  return z.buffer != null && z.buffer !== '' ? Math.max(0, Number(z.buffer) || 0) : DEFAULT_BUFFER;
};
export const zoneTag = (z, settings) => {
  const k = kindStyle(z.kind, settings), L = zoneLimits(z), parts = [k.short];
  if (L.h != null) parts.push('≤ ' + L.h + ' m');
  if (L.v != null) parts.push(fmtSpeed(L.v));
  if (z.kind === 'exclusion') { const B = exBand(z); if (B.lo > 0) parts.push('from ' + fmtHt(B.lo, z.exUnit)); if (B.hi != null) parts.push('up to ' + fmtHt(B.hi, z.exUnit));
    const b = zoneBuffer(z); parts.push(z.shielded ? 'shielded ' + b + ' m' : b + ' m buffer'); }
  if (z.kind === 'surface') parts.push(z.deck === 'raised' ? 'deck ' + (Number(z.raise) || 0) + ' m above the ground' : 'deck level between its ends' + (Number(z.raise) ? ' +' + Number(z.raise) + ' m' : ''));
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
  const zones = (m.zones || []).filter((z) => z.kind !== 'surface').map((z) => ({ z, l: zoneLocal(z, proj), lim: zoneLimits(z), buf: zoneBuffer(z) }))
    .filter((q) => q.l.circle ? q.l.r > 0 : q.l.poly.length > 2);
  const flyZones = zones.filter((q) => q.z.kind !== 'exclusion');
  const out = { paths: {}, issues: [], counts: { stop: 0, warn: 0 } };
  (m.paths || []).forEach((path) => {
    const K = keFor ? keFor(path.drone) : null;
    const speed = Number(path.speed) || 0;
    const res = { legs: [], profile: [], length: 0 };
    let dist0 = 0;
    const grouped = new Map(); // v7.53: one check per path and problem, listing the legs, instead of one per leg
    pathLegs(path).forEach(([A, B], i) => {
      const a = proj.to(A), b = proj.to(B), len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(2, Math.min(240, Math.ceil(len / 1)));
      const msgs = new Map(); let status = 'ok';
      const add = (lvl, key, text, extra) => { if (!msgs.has(key)) msgs.set(key, { lvl, text, key, ...(extra || {}) }); if (lvl === 'stop') status = 'stop'; else if (status === 'ok') status = 'warn'; };
      for (let s = 0; s <= n; s++) {
        const t = s / n, p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        const alt = (Number(A[2]) || 0) + t * ((Number(B[2]) || 0) - (Number(A[2]) || 0));
        // v7.27: a path that follows the ground carries the ground height (m above take-off) as each point's 4th value
        const terr = A[3] != null && B[3] != null ? Number(A[3]) + t * (Number(B[3]) - Number(A[3])) : null;
        let ceil = null, ground = terr != null ? terr : 0, inFly = false, inExcl = false;
        if (terr != null && path.follow && !path.ctrl) { // v7.58: points with their own heights replace the one height band
          const agl = alt - terr, lo = path.aglMin != null ? Number(path.aglMin) : 1, hi = path.aglMax != null ? Number(path.aglMax) : 5;
          if (agl < lo - 0.05 || agl > hi + 0.05) add('warn', 'band', 'is ' + agl.toFixed(1) + ' m above the ground (planned ' + lo + '–' + hi + ' m)');
        }
        zones.forEach(({ z, l, lim, buf }) => {
          const d = zoneDistance(p, l);
          if (z.kind === 'exclusion') {
            // v7.47: only the zone's height band is excluded; above its top or below its floor is clear of it
            const B = exBand(z), agl = alt - (terr != null ? terr : Number(z.ground) || 0);
            const vOff = agl < B.lo ? B.lo - agl : B.hi != null && agl > B.hi ? agl - B.hi : 0, nm = '"' + (z.name || 'Exclusion') + '"';
            if (d === 0 && vOff === 0) { inExcl = true; add('stop', 'ex' + z.id, 'enters exclusion zone ' + nm); }
            else if (d === 0 && vOff < buf - 0.05) add('warn', 'vbuf' + z.id, 'passes ' + vOff.toFixed(1) + ' m ' + (agl < B.lo ? 'below' : 'above') + ' exclusion ' + nm + ' (needs ' + buf + ' m' + (z.shielded ? ', shielded' : '') + ')');
            else if (d > 0 && d < buf - 0.05 && vOff < buf - 0.05) add('warn', 'buf' + z.id, 'comes ' + Math.floor(d) + ' m from exclusion ' + nm + ' (needs ' + buf + ' m' + (z.shielded ? ', shielded' : '') + ')');
            return;
          }
          if (d > 0) return;
          inFly = true;
          const g = terr != null ? terr : Number(z.ground) || 0; ground = Math.max(ground, g);
          const agl = alt - g;
          if (lim.h != null) { ceil = ceil == null ? g + lim.h : Math.min(ceil, g + lim.h); if (agl > lim.h + 0.01) add('stop', 'h' + z.id, 'is ' + agl.toFixed(1) + ' m above ground in "' + (z.name || KINDS[z.kind].label) + '" (limit ' + lim.h + ' m)'); }
          if (lim.v != null && speed > lim.v + 0.01) add('stop', 'v' + z.id, 'speed ' + fmtSpeed(speed) + ' is over ' + fmtSpeed(lim.v) + ' in "' + (z.name || KINDS[z.kind].label) + '"', { fixSpeed: lim.v });
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
      list.forEach((q) => { const g = grouped.get(q.key); if (g) { g.legs.push(i); if (q.lvl === 'stop') g.lvl = 'stop'; } else grouped.set(q.key, { ...q, legs: [i] }); });
    });
    const seg = path.ctrl ? legToCtrl(path) : null; // v7.58: legs between the path's own points
    const nLegs = seg ? path.ctrl.length - 1 : res.legs.length;
    grouped.forEach((q) => {
      const ls = seg ? [...new Set(q.legs.map((i) => seg[i]).filter((v) => v != null))].sort((a, b) => a - b) : q.legs;
      const where = ls.length === nLegs && nLegs > 1 ? 'the whole way' : (ls.length === 1 ? 'leg ' : 'legs ') + legRanges(ls);
      out.issues.push({ lvl: q.lvl, path: path.id, leg: q.legs[0], legs: q.legs, key: path.id + ':' + q.key, legKeys: q.legs.map((i) => path.id + ':' + i + ':' + q.key),
        fixSpeed: q.fixSpeed, text: (path.name || 'Path') + ' ' + q.text + ' (' + where + ')' });
    });
    res.length = dist0;
    out.paths[path.id] = res;
  });
  zones.forEach(({ z }) => {
    if ((z.kind === 'oonp' || z.kind === 'near') && (z.h == null || z.h === '')) {
      out.issues.push({ lvl: 'warn', zone: z.id, key: 'z:' + z.id + ':nolimit', text: '"' + (z.name || KINDS[z.kind].label) + '" has no height / speed limit yet' });
    } else if ((z.kind === 'oonp' || z.kind === 'near') && z.autoLimit && !z.limitReviewed) {
      out.issues.push({ lvl: 'warn', zone: z.id, key: 'z:' + z.id + ':review', review: true, text: '"' + (z.name || KINDS[z.kind].label) + '": height and speed filled in from the ' + (z.autoLimit.energy || 34) + ' J energy table, pilot to review' });
    }
    if (z.kind === 'exclusion' && z.shielded && !String(z.shieldNote || '').trim()) {
      out.issues.push({ lvl: 'warn', zone: z.id, key: 'z:' + z.id + ':shield', text: '"' + (z.name || 'Exclusion') + '" is shielded: add what shields it' });
    }
  });
  // v7.12: a check can be acknowledged (with a note) in the editor; it then no longer counts as open
  const acks = m.acks || {};
  // (a grouped path check also counts as acknowledged if every leg was acknowledged before v7.53)
  out.issues.forEach((q) => { const a = (q.key && acks[q.key]) || (q.legKeys && q.legKeys.every((k) => acks[k]) && acks[q.legKeys[0]]); if (a) q.ack = a; else out.counts[q.lvl]++; });
  out.counts.acked = out.issues.filter((q) => q.ack).length;
  // v7.58: checks are switched off for now (Mike: too much noise, red ones blocked planning). The workings stay for
  // the profile and for later; nothing is flagged, coloured or listed. window.__WD_OPS_CHECKS = true turns them on.
  if (!opsChecksOn()) {
    out.issues = []; out.counts = { stop: 0, warn: 0, acked: 0 }; out.off = true;
    Object.values(out.paths).forEach((r) => { r.legs.forEach((l) => { l.status = 'ok'; l.msgs = []; }); r.profile.forEach((q) => { q.excl = false; }); });
  }
  return out;
};
export const opsChecksOn = () => typeof window !== 'undefined' && window.__WD_OPS_CHECKS === true;

// one-line summary for Section 1 and the PDF
export const opsSummary = (m, chk) => {
  if (!hasOpsContent(m)) return '';
  const n = (a, w) => a.length + ' ' + w + (a.length === 1 ? '' : 's');
  const z = m.zones || [], p = m.paths || [], pts = m.points || [];
  const bits = [n(z, 'zone'), n(p, 'path'), n(pts, 'marker')];
  if (m.overlay) bits.push('plan overlay');
  if ((m.views || []).length) bits.push(n(m.views, 'view') + ' for the PDF');
  if (chk && !chk.off) bits.push(chk.counts.stop ? chk.counts.stop + ' to fix' : chk.counts.warn ? chk.counts.warn + ' to check' : 'checks clear');
  return bits.join(' · ');
};

// what goes into the RPIC / CRP signature fingerprint: everything except the overlay picture itself
export const opsSignable = (m) => {
  if (!hasOpsContent(m)) return undefined;
  const { overlay, terrain, ...rest } = m;
  // v7.27: when the ground was last checked doesn't change what was signed; the heights themselves are in the paths
  return { ...rest, paths: (rest.paths || []).map(({ followKey: fk, terrainSrc: ts, followErr: fe, lineKey: lk, ...p }) => p), overlay: overlay ? { name: overlay.name, page: overlay.page, center: overlay.center, widthM: overlay.widthM, rot: overlay.rot, size: (overlay.src || '').length } : null };
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

// ── v7.27: following the ground ──
// Points every `step` metres along the path (the drawn corners are kept), so the height can follow the terrain.
export const densify = (pts, proj, step = 5) => {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i]; out.push([A[0], A[1], A[2]]);
    if (i === pts.length - 1) break;
    const B = pts[i + 1], a = proj.to(A), b = proj.to(B), len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.floor(len / step);
    for (let k = 1; k < n; k++) { if (len - (k * len) / n < step * 0.5) break; const t = k / n; const ll = proj.from({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }); out.push([ll[0], ll[1], (Number(A[2]) || 0) + t * ((Number(B[2]) || 0) - (Number(A[2]) || 0))]); }
  }
  return out;
};
// the bridges / raised surfaces in local metres, for followGround
export const surfacesOf = (m, proj) => (m.zones || []).filter((z) => z.kind === 'surface').map((z) => ({ id: z.id, l: zoneLocal(z, proj), mode: z.deck === 'raised' ? 'raised' : 'ends', raise: Number(z.raise) || 0 }))
  .filter((s) => (s.l.circle ? s.l.r > 0 : s.l.poly.length > 2));
// Heights for a path that keeps `agl` metres above the ground. elev: ground (m above sea level) at each point; ref: at
// the take-off. Over a bridge the deck runs level from one end to the other (plus any extra), or sits `raise` metres
// above the ground below. Returns points as [lat, lng, height above take-off, ground above take-off].
export const followGround = (pts, elev, ref, agl, surfaces, proj) => {
  const n = pts.length; if (!n) return [];
  const xy = pts.map((q) => proj.to(q));
  const dist = [0]; for (let i = 1; i < n; i++) dist.push(dist[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
  // light smoothing: terrain data comes in steps
  const raw = elev.map((e) => e - ref);
  let g = raw.map((v, i) => { const a = raw[Math.max(0, i - 1)], c = raw[Math.min(n - 1, i + 1)]; return (a + 2 * v + c) / 4; });
  const on = xy.map((p) => surfaces.find((s) => zoneDistance(p, s.l) === 0) || null);
  for (let i = 0; i < n;) {
    const s = on[i]; if (!s) { i++; continue; }
    let j = i; while (j + 1 < n && on[j + 1] === s) j++;
    if (s.mode === 'raised') for (let k = i; k <= j; k++) g[k] += s.raise;
    else {
      const ia = i > 0 ? i - 1 : i, ib = j < n - 1 ? j + 1 : j, a = g[ia], b = g[ib], span = dist[ib] - dist[ia] || 1;
      for (let k = i; k <= j; k++) g[k] = a + ((dist[k] - dist[ia]) / span) * (b - a) + s.raise;
    }
    i = j + 1;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  return pts.map((q, k) => [q[0], q[1], r1(g[k] + (agl == null ? Number(q[2]) || 0 : agl)), r1(g[k])]); // v7.58: agl null = each point's own height above the ground
};
// where heights are measured from: the first take-off (TLZ) marker, else the start of the first path
export const terrainRefPoint = (m) => {
  const t = (m.points || []).find((p) => p.kind === 'tlz'); if (t) return [t.lat, t.lng];
  const p = (m.paths || []).find((q) => (q.pts || []).length); return p ? [p.pts[0][0], p.pts[0][1]] : null;
};
// what a ground-following path's heights depend on (when this changes, they're worked out again)
export const followKey = (path, m) => JSON.stringify([path.ctrl ? ['c', !!path.curve] : Number(path.agl) || 0, (path.ctrl || path.pts || []).map((q) => [Math.round(q[0] * 1e6), Math.round(q[1] * 1e6)]),
  (m.zones || []).filter((z) => z.kind === 'surface').map((z) => [z.pts, z.c, z.r, z.deck, z.raise]), terrainRefPoint(m)]);

// v7.51: each flight path has its own colour (problem legs keep an amber / red outline on the map)
export const PATH_COLOURS = ['#7c3aed', '#0891b2', '#db2777', '#2563eb', '#65a30d', '#0f172a', '#c2410c'];
export const pathColour = (p, all) => p.color || PATH_COLOURS[Math.max(0, (all || []).findIndex((q) => q.id === p.id)) % PATH_COLOURS.length];
export const PATH_WIDTHS = [1, 2, 3]; // 3D: the airspace tube around the path, metres across

// v7.53: [0,1,2,5,6,9] → "1→3, 6→7 and 10→11" style ranges of legs (leg i runs from point i+1 to i+2)
export function legRanges(legs) {
  const r = []; let a = legs[0], b = legs[0];
  for (let k = 1; k <= legs.length; k++) { const x = legs[k]; if (x === b + 1) { b = x; continue; } r.push(a === b ? (a + 1) + '→' + (a + 2) : (a + 1) + '→' + (b + 2)); a = b = x; }
  return r.length > 1 ? r.slice(0, -1).join(', ') + ' and ' + r[r.length - 1] : r[0];
}

// ── v7.58: a path is the points you place (ctrl), each with its own height; the flown line (pts) is worked out ──
// ctrl: [[lat, lng, h]], h = height above the ground (follow) or above the take-off (not following). curve: the line
// bends smoothly through the points instead of running straight between them. pts stays the flown line every check,
// the profile, the 3D view and the PDF use, so older plans (no ctrl) keep working unchanged.
const rnd = (v) => Math.round(v * 10) / 10;
export const ctrlOf = (path, mode) => {
  if (path.ctrl && path.ctrl.length) return path.ctrl;
  const pts = path.pts || [];
  const base = pts.map((q) => [q[0], q[1], path.follow ? (q[3] != null ? rnd(Number(q[2]) - Number(q[3])) : Number(path.agl) || 0) : Number(q[2]) || 0]);
  if (base.length <= 30) return base;
  const prj = makeProj(mode, base[0]); // an older drawn or ground-following path: keep just the points that shape it
  const keep = rdp(base.map((q, i) => ({ ...prj.to(q), i })), 2.5).map((v) => v.i);
  return keep.map((i) => base[i]);
};
// centripetal Catmull-Rom through the points, every ~`step` m; the points themselves stay exactly on the line
export const curveLine = (ctrl, proj, step = 4) => {
  const n = ctrl.length; if (n < 3) return ctrl.map((q) => [q[0], q[1], Number(q[2]) || 0]);
  const P = ctrl.map((q) => proj.to(q)), out = [];
  const at = (i) => (i < 0 ? { x: 2 * P[0].x - P[1].x, y: 2 * P[0].y - P[1].y } : i >= n ? { x: 2 * P[n - 1].x - P[n - 2].x, y: 2 * P[n - 1].y - P[n - 2].y } : P[i]);
  for (let i = 0; i < n - 1; i++) {
    out.push([ctrl[i][0], ctrl[i][1], Number(ctrl[i][2]) || 0]);
    const p0 = at(i - 1), p1 = P[i], p2 = P[i + 1], p3 = at(i + 2);
    const d = (a, b) => Math.max(1e-6, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y), m = Math.max(1, Math.min(200, Math.round(len / step)));
    const h1 = Number(ctrl[i][2]) || 0, h2 = Number(ctrl[i + 1][2]) || 0;
    for (let k = 1; k < m; k++) {
      const t = t1 + ((t2 - t1) * k) / m;
      const L = (a, b, ta, tb) => ({ x: ((tb - t) * a.x + (t - ta) * b.x) / (tb - ta), y: ((tb - t) * a.y + (t - ta) * b.y) / (tb - ta) });
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3), B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3), C = L(B1, B2, t1, t2);
      const ll = proj.from(C); out.push([ll[0], ll[1], h1 + ((h2 - h1) * k) / m]);
    }
  }
  out.push([ctrl[n - 1][0], ctrl[n - 1][1], Number(ctrl[n - 1][2]) || 0]);
  return out;
};
// the line through the points (straight or curved), heights still as planned per point (not yet on the ground)
export const lineOf = (path, mode) => {
  const c = ctrlOf(path, mode); if (c.length < 2) return c.map((q) => [q[0], q[1], Number(q[2]) || 0]);
  return path.curve ? curveLine(c, makeProj(mode, c[0])) : c.map((q) => [q[0], q[1], Number(q[2]) || 0]);
};
// where each of the path's own points sits in the flown line (null if the line is out of date)
export const ctrlIdx = (path) => {
  const c = path.ctrl, pts = path.pts || []; if (!c || !c.length) return null;
  const out = []; let j = 0;
  for (let k = 0; k < c.length; k++) {
    while (j < pts.length && !(Math.abs(pts[j][0] - c[k][0]) < 1e-9 && Math.abs(pts[j][1] - c[k][1]) < 1e-9)) j++;
    if (j >= pts.length) return null; out.push(j); if (k < c.length - 1) j++;
  }
  return out;
};
// heights along the flown line from the points' heights (ground + height when following), without moving the line
const reheight = (path, mode, idx) => {
  const c = path.ctrl, pts = path.pts, prj = makeProj(mode, c[0]);
  const out = pts.map((q) => q.slice());
  for (let k = 0; k < c.length - 1; k++) {
    const a = idx[k], b = idx[k + 1], h1 = Number(c[k][2]) || 0, h2 = Number(c[k + 1][2]) || 0;
    const ds = [0]; for (let i = a + 1; i <= b; i++) ds.push(ds[ds.length - 1] + prj.dist(pts[i - 1], pts[i]));
    const tot = ds[ds.length - 1] || 1;
    for (let i = a; i <= b; i++) { const h = h1 + ((h2 - h1) * ds[i - a]) / tot, g = path.follow && pts[i][3] != null ? Number(pts[i][3]) : null;
      out[i] = g != null ? [pts[i][0], pts[i][1], rnd(g + h), g] : [pts[i][0], pts[i][1], rnd(h)]; }
  }
  return out;
};
// bring a path's flown line up to date after its points, heights, curve or follow setting change
export const rebuildPath = (path, mode) => {
  if (!path.ctrl || !path.ctrl.length) return path;
  const geo = JSON.stringify([path.ctrl.map((q) => [q[0], q[1]]), !!path.curve, !!path.follow]);
  const idx = path.lineKey === geo ? ctrlIdx(path) : null;
  if (idx) return { ...path, pts: reheight(path, mode, idx) };
  return { ...path, pts: lineOf(path, mode), lineKey: geo }; // a ground-following path gets its ground heights next
};
// "legs 3→9" in checks names the path's own points, not the line's fine steps
export const legToCtrl = (path) => {
  const idx = ctrlIdx(path); if (!idx) return null;
  const seg = []; for (let k = 0; k < idx.length - 1; k++) for (let i = idx[k]; i < idx[k + 1]; i++) seg[i] = k;
  return seg;
};
// "· 3 m above ground" / "· 0–120 m above ground" after a path's name (blank when heights are above the take-off)
export const pathHeightTag = (p) => {
  if (!p.follow) return '';
  if (p.ctrl && p.ctrl.length) { const h = p.ctrl.map((q) => Number(q[2]) || 0), lo = Math.min(...h), hi = Math.max(...h); return ' · ' + (lo === hi ? lo : lo + '–' + hi) + ' m above ground'; }
  return ' · ' + (Number(p.agl) || 0) + ' m above ground';
};
