// Dream Planner connector: the tools Claude can use on the CRP's own account (v7.41).
// Everything goes through the CRP's normal login, so the database's own rules (RLS) apply: only a CRP account can
// read every job or change them. Nothing here uses a secret key.
//
// How changes reach the planner: a job saved here gets a newer "savedAt", and each CRP device downloads newer account
// copies of jobs it hasn't changed itself (v7.38). Approved plans are never re-planned from here (that would void the
// signatures); only their flight log is filled in.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseTelemetryCsv, flightFromTelemetry, guessAircraft, fmtMmSs, retimeFlight } from '../src/telemetry/logs.js';

const slim = (plan) => { const p = JSON.parse(JSON.stringify(plan || {}));
  Object.values((p.log && p.log.rpaLogs) || {}).forEach(rl => ((rl && rl.flights) || []).forEach(f => { if (f && f.telemetry) { delete f.telemetry.trace; delete f.telemetry.altRaw; delete f.telemetry.spdRaw; } }));
  delete p.siteAttachments; delete p.heatStrokes; return p; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const deepMerge = (a, b) => { if (!isObj(a) || !isObj(b)) return b; const o = { ...a }; Object.keys(b).forEach(k => { o[k] = (isObj(a[k]) && isObj(b[k])) ? deepMerge(a[k], b[k]) : b[k]; }); return o; };
const localIso = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const localDay = (ms) => localIso(ms).slice(0, 10);

export function makeTools(sb, opts = {}) {
  const defClock = opts.clock || 'utc';
  const clockOf = (c) => c === 'local' || c === 'utc' ? c : defClock;
  const err = (m) => { const e = new Error(m); e.user = true; return e; };

  const CREW_COLS = 'full_name,role,email,phone,address,arn,repl_no,nok_name,nok_relationship,nok_phone,total_hours,medical_expiry,training_expiry,notes';
  const crewFields = (a, isNew) => { const o = {};
    const ok = ['full_name', 'role', 'email', 'phone', 'address', 'arn', 'repl_no', 'nok_name', 'nok_relationship', 'nok_phone', 'total_hours', 'medical_expiry', 'training_expiry', 'notes', 'active'];
    const bad = Object.keys(a).filter(k => !ok.includes(k)); if (bad.length) throw err('Can\'t set ' + bad.join(', ') + ' here. Allowed: ' + ok.join(', '));
    for (const k of ok) { if (!(k in a)) continue; let v = a[k];
      if (k === 'role') { if (!['pilot', 'observer'].includes(v)) throw err('role must be pilot or observer.'); }
      else if (k === 'active') v = v !== false && v !== 'false';
      else if (k === 'total_hours') { v = v === '' || v == null ? null : Number(v); if (v != null && !(v >= 0)) throw err('total_hours must be a number.'); }
      else if (/_expiry$/.test(k)) { v = v ? String(v) : null; if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err(k + ' must be YYYY-MM-DD.'); }
      else { v = String(v == null ? '' : v).trim(); if (k === 'email') v = v.toLowerCase(); if (v === '') v = null; }
      if (k === 'full_name' && !v) throw err('full_name can\'t be blank.');
      o[k] = v; }
    return o; };
  const findPerson = async (q) => { const s = String(q || '').trim().toLowerCase(); if (!s) throw err('Say who (name, email or id).');
    const { data, error } = await sb.from('people').select('id,full_name,email,role'); if (error) throw err('Could not read the crew: ' + error.message);
    let hit = (data || []).filter(p => p.id === s || String(p.email || '') === s || String(p.full_name || '').trim().toLowerCase() === s);
    if (!hit.length) hit = (data || []).filter(p => String(p.full_name || '').toLowerCase().includes(s));
    if (!hit.length) throw err('No one in the crew list matches "' + q + '".');
    if (hit.length > 1) throw err('Several people match "' + q + '": ' + hit.map(p => p.full_name).join(', ') + '.'); return hit[0]; };

  const listRows = async () => {
    const { data, error } = await sb.from('jobs').select('id,plan_uid,op_id,title,status,start_date,end_date,updated_at').order('start_date', { ascending: false });
    if (error) throw err('Could not read jobs: ' + error.message); return data || [];
  };
  const findJob = async (q) => {
    const s = String(q || '').trim(); if (!s) throw err('Say which job (its OP number, name, or id).');
    const rows = (await listRows()).filter(r => r.status !== 'cancelled');
    let hit = rows.filter(r => r.id === s || r.plan_uid === s || String(r.op_id || '').toLowerCase() === s.toLowerCase());
    if (!hit.length) hit = rows.filter(r => String(r.title || '').toLowerCase().includes(s.toLowerCase()));
    if (!hit.length) throw err('No job matches "' + s + '".');
    if (hit.length > 1) throw err('Several jobs match "' + s + '": ' + hit.map(r => `${r.op_id || ''} ${r.title} (${r.status}, ${r.start_date || 'no date'})`).join('; ') + '. Use the OP number.');
    const { data, error } = await sb.from('jobs').select('id,plan_uid,op_id,title,status,start_date,end_date,updated_at,plan').eq('id', hit[0].id).single();
    if (error) throw err('Could not read the job: ' + error.message); return data;
  };
  const saveJob = async (row, plan, status) => {
    const ov = plan.overview || {};
    const out = { plan_uid: row.plan_uid, op_id: ov.identifier || row.op_id || null, title: plan.title || row.title || '', status: status || row.status,
      start_date: ov.operationDate || row.start_date || null, end_date: ov.operationEndDate || ov.operationDate || row.end_date || null, plan: slim(plan), updated_at: new Date().toISOString() };
    if (opts.userId) out.updated_by = opts.userId;
    const { data, error } = await sb.from('jobs').upsert(out, { onConflict: 'plan_uid' }).select('id').single();
    if (error) throw err('Could not save the job: ' + error.message); return data;
  };
  const getSetup = async () => {
    const { data, error } = await sb.from('crp_store').select('data,updated_at,device').eq('key', 'settings').maybeSingle();
    if (error) throw err('Could not read the company setup: ' + error.message);
    return (data && data.data) || {};
  };
  const flightSummary = (rpa, f, i) => ({ rpa, index: i, label: f.label || '', minutes: f.duration || '', batteries: f.batteries || '', oonp: f.oonp === true ? 'OONP' : f.oonp === false ? 'Non-OONP' : 'not set',
    start: f.telemetry && f.telemetry.startMs ? localIso(f.telemetry.startMs) : '', maxAltFt: f.telemetry && f.telemetry.maxAltM != null ? Math.round(f.telemetry.maxAltM * 3.28084) : undefined,
    source: f.source || 'manual' });
  const jobSummary = (row) => {
    const p = row.plan || {}, ov = p.overview || {}, ap = p.approval || {}, lg = p.log || {};
    const flights = []; Object.entries(lg.rpaLogs || {}).forEach(([rpa, rl]) => ((rl && rl.flights) || []).forEach((f, i) => flights.push(flightSummary(rpa, f, i))));
    const todo = [];
    flights.forEach(f => { if (!f.batteries) todo.push(`${f.rpa} flight ${f.index + 1} (${f.label}): battery used`); if (f.oonp === 'not set') todo.push(`${f.rpa} flight ${f.index + 1} (${f.label}): OONP / Non-OONP`); });
    return { id: row.id, op: row.op_id, title: row.title, status: row.status, approved: !!ap.flightAuthApproved, dates: [ov.operationDate, ov.operationEndDate].filter(Boolean).join(' to '),
      client: ov.clientName || '', location: ov.location || '', rpic: ov.rpic || '', aircraft: ov.rpaTypes || [], flights, still_to_fill_in: todo,
      crew_log: { crewRP: lg.crewRP || '', crewObserver: lg.crewObserver || '', weatherDetails: lg.weatherDetails || '', defects: lg.defects || '', comments: lg.comments || '' } };
  };
  const csvFiles = (paths) => { const out = [];
    (paths || []).forEach(p0 => { const p = String(p0).replace(/^~(?=\/)/, process.env.HOME || '~');
      if (!fs.existsSync(p)) throw err('Not found: ' + p0);
      const st = fs.statSync(p);
      if (st.isDirectory()) fs.readdirSync(p).filter(n => /\.csv$/i.test(n)).sort().forEach(n => out.push(path.join(p, n)));
      else out.push(p); });
    return out; };
  const readFlights = (paths, clock) => { const out = [], empty = [];
    csvFiles(paths).forEach(f => { let fl = [];
      try { fl = parseTelemetryCsv(fs.readFileSync(f, 'utf8'), path.basename(f), clock); } catch (e) { empty.push(path.basename(f) + ' (' + e.message + ')'); return; }
      if (!fl.length) empty.push(path.basename(f)); fl.forEach((t, i) => out.push({ ref: f + '#' + i + '@' + clock, file: f, t })); });
    return { flights: out, empty }; };

  const tools = {
    list_jobs: {
      description: 'List the jobs in the planner account (drafts, approved plans, completed records). Optional filters: status (draft | approved | completed | all) and search (part of the name or OP number).',
      schema: { type: 'object', properties: { status: { type: 'string', enum: ['draft', 'approved', 'completed', 'all'] }, search: { type: 'string' } } },
      run: async ({ status = 'all', search = '' } = {}) => {
        const s = String(search || '').toLowerCase();
        return (await listRows()).filter(r => r.status !== 'cancelled' && (status === 'all' || r.status === status) && (!s || String(r.title || '').toLowerCase().includes(s) || String(r.op_id || '').toLowerCase().includes(s)))
          .map(r => ({ id: r.id, op: r.op_id, title: r.title, status: r.status, dates: [r.start_date, r.end_date !== r.start_date ? r.end_date : null].filter(Boolean).join(' to '), updated: r.updated_at }));
      },
    },
    get_job: {
      description: 'Read one job: overview, aircraft, approval, its flight log (every flight with battery and OONP), and what is still to fill in. Use full=true for the whole plan (JSA, risks, map, approval details).',
      schema: { type: 'object', properties: { job: { type: 'string', description: 'OP number, name, or id' }, full: { type: 'boolean' } }, required: ['job'] },
      run: async ({ job, full }) => { const row = await findJob(job); return full ? { ...jobSummary(row), plan: slim(row.plan) } : jobSummary(row); },
    },
    get_setup: {
      description: 'Read the company setup: fleet (aircraft, battery cells, radio model names), battery numbers per aircraft, and the people lists (pilots, observers, clients). Use it to fill in plans and logs with real names and battery numbers.',
      schema: { type: 'object', properties: {} },
      run: async () => { const d = await getSetup(); const fl = d.fleet || {};
        return { company: (d.companyProfile || {}).name || '', fleet: Object.fromEntries(Object.entries(fl).map(([k, v]) => [k, { weightKg: v.weight, cells: v.cells, radioModel: v.radioModel || '', batteries: (d.rpaBatteries || {})[k] || [] }])),
          pilots: (d.pilots || []).map(p => p.name || p), observers: (d.observers || []).map(p => p.name || p), clients: (d.clients || []).map(c => c.name || c) }; },
    },
    read_flight_logs: {
      description: 'Read radio flight logs (EdgeTX / ELRS telemetry CSV files, or folders of them) from this Mac, the same way the planner does. Lists each armed flight with its start time, length, height, battery voltage, the aircraft it most likely is, and the job flown that day. Nothing is saved.',
      schema: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' }, description: 'CSV files or folders' }, clock: { type: 'string', enum: ['utc', 'local'], description: 'How the radio clock was set when these logs were recorded. Mike\'s radio: local (Brisbane) time from November 2026, UTC before that. If unsure, compare a flight\'s start time with when the user remembers flying.' } }, required: ['paths'] },
      run: async ({ paths, clock }) => {
        const { flights, empty } = readFlights(paths, clockOf(clock)); const setup = await getSetup(); const rows = (await listRows()).filter(r => r.status === 'draft' || r.status === 'approved');
        return { flights: flights.map(x => { const day = localDay(x.t.startMs);
            const jobs = rows.filter(r => r.start_date && r.start_date <= day && day <= (r.end_date || r.start_date));
            const g = guessAircraft(x.t, path.basename(x.file), setup.fleet || {}, []);
            return { ref: x.ref, file: path.basename(x.file), start: localIso(x.t.startMs), armed: fmtMmSs(x.t.durationSec), maxAltFt: Math.round((x.t.maxAltM || 0) * 3.28084), startVolts: x.t.vStart,
              clock: x.t.clock, aircraft_guess: g.rpa || '', why: g.why, options: g.options, jobs_that_day: jobs.map(r => `${r.op_id || ''} ${r.title} (${r.status})`) }; }),
          files_without_flights: empty };
      },
    },
    add_flight_logs: {
      description: 'Add flights (from read_flight_logs refs) to a job\'s flight log, each with its aircraft and optionally the battery used and OONP true/false. Flights already on the job are skipped. On an approved plan only aircraft already on the plan are allowed (adding one would withdraw the approval: do that in the planner).',
      schema: { type: 'object', properties: { job: { type: 'string' }, flights: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, aircraft: { type: 'string' }, battery: { type: 'string' }, oonp: { type: 'boolean' } }, required: ['ref', 'aircraft'] } }, clock: { type: 'string', enum: ['utc', 'local'], description: 'How the radio clock was set when these logs were recorded. Mike\'s radio: local (Brisbane) time from November 2026, UTC before that. If unsure, compare a flight\'s start time with when the user remembers flying.' } }, required: ['job', 'flights'] },
      run: async ({ job, flights, clock }) => { const clk = clockOf(clock);
        const row = await findJob(job); if (row.status === 'completed') throw err('That job is a completed record; it can\'t be changed here.');
        const plan = JSON.parse(JSON.stringify(row.plan || {})), ov = plan.overview = plan.overview || {}, lg = plan.log = plan.log || {};
        const approved = !!((plan.approval || {}).flightAuthApproved), setup = await getSetup(), fleet = setup.fleet || {};
        const rpaLogs = lg.rpaLogs = { ...(lg.rpaLogs || {}) }, rpaTypes = ov.rpaTypes = [...(ov.rpaTypes || [])];
        const have = new Set(); Object.values(rpaLogs).forEach(rl => ((rl && rl.flights) || []).forEach(f => { if (f.telemetry) have.add(f.telemetry.startMs); }));
        const cache = {}; const added = [], skipped = [];
        for (const it of flights || []) {
          const rm = /^(.*)#(\d+)(?:@(utc|local))?$/.exec(String(it.ref || '')); if (!rm) { skipped.push(it.ref + ': not a flight reference from read_flight_logs'); continue; }
          const file = rm[1], idx = rm[2], fclk = clock ? clk : (rm[3] || clk);
          if (!fleet[it.aircraft]) { skipped.push(it.ref + ': no aircraft called "' + it.aircraft + '" in the fleet'); continue; }
          if (approved && !rpaTypes.includes(it.aircraft)) { skipped.push(it.ref + ': ' + it.aircraft + ' is not on this approved plan (add it in the planner)'); continue; }
          const ck = file + '@' + fclk; if (!cache[ck]) { try { cache[ck] = parseTelemetryCsv(fs.readFileSync(file, 'utf8'), path.basename(file), fclk); } catch (e) { skipped.push(it.ref + ': ' + e.message); continue; } }
          const t = cache[ck][parseInt(idx, 10)]; if (!t) { skipped.push(it.ref + ': flight not found in the file'); continue; }
          if (have.has(t.startMs)) { skipped.push(it.ref + ': already on this job'); continue; } have.add(t.startMs);
          const cells = parseInt((fleet[it.aircraft] || {}).cells) || 0;
          const f = flightFromTelemetry(cells ? { ...t, cells } : t); delete f.telemetry.trace; delete f.telemetry.altRaw; delete f.telemetry.spdRaw;
          if (it.battery) f.batteries = String(it.battery); if (typeof it.oonp === 'boolean') f.oonp = it.oonp;
          if (!rpaTypes.includes(it.aircraft)) rpaTypes.push(it.aircraft);
          const rl = { duration: '', batteries: '', fpvEnabled: false, flights: [], ...(rpaLogs[it.aircraft] || {}) };
          const blank = (x) => !(parseInt(x.duration) > 0) && !String(x.batteries || '').trim() && !x.telemetry && !(x.segments || []).some(s => s.maxFt);
          rpaLogs[it.aircraft] = { ...rl, flights: [...(rl.flights || []).filter(x => !blank(x)), f].sort((a, b) => ((a.telemetry && a.telemetry.startMs) || 0) - ((b.telemetry && b.telemetry.startMs) || 0)) };
          added.push(`${it.aircraft}: ${f.label} (${f.duration} min)`);
        }
        if (added.length) { plan.savedAt = new Date().toISOString(); await saveJob(row, plan); }
        return { job: `${row.op_id || ''} ${row.title}`, added, skipped, note: added.length ? 'Saved to the account. Open the planner: the job updates on each device (if that device has unsaved changes to this job, those are kept and this is not applied there).' : 'Nothing was added.' };
      },
    },
    update_flight: {
      description: 'Fill in or correct one flight on a job\'s log: battery used, OONP true/false, minutes, or label. Find it with get_job (aircraft + index).',
      schema: { type: 'object', properties: { job: { type: 'string' }, aircraft: { type: 'string' }, index: { type: 'integer' }, battery: { type: 'string' }, oonp: { type: 'boolean' }, minutes: { type: 'string' }, label: { type: 'string' } }, required: ['job', 'aircraft', 'index'] },
      run: async ({ job, aircraft, index, battery, oonp, minutes, label }) => {
        const row = await findJob(job); if (row.status === 'completed') throw err('That job is a completed record; it can\'t be changed here.');
        const plan = JSON.parse(JSON.stringify(row.plan || {})), rl = ((plan.log || {}).rpaLogs || {})[aircraft];
        const f = rl && (rl.flights || [])[index]; if (!f) throw err('No flight ' + index + ' for ' + aircraft + ' on that job.');
        if (battery !== undefined) f.batteries = String(battery); if (typeof oonp === 'boolean') f.oonp = oonp; if (minutes !== undefined) f.duration = String(minutes); if (label !== undefined) f.label = String(label);
        plan.savedAt = new Date().toISOString(); await saveJob(row, plan);
        return flightSummary(aircraft, f, index);
      },
    },
    update_crew_log: {
      description: 'Fill in the post-flight part of a job\'s log: crewRP, crewSecondRP, crewObserver, weatherDetails, defects, comments, planningErrors, conductedChanges (text fields).',
      schema: { type: 'object', properties: { job: { type: 'string' }, fields: { type: 'object' } }, required: ['job', 'fields'] },
      run: async ({ job, fields }) => {
        const ok = ['crewRP', 'crewSecondRP', 'crewObserver', 'weatherDetails', 'defects', 'comments', 'planningErrors', 'conductedChanges'];
        const bad = Object.keys(fields || {}).filter(k => !ok.includes(k)); if (bad.length) throw err('Can\'t set ' + bad.join(', ') + ' here. Allowed: ' + ok.join(', '));
        const row = await findJob(job); if (row.status === 'completed') throw err('That job is a completed record; it can\'t be changed here.');
        const plan = JSON.parse(JSON.stringify(row.plan || {})); plan.log = { ...(plan.log || {}) }; Object.entries(fields).forEach(([k, v]) => { plan.log[k] = String(v); });
        plan.savedAt = new Date().toISOString(); await saveJob(row, plan); return { saved: Object.keys(fields) };
      },
    },
    fix_flight_clock: {
      description: 'Move flights that were imported with the wrong radio clock: re-reads their times as local time (to: "local") or UTC (to: "utc"). For Brisbane that moves them by 10 hours. Only flights saved with the other clock move; length, heights, batteries and OONP stay. Optionally only one aircraft, or only flights first saved on/after a date (YYYY-MM-DD, as currently shown).',
      schema: { type: 'object', properties: { job: { type: 'string' }, to: { type: 'string', enum: ['utc', 'local'] }, aircraft: { type: 'string' }, from_date: { type: 'string' } }, required: ['job', 'to'] },
      run: async ({ job, to, aircraft, from_date }) => {
        const row = await findJob(job); if (row.status === 'completed') throw err('That job is a completed record; it can\'t be changed here.');
        const plan = JSON.parse(JSON.stringify(row.plan || {})), moved = [];
        Object.entries((plan.log || {}).rpaLogs || {}).forEach(([rpa, rl]) => { if (aircraft && rpa !== aircraft) return;
          rl.flights = (rl.flights || []).map(f => { if (!f.telemetry || !f.telemetry.startMs || (f.telemetry.clock || 'utc') === to) return f;
            if (from_date && localDay(f.telemetry.startMs) < from_date) return f;
            const g = retimeFlight(f, to); moved.push(`${rpa}: ${localIso(f.telemetry.startMs)} → ${localIso(g.telemetry.startMs)}`); return g; })
            .sort((a, b) => ((a.telemetry && a.telemetry.startMs) || 0) - ((b.telemetry && b.telemetry.startMs) || 0)); });
        if (moved.length) { plan.savedAt = new Date().toISOString(); await saveJob(row, plan); }
        return { job: `${row.op_id || ''} ${row.title}`, moved, note: moved.length ? 'Saved to the account.' : 'No flights needed moving.' };
      },
    },
    remove_flight: {
      description: 'Remove one flight from a job\'s log (find it with get_job: aircraft + index). Use for a flight put on the wrong job or a duplicate. Ask the user first.',
      schema: { type: 'object', properties: { job: { type: 'string' }, aircraft: { type: 'string' }, index: { type: 'integer' } }, required: ['job', 'aircraft', 'index'] },
      run: async ({ job, aircraft, index }) => {
        const row = await findJob(job); if (row.status === 'completed') throw err('That job is a completed record; it can\'t be changed here.');
        const plan = JSON.parse(JSON.stringify(row.plan || {})), rl = ((plan.log || {}).rpaLogs || {})[aircraft];
        const f = rl && (rl.flights || [])[index]; if (!f) throw err('No flight ' + index + ' for ' + aircraft + ' on that job.');
        rl.flights.splice(index, 1); plan.savedAt = new Date().toISOString(); await saveJob(row, plan);
        return { removed: flightSummary(aircraft, f, index), left_for_aircraft: rl.flights.length };
      },
    },
    create_draft_job: {
      description: 'Start a new draft job in the planner: name, date (YYYY-MM-DD), optional end date, client, location, RPIC, aircraft (fleet names), and notes on the operation. The rest (JSA, risks, map, approval) is done in the planner; it appears on every device as a draft.',
      schema: { type: 'object', properties: { name: { type: 'string' }, date: { type: 'string' }, end_date: { type: 'string' }, client: { type: 'string' }, location: { type: 'string' }, rpic: { type: 'string' }, aircraft: { type: 'array', items: { type: 'string' } }, description: { type: 'string', description: 'task overview' }, start_time: { type: 'string', description: 'HH:MM' }, end_time: { type: 'string', description: 'HH:MM' }, max_height_ft: { type: 'string' } }, required: ['name', 'date'] },
      run: async (a) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) throw err('Date must be YYYY-MM-DD.');
        const setup = await getSetup(), fleet = setup.fleet || {}; const unknown = (a.aircraft || []).filter(r => !fleet[r]); if (unknown.length) throw err('Not in the fleet: ' + unknown.join(', ') + '. Fleet: ' + Object.keys(fleet).join(', '));
        const y = a.date.slice(0, 4), re = new RegExp('^OP-' + y + '-(\\d+)$'); let max = 0;
        (await listRows()).forEach(r => { const m = re.exec(String(r.op_id || '')); if (m) max = Math.max(max, parseInt(m[1], 10)); });
        const op = 'OP-' + y + '-' + String(max + 1).padStart(4, '0'), uid = crypto.randomUUID(), now = new Date().toISOString();
        const plan = { id: op, title: a.name, savedAt: now, status: 'draft', appVersion: 'connector',
          overview: { uid, identifier: op, operationName: a.name, operationDate: a.date, operationEndDate: a.end_date || '', clientName: a.client || '', location: a.location || '', rpic: a.rpic || '', rpaTypes: a.aircraft || [], taskOverview: a.description || '', startTime: a.start_time || '09:00', endTime: a.end_time || '17:00', maxHeightPlanned: a.max_height_ft || '' } };
        await saveJob({ plan_uid: uid, op_id: op, title: a.name, status: 'draft' }, plan, 'draft');
        return { created: op, title: a.name, note: 'Draft saved to the account. Open the planner on any device: it downloads into Draft flight plans.' };
      },
    },
    update_draft_job: {
      description: 'Change fields of a DRAFT job\'s plan (not approved ones): give "changes" as part of the plan, e.g. {"overview":{"location":"…","clientName":"…"}} or {"jsa":{…}}. Parts are merged in, not replaced. Use get_job full=true first to see the shape.',
      schema: { type: 'object', properties: { job: { type: 'string' }, changes: { type: 'object' } }, required: ['job', 'changes'] },
      run: async ({ job, changes }) => {
        const row = await findJob(job);
        if (row.status !== 'draft' || ((row.plan || {}).approval || {}).flightAuthApproved) throw err('Only drafts can be re-planned here. Approved plans are signed; amend them in the planner.');
        const bad = Object.keys(changes || {}).filter(k => ['approval', 'id', 'status'].includes(k)); if (bad.length) throw err('Can\'t change ' + bad.join(', ') + ' here.');
        const c = JSON.parse(JSON.stringify(changes || {})); if (c.overview) { delete c.overview.uid; delete c.overview.identifier; }
        const plan = deepMerge(row.plan || {}, c); if (c.overview && c.overview.operationName) plan.title = c.overview.operationName;
        plan.savedAt = new Date().toISOString(); await saveJob(row, plan, 'draft');
        return { saved: Object.keys(c), job: `${row.op_id || ''} ${plan.title || row.title}` };
      },
    },
    // v7.44: maintenance log (Technical Log), kept in the company setup. Entries are only added; a correction is a new entry.
    list_maintenance: {
      description: 'List the maintenance log (Technical Log): date, kind, aircraft, other equipment, what was done, result, who did it. Optional "aircraft" filter.',
      schema: { type: 'object', properties: { aircraft: { type: 'string' } } },
      run: async ({ aircraft } = {}) => {
        const { data: st, error } = await sb.from('crp_store').select('data').eq('key', 'settings').maybeSingle(); if (error) throw err('Could not read the setup: ' + error.message);
        const log = (((st && st.data) || {}).maintenanceLog || []).filter(e => !aircraft || (e.aircraft || []).includes(aircraft)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
        return { entries: log };
      },
    },
    add_maintenance: {
      description: 'Add a maintenance log entry: date YYYY-MM-DD (not in the future), kind maintenance | firmware | repair | inspection | test | other, aircraft (fleet names), equipment (e.g. goggles, radio, batteries, control system), work (what was done), result pass | fail | note, by (who did it), corrects (id of an earlier entry this one corrects, optional).',
      schema: { type: 'object', properties: { date: { type: 'string' }, kind: { type: 'string' }, aircraft: { type: 'array', items: { type: 'string' } }, equipment: { type: 'array', items: { type: 'string' } }, work: { type: 'string' }, result: { type: 'string' }, by: { type: 'string' }, corrects: { type: 'string' } }, required: ['date', 'work'] },
      run: async (a = {}) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date || ''))) throw err('date must be YYYY-MM-DD.');
        const t = new Date(), today = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
        if (a.date > today) throw err('The date can\'t be in the future.');
        const kind = a.kind || 'maintenance', result = a.result || 'pass';
        if (!['maintenance', 'firmware', 'repair', 'inspection', 'test', 'other'].includes(kind)) throw err('kind must be maintenance, firmware, repair, inspection, test or other.');
        if (!['pass', 'fail', 'note'].includes(result)) throw err('result must be pass, fail or note.');
        if (!String(a.work || '').trim()) throw err('Say what was done (work).');
        const { data: st, error } = await sb.from('crp_store').select('data').eq('key', 'settings').maybeSingle(); if (error || !st) throw err('Could not read the setup' + (error ? ': ' + error.message : '.'));
        const d = JSON.parse(JSON.stringify(st.data || {})); const fleet = Object.keys(d.fleet || {});
        const ac = (a.aircraft || []).map(String); const bad = ac.filter(x => !fleet.includes(x)); if (bad.length) throw err('Not in the fleet: ' + bad.join(', ') + '. Use the exact names: ' + fleet.join(', '));
        const eq = (a.equipment || []).map(x => String(x).trim()).filter(Boolean); if (!ac.length && !eq.length) throw err('Say which aircraft or equipment.');
        const log = d.maintenanceLog || []; if (a.corrects && !log.some(e => e.id === a.corrects)) throw err('No earlier entry with id ' + a.corrects + '.');
        const e = { id: 'mnt-' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), date: a.date, kind, aircraft: ac, equipment: eq, work: String(a.work).trim(), result, by: String(a.by || '').trim(), createdAt: new Date().toISOString(), ...(a.corrects ? { corrects: a.corrects } : {}) };
        d.maintenanceLog = [...log, e];
        const { error: e2 } = await sb.from('crp_store').upsert({ key: 'settings', data: d, hash: 'connector-' + Date.now(), device: 'Claude connector', updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (e2) throw err('Not saved: ' + e2.message); return { added: e, note: 'Saved to the company setup. Each device merges it in when it next loads the setup.' };
      },
    },
    // v7.43: crew records (people + certifications). Checks are only ever added (a correction is a newer check), never edited.
    list_crew: {
      description: 'List the crew (pilots, observers, CRP) with their ARN, RePL number, contact details and each certification\'s status (current / due soon / expired), due date and assessor.',
      schema: { type: 'object', properties: { include_inactive: { type: 'boolean' } } },
      run: async ({ include_inactive } = {}) => {
        const [{ data: ppl, error }, { data: cur }] = await Promise.all([sb.from('people').select(CREW_COLS + ',id,user_id,active').order('full_name'), sb.rpc('crew_currency')]);
        if (error) throw err('Could not read the crew: ' + error.message);
        return { crew: (ppl || []).filter(p => include_inactive || p.active !== false).map(p => ({ ...Object.fromEntries(Object.entries(p).filter(([k, v]) => v != null && k !== 'user_id')), has_login: !!p.user_id,
          certifications: (cur || []).filter(r => r.person_id === p.id).map(r => ({ competency: r.competency, checked: r.check_date, due: r.due, status: r.status, assessor: r.assessor || '', extended_by_flights: !!r.extended })) })) };
      },
    },
    add_crew_member: {
      description: 'Add a pilot or observer to the crew list (no login is created; invite them from the planner). Fields: full_name (required), role pilot|observer, email, phone, address, arn, repl_no, nok_name, nok_relationship, nok_phone, total_hours, medical_expiry, training_expiry (YYYY-MM-DD), notes.',
      schema: { type: 'object', properties: { full_name: { type: 'string' }, role: { type: 'string', enum: ['pilot', 'observer'] } }, required: ['full_name'] },
      run: async (a = {}) => {
        const name = String(a.full_name || '').trim(); if (name.length < 2) throw err('Give their full name.');
        const { data: ppl } = await sb.from('people').select('id,full_name,email');
        if ((ppl || []).some(p => String(p.full_name).trim().toLowerCase() === name.toLowerCase())) throw err(name + ' is already in the crew list. Use update_crew_member.');
        const row = crewFields({ ...a, role: a.role || 'pilot' }, true); row.full_name = name;
        if (row.email && (ppl || []).some(p => p.email === row.email)) throw err('Someone in the crew list already has ' + row.email + '.');
        const { data, error } = await sb.from('people').insert(row).select('id,full_name,role').single();
        if (error) throw err('Not saved: ' + error.message); return { added: data };
      },
    },
    update_crew_member: {
      description: 'Change a crew member\'s details: give "person" (name, email or id) and "changes" with any of: full_name, role (pilot|observer), email, phone, address, arn, repl_no, nok_name, nok_relationship, nok_phone, total_hours, medical_expiry, training_expiry, notes, active. Blank a field with "".',
      schema: { type: 'object', properties: { person: { type: 'string' }, changes: { type: 'object' } }, required: ['person', 'changes'] },
      run: async ({ person, changes }) => {
        const p = await findPerson(person);
        if (changes && changes.role && p.role === 'crp') throw err('The CRP\'s role can\'t be changed here.');
        const row = crewFields(changes || {}, false); if (!Object.keys(row).length) throw err('Nothing to change.');
        row.updated_at = new Date().toISOString();
        const { error } = await sb.from('people').update(row).eq('id', p.id); if (error) throw err('Not saved: ' + error.message);
        return { person: p.full_name, saved: Object.keys(row).filter(k => k !== 'updated_at') };
      },
    },
    add_certification: {
      description: 'Record a check (sign-off) for a crew member, the same as "Record a check" in Registers & currency: competency induction | evlos | oonp | night | type:<fleet aircraft name>, check_date YYYY-MM-DD (not in the future), assessor. Due 12 months later, or up to 24 months while they keep flying. Adds a new record; earlier ones are kept.',
      schema: { type: 'object', properties: { person: { type: 'string' }, competency: { type: 'string' }, check_date: { type: 'string' }, assessor: { type: 'string' } }, required: ['person', 'competency', 'check_date'] },
      run: async ({ person, competency, check_date, assessor }) => {
        const p = await findPerson(person); const c = String(competency || '').trim();
        if (!['induction', 'evlos', 'oonp', 'night'].includes(c) && !/^type:.+/.test(c)) throw err('competency must be induction, evlos, oonp, night or type:<aircraft name>.');
        if (c.startsWith('type:')) { const { data: st } = await sb.from('crp_store').select('data').eq('key', 'settings').maybeSingle(); const fleet = Object.keys(((st && st.data) || {}).fleet || {});
          if (fleet.length && !fleet.includes(c.slice(5))) throw err('"' + c.slice(5) + '" isn\'t in the fleet. Use the exact name: ' + fleet.join(', ')); }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(check_date || ''))) throw err('check_date must be YYYY-MM-DD.');
        const { data, error } = await sb.rpc('record_check', { p_person: p.id, p_competency: c, p_check_date: check_date, p_assessor: assessor || 'CRP' });
        if (error) throw err('Not saved: ' + error.message); return { person: p.full_name, recorded: c, check_date, id: data };
      },
    },
  };
  return tools;
}
