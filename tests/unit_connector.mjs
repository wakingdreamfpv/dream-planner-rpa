// v7.41: Dream Planner connector tools against a stand-in account (node tests/unit_connector.mjs)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { makeTools } from '../connector/tools.mjs';
let fails = 0; const ok = (n, c, info) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' :: ' + JSON.stringify(info))); if (!c) fails++; };
const T = {
  jobs: [
    { id: 'j1', plan_uid: 'u1', op_id: 'OP-2026-0101', title: 'Beach promo', status: 'draft', start_date: '2026-11-15', end_date: '2026-11-15', updated_at: '2026-11-10T00:00:00Z',
      plan: { id: 'OP-2026-0101', title: 'Beach promo', savedAt: '2026-11-10T00:00:00Z', status: 'draft', overview: { uid: 'u1', identifier: 'OP-2026-0101', operationName: 'Beach promo', operationDate: '2026-11-15', rpaTypes: ['Nazgul 5'] }, log: { rpaLogs: {} } } },
    { id: 'j2', plan_uid: 'u2', op_id: 'OP-2026-0102', title: 'Hezzelic homes', status: 'approved', start_date: '2026-11-16', end_date: '2026-11-16', updated_at: '2026-11-10T00:00:00Z',
      plan: { id: 'OP-2026-0102', title: 'Hezzelic homes', savedAt: '2026-11-10T00:00:00Z', status: 'approved', overview: { uid: 'u2', identifier: 'OP-2026-0102', operationName: 'Hezzelic homes', operationDate: '2026-11-16', rpaTypes: ['Nazgul 5'] }, approval: { flightAuthApproved: true }, log: { rpaLogs: {} } } },
    { id: 'j3', plan_uid: 'u3', op_id: 'OP-2026-0090', title: 'Old deleted', status: 'cancelled', start_date: '2026-10-01', plan: {} },
  ],
  crp_store: [{ key: 'settings', data: { companyProfile: { name: 'Waking Dream FPV' }, fleet: { 'Nazgul 5': { weight: 0.65, cells: '6', radioModel: 'Nazgul5' }, 'DJI Mini 4 Pro': { weight: 0.249, cells: 'none' } }, rpaBatteries: { 'Nazgul 5': ['6S-01', '6S-02'] }, pilots: [{ name: 'Mike Rubio' }] } }],
};
const sb = { from(t) { let rows = () => T[t] || [], filt = [], one = false, op = 'select', payload = null;
  const run = () => { if (op === 'upsert') { const i = T[t].findIndex(r => r.plan_uid === payload.plan_uid); if (i >= 0) T[t][i] = { ...T[t][i], ...payload }; else T[t].push({ id: 'new' + T[t].length, ...payload }); return { data: { id: (T[t][i >= 0 ? i : T[t].length - 1]).id }, error: null }; }
    let r = rows().filter(x => filt.every(f => f(x))); return { data: one ? (r[0] || null) : r, error: null }; };
  const api = { select() { return api; }, eq(k, v) { filt.push(x => x[k] === v); return api; }, in(k, v) { filt.push(x => v.includes(x[k])); return api; }, order() { return api; },
    single() { one = true; return api; }, maybeSingle() { one = true; return api; }, upsert(p) { op = 'upsert'; payload = p; return api; }, then(res, rej) { return Promise.resolve(run()).then(res, rej); } };
  return api; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wdc-'));
const edgetx = (day, hh) => { const L = ['Date,Time,FM,Alt(m),GSpd(kmh),RxBt(V),GPS']; const st = (s) => `${day},${String(hh).padStart(2, '0')}:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000`;
  for (let s = 0; s < 5; s++) L.push(st(s) + ',OK,12,0,25.1,-27.46 153.01'); for (let s = 5; s < 95; s++) L.push(st(s) + `,ACRO,${12 + Math.min(30, s - 5)},${s > 8 ? 20 : 0},${(25 - (s - 5) * 0.02).toFixed(1)},-27.46 153.01`); for (let s = 95; s < 100; s++) L.push(st(s) + ',OK,12,0,23.0,-27.46 153.01'); return L.join('\n') + '\n'; };
fs.writeFileSync(path.join(dir, 'Nazgul5-2026-11-15-010000.csv'), edgetx('2026-11-15', 1));
fs.writeFileSync(path.join(dir, 'Nazgul5-2026-11-16-020000.csv'), edgetx('2026-11-16', 2));
fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a log');
const tools = makeTools(sb, { userId: 'me' });
const list = await tools.list_jobs.run({});
ok('list_jobs: active jobs, deleted ones hidden', list.length === 2 && !list.some(j => j.title === 'Old deleted'), list);
const setup = await tools.get_setup.run();
ok('get_setup: fleet with batteries and radio models', setup.fleet['Nazgul 5'].radioModel === 'Nazgul5' && setup.fleet['Nazgul 5'].batteries.length === 2 && setup.pilots[0] === 'Mike Rubio', setup);
const rd = await tools.read_flight_logs.run({ paths: [dir] });
ok('read_flight_logs: a folder → 2 flights, aircraft guessed, job that day', rd.flights.length === 2 && rd.flights.every(f => f.aircraft_guess === 'Nazgul 5') && /Beach promo/.test(rd.flights[0].jobs_that_day[0]) && /Hezzelic/.test(rd.flights[1].jobs_that_day[0]), rd);
const r1 = await tools.add_flight_logs.run({ job: 'OP-2026-0101', flights: [{ ref: rd.flights[0].ref, aircraft: 'Nazgul 5', battery: '6S-01', oonp: false }] });
ok('add_flight_logs: added to the draft with battery and OONP', r1.added.length === 1 && !r1.skipped.length, r1);
const j1 = T.jobs.find(j => j.id === 'j1');
const f1 = j1.plan.log.rpaLogs['Nazgul 5'].flights[0];
ok('...saved in the account: newer savedAt, telemetry with its chart readings (v7.65)', j1.plan.savedAt > '2026-11-10' && f1.batteries === '6S-01' && f1.oonp === false && f1.telemetry && (f1.telemetry.trace || []).length > 5, f1);
// v7.65: a flight added before without its readings gets them when its log is added again; nothing else on it changes
delete f1.telemetry.trace; f1.notes = 'keep me';
const rf = await tools.add_flight_logs.run({ job: 'Beach', flights: [{ ref: rd.flights[0].ref, aircraft: 'Nazgul 5' }] });
const f1b = T.jobs.find(j => j.id === 'j1').plan.log.rpaLogs['Nazgul 5'].flights;
ok('adding the log again fills in missing chart readings only', !rf.added.length && (rf.filled || []).length === 1 && f1b.length === 1 && (f1b[0].telemetry.trace || []).length > 5 && f1b[0].notes === 'keep me' && f1b[0].batteries === '6S-01', rf);
const r2 = await tools.add_flight_logs.run({ job: 'Beach', flights: [{ ref: rd.flights[0].ref, aircraft: 'Nazgul 5' }] });
ok('the same flight again is skipped', !r2.added.length && /already/.test(r2.skipped[0]), r2);
const r3 = await tools.add_flight_logs.run({ job: 'Hezzelic', flights: [{ ref: rd.flights[1].ref, aircraft: 'DJI Mini 4 Pro' }, { ref: rd.flights[1].ref, aircraft: 'Nazgul 5' }] });
ok('approved plan: an aircraft not on it is refused, one on it is added', r3.added.length === 1 && /not on this approved plan/.test(r3.skipped[0]) && T.jobs.find(j => j.id === 'j2').plan.approval.flightAuthApproved === true, r3);
const g = await tools.get_job.run({ job: 'Hezzelic' });
ok('get_job: lists the flight and what is still to fill in', g.flights.length === 1 && g.still_to_fill_in.some(x => /battery/.test(x)) && g.still_to_fill_in.some(x => /OONP/.test(x)), g);
await tools.update_flight.run({ job: 'Hezzelic', aircraft: 'Nazgul 5', index: 0, battery: '6S-02', oonp: true });
const g2 = await tools.get_job.run({ job: 'Hezzelic' });
ok('update_flight: battery and OONP filled in', g2.flights[0].batteries === '6S-02' && g2.flights[0].oonp === 'OONP' && !g2.still_to_fill_in.length, g2);
await tools.update_crew_log.run({ job: 'Hezzelic', fields: { crewRP: 'Mike Rubio', weatherDetails: 'Fine, 10 kt SE' } });
ok('update_crew_log: post-flight fields saved', T.jobs.find(j => j.id === 'j2').plan.log.crewRP === 'Mike Rubio');
let refused = ''; try { await tools.update_crew_log.run({ job: 'Hezzelic', fields: { flightAuthApproved: 'x' } }); } catch (e) { refused = e.message; }
ok('update_crew_log: other fields refused', /Can't set/.test(refused), refused);
refused = ''; try { await tools.update_draft_job.run({ job: 'Hezzelic', changes: { overview: { location: 'x' } } }); } catch (e) { refused = e.message; }
ok('update_draft_job: approved plans refused', /Only drafts/.test(refused), refused);
refused = ''; try { await tools.update_draft_job.run({ job: 'Beach', changes: { approval: { flightAuthApproved: true } } }); } catch (e) { refused = e.message; }
ok('update_draft_job: approval can never be set from here', /Can't change approval/.test(refused), refused);
await tools.update_draft_job.run({ job: 'Beach', changes: { overview: { location: 'Burleigh Heads', uid: 'hack' } } });
const b = T.jobs.find(j => j.id === 'j1').plan;
ok('update_draft_job: merged in, the job\'s id kept, flights kept', b.overview.location === 'Burleigh Heads' && b.overview.uid === 'u1' && b.overview.rpaTypes[0] === 'Nazgul 5' && b.log.rpaLogs['Nazgul 5'].flights.length === 1, b.overview);
const c = await tools.create_draft_job.run({ name: 'Sunshine Coast shoot', date: '2026-12-02', aircraft: ['Nazgul 5'], client: 'Acme', description: 'Real estate flythrough' });
const nj = T.jobs.find(j => j.op_id === c.created);
ok('create_draft_job: next OP number after the account\'s, saved as a draft', c.created === 'OP-2026-0103' && nj && nj.status === 'draft' && nj.plan.overview.uid && nj.plan.overview.taskOverview === 'Real estate flythrough', c);
refused = ''; try { await tools.create_draft_job.run({ name: 'X', date: '2026-12-02', aircraft: ['Not a drone'] }); } catch (e) { refused = e.message; }
ok('create_draft_job: unknown aircraft refused', /Not in the fleet/.test(refused), refused);
refused = ''; try { await tools.get_job.run({ job: 'OP-2026-01' }); } catch (e) { refused = e.message; }
ok('ambiguous job name asks for the OP number', /Several jobs match|No job matches/.test(refused), refused);
// v7.42: radio clock
const rdL = await tools.read_flight_logs.run({ paths: [dir], clock: 'local' });
ok('read as local time: 10 hours earlier than as UTC, and the ref remembers it', rdL.flights[0].start === '2026-11-15 01:00' && rd.flights[0].start === '2026-11-15 11:00' && /@local$/.test(rdL.flights[0].ref), [rdL.flights[0].start, rd.flights[0].start, rdL.flights[0].ref]);
const before = (await tools.get_job.run({ job: 'Beach' })).flights[0].start;
const fx = await tools.fix_flight_clock.run({ job: 'Beach', to: 'local' });
const after = (await tools.get_job.run({ job: 'Beach' })).flights[0];
ok('fix_flight_clock: a UTC-read flight moves 10 hours earlier, label follows', fx.moved.length === 1 && before === '2026-11-15 11:00' && after.start === '2026-11-15 01:00' && /01:00/.test(after.label) && after.batteries === '6S-01', [before, after]);
const fx2 = await tools.fix_flight_clock.run({ job: 'Beach', to: 'local' });
ok('...running it again moves nothing', !fx2.moved.length, fx2);
await tools.add_flight_logs.run({ job: 'Beach', flights: [{ ref: rdL.flights[1].ref, aircraft: 'Nazgul 5' }] });
const bj = await tools.get_job.run({ job: 'Beach' });
ok('add_flight_logs uses the clock the flight was read with', bj.flights.length === 2 && bj.flights[1].start === '2026-11-16 02:00', bj.flights.map(f => f.start));
const rmv = await tools.remove_flight.run({ job: 'Beach', aircraft: 'Nazgul 5', index: 1 });
ok('remove_flight: takes off just that flight', rmv.left_for_aircraft === 1 && (await tools.get_job.run({ job: 'Beach' })).flights.length === 1, rmv);
console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
