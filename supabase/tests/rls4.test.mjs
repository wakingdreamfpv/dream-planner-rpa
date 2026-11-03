// Chunk 2b: cloud jobs for crew, logged hours, access requests and shared snapshots (PGlite).
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
await db.exec(rd('0004_chunk2b_cloud_jobs.sql')); await db.exec(rd('0004_chunk2b_cloud_jobs.sql'));
check('migration 0004 runs twice cleanly', true);
const newUser = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } };
const tryq = async (q, p) => { try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { error: e.message }; } };

const mike = await newUser('mike@wakingdreamfpv.com');
await db.query(`insert into public.invites (email, full_name, role) values ('ben@test.com','Ben Walker','pilot'),('tp2@test.com','Test Pilot 2','pilot'),('obs@test.com','Olivia Obs','observer')`);
const benU = await newUser('ben@test.com'), tp2U = await newUser('tp2@test.com'), obsU = await newUser('obs@test.com');
const pid = async (u) => (await db.query(`select id from public.people where user_id=$1`, [u])).rows[0].id;
const ben = await pid(benU), tp2 = await pid(tp2U), obs = await pid(obsU);

// jobs: the CRP publishes; crew see only theirs
const j1 = (await as(mike, () => db.query(`insert into public.jobs (plan_uid, op_id, title, status, plan) values ('u1','OP-1','Knockout','approved','{"overview":{"clientName":"Revel"}}') returning id`))).rows[0].id;
const j2 = (await as(mike, () => db.query(`insert into public.jobs (plan_uid, op_id, title, status, plan) values ('u2','OP-2','Secret client job','draft','{}') returning id`))).rows[0].id;
const jc = await as(mike, () => tryq(`insert into public.job_crew (job_id, person_id, job_role) values ($1,$2,'rpic'),($1,$3,'observer')`, [j1, ben, obs]));
check('CRP assigns crew to a job', !jc.error, jc.error);
const bj = await as(benU, () => tryq(`select title from public.jobs order by title`));
check('pilot sees only the job he is on', bj.rows && bj.rows.length === 1 && bj.rows[0].title === 'Knockout', JSON.stringify(bj));
const tj = await as(tp2U, () => tryq(`select title from public.jobs`));
check('unassigned pilot sees no jobs', tj.rows && tj.rows.length === 0, JSON.stringify(tj));
const tjw = await as(tp2U, () => tryq(`insert into public.jobs (plan_uid, title) values ('x','Fake')`));
check('pilot cannot create jobs', !!tjw.error, tjw.error);
const crewNames = await as(benU, () => tryq(`select * from public.job_crew_list($1)`, [j1]));
check('crew see who else is on their job', crewNames.rows && crewNames.rows.length === 2, JSON.stringify(crewNames));
const fl = await as(benU, () => tryq(`insert into public.job_flights (job_id, person_id, rpa, flight) values ($1,$2,'Pavo 20 Pro','{"duration":"6"}') returning id`, [j1, ben]));
check('crew log flights on their job', !fl.error, fl.error);
const fl2 = await as(tp2U, () => tryq(`insert into public.job_flights (job_id, person_id, rpa, flight) values ($1,$2,'X','{}')`, [j1, tp2]));
check('unassigned pilot cannot log on that job', !!fl2.error, fl2.error);
const crpFl = await as(mike, () => tryq(`select rpa from public.job_flights where job_id=$1`, [j1]));
check('CRP sees the crew flights', crpFl.rows && crpFl.rows.length === 1);

// logged hours
const h1 = await as(mike, () => tryq(`insert into public.pilot_hours (person_id, rpa_type, flights, seconds) values ($1,'Pavo 20 Pro',12,4320),($2,'Avata 2',3,900)`, [ben, tp2]));
check('CRP publishes logged hours', !h1.error, h1.error);
const bh = await as(benU, () => tryq(`select rpa_type, seconds from public.pilot_hours`));
check('pilot sees only his own hours', bh.rows && bh.rows.length === 1 && bh.rows[0].seconds === 4320, JSON.stringify(bh));
const bhw = await as(benU, () => tryq(`update public.pilot_hours set seconds=99999 where person_id=$1 returning 1`, [ben]));
check('pilot cannot change his hours', bhw.rows && bhw.rows.length === 0, JSON.stringify(bhw));

