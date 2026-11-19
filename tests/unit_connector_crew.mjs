// v7.43: connector crew tools (list / add / update crew, record checks) against a stand-in account
import { makeTools } from '../connector/tools.mjs';
let fails = 0; const ok = (n, c, info) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' :: ' + JSON.stringify(info))); if (!c) fails++; };
const T = {
  people: [{ id: 'p1', user_id: 'me', full_name: 'Michael Rubio', role: 'crp', email: 'mike@example.com', arn: '1209476', active: true },
    { id: 'p2', full_name: 'Brendan Hollands', role: 'pilot', email: 'b@example.com', arn: '1260445', active: true }],
  certifications: [], crp_store: [{ key: 'settings', data: { fleet: { 'Pavo 20 Pro': {}, 'BETAFPV Meteor 1S': {} } } }],
};
const calls = [];
const sb = {
  from(t) { const filt = []; let op = 'select', payload = null, one = false;
    const run = () => {
      if (op === 'upsert') { const i = T[t].findIndex(r => r.key === payload.key); if (i >= 0) T[t][i] = { ...T[t][i], ...payload }; else T[t].push(payload); calls.push({ t, op, payload }); return { data: null, error: null }; }
      if (op === 'insert') { const r = { id: 'n' + T[t].length, active: true, ...payload }; T[t].push(r); return { data: r, error: null }; }
      const hit = (T[t] || []).filter(x => filt.every(f => f(x)));
      if (op === 'update') { hit.forEach(x => Object.assign(x, payload)); calls.push({ t, op, payload }); return { data: null, error: null }; }
      return { data: one ? hit[0] || null : hit, error: null }; };
    const api = { select() { return api; }, order() { return api; }, eq(k, v) { filt.push(x => x[k] === v); return api; }, single() { one = true; return api; }, maybeSingle() { one = true; return api; },
      insert(p) { op = 'insert'; payload = p; return api; }, upsert(p) { op = 'upsert'; payload = p; return api; }, update(p) { op = 'update'; payload = p; return api; }, then(a, b) { return Promise.resolve(run()).then(a, b); } };
    return api; },
  async rpc(name, args) {
    if (name === 'record_check') { if (args.p_check_date > '2099') return { error: { message: 'future' } }; T.certifications.push({ id: 'c' + T.certifications.length, person_id: args.p_person, competency: args.p_competency, check_date: args.p_check_date, assessor: args.p_assessor }); return { data: 'c' + (T.certifications.length - 1), error: null }; }
    if (name === 'crew_currency') return { data: T.certifications.map(c => ({ ...c, cert_id: c.id, due: '2027-11-19', status: 'current' })), error: null };
    return { error: { message: 'no ' + name } }; },
};
const tools = makeTools(sb, { userId: 'me' });
const err = async (f) => { try { await f(); return ''; } catch (e) { return e.message; } };

