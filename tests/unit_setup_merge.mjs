// v7.39: company setup merge (node tests/unit_setup_merge.mjs)
import { mergeSetup, applyPicks } from '../src/cloud/setupMerge.js';
let fails = 0; const ok = (name, c, info) => { console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : ' :: ' + JSON.stringify(info))); if (!c) fails++; };
const base = { companyProfile: { name: 'Waking Dream FPV', phone: '1', email: 'a@x' }, fleet: { 'Mini 4': { weight: 0.249 }, 'Avata 2': { weight: 0.377 } },
  batteries: ['B1', 'B2', 'B3'], pilots: [{ name: 'Mike' }, { name: 'Ben' }] };
// phone changed phone number + added an aircraft + removed B3; Mac changed email + added battery B4 + added pilot Sam
const local = { ...base, companyProfile: { ...base.companyProfile, phone: '2' }, fleet: { ...base.fleet, 'Air 3S': { weight: 0.72 } }, batteries: ['B1', 'B2'] };
const cloud = { ...base, companyProfile: { ...base.companyProfile, email: 'b@x' }, batteries: ['B1', 'B2', 'B3', 'B4'], pilots: [...base.pilots, { name: 'Sam' }] };
let r = mergeSetup(local, cloud, base);
ok('different changes on each device merge with no questions', r.conflicts.length === 0, r.conflicts);
ok('company: phone from here, email from account', r.merged.companyProfile.phone === '2' && r.merged.companyProfile.email === 'b@x', r.merged.companyProfile);
ok('fleet keeps both', Object.keys(r.merged.fleet).sort().join() === 'Air 3S,Avata 2,Mini 4', r.merged.fleet);
ok('battery removed here stays removed, added there is added', r.merged.batteries.join() === 'B1,B2,B4', r.merged.batteries);
ok('pilot added there is added', r.merged.pilots.map(p => p.name).join() === 'Mike,Ben,Sam', r.merged.pilots);
// both changed the same thing
const l2 = { ...base, fleet: { ...base.fleet, 'Mini 4': { weight: 0.25 } } }, c2 = { ...base, fleet: { ...base.fleet, 'Mini 4': { weight: 0.26 } }, batteries: ['B1'] };
r = mergeSetup(l2, c2, base);
ok('same item changed on both: one question about just that', r.conflicts.length === 1 && r.conflicts[0].label === 'Fleet (aircraft) › Mini 4 › Weight', r.conflicts.map(c => c.label));
ok('...the rest still merged (account removed B2, B3)', r.merged.batteries.join() === 'B1', r.merged.batteries);
ok('pick this device', applyPicks(r.merged, r.conflicts, { [r.conflicts[0].id]: 'local' }).fleet['Mini 4'].weight === 0.25);
ok('pick the account', applyPicks(r.merged, r.conflicts, { [r.conflicts[0].id]: 'cloud' }).fleet['Mini 4'].weight === 0.26);
// no base (a device that never synced)
const l3 = { companyProfile: { name: 'Waking Dream FPV', phone: '' }, fleet: { 'Mini 4': { weight: 0.249 } }, batteries: ['B1'] };
const c3 = { companyProfile: { name: 'Waking Dream FPV', phone: '0400' }, fleet: { 'Avata 2': { weight: 0.377 } }, batteries: ['B2'] };
r = mergeSetup(l3, c3, null);
ok('no shared history: blanks filled, lists joined, no questions', r.conflicts.length === 0 && r.merged.companyProfile.phone === '0400' && Object.keys(r.merged.fleet).length === 2 && r.merged.batteries.join() === 'B1,B2', r);
r = mergeSetup({ companyProfile: { name: 'A Co' } }, { companyProfile: { name: 'B Co' } }, null);
ok('no shared history, different names: asks', r.conflicts.length === 1 && r.conflicts[0].label === 'Company profile › Name', r.conflicts);
// deleted here, edited there
r = mergeSetup({ ...base, fleet: { 'Avata 2': { weight: 0.377 } } }, { ...base, fleet: { ...base.fleet, 'Mini 4': { weight: 0.3 } } }, base);
ok('removed here but edited there: asks', r.conflicts.length === 1 && r.conflicts[0].local === undefined, r.conflicts);
ok('choosing this device removes it', !('Mini 4' in applyPicks(r.merged, r.conflicts, { [r.conflicts[0].id]: 'local' }).fleet));
// removed here, untouched there
r = mergeSetup({ ...base, fleet: { 'Avata 2': { weight: 0.377 } } }, base, base);
ok('removed here, untouched there: stays removed', !('Mini 4' in r.merged.fleet) && !r.conflicts.length);
console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); process.exit(fails ? 1 : 0);
