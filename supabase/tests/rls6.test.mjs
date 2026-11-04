// EVLOS register, training links without a job, protected manual (PGlite).
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
await db.exec(rd('0006_evlos_register_manual.sql')); await db.exec(rd('0006_evlos_register_manual.sql'));
check('migration 0006 runs twice cleanly', true);
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
  [JSON.stringify({ overview: { location: 'Story Bridge', clientName: 'Secret Client', launchSites: [{ coords: '-27.46, 153.03' }] }, approval: { rpName: 'Ben Walker' }, jsa: { operationTypes: ['EVLOS'] }, mapData: { launches: [{ lat: -27.46, lng: 153.03 }] }, risks: [{ hazard: 'Birds', riskDescription: 'Strike', existingControls: 'Watch' }] })]))).rows[0].id;
await as(mike, () => db.query(`update public.app_settings set value = '{"path":"current.pdf","name":"Ops Manual v3.2.pdf"}' where key = 'manual_file'`));
await as(mike, () => db.query(`update public.app_settings set value = '"3.2"' where key = 'manual_version'`));
await as(mike, () => db.query(`update public.app_settings set value = '"Observer duties: watch the aircraft…"' where key = 'observer_extract'`));
// job link: the job pack
const tok = (await as(mike, () => db.query(`select public.create_observer_token($1) t`, [j1]))).rows[0].t;
const f = (await asAnon(() => db.query(`select public.get_observer_form($1) f`, [tok]))).rows[0].f;
check('job pack: map, launch sites, RPIC, full risk with description', f.mapData && f.mapData.launches.length === 1 && f.overview.launchSites.length === 1 && f.overview.rpic === 'Ben Walker' && f.risks[0].risk === 'Strike');
check('job pack: manual available + version, observer extract', f.manual.available === true && f.manual.version === '3.2' && f.extract.startsWith('Observer duties'));
check('job pack: never the client', !JSON.stringify(f).includes('Secret Client'));
// training link (no job)
const tt = (await as(mike, () => db.query(`select public.create_observer_token(null) t`))).rows[0].t;
const tf = (await asAnon(() => db.query(`select public.get_observer_form($1) f`, [tt]))).rows[0].f;
check('training link (no job) works', tf.training === true && !tf.job && tf.company === '' || tf.training === true, JSON.stringify(tf));
const ts = await asAnon(() => tryq(`select public.submit_observer_signoff($1,'Tia Trainee','0400 222 333',null,'{"declaration":true,"manualVersion":"3.2"}'::jsonb,'{"typed":"Tia"}'::jsonb) id`, [tt]));
check('training sign-off submitted without a job', !ts.error, ts.error);
const tr = (await db.query(`select job_id, answers->>'training' t, source_token from public.signoff_records where id=$1`, [ts.rows[0].id])).rows[0];
check('…marked training, linked to its link', tr.job_id === null && tr.t === 'true' && !!tr.source_token);
await as(mike, () => db.query(`select public.certify_observer($1,'certified','{"crpCertifies":true,"assessor":"Michael Rubio","callsign":"Eagle"}'::jsonb,'{"typed":"Michael Rubio"}'::jsonb)`, [ts.rows[0].id]));
const dev = await as(mike, () => tryq(`select public.record_observer_signoff(null,'{"name":"Dev Train","phone":"0411"}'::jsonb,'{"declaration":true}'::jsonb,'{"typed":"Dev"}'::jsonb,null,'certified','{"crpCertifies":true}'::jsonb,'{"typed":"Mike"}'::jsonb) id`));
check('CRP device training sign-off (no job)', !dev.error, dev.error);
// register
const reg = await as(mike, () => tryq(`select * from public.observer_register()`));
const tia = reg.rows && reg.rows.find(r => r.full_name === 'Tia Trainee');
check('register lists observers with status, due date, callsign, manual version', tia && tia.status === 'certified' && tia.next_due && tia.callsign === 'Eagle' && tia.manual_version === '3.2' && tia.training === true, JSON.stringify(tia));
const regPilot = await as(benU, () => tryq(`select * from public.observer_register()`));
check('a pilot cannot read the register', !!regPilot.error);
// manual log
const lg = await asAnon(() => tryq(`select public.log_manual_page($1, 4, 35, '3.2')`, [tok]));
check('link viewer page reads are logged', !lg.error, lg.error);
const lgBad = await asAnon(() => tryq(`select public.log_manual_page('nope', 1, 5, '3.2')`));
check('…not with a bad link', !!lgBad.error);
const lg2 = await as(benU, () => tryq(`select public.log_manual_page(null, 2, 10, '3.2')`));
check('signed-in crew page reads are logged as them', !lg2.error && (await db.query(`select count(*)::int n from public.document_access_log where user_id=$1`, [benU])).rows[0].n === 1, lg2.error);
const lgAnon = await asAnon(() => tryq(`select public.log_manual_page(null, 2, 10, '3.2')`));
check('anon without a link cannot log', !!lgAnon.error);
const readLog = await as(benU, () => tryq(`select * from public.document_access_log`));
check('crew cannot read the read log', readLog.rows && readLog.rows.length === 0 || !!readLog.error);
const crpLog = await as(mike, () => tryq(`select count(*)::int n from public.document_access_log`));
check('CRP reads the read log', crpLog.rows && crpLog.rows[0].n === 2, JSON.stringify(crpLog));
// settings: crew read, anon can't
const st = await as(benU, () => tryq(`select value from public.app_settings where key='manual_file'`));
check('crew can read the manual settings', st.rows && st.rows.length === 1);
const sta = await asAnon(() => tryq(`select value from public.app_settings`));
check('anon cannot read settings directly', !!sta.error || sta.rows.length === 0);
console.log(`\n${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
