// v7.15 (Chunk 9): read the old Google Forms registers (Pilot Register and Observer Register F15, Form Responses 1 and 2)
// into records the CRP can check, then import with import_register(). Parts 1 and 2 are matched by name.

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

export const normName = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const tidy = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// Google Forms dates are US style: 10/27/2026 or 10/27/2026 9:33:00 (Brisbane time)
export function usDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) { const iso = String(s || '').match(/^(\d{4}-\d{2}-\d{2})/); return iso ? { date: iso[1], at: null } : null; }
  const p = (n) => String(n).padStart(2, '0');
  const date = `${m[3]}-${p(m[1])}-${p(m[2])}`;
  return { date, at: m[4] ? `${date}T${p(m[4])}:${m[5]}:${p(m[6] || 0)}+10:00` : null };
}

const KINDS = [
  ['pilot1', (h) => h.some((x) => /^full name$/i.test(x)) && h.some((x) => /^arn$/i.test(x))],
  ['pilot2', (h) => h.some((x) => /record id/i.test(x)) && h.some((x) => /pilot name/i.test(x))],
  ['obs1', (h) => h.some((x) => /observer full name/i.test(x))],
  ['obs2', (h) => h.some((x) => /observer name/i.test(x)) && h.some((x) => /crp sign-?off/i.test(x))],
];
export const kindLabel = { pilot1: 'Pilot Register – Part 1 (pilot)', pilot2: 'Pilot Register – Part 2 (CRP)', obs1: 'Observer Register – Part 1 (observer)', obs2: 'Observer Register – Part 2 (CRP)' };

// one file → { kind, rows: [{header: value}] }
export function readFormFile(text) {
  const t = parseCsv(text);
  if (!t.length) return { kind: null, rows: [] };
  const head = t[0].map((h) => tidy(h));
  const k = KINDS.find(([, f]) => f(head));
  return { kind: k ? k[0] : null, head, rows: t.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] == null ? '' : String(r[i])]))) };
}
const col = (row, re) => { const k = Object.keys(row).find((h) => re.test(h)); return k ? row[k] : ''; };

