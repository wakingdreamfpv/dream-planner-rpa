// Chunk 2: crew & job data model — row-level security, guards and audit log, run in PGlite.
// cd supabase/tests && npm i @electric-sql/pglite && node rls2.test.mjs
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
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
const m1 = readFileSync(new URL('../migrations/0001_chunk1_auth_roles.sql', import.meta.url), 'utf8').replace(/CHANGE-ME@example\.com/g, 'mike@wakingdreamfpv.com');
const m2 = readFileSync(new URL('../migrations/0002_chunk2_data_model.sql', import.meta.url), 'utf8');
await db.exec(m1);
// a Chunk-1 login that exists before Chunk 2 is installed
const newUser = async (email, meta = {}) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])).rows[0].id;
const mike = await newUser('mike@wakingdreamfpv.com');
await db.exec(m2); await db.exec(m2);
check('migration 0002 runs twice cleanly', true);
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } };
const tryq = async (q, p) => { try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { error: e.message }; } };
const one = async (q, p) => (await db.query(q, p)).rows[0];

const seeds = (await db.query(`select full_name, role from public.people where email like 'test.%@example.com' order by role`)).rows;
check('seed test pilot and observer exist (once)', seeds.length === 2 && seeds[0].role === 'observer' && seeds[1].role === 'pilot', JSON.stringify(seeds));
const mikeP = await one(`select * from public.people where user_id = $1`, [mike]);
check('existing CRP login got a linked person record', mikeP && mikeP.role === 'crp' && mikeP.email === 'mike@wakingdreamfpv.com');

// CRP adds Ben (no login yet), then invites him; on accepting he is linked to the same record
const ben = (await as(mike, () => db.query(`insert into public.people (full_name, role, email, arn) values ('Ben','pilot','ben@test.com','1234567') returning id`))).rows[0].id;
await as(mike, () => db.query(`insert into public.invites (email, full_name, role) values ('ben@test.com','Ben','pilot')`));
const benU = await newUser('ben@test.com');
const benRow = await one(`select user_id from public.people where id=$1`, [ben]);
check('accepting an invite links the login to the existing person', benRow.user_id === benU);
check('no duplicate person created for Ben', (await one(`select count(*)::int n from public.people where email='ben@test.com'`)).n === 1);

await db.query(`insert into public.invites (email, full_name, role) values ('mitch@test.com','Mitch','pilot'),('obs@test.com','Sam Spotter','observer')`);
const mitchU = await newUser('mitch@test.com'); const obsU = await newUser('obs@test.com');
const mitch = (await one(`select id from public.people where user_id=$1`, [mitchU])).id;
const obs = (await one(`select id from public.people where user_id=$1`, [obsU])).id;
check('invited login without a crew record gets one created', !!mitch && !!obs);

// people visibility & self-service
const bp = await as(benU, () => tryq(`select full_name from public.people`));
check('pilot sees only his own person record', bp.rows && bp.rows.length === 1 && bp.rows[0].full_name === 'Ben', JSON.stringify(bp));
const cp = await as(mike, () => tryq(`select id from public.people`));
check('CRP sees all people', cp.rows && cp.rows.length === 6, cp.rows && cp.rows.length);
const u1 = await as(benU, () => tryq(`update public.people set phone='0411 111 111', nok_name='Jo', repl_no='RePL-99', total_hours=120 where id=$1 returning phone`, [ben]));
check('pilot updates his own contact, next of kin, RePL and hours', u1.rows && u1.rows[0]?.phone === '0411 111 111', JSON.stringify(u1));
const u2 = await as(benU, () => tryq(`update public.people set role='crp' where id=$1`, [ben]));
check('pilot cannot change his own role', !!u2.error, u2.error);
const u3 = await as(benU, () => tryq(`update public.people set training_expiry='2030-01-01' where id=$1`, [ben]));
check('pilot cannot extend his own currency date', !!u3.error, u3.error);
const u4 = await as(benU, () => tryq(`update public.people set phone='x' where id=$1 returning id`, [mitch]));
check("pilot cannot edit someone else's record", u4.rows && u4.rows.length === 0, JSON.stringify(u4));
const u5 = await as(benU, () => tryq(`insert into public.people (full_name) values ('Fake')`));
check('pilot cannot add people', !!u5.error, u5.error);
const ex = await as(benU, () => tryq(`insert into public.experience (person_id, rpa_type, hours) values ($1,'Pavo 20 Pro',12.5) returning hours`, [ben]));
check('pilot records his own hours per RPA type', ex.rows && Number(ex.rows[0]?.hours) === 12.5, JSON.stringify(ex));
const ex2 = await as(benU, () => tryq(`insert into public.experience (person_id, rpa_type, hours) values ($1,'Pavo 20 Pro',99)`, [mitch]));
check("pilot cannot write someone else's hours", !!ex2.error, ex2.error);

