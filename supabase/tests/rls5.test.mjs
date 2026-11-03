// Chunk 4: EVLOS observer sign-off (PGlite).
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
await db.exec(rd('0005_chunk4_evlos_observer.sql')); await db.exec(rd('0005_chunk4_evlos_observer.sql'));
check('migration 0005 runs twice cleanly', true);
const newUser = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } };
const tryq = async (q, p) => { try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { error: e.message }; } };

const mike = await newUser('mike@wakingdreamfpv.com');
await db.query(`insert into public.invites (email, full_name, role) values ('ben@test.com','Ben Walker','pilot'),('tp2@test.com','Test Pilot 2','pilot'),('obs@test.com','Olivia Obs','observer')`);
const benU = await newUser('ben@test.com'), tp2U = await newUser('tp2@test.com'), obsU = await newUser('obs@test.com');
const pid = async (u) => (await db.query(`select id from public.people where user_id=$1`, [u])).rows[0].id;
const ben = await pid(benU), tp2 = await pid(tp2U), obs = await pid(obsU);


const asAnon = async (fn) => { await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`); try { return await fn(); } finally { await db.exec(`reset role;`); } };
const j1 = (await as(mike, () => db.query(`insert into public.jobs (plan_uid, op_id, title, status, plan) values ('u1','OP-1','Bridge Shoot','approved',$1) returning id`,
  [JSON.stringify({ overview: { location: 'Story Bridge', operationDate: '2026-11-20', clientName: 'Secret Client', rpic: 'Ben Walker' }, jsa: { operationTypes: ['VLOS','EVLOS'], evlosObserver: 'Olivia Obs' }, risks: [{ hazard: 'Birds', existingControls: 'Watch and call' }, { hazard: '' }] })]))).rows[0].id;
const j2 = (await as(mike, () => db.query(`insert into public.jobs (plan_uid, op_id, title, status, plan) values ('u2','OP-2','Other job','draft','{}') returning id`))).rows[0].id;
await as(mike, () => db.query(`insert into public.job_crew (job_id, person_id, job_role) values ($1,$2,'rpic'),($1,$3,'observer')`, [j1, ben, obs]));
await as(mike, () => db.query(`insert into public.shared_data (area, data) values ('company', '{"name":"Waking Dream FPV"}')`));

// links
const badTok = await as(benU, () => tryq(`select public.create_observer_token($1)`, [j1]));
check('a pilot cannot make observer links', !!badTok.error, badTok.error);
const anonTok = await asAnon(() => tryq(`select public.create_observer_token($1)`, [j1]));
check('anon cannot make observer links', !!anonTok.error);
const tok = (await as(mike, () => db.query(`select public.create_observer_token($1) t`, [j1]))).rows[0].t;
check('CRP makes a link (random token)', typeof tok === 'string' && tok.length >= 60, tok);
const stored = (await db.query(`select token_hash from public.observer_tokens`)).rows[0].token_hash;
check('only the hash is stored', stored !== tok && stored.length === 64);
const anonRead = await asAnon(() => tryq(`select * from public.observer_tokens`));
check('anon cannot read the tokens table', !!anonRead.error || anonRead.rows.length === 0, JSON.stringify(anonRead));

// the observer's phone (no login)
const form = (await asAnon(() => db.query(`select public.get_observer_form($1) f`, [tok]))).rows[0].f;
check('form shows the job and company', form.job.title === 'Bridge Shoot' && form.company === 'Waking Dream FPV', JSON.stringify(form).slice(0, 200));
check('form shows plan summary and hazards', form.overview.location === 'Story Bridge' && form.risks.length === 1 && form.risks[0].hazard === 'Birds');
check('form never includes the client', !JSON.stringify(form).includes('Secret Client'));
const bad = (await asAnon(() => db.query(`select public.get_observer_form('nope') f`))).rows[0].f;
check('a wrong token shows an error, no data', bad.error && !bad.job);
const noDecl = await asAnon(() => tryq(`select public.submit_observer_signoff($1,'Sam Spotter','0400 111 222',null,'{}'::jsonb,'{"typed":"Sam"}'::jsonb)`, [tok]));
check('submit needs the declaration', !!noDecl.error, noDecl.error);
const noSig = await asAnon(() => tryq(`select public.submit_observer_signoff($1,'Sam Spotter','0400 111 222',null,'{"declaration":true}'::jsonb,null)`, [tok]));
check('submit needs a signature', !!noSig.error, noSig.error);
const s1 = await asAnon(() => tryq(`select public.submit_observer_signoff($1,'Sam Spotter','0400 111 222',null,'{"declaration":true}'::jsonb,'{"typed":"Sam Spotter"}'::jsonb) id`, [tok]));
check('no-login observer submits their part', !s1.error && s1.rows[0].id, s1.error);
const sid1 = s1.rows[0].id;
const rec1 = (await db.query(`select s.*, p.full_name, p.role, p.user_id from public.signoff_records s join public.people p on p.id=s.person_id where s.id=$1`, [sid1])).rows[0];
check('…as an observer record waiting for the CRP, tied to the job', rec1.type === 'evlos_observer' && rec1.status === 'awaiting_crp' && rec1.job_id === j1 && rec1.full_name === 'Sam Spotter' && rec1.role === 'observer' && rec1.user_id === null);
const anonSee = await asAnon(() => tryq(`select * from public.signoff_records`));
check('anon cannot read sign-offs', !!anonSee.error || anonSee.rows.length === 0);
const s1b = await asAnon(() => tryq(`select public.submit_observer_signoff($1,'Sam Spotter','0400111222',null,'{"declaration":true}'::jsonb,'{"typed":"Sam"}'::jsonb) id`, [tok]));
const people = (await db.query(`select count(*)::int n from public.people where full_name='Sam Spotter'`)).rows[0].n;
check('same name + phone reuses the person', !s1b.error && people === 1, s1b.error);
// use the link up
for (let i = 0; i < 3; i++) await asAnon(() => tryq(`select public.submit_observer_signoff($1,'Obs ${i}','04${i}',null,'{"declaration":true}'::jsonb,'{"typed":"x"}'::jsonb)`, [tok]));
const over = await asAnon(() => tryq(`select public.submit_observer_signoff($1,'Too Many','0499',null,'{"declaration":true}'::jsonb,'{"typed":"x"}'::jsonb)`, [tok]));
check('a link stops after 5 sign-offs', !!over.error, over.error);
await db.query(`update public.observer_tokens set expires_at = now() - interval '1 minute'`);
const exp = (await asAnon(() => db.query(`select public.get_observer_form($1) f`, [tok]))).rows[0].f;
check('an expired link shows an error', !!exp.error);

// CRP countersigns
const pilotCert = await as(benU, () => tryq(`select public.certify_observer($1,'certified','{"crpCertifies":true}'::jsonb,'{"typed":"Ben"}'::jsonb)`, [sid1]));
check('a pilot cannot certify an observer', !!pilotCert.error);
const noTick = await as(mike, () => tryq(`select public.certify_observer($1,'certified','{}'::jsonb,'{"typed":"Mike"}'::jsonb)`, [sid1]));
check('CRP must tick the checks', !!noTick.error);
const ok1 = await as(mike, () => tryq(`select public.certify_observer($1,'certified','{"crpCertifies":true,"assessor":"Michael Rubio"}'::jsonb,'{"typed":"Michael Rubio"}'::jsonb)`, [sid1]));
check('CRP certifies', !ok1.error, ok1.error);
const r1 = (await db.query(`select status, locked, crp_signed_by from public.signoff_records where id=$1`, [sid1])).rows[0];
check('record certified and locked', r1.status === 'certified' && r1.locked && r1.crp_signed_by === mike);
const cert = (await db.query(`select competency, next_due - check_date as days from public.certifications where signoff_id=$1`, [sid1])).rows[0];
check('evlos_observer certification for 12 months', cert && cert.competency === 'evlos_observer' && cert.days >= 365, JSON.stringify(cert));
const edit = await as(mike, () => tryq(`update public.signoff_records set answers='{}' where id=$1`, [sid1]));
check('a certified record can\'t be edited', !!edit.error);

// logged-in observer
const notOn = await as(obsU, () => tryq(`select public.submit_observer_self($1,'{"declaration":true,"reviewedPlan":true}'::jsonb,'{"typed":"Olivia"}'::jsonb)`, [j2]));
check('observer cannot sign for a job they are not on', !!notOn.error, notOn.error);
const noRev = await as(obsU, () => tryq(`select public.submit_observer_self($1,'{"declaration":true}'::jsonb,'{"typed":"Olivia"}'::jsonb)`, [j1]));
check('logged-in observer must confirm they reviewed the plan', !!noRev.error, noRev.error);
const s3 = await as(obsU, () => tryq(`select public.submit_observer_self($1,'{"declaration":true,"reviewedPlan":true}'::jsonb,'{"typed":"Olivia Obs"}'::jsonb) id`, [j1]));
check('logged-in observer on the job signs', !s3.error, s3.error);
const mine = await as(obsU, () => tryq(`select count(*)::int n from public.signoff_records where type='evlos_observer'`));
check('they see only their own sign-off', mine.rows && mine.rows[0].n === 1, JSON.stringify(mine));
const selfCert = await as(obsU, () => tryq(`update public.signoff_records set status='certified' where id=$1`, [s3.rows[0].id]));
check('they cannot certify themselves', !!selfCert.error || (await db.query(`select status from public.signoff_records where id=$1`, [s3.rows[0].id])).rows[0].status === 'awaiting_crp');

// on the CRP's device
const dev = await as(mike, () => tryq(`select public.record_observer_signoff($1,'{"name":"Dana Device","phone":"0411 000 000"}'::jsonb,'{"declaration":true}'::jsonb,'{"image":"data:image/png;base64,xx"}'::jsonb,'2026-11-20T08:00:00+10:00','certified','{"crpCertifies":true}'::jsonb,'{"typed":"Michael Rubio"}'::jsonb) id`, [j1]));
check('CRP device records both parts at once', !dev.error, dev.error);
const r4 = (await db.query(`select status, locked, person_signed_at from public.signoff_records where id=$1`, [dev.rows[0].id])).rows[0];
check('…certified, locked, observer time kept', r4.status === 'certified' && r4.locked && new Date(r4.person_signed_at).toISOString() === '2026-11-19T22:00:00.000Z', JSON.stringify(r4));
const devPilot = await as(benU, () => tryq(`select public.record_observer_signoff($1,'{"name":"X"}'::jsonb,'{"declaration":true}'::jsonb,'{"typed":"X"}'::jsonb,null,'certified','{"crpCertifies":true}'::jsonb,'{"typed":"X"}'::jsonb)`, [j1]));
check('a pilot cannot use the CRP-device path', !!devPilot.error);
const au = (await db.query(`select count(*)::int n from public.audit_log where table_name in ('signoff_records','observer_tokens','certifications')`)).rows[0].n;
check('all of it is audited', au >= 6, au);

console.log(`\n${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