// shared snapshots + access
await as(mike, () => db.query(`insert into public.shared_data (area, data) values ('company','{"name":"Rubio Enterprises"}'),('fleet','{"aircraft":["Pavo 20 Pro"]}'),('records','{"jobs":3}') on conflict (area) do update set data=excluded.data`));
const co = await as(tp2U, () => tryq(`select area from public.shared_data order by area`));
check('crew see the company, not the fleet or records', co.rows && co.rows.map(r => r.area).join() === 'company', JSON.stringify(co));
const dw = await as(tp2U, () => tryq(`insert into public.access_grants (person_id, area) values ($1,'fleet')`, [tp2]));
check('no direct writes to access grants', !!dw.error, dw.error);
const rq = await as(tp2U, () => tryq(`select public.request_access('fleet','for the Saturday job')`));
check('crew request access to an area', !rq.error, rq.error);
const rqBad = await as(tp2U, () => tryq(`select public.request_access('payroll')`));
check('unknown area refused', !!rqBad.error, rqBad.error);
const gid = (await db.query(`select id from public.access_grants where person_id=$1 and area='fleet'`, [tp2])).rows[0].id;
const selfGrant = await as(tp2U, () => tryq(`select public.decide_access($1,'granted')`, [gid]));
check('crew cannot grant themselves', /Only the CRP/.test(selfGrant.error || ''), selfGrant.error);
const seeReq = await as(mike, () => tryq(`select status, note from public.access_grants`));
check('CRP sees the request with its note', seeReq.rows && seeReq.rows[0].status === 'requested' && seeReq.rows[0].note === 'for the Saturday job');
await as(mike, () => db.query(`select public.decide_access($1,'granted')`, [gid]));
const co2 = await as(tp2U, () => tryq(`select area from public.shared_data order by area`));
check('after the grant, crew see the fleet snapshot', co2.rows && co2.rows.map(r => r.area).join() === 'company,fleet', JSON.stringify(co2));
const benSees = await as(benU, () => tryq(`select area from public.shared_data order by area`));
check('another pilot still does not', benSees.rows && benSees.rows.map(r => r.area).join() === 'company', JSON.stringify(benSees));
await as(tp2U, () => db.query(`select public.request_access('fleet')`));
const still = (await db.query(`select status from public.access_grants where id=$1`, [gid])).rows[0].status;
check('asking again does not undo a grant', still === 'granted', still);
await as(mike, () => db.query(`select public.decide_access($1,'revoked')`, [gid]));
const co3 = await as(tp2U, () => tryq(`select area from public.shared_data order by area`));
check('revoking removes access', co3.rows && co3.rows.map(r => r.area).join() === 'company', JSON.stringify(co3));
const sw = await as(tp2U, () => tryq(`insert into public.shared_data (area, data) values ('batteries','{}')`));
check('crew cannot publish snapshots', !!sw.error, sw.error);

// deactivated crew lose everything
await db.query(`update public.profiles set active=false where id=$1`, [benU]);
const gone = await as(benU, () => tryq(`select count(*)::int n from public.jobs`));
check('deactivated pilot sees no jobs', gone.rows && gone.rows[0].n === 0, JSON.stringify(gone));
const gone2 = await as(benU, () => tryq(`select count(*)::int n from public.shared_data`));
check('…and no company snapshot', gone2.rows && gone2.rows[0].n === 0, JSON.stringify(gone2));
const au = (await db.query(`select count(*)::int n from public.audit_log where table_name='access_grants'`)).rows[0].n;
check('access decisions are audited', au >= 3, au);

console.log(`\n${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