// jobs & crew
const job = (await as(mike, () => db.query(`insert into public.jobs (op_id, title, plan, status) values ('OP-2026-0042','Saturday shoot','{"overview":{"clientName":"Aria Cruises"},"jsa":{}}','approved') returning id`))).rows[0].id;
const job2 = (await as(mike, () => db.query(`insert into public.jobs (op_id, title) values ('OP-2026-0043','Other job') returning id`))).rows[0].id;
await as(mike, () => db.query(`insert into public.job_crew (job_id, person_id, job_role) values ($1,$2,'rpic'),($1,$3,'observer'),($4,$5,'pilot')`, [job, ben, obs, job2, mitch]));
const bj = await as(benU, () => tryq(`select op_id, plan->'overview'->>'clientName' client from public.jobs`));
check('pilot sees only the job he is on, with the client name from the plan', bj.rows && bj.rows.length === 1 && bj.rows[0].op_id === 'OP-2026-0042' && bj.rows[0].client === 'Aria Cruises', JSON.stringify(bj));
const oj = await as(obsU, () => tryq(`select op_id from public.jobs`));
check('observer sees the plan of the job they are on', oj.rows && oj.rows.length === 1, JSON.stringify(oj));
const bj2 = await as(benU, () => tryq(`update public.jobs set title='hacked' where id=$1 returning id`, [job]));
check('crew cannot edit the plan', bj2.rows && bj2.rows.length === 0, JSON.stringify(bj2));
const cl = await as(benU, () => tryq(`select full_name, job_role from public.job_crew_list($1)`, [job]));
check('crew see names and roles of the crew on their job', cl.rows && cl.rows.length === 2 && cl.rows[0].job_role === 'rpic', JSON.stringify(cl));
const cl2 = await as(benU, () => tryq(`select * from public.job_crew_list($1)`, [job2]));
check("crew can't list crew of a job they're not on", cl2.rows && cl2.rows.length === 0);
const jc = await as(benU, () => tryq(`insert into public.job_crew (job_id, person_id, job_role) values ($1,$2,'pilot')`, [job2, ben]));
check('crew cannot add themselves to a job', !!jc.error, jc.error);

// flights
const f1 = await as(benU, () => tryq(`insert into public.job_flights (job_id, person_id, rpa, flight) values ($1,$2,'Pavo 20 Pro','{"label":"F1","duration":"6"}') returning id`, [job, ben]));
check('RPIC logs a flight on his job', f1.rows && f1.rows.length === 1, JSON.stringify(f1));
const f2 = await as(obsU, () => tryq(`insert into public.job_flights (job_id, person_id, rpa, flight) values ($1,$2,'Pavo 20 Pro','{"label":"Obs F2"}') returning id`, [job, obs]));
check('observer logs a flight on their job', f2.rows && f2.rows.length === 1, JSON.stringify(f2));
const f3 = await as(benU, () => tryq(`insert into public.job_flights (job_id, person_id, flight) values ($1,$2,'{}')`, [job2, ben]));
check("crew cannot log on a job they're not on", !!f3.error, f3.error);
const f4 = await as(benU, () => tryq(`insert into public.job_flights (job_id, person_id, flight) values ($1,$2,'{}')`, [job, obs]));
check('crew cannot log a flight as someone else', !!f4.error, f4.error);
const r1 = await as(benU, () => tryq(`select flight->>'label' l from public.job_flights order by l`));
check("pilot on the job sees the whole job's flight log", r1.rows && r1.rows.length === 2, JSON.stringify(r1));
const r2 = await as(obsU, () => tryq(`select flight->>'label' l from public.job_flights`));
check('observer sees only their own flights', r2.rows && r2.rows.length === 1 && r2.rows[0].l === 'Obs F2', JSON.stringify(r2));
const r3 = await as(mitchU, () => tryq(`select id from public.job_flights`));
check('pilot on another job sees none of these flights', r3.rows && r3.rows.length === 0);
const e1 = await as(benU, () => tryq(`update public.job_flights set flight='{"label":"x"}' where id=$1 returning id`, [f2.rows[0].id]));
check("pilot cannot edit the observer's flight", e1.rows && e1.rows.length === 0, JSON.stringify(e1));
await as(mike, () => db.query(`update public.jobs set status='completed' where id=$1`, [job]));
const e2 = await as(benU, () => tryq(`update public.job_flights set flight='{"label":"late"}' where id=$1`, [f1.rows[0].id]));
check('flights lock when the CRP closes the job', !!e2.error, e2.error);