// ── fuzzy aircraft names ("Neo2", "pavo 20 - 40", '5" FPV drone') ─────────────────────────────────────
const STOP = new Set(['dji', 'fpv', 'drone', 'pro', 'custom', 'the', 'rpa']);
export const typeTokens = (s) => String(s || '').toLowerCase().replace(/["”″]/g, ' inch ').replace(/(\d)\s*in\b/g, '$1 inch')
  .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').split(/[^a-z0-9.]+/).filter((w) => w && !STOP.has(w));
export function typeScore(a, b) {
  const A = typeTokens(a), B = typeTokens(b); if (!A.length || !B.length) return 0;
  const shared = A.filter((w) => B.includes(w)).length;
  let s = shared / Math.max(A.length, B.length);
  const ja = A.join(''), jb = B.join('');
  const named = (T) => T.some((w) => /^[a-z]{3,}$/.test(w) && w !== 'inch'); // a real name, not just '5"'
  const shortT = A.length <= B.length ? A : B;
  if (ja === jb) s = 1; else if (ja.length > 3 && jb.length > 3 && named(shortT) && (ja.includes(jb) || jb.includes(ja))) s = Math.max(s, 0.75);
  else if (shared && (shared === A.length || shared === B.length)) s = Math.max(s, 0.6); // "3.5" in 'Cinewhoop 3.5"'
  // a number that differs ("Mavic 3" vs "Mavic 4") is a different aircraft
  const na = A.filter((w) => /^\d/.test(w)), nb = B.filter((w) => /^\d/.test(w));
  if (na.length && nb.length && !na.some((n) => nb.includes(n))) s *= 0.3;
  return s;
}
export function bestType(name, options, min = 0.5) {
  let best = null, sc = 0;
  for (const o of options || []) { const v = typeScore(name, o); if (v > sc) { sc = v; best = o; } }
  return sc >= min ? best : null;
}
const splitList = (s) => String(s || '').split(/,(?![^(]*\))/).map(tidy).filter(Boolean);

// "Avata 2 20" / "pavo 20 - 40" / "Mavic 3: 40h" → { name, hours }
export function parseHourLines(text) {
  return String(text || '').split(/\r?\n|;/).map(tidy).filter(Boolean).map((l) => {
    const m = l.match(/^(.*?)[\s:=–-]*\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours)?\s*$/i);
    if (!m || !tidy(m[1])) return null;
    return { name: tidy(m[1].replace(/[\s:=–-]+$/, '')), hours: Number(m[2]) };
  }).filter(Boolean);
}

const REL = /^(father|dad|mother|mum|mom|wife|husband|partner|spouse|brother|sister|son|daughter|friend|parent|fiance|fiancee|fiancé|fiancée|uncle|aunt|grandfather|grandmother|cousin|de facto|girlfriend|boyfriend)$/i;
export function splitNok(s) {
  const t = tidy(s); if (!t) return { name: '', rel: '' };
  let m = t.match(/^(.*?)\s*[(\[](.+?)[)\]]$/) || t.match(/^(.*?)\s*[,–-]\s*(.+)$/);
  if (m && tidy(m[1])) return { name: tidy(m[1]), rel: tidy(m[2]) };
  const w = t.split(' '); if (w.length > 1 && REL.test(w[w.length - 1])) return { name: w.slice(0, -1).join(' '), rel: w[w.length - 1].replace(/^./, (c) => c.toUpperCase()) };
  return { name: t, rel: '' };
}
const ticked = (v) => /competent|complete|yes|✓|true/i.test(String(v || '')) && !/not yet|not competent/i.test(String(v || ''));

// files: [{ name, text }] → { records, files: [{name, kind, rows}], unknown: [names] }
export function buildRecords(files, fleetTypes = []) {
  const got = { pilot1: [], pilot2: [], obs1: [], obs2: [] }, info = [], unknown = [];
  for (const f of files) { const r = readFormFile(f.text); if (!r.kind) { unknown.push(f.name); continue; } got[r.kind].push(...r.rows); info.push({ name: f.name, kind: r.kind, rows: r.rows.length }); }
  const records = [];
  const p2 = new Map(got.pilot2.map((r) => [normName(col(r, /pilot name/i)), r]));
  const seen = new Set();
  for (const r of got.pilot1) {
    const name = tidy(col(r, /^full name$/i)); if (!name) continue;
    const key = normName(name); seen.add(key);
    const crp = p2.get(key) || null;
    const ts = usDate(col(r, /^timestamp$/i)), cts = crp ? usDate(col(crp, /^timestamp$/i)) : null;
    const check = crp ? usDate(col(crp, /check date/i)) : null;
    const declared = splitList(col(r, /rpa types you will fly/i));
    const assessed = crp ? splitList(col(crp, /types assessed/i)) : [];
    const typeOk = crp && ticked(col(crp, /type training/i));
    const hourLines = parseHourLines(col(r, /hours on each/i));
    // every aircraft named anywhere, matched to the declared list, then to the planner's fleet
    const names = [...declared];
    assessed.forEach((a) => { if (!names.some((n) => typeScore(a, n) >= 0.9)) names.push(a); });
    const types = names.map((t) => {
      const h = hourLines.find((x) => typeScore(x.name, t) >= 0.5 && bestType(x.name, names, 0.5) === t);
      return { form: t, hours: h ? h.hours : null, hoursText: h ? h.name + ' ' + h.hours : '', assessed: typeOk && assessed.some((a) => normName(a) === normName(t) || typeScore(a, t) >= 0.9), map: bestType(t, fleetTypes, 0.7) || t };
    });
    hourLines.filter((x) => !types.some((t) => t.hoursText === x.name + ' ' + x.hours)).forEach((x) => types.push({ form: x.name, hours: x.hours, hoursText: x.name + ' ' + x.hours, assessed: false, map: bestType(x.name, fleetTypes, 0.7) || x.name }));
    const nok = splitNok(col(r, /next of kin.*name|emergency contact/i));
    const comps = crp ? [ticked(col(crp, /induction/i)) && 'induction', ticked(col(crp, /evlos/i)) && 'evlos', ticked(col(crp, /oonp/i)) && 'oonp', ticked(col(crp, /night/i)) && 'night'].filter(Boolean) : [];
    records.push({
      id: 'pilot:' + key, kind: 'pilot', include: true, name, certified: !!crp,
      checkDate: (check && check.date) || (ts && ts.date) || '', signedAt: ts && ts.at, crpSignedAt: cts && cts.at,
      personTyped: tidy(col(r, /pilot signature/i)), crpTyped: crp ? tidy(col(crp, /crp signature/i)) : '',
      ref: crp && tidy(col(crp, /record id/i)) ? 'gf-pilot-' + tidy(col(crp, /record id/i)) : 'gf-pilot-' + key.replace(/\W+/g, '-') + '-' + ((ts && ts.at) || ''),
      person: { full_name: name, email: tidy(col(r, /^email$/i)).toLowerCase(), phone: tidy(col(r, /^phone$/i)), address: tidy(col(r, /^address$/i)),
        arn: tidy(col(r, /^arn$/i)).replace(/^arn[\s:#-]*/i, ''), repl_no: tidy(col(r, /repl/i)), nok_name: nok.name, nok_relationship: nok.rel, nok_phone: tidy(col(r, /next of kin.*phone/i)),
        total_hours: Number(String(col(r, /total rpa hours/i)).replace(/[^\d.]/g, '')) || null },
      comps, types,
      notes: crp ? tidy(col(crp, /notes/i)) : '',
      answers: { form: 'Pilot Register (Google Forms)', declaration: tidy(col(r, /pilot declaration/i)), approvalsSought: tidy(col(r, /approvals you are being assessed/i)),
        typesDeclared: declared, hoursAsWritten: String(col(r, /hours on each/i)).trim(), recordId: crp ? tidy(col(crp, /record id/i)) : '',
        crp: crp ? { induction: tidy(col(crp, /induction/i)), typeTraining: tidy(col(crp, /type training/i)), evlos: tidy(col(crp, /evlos/i)), oonp: tidy(col(crp, /oonp/i)), night: tidy(col(crp, /night/i)),
          typesAssessed: assessed, certification: tidy(col(crp, /crp certification/i)), notes: tidy(col(crp, /notes/i)), checkDate: check && check.date } : null },
    });
  }
  got.pilot2.forEach((r) => { const k = normName(col(r, /pilot name/i)); if (k && !seen.has(k)) records.push({ id: 'orphan:' + k, kind: 'pilot', orphan: true, include: false, name: tidy(col(r, /pilot name/i)), comps: [], types: [] }); });

  const o2 = new Map(got.obs2.map((r) => [normName(col(r, /observer name/i)), r]));
  const oseen = new Set();
  for (const r of got.obs1) {
    const name = tidy(col(r, /observer full name/i)); if (!name) continue;
    const key = normName(name); oseen.add(key);
    const crp = o2.get(key) || null;
    const ts = usDate(col(r, /^timestamp$/i)), cts = crp ? usDate(col(crp, /^timestamp$/i)) : null, d = usDate(col(r, /^date$/i));
    records.push({
      id: 'obs:' + key + ':' + ((ts && ts.at) || ''), kind: 'observer', include: true, name, certified: !!crp,
      checkDate: (d && d.date) || (ts && ts.date) || '', signedAt: ts && ts.at, crpSignedAt: cts && cts.at,
      personTyped: tidy(col(r, /observer signature/i)), crpTyped: crp ? tidy(col(crp, /crp signature/i)) : '',
      ref: 'gf-obs-' + key.replace(/\W+/g, '-') + '-' + ((ts && ts.at) || (d && d.date) || ''),
      person: { full_name: name, phone: tidy(col(r, /observer phone/i)) }, comps: crp ? ['evlos_observer'] : [], types: [],
      notes: crp ? tidy(col(crp, /notes/i)) : '', job: tidy(col(r, /job \/ location/i)),
      answers: { form: 'Observer Register F15 (Google Forms)', job: tidy(col(r, /job \/ location/i)), date: d && d.date, declaration: tidy(col(r, /observer declaration/i)),
        crp: crp ? { certification: tidy(col(crp, /crp sign-?off/i)), notes: tidy(col(crp, /notes/i)), job: tidy(col(crp, /job \/ date/i)) } : null },
    });
  }
  got.obs2.forEach((r) => { const k = normName(col(r, /observer name/i)); if (k && !oseen.has(k)) records.push({ id: 'orphan-obs:' + k, kind: 'observer', orphan: true, include: false, name: tidy(col(r, /observer name/i)), comps: [], types: [] }); });
  return { records, files: info, unknown };
}

// preview records → rows for import_register()
export function toImportRows(records) {
  return records.filter((r) => r.include && !r.orphan).map((r) => {
    const types = (r.types || []).filter((t) => t.map && t.map !== '__skip');
    const certs = r.certified ? [...r.comps.map((c) => ({ competency: c, check_date: r.checkDate })),
      ...(r.kind === 'pilot' ? types.filter((t) => t.assessed).map((t) => ({ competency: 'type:' + t.map, check_date: r.checkDate })) : [])] : [];
    const seen = new Set();
    return {
      ref: r.ref, kind: r.kind, certified: !!r.certified, person: r.person,
      hours: types.filter((t) => t.hours != null).map((t) => ({ rpa_type: t.map, hours: t.hours })),
      person_typed: r.personTyped, person_signed_at: r.signedAt, crp_typed: r.crpTyped, crp_signed_at: r.crpSignedAt,
      answers: { ...r.answers, checkDate: r.checkDate, typeMap: types.map((t) => ({ form: t.form, planner: t.map })) },
      certs: certs.filter((c) => (seen.has(c.competency) ? false : seen.add(c.competency))),
    };
  });
}