let l = await tools.list_crew.run({});
ok('list_crew: everyone with ARN and login flag', l.crew.length === 2 && l.crew[0].arn === '1209476' && l.crew[0].has_login && !l.crew[1].has_login, l);
const a = await tools.add_crew_member.run({ full_name: 'Mitch Blunt', role: 'observer', email: 'Mitch@Example.com', phone: '0400 000 000' });
const m = T.people.find(p => p.full_name === 'Mitch Blunt');
ok('add_crew_member: added with a lower-case email', a.added && m && m.role === 'observer' && m.email === 'mitch@example.com' && m.phone === '0400 000 000', T.people);
ok('...the same name twice is refused', /already/.test(await err(() => tools.add_crew_member.run({ full_name: 'mitch blunt' }))));
ok('...nobody can be added as a CRP', /pilot or observer/.test(await err(() => tools.add_crew_member.run({ full_name: 'Someone', role: 'crp' }))));
ok('...unknown fields are refused (no user_id)', /Can't set user_id/.test(await err(() => tools.add_crew_member.run({ full_name: 'X Y', user_id: 'abc' }))));
await tools.update_crew_member.run({ person: 'Brendan', changes: { repl_no: '1260445', medical_expiry: '2027-05-01' } });
const b = T.people.find(p => p.id === 'p2');
ok('update_crew_member: found by part of the name, fields saved', b.repl_no === '1260445' && b.medical_expiry === '2027-05-01' && b.updated_at, b);
ok('...the CRP\'s role can\'t be changed', /CRP/.test(await err(() => tools.update_crew_member.run({ person: 'Michael Rubio', changes: { role: 'pilot' } }))));
ok('...a bad date is refused', /YYYY-MM-DD/.test(await err(() => tools.update_crew_member.run({ person: 'Brendan', changes: { training_expiry: '1 May' } }))));
const c = await tools.add_certification.run({ person: 'Brendan Hollands', competency: 'type:Pavo 20 Pro', check_date: '2026-05-07', assessor: 'Michael Rubio (CRP)' });
ok('add_certification: recorded through record_check', c.recorded === 'type:Pavo 20 Pro' && T.certifications.length === 1 && T.certifications[0].person_id === 'p2', T.certifications);
ok('...an aircraft not in the fleet is refused, with the names', /isn't in the fleet.*Meteor/.test(await err(() => tools.add_certification.run({ person: 'Brendan', competency: 'type:Pavo', check_date: '2026-05-07' }))));
ok('...a made-up competency is refused', /competency must/.test(await err(() => tools.add_certification.run({ person: 'Brendan', competency: 'aerobatics', check_date: '2026-05-07' }))));
await tools.add_certification.run({ person: 'Brendan', competency: 'type:Pavo 20 Pro', check_date: '2026-11-19' });
ok('...a second check is added, the first kept', T.certifications.length === 2 && T.certifications[0].check_date === '2026-05-07');
l = await tools.list_crew.run({});
ok('list_crew shows the checks', l.crew.find(p => p.full_name === 'Brendan Hollands').certifications.length === 2);
ok('no tool edits or deletes certifications', !calls.some(x => x.t === 'certifications'));
// v7.44: maintenance log
const m1 = await tools.add_maintenance.run({ date: '2026-10-22', kind: 'maintenance', aircraft: ['Pavo 20 Pro'], equipment: ['Goggles', 'Radio'], work: 'Full maintenance', result: 'pass', by: 'Michael Rubio' });
const set = () => T.crp_store[0].data;
ok('add_maintenance: saved to the setup with a new hash, fleet kept', set().maintenanceLog.length === 1 && set().fleet['Pavo 20 Pro'] && /^connector-/.test(T.crp_store[0].hash) && m1.added.id, T.crp_store[0]);
ok('...an aircraft not in the fleet is refused', /Not in the fleet/.test(await err(() => tools.add_maintenance.run({ date: '2026-10-22', aircraft: ['Pavo'], work: 'x' }))));
ok('...a future date is refused', /future/.test(await err(() => tools.add_maintenance.run({ date: '2099-01-01', aircraft: ['Pavo 20 Pro'], work: 'x' }))));
ok('...needs an aircraft or equipment', /which aircraft/.test(await err(() => tools.add_maintenance.run({ date: '2026-10-22', work: 'x' }))));
await tools.add_maintenance.run({ date: '2026-11-18', kind: 'firmware', equipment: ['Control system'], work: 'Firmware', corrects: m1.added.id });
const lm = await tools.list_maintenance.run({});
ok('list_maintenance: newest first, a correction is a new entry', lm.entries.length === 2 && lm.entries[0].date === '2026-11-18' && lm.entries[0].corrects === m1.added.id && lm.entries[1].work === 'Full maintenance', lm);
ok('...filter by aircraft', (await tools.list_maintenance.run({ aircraft: 'Pavo 20 Pro' })).entries.length === 1);
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
