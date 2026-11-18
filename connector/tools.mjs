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
import { parseTelemetryCsv, flightFromTelemetry, guessAircraft, fmtMmSs } from '../src/telemetry/logs.js';

const slim = (plan) => { const p = JSON.parse(JSON.stringify(plan || {}));
  Object.values((p.log && p.log.rpaLogs) || {}).forEach(rl => ((rl && rl.flights) || []).forEach(f => { if (f && f.telemetry) { delete f.telemetry.trace; delete f.telemetry.altRaw; delete f.telemetry.spdRaw; } }));
  delete p.siteAttachments; delete p.heatStrokes; return p; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const deepMerge = (a, b) => { if (!isObj(a) || !isObj(b)) return b; const o = { ...a }; Object.keys(b).forEach(k => { o[k] = (isObj(a[k]) && isObj(b[k])) ? deepMerge(a[k], b[k]) : b[k]; }); return o; };
const localIso = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const localDay = (ms) => localIso(ms).slice(0, 10);

export function makeTools(sb, opts = {}) {
  const clock = opts.clock || 'utc';
  const err = (m) => { const e = new Error(m); e.user = true; return e; };

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
  const readFlights = (paths) => { const out = [], empty = [];
    csvFiles(paths).forEach(f => { let fl = [];
      try { fl = parseTelemetryCsv(fs.readFileSync(f, 'utf8'), path.basename(f), clock); } catch (e) { empty.push(path.basename(f) + ' (' + e.message + ')'); return; }
      if (!fl.length) empty.push(path.basename(f)); fl.forEach((t, i) => out.push({ ref: f + '#' + i, file: f, t })); });
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
      schema: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' }, description: 'CSV files or folders' } }, required: ['paths'] },
      run: async ({ paths }) => {
        const { flights, empty } = readFlights(paths); const setup = await getSetup(); const rows = (await listRows()).filter(r => r.status === 'draft' || r.status === 'approved');
        return { flights: flights.map(x => { const day = localDay(x.t.startMs);
            const jobs = rows.filter(r => r.start_date && r.start_date <= day && day <= (r.end_date || r.start_date));
            const g = guessAircraft(x.t, path.basename(x.file), setup.fleet || {}, []);
            return { ref: x.ref, file: path.basename(x.file), start: localIso(x.t.startMs), armed: fmtMmSs(x.t.durationSec), maxAltFt: Math.round((x.t.maxAltM || 0) * 3.28084), startVolts: x.t.vStart,
              aircraft_guess: g.rpa || '', why: g.why, options: g.options, jobs_that_day: jobs.map(r => `${r.op_id || ''} ${r.title} (${r.status})`) }; }),
          files_without_flights: empty };
      },
    },
    add_flight_logs: {
      description: 'Add flights (from read_flight_logs refs) to a job\'s flight log, each with its aircraft and optionally the battery used and OONP true/false. Flights already on the job are skipped. On an approved plan only aircraft already on the plan are allowed (adding one would withdraw the approval: do that in the planner).',
      schema: { type: 'object', properties: { job: { type: 'string' }, flights: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, aircraft: { type: 'string' }, battery: { type: 'string' }, oonp: { type: 'boolean' } }, required: ['ref', 'aircraft'] } } }, required: ['job', 'flights'] },
      run: async ({ job, flights }) => {
        const row = await findJob(job); if (row.status === 'completed') throw err('That job is a completed record; it can\'t be changed here.');
        const plan = JSON.parse(JSON.stringify(row.plan || {})), ov = plan.overview = plan.overview || {}, lg = plan.log = plan.log || {};
        const approved = !!((plan.approval || {}).flightAuthApproved), setup = await getSetup(), fleet = setup.fleet || {};
        const rpaLogs = lg.rpaLogs = { ...(lg.rpaLogs || {}) }, rpaTypes = ov.rpaTypes = [...(ov.rpaTypes || [])];
        const have = new Set(); Object.values(rpaLogs).forEach(rl => ((rl && rl.flights) || []).forEach(f => { if (f.telemetry) have.add(f.telemetry.startMs); }));
        const cache = {}; const added = [], skipped = [];
        for (const it of flights || []) {
          const [file, idx] = String(it.ref || '').split(/#(?=\d+$)/);
          if (!fleet[it.aircraft]) { skipped.push(it.ref + ': no aircraft called "' + it.aircraft + '" in the fleet'); continue; }
          if (approved && !rpaTypes.includes(it.aircraft)) { skipped.push(it.ref + ': ' + it.aircraft + ' is not on this approved plan (add it in the planner)'); continue; }
          if (!cache[file]) { try { cache[file] = parseTelemetryCsv(fs.readFileSync(file, 'utf8'), path.basename(file), clock); } catch (e) { skipped.push(it.ref + ': ' + e.message); continue; } }
          const t = cache[file][parseInt(idx, 10)]; if (!t) { skipped.push(it.ref + ': flight not found in the file'); continue; }
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
  };
  return tools;
}
