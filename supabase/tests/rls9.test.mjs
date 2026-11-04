// v7.15: import the Google Forms registers, date last engaged, backups bucket (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
let pass = 0, fail = 0;
const check = (n, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n, info); };
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
const rd = (f) => readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8');
await db.exec(rd('0001_chunk1_auth_roles.sql').replace(/CHANGE-ME@example\.com/g, 'mike@wakingdreamfpv.com'));
await db.exec(rd('0002_chunk2_data_model.sql'));
await db.exec(rd('0003_chunk3_induction.sql'));
await db.exec(rd('0004_chunk2b_cloud_jobs.sql'));
await db.exec(rd('0005_chunk4_evlos_observer.sql'));
await db.exec(rd('0006_evlos_register_manual.sql'));
await db.exec(rd('0007_opsmap_observer.sql'));
await db.exec(rd('0008_currency_registers_digest.sql'));
await db.exec(rd('0009_records_import_backup.sql')); await db.exec(rd('0009_records_import_backup.sql'));
check('migration 0009 runs twice cleanly', true);
const newUser = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } };
const tryq = async (q, p) => { try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { error: e.message }; } };

const mike = await newUser('mike@wakingdreamfpv.com');
await db.query(`insert into public.invites (email, full_name, role) values ('ben@test.com','Ben Walker','pilot'),('tp2@test.com','Test Pilot 2','pilot'),('obs@test.com','Olivia Obs','observer')`);
const benU = await newUser('ben@test.com'), tp2U = await newUser('tp2@test.com'), obsU = await newUser('obs@test.com');
const pid = async (u) => (await db.query(`select id from public.people where user_id=$1`, [u])).rows[0].id;
const ben = await pid(benU), tp2 = await pid(tp2U), obs = await pid(obsU);



