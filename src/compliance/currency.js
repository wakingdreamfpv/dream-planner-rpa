// v7.11 (Chunks 7 & 8): crew currency for a job, and flight counts for the currency rule.
// Currency itself is worked out in the database (crew_currency): a check is good for 12 months, or up to 24 months
// while the person keeps flying at least 3 flights of that kind in each 12-month period. This file decides what each
// person on a job needs, and matches it against those results.

export const COMP_LABEL = { induction: 'Induction', evlos: 'EVLOS', oonp: 'OONP', night: 'Night', evlos_observer: 'EVLOS observer' };
export const compLabel = (c) => (String(c || '').startsWith('type:') ? String(c).slice(5) : COMP_LABEL[c] || c);
export const STATUS_LABEL = { current: 'Current', due_soon: 'Due soon', expired: 'Expired', missing: 'Not certified', unknown: 'Not in crew list' };
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const splitNames = (s) => String(s || '').split(/[,;/&\n]|\band\b/).map((x) => x.replace(/\(.*?\)/g, '').trim()).filter((x) => x.length > 1);
const RANK = { rpic: 0, pilot: 1, observer: 2 };

export const jobOps = (plan) => {
  const jsa = (plan && plan.jsa) || {}, ops = jsa.operationTypes || [];
  return { evlos: ops.includes('EVLOS'), oonp: ops.includes('OONP'), night: jsa.timeOfDay === 'NIGHT' || jsa.timeOfDay === 'DAY_NIGHT',
    types: (((plan && plan.overview) || {}).rpaTypes || []).filter((t) => t && t !== 'Custom') };
};

// Who is on the job and what each of them needs
export function jobRequirements(plan) {
  const ov = (plan && plan.overview) || {}, ap = (plan && plan.approval) || {}, lg = (plan && plan.log) || {}, jsa = (plan && plan.jsa) || {};
  const o = jobOps(plan), crew = new Map();
  const add = (names, role) => splitNames(names).forEach((n) => { const k = norm(n), cur = crew.get(k); if (!cur || RANK[role] < RANK[cur.role]) crew.set(k, { name: n, role, evlosObs: (cur && cur.evlosObs) || false }); });
  add(ov.rpic, 'rpic'); add(ap.rpName, 'rpic'); add(lg.crewRP, 'pilot'); add(lg.crewSecondRP, 'pilot');
  if (o.evlos) splitNames(jsa.evlosObserver).forEach((n) => { add(n, 'observer'); crew.get(norm(n)).evlosObs = true; });
  return [...crew.values()].map((c) => {
    const needs = [];
    if (c.role !== 'observer') {
      needs.push({ comp: 'induction' });
      if (o.types.length) needs.push({ anyOf: o.types.map((t) => 'type:' + t), label: o.types.length > 1 ? 'Type: one of ' + o.types.join(', ') : 'Type: ' + o.types[0] });
      if (o.evlos && c.role === 'rpic') needs.push({ comp: 'evlos' });
      if (o.oonp) needs.push({ comp: 'oonp', hours: 10 });
      if (o.night) needs.push({ comp: 'night' });
    }
    if (c.evlosObs) needs.push({ comp: 'evlos_observer' });
    return { ...c, needs };
  }).filter((c) => c.needs.length);
}

export const findPerson = (people, name) => {
  const k = norm(name); if (!k) return null;
  const ppl = (people || []).filter((p) => p && p.active !== false);
  return ppl.find((p) => norm(p.full_name) === k) || ppl.find((p) => norm(p.email) === k) || null;
};

// One line per person × requirement: status from the latest certification (rows from crew_currency)
export function checkJobCrew(plan, cur) {
  const rows = (cur && cur.rows) || [], people = (cur && cur.people) || [], hours = (cur && cur.hours) || [];
  const o = jobOps(plan), out = [];
  jobRequirements(plan).forEach((c) => {
    const p = findPerson(people, c.name);
    c.needs.forEach((n) => {
      if (n.comp === 'induction' && p && p.role === 'crp') return; // the CRP runs the inductions; they don't induct themselves
      const comps = n.anyOf || [n.comp], label = n.label || compLabel(n.comp);
      const id = 'crew:' + norm(c.name) + ':' + (n.comp || 'type');
      if (!p) { out.push({ id, name: c.name, role: c.role, label, status: 'unknown', detail: 'Add them in Crew & users (with a login) so their certifications can be checked.' }); return; }
      const have = rows.filter((r) => r.person_id === p.id && comps.includes(r.competency));
      const order = { current: 0, due_soon: 1, expired: 2 };
      const best = have.sort((a, b) => (order[a.status] - order[b.status]) || String(b.due || '9999').localeCompare(String(a.due || '9999')))[0];
      let status = best ? best.status : 'missing', detail = '';
      if (best) detail = (best.due ? (status === 'expired' ? 'Expired ' : 'Due ') + best.due : 'No expiry') + (best.extended && status !== 'expired' ? ' (extended by recent flights)' : '') + (n.anyOf && n.anyOf.length > 1 ? ' · ' + compLabel(best.competency) : '');
      else detail = 'No ' + label + ' certification on record.';
      if (n.hours && status !== 'missing' && status !== 'expired') {
        const hrs = hours.filter((h) => h.person_id === p.id && o.types.includes(h.rpa_type)).reduce((t, h) => t + (Number(h.seconds) || 0), 0) / 3600;
        const declared = Number(p.total_hours) || 0;
        if (hrs < n.hours) { status = status === 'current' ? 'hours' : status; detail += ' · ' + hrs.toFixed(1) + ' h logged on ' + (o.types.join(' / ') || 'type') + ' (needs ' + n.hours + ')' + (declared ? ', ' + declared + ' h declared overall' : ''); }
      }
      out.push({ id, name: c.name, role: c.role, personId: p.id, label, status, due: best && best.due, detail });
    });
  });
  return out;
}
export const crewItemOk = (x) => x.status === 'current' || x.status === 'due_soon';

// Flights from completed jobs, for the "3 flights in each 12-month period" rule
export function flightCountRows(records) {
  const out = [];
  (records || []).forEach((rec) => {
    const ov = rec.overview || {}, lg = rec.log || {}, o = jobOps(rec);
    const pilots = splitNames(lg.crewRP || ov.rpic);
    if (!pilots.length) return;
    const uid = ov.uid || rec.id || ov.identifier || ''; if (!uid) return;
    const day = String(ov.operationDate || rec.completedAt || '').slice(0, 10);
    Object.entries(lg.rpaLogs || {}).forEach(([rpa, rl]) => ((rl && rl.flights) || []).forEach((f, i) => {
      const sec = f.telemetry && f.telemetry.durationSec > 0 ? f.telemetry.durationSec : (parseInt(f.duration, 10) || 0) * 60;
      if (!(sec > 0)) return;
      const when = f.telemetry && f.telemetry.startMs ? new Date(f.telemetry.startMs).toISOString().slice(0, 10) : day;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(when)) return;
      const comps = ['type:' + rpa, ...(o.evlos ? ['evlos'] : []), ...(o.oonp ? ['oonp'] : []), ...(((rec.jsa || {}).timeOfDay === 'NIGHT') ? ['night'] : [])];
      const ref = uid + ':' + rpa + ':' + (f.id != null ? f.id : i);
      pilots.forEach((name) => comps.forEach((competency) => out.push({ name, competency, flight_date: when, flight_ref: ref })));
    }));
  });
  return out;
}
