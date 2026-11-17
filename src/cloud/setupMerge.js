// v7.39: merge two copies of the CRP's company setup (this device and the one saved to the account) instead of
// making the CRP pick one copy and lose the other.
//
// With a "base" (the copy both devices last agreed on), it's a three-way merge: whatever only one side changed is
// taken automatically. Without one (a device that has never synced), anything that's only on one side is added and
// anything blank on one side is filled from the other. Only an item that BOTH sides changed differently becomes a
// conflict, which the CRP settles item by item (pre-picked: the newer copy).

const stable = (v) => v === null || v === undefined || typeof v !== 'object' ? JSON.stringify(v === undefined ? null : v)
  : Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
const same = (a, b) => stable(a) === stable(b);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);
const itemKey = (x) => isObj(x) ? (x.id != null && x.id !== '' ? 'id:' + x.id : x.name ? 'name:' + String(x.name).trim().toLowerCase() : null) : null;
const keyedList = (arr) => { if (!arr.length || !arr.every(isObj)) return null; const m = new Map();
  for (const x of arr) { const k = itemKey(x); if (!k || m.has(k)) return null; m.set(k, x); } return m; };

export const SECTION_NAMES = {
  companyProfile: 'Company profile', fleet: 'Fleet (aircraft)', batteries: 'Battery types', rpaBatteries: 'Battery packs per aircraft',
  batteryRegister: 'Battery register', pilots: 'Pilots', observers: 'Observers', assessors: 'Assessors', clients: 'Clients',
  compliance: 'Compliance & crew records', officialAuths: 'Instruments & approvals', customRiskTemplates: 'Risk templates',
  riskTemplates: 'Risk templates', speedMeasures: 'Speed measures', heightMeasures: 'Height measures', mediaFormats: 'Media formats',
  pdfViews: 'PDF layout', crew: 'Crew & users',
};
const words = (k) => SECTION_NAMES[k] || String(k).replace(/^(id|name):/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());
export const pathLabel = (path) => path.map(p => typeof p === 'object' ? String(p.k).replace(/^(id|name):/, '') : words(p)).join(' › ');

// one value, shortened for the screen
export const preview = (v) => {
  if (v === undefined || v === null || v === '') return '(blank / removed)';
  if (typeof v !== 'object') return String(v).length > 80 ? String(v).slice(0, 77) + '…' : String(v);
  if (Array.isArray(v)) return v.length + ' item' + (v.length === 1 ? '' : 's') + (v.length && typeof v[0] !== 'object' ? ': ' + v.slice(0, 4).join(', ') + (v.length > 4 ? '…' : '') : '');
  const ks = Object.keys(v); const nm = v.name || v.title || v.label;
  return (nm ? String(nm) + ' · ' : '') + ks.length + ' detail' + (ks.length === 1 ? '' : 's');
};

function mergeVal(L, C, B, hasBase, path, out, depth) {
  if (same(L, C)) return L;
  if (hasBase && same(L, B)) { if (!same(C, B)) out.fromCloud++; return C; }
  if (hasBase && same(C, B)) { out.fromLocal++; return L; }
  if (!hasBase && empty(L)) { out.fromCloud++; return C; }
  if (!hasBase && empty(C)) { out.fromLocal++; return L; }
  if (depth < 4 && isObj(L) && isObj(C)) {
    const b = isObj(B) ? B : null, res = {};
    const keys = [...new Set([...Object.keys(L), ...Object.keys(C)])];
    keys.forEach(k => { const v = mergeVal(L[k], C[k], b ? b[k] : undefined, !!b && hasBase && (k in b), [...path, k], out, depth + 1); if (v !== undefined) res[k] = v; });
    return res;
  }
  if (depth < 4 && Array.isArray(L) && Array.isArray(C)) {
    const b = Array.isArray(B) ? B : null;
    if (!L.some(x => typeof x === 'object' && x) && !C.some(x => typeof x === 'object' && x)) { // plain lists (names, battery numbers…)
      const has = (arr, x) => arr.some(y => same(x, y));
      const gone = b && hasBase ? b.filter(x => !has(L, x) || !has(C, x)) : [];
      const res = [...L, ...C.filter(x => !has(L, x))].filter(x => !has(gone, x));
      out.fromLocal += L.some(x => !has(C, x)) ? 1 : 0; out.fromCloud += C.some(x => !has(L, x)) ? 1 : 0;
      return res;
    }
    const lm = keyedList(L), cm = keyedList(C), bm = b ? keyedList(b) : null;
    if (lm && cm && (!b || !b.length || bm)) { // lists of named / numbered things: merge thing by thing
      const res = [];
      const order = [...lm.keys(), ...[...cm.keys()].filter(k => !lm.has(k))];
      order.forEach(k => { const v = mergeVal(lm.get(k), cm.get(k), bm ? bm.get(k) : undefined, !!bm && hasBase && bm.has(k), [...path, { k }], out, depth + 1); if (v !== undefined) res.push(v); });
      return res;
    }
  }
  out.conflicts.push({ path, local: L, cloud: C });
  return L;
}

// local, cloud, base: setup objects (no jobs). Returns { merged, conflicts: [{path, label, local, cloud}], fromLocal, fromCloud }
export function mergeSetup(local, cloud, base) {
  const out = { conflicts: [], fromLocal: 0, fromCloud: 0 };
  const hasBase = isObj(base);
  const merged = {};
  const keys = [...new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})])];
  keys.forEach(k => { const L = (local || {})[k], C = (cloud || {})[k], B = hasBase ? base[k] : undefined;
    const kb = hasBase && (k in base);
    const v = mergeVal(L, C, B, kb, [k], out, 1); if (v !== undefined) merged[k] = v; });
  out.conflicts.forEach(c => { c.label = pathLabel(c.path); c.id = stable(c.path); });
  return { merged, ...out };
}

// put a chosen value at a conflict's place (undefined removes it)
export function setAt(obj, path, value) {
  const root = JSON.parse(JSON.stringify(obj || {}));
  let cur = root;
  for (let i = 0; i < path.length; i++) {
    const p = path[i], last = i === path.length - 1;
    if (typeof p === 'object') { // item in a list, found by id or name
      if (!Array.isArray(cur)) return root;
      const idx = cur.findIndex(x => itemKey(x) === p.k);
      if (last) { if (value === undefined) { if (idx >= 0) cur.splice(idx, 1); } else if (idx >= 0) cur[idx] = value; else cur.push(value); return root; }
      if (idx < 0) return root; cur = cur[idx];
    } else {
      if (last) { if (value === undefined) delete cur[p]; else cur[p] = value; return root; }
      if (cur[p] == null || typeof cur[p] !== 'object') return root; cur = cur[p];
    }
  }
  return root;
}

export function applyPicks(merged, conflicts, picks) {
  let res = merged;
  conflicts.forEach(c => { const side = picks[c.id] || 'cloud'; res = setAt(res, c.path, side === 'local' ? c.local : c.cloud); });
  return res;
}