const asAnon = async (fn) => { await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`); try { return await fn(); } finally { await db.exec(`reset role;`); } };



const rows = [
  { ref: 'gf-pilot-F2A70205', kind: 'pilot', certified: true, crp_typed: 'Michael Rubio', crp_signed_at: '2026-10-27T01:28:53Z', person_typed: 'Benjamin Curseri', person_signed_at: '2026-10-27T00:42:56Z',
    person: { full_name: 'Benjamin Curseri', email: 'Benjamin@DroneActionTeam.com.au', phone: '0402548721', address: '2/48 Walton St Southport', arn: '1018732', repl_no: '1018732', nok_name: 'Gus', nok_relationship: 'Father', nok_phone: '0402034859', total_hours: 324 },
    hours: [{ rpa_type: 'DJI Avata 2', hours: 20 }, { rpa_type: 'DJI Mavic 3 Pro', hours: 40 }, { rpa_type: 'Bad', hours: 'lots' }],
    answers: { notes: 'Assessed in person' }, certs: [{ competency: 'induction', check_date: '2026-09-11' }, { competency: 'type:DJI Avata 2', check_date: '2026-09-11' }, { competency: 'evlos', check_date: '2026-09-11' }, { competency: 'oonp', check_date: '2026-09-11' }, { competency: 'night', check_date: '2026-09-11' }] },
  { ref: 'gf-obs-joel', kind: 'observer', certified: true, crp_typed: 'Michael Rubio', person_typed: 'Joel David Skerman', person_signed_at: '2026-10-27T09:33:00+10:00', crp_signed_at: '2026-10-27T09:35:32+10:00',
    person: { full_name: 'Ben Walker', phone: '+61432785806' }, certs: [{ competency: 'evlos_observer', check_date: '2026-10-17' }] },
  { ref: 'gf-obs-matt', kind: 'observer', certified: false, person_typed: 'Matthew Ryan', person_signed_at: '2026-10-31T17:10:10+10:00', person: { full_name: 'Matthew Ryan', phone: '0450732025' } },
];
const benBefore = (await db.query(`select phone, email from public.people where id=$1`, [ben])).rows[0];
const r1 = await as(benU, () => tryq(`select public.import_register($1::jsonb) r`, [JSON.stringify(rows)]));
check('a pilot cannot import registers', !!r1.error && /Only the CRP/.test(r1.error), r1.error);
const r2 = await as(mike, () => tryq(`select public.import_register($1::jsonb) r`, [JSON.stringify(rows)]));
check('CRP imports', !r2.error && r2.rows[0].r.signoffs === 3 && r2.rows[0].r.certifications === 6 && r2.rows[0].r.people === 2, r2.error || r2.rows[0].r);
const bc = (await db.query(`select * from public.people where full_name='Benjamin Curseri'`)).rows[0];
check('new pilot created with the form details', bc && bc.email === 'benjamin@droneactionteam.com.au' && bc.arn === '1018732' && bc.nok_name === 'Gus' && Number(bc.total_hours) === 324 && bc.role === 'pilot', bc);
check('date last engaged = latest check', bc && new Date(bc.date_last_engaged).toISOString().slice(0, 10) === '2026-09-11', bc && bc.date_last_engaged);
const ex = (await db.query(`select rpa_type, hours from public.experience where person_id=$1 order by rpa_type`, [bc.id])).rows;
check('hours per type imported (bad numbers skipped)', ex.length === 2 && Number(ex[0].hours) === 20, ex);
const so = (await db.query(`select * from public.signoff_records where person_id=$1`, [bc.id])).rows[0];
check('sign-off locked, certified, typed signatures, original dates', so && so.locked && so.status === 'certified' && so.person_signature.typed === 'Benjamin Curseri' && so.crp_signature.typed === 'Michael Rubio' && so.crp_signed_by === mike && so.answers.source === 'Imported from Google Forms' && so.answers.notes === 'Assessed in person' && new Date(so.person_signed_at).toISOString() === '2026-10-27T00:42:56.000Z', so);
const cs = (await db.query(`select competency, check_date, next_due, assessor, signoff_id from public.certifications where person_id=$1 order by competency`, [bc.id])).rows;
check('certifications with 12-month due dates, linked to the sign-off', cs.length === 5 && cs.every((c) => c.assessor === 'Michael Rubio' && c.signoff_id === so.id && new Date(c.next_due).toISOString().slice(0, 10) === '2027-09-11'), cs);
const benAfter = (await db.query(`select phone, email from public.people where id=$1`, [ben])).rows[0];
check('existing person matched by name; their details kept, empty ones filled', benAfter.email === benBefore.email && benAfter.phone === (benBefore.phone || '+61432785806'), [benBefore, benAfter]);
const bo = (await db.query(`select competency from public.certifications where person_id=$1`, [ben])).rows;
check('observer certification added to the matched person', bo.some((c) => c.competency === 'evlos_observer'));
const mr = (await db.query(`select p.role, s.status, s.locked, (select count(*) from public.certifications c where c.person_id=p.id)::int n from public.people p join public.signoff_records s on s.person_id=p.id where p.full_name='Matthew Ryan'`)).rows[0];
check('no CRP part = waiting for the CRP, unlocked, no certification', mr && mr.role === 'observer' && mr.status === 'awaiting_crp' && !mr.locked && mr.n === 0, mr);
const r3 = await as(mike, () => tryq(`select public.import_register($1::jsonb) r`, [JSON.stringify(rows)]));
check('importing again changes nothing', !r3.error && r3.rows[0].r.skipped === 3 && r3.rows[0].r.signoffs === 0, r3.rows && r3.rows[0].r);
const cnt = (await db.query(`select count(*)::int n from public.signoff_records where answers->>'importRef' like 'gf-%'`)).rows[0].n;
check('still one record per form row', cnt === 3, cnt);
const lk = await as(mike, () => tryq(`update public.signoff_records set status='draft' where id=$1`, [so.id]));
check('imported sign-off stays locked', !!lk.error && /locked/.test(lk.error));
// flight counts move "date last engaged" forward
await db.query(`insert into public.flight_counts (person_id, competency, flight_date) values ($1, 'evlos', '2026-11-01')`, [bc.id]);
const dle = (await db.query(`select date_last_engaged d from public.people where id=$1`, [bc.id])).rows[0].d;
check('a logged flight bumps date last engaged', new Date(dle).toISOString().slice(0, 10) === '2026-11-01', dle);
await db.query(`insert into public.flight_counts (person_id, competency, flight_date) values ($1, 'evlos', '2020-01-01')`, [bc.id]);
const dle2 = (await db.query(`select date_last_engaged d from public.people where id=$1`, [bc.id])).rows[0].d;
check('an older flight never moves it back', new Date(dle2).toISOString().slice(0, 10) === '2026-11-01', dle2);
// backups
const bk = (await db.query(`select public from storage.buckets where id='backups'`)).rows[0];
check('private backups bucket', bk && bk.public === false);
await db.query(`insert into storage.objects (bucket_id, name) values ('backups', 'daily/2026-11-04.json')`);
await db.exec(`grant select on storage.objects to authenticated`);
const seeP = await as(benU, () => tryq(`select name from storage.objects where bucket_id='backups'`));
const seeC = await as(mike, () => tryq(`select name from storage.objects where bucket_id='backups'`));
check('only the CRP can read backups', (seeP.rows || []).length === 0 && (seeC.rows || []).length === 1, [seeP, seeC]);
const np = await as(mike, () => tryq(`insert into public.notification_prefs (user_id, backup_email) values ($1, 'daily') returning backup_email`, [mike]));
check('backup email setting saved', !np.error && np.rows[0].backup_email === 'daily', np.error);
const npb = await as(mike, () => tryq(`update public.notification_prefs set backup_email='hourly' where user_id=$1`, [mike]));
check('backup email setting only daily / weekly / off', !!npb.error);
console.log(pass + ' / ' + (pass + fail));
if (fail) process.exit(1);