// sign-offs, certifications, flight counts
const s1 = await as(benU, () => tryq(`insert into public.signoff_records (person_id, type, answers) values ($1,'pilot_induction','{"decl":true}') returning id`, [ben]));
check('pilot starts his own induction sign-off', s1.rows && s1.rows.length === 1, JSON.stringify(s1));
const sid = s1.rows[0].id;
const s2 = await as(benU, () => tryq(`update public.signoff_records set status='certified' where id=$1`, [sid]));
check('pilot cannot certify himself', !!s2.error, s2.error);
const s3 = await as(benU, () => tryq(`update public.signoff_records set status='awaiting_crp', person_signed_at=now() where id=$1 returning status`, [sid]));
check('pilot submits to the CRP', s3.rows && s3.rows[0]?.status === 'awaiting_crp', JSON.stringify(s3));
const s4 = await as(benU, () => tryq(`update public.signoff_records set answers='{}' where id=$1`, [sid]));
check('submitted sign-off is read-only to the pilot', !!s4.error, s4.error);
await as(mike, () => db.query(`update public.signoff_records set status='certified', crp_signed_by=$2, crp_signed_at=now(), locked=true where id=$1`, [sid, mike]));
const s5 = await as(mike, () => tryq(`update public.signoff_records set answers='{}' where id=$1`, [sid]));
check('locked sign-off cannot be changed, even by the CRP', !!s5.error, s5.error);
const c1 = await as(mike, () => tryq(`insert into public.certifications (person_id, competency, check_date, next_due, assessor, signoff_id) values ($1,'type:Pavo 20 Pro','2026-10-30','2027-10-30','Michael Rubio',$2) returning id`, [ben, sid]));
check('CRP records a certification', c1.rows && c1.rows.length === 1, JSON.stringify(c1));
const c2 = await as(benU, () => tryq(`insert into public.certifications (person_id, competency, check_date) values ($1,'oonp','2026-10-30')`, [ben]));
check('pilot cannot certify himself (certifications)', !!c2.error, c2.error);
const c3 = await as(benU, () => tryq(`select competency from public.certifications`));
check('pilot reads his own certifications', c3.rows && c3.rows.length === 1);
const c4 = await as(mitchU, () => tryq(`select competency from public.certifications`));
check("other pilots can't see Ben's certifications", c4.rows && c4.rows.length === 0);
const k1 = await as(mike, () => tryq(`insert into public.flight_counts (person_id, competency, flight_date, job_id) values ($1,'evlos','2026-11-01',$2) returning id`, [ben, job]));
check('CRP records a qualifying flight', k1.rows && k1.rows.length === 1, JSON.stringify(k1));
const k2 = await as(benU, () => tryq(`insert into public.flight_counts (person_id, competency, flight_date) values ($1,'evlos','2026-11-02')`, [ben]));
check('pilot cannot add his own recency flights', !!k2.error, k2.error);

// document access log
const d1 = await as(benU, () => tryq(`insert into public.document_access_log (document, page, duration_s) values ('Ops Manual v3', 12, 40)`));
check('crew record their own manual page views', !d1.error, JSON.stringify(d1));
const d2 = await as(benU, () => tryq(`select * from public.document_access_log`));
check("crew can't read the access report", d2.rows && d2.rows.length === 0);
const d3 = await as(mike, () => tryq(`select * from public.document_access_log`));
check('CRP reads the access report', d3.rows && d3.rows.length === 1);

// audit log
const a1 = await as(mike, () => tryq(`select table_name, action, before->>'phone' b, after->>'phone' a from public.audit_log where table_name='people' and row_id=$1 and action='UPDATE' order by id`, [ben]));
check('audit log keeps before/after of Ben updating his phone', a1.rows && a1.rows.some(r => r.a === '0411 111 111' && r.b === null), JSON.stringify(a1.rows));
const a2 = await as(mike, () => tryq(`select actor from public.audit_log where table_name='job_flights' and action='INSERT' order by id limit 1`));
check('audit log records who logged a flight', a2.rows && a2.rows[0]?.actor === benU, JSON.stringify(a2));
const a3 = await as(benU, () => tryq(`select * from public.audit_log`));
check('crew cannot read the audit log', a3.rows && a3.rows.length === 0);
const a4 = await as(mike, () => tryq(`delete from public.audit_log`));
check('nobody can delete the audit log', !!a4.error, a4.error);
const a5 = await as(mike, () => tryq(`insert into public.audit_log (table_name, action) values ('x','INSERT')`));
check('nobody can write to the audit log directly', !!a5.error, a5.error);
const del = await as(mike, () => tryq(`delete from public.people where id=$1`, [mitch]));
check('people are never deleted (deactivate instead)', !!del.error, del.error);

// deactivated login loses access
await as(mike, () => db.query(`update public.profiles set active=false where id=$1`, [obsU]));
const o2 = await as(obsU, () => tryq(`select id from public.jobs`));
check('deactivated observer no longer sees the job', o2.rows && o2.rows.length === 0);

const anonQ = async (q) => { await db.exec('set role anon'); try { return await tryq(q); } finally { await db.exec('reset role'); } };
const an = await anonQ(`select * from public.people`);
check('signed-out visitors get nothing', !!an.error, an.error);

console.log(`\n${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
