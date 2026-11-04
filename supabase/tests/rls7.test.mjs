// v7.9: observers' job link carries the advanced ops map, without the floor-plan picture (PGlite).
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
await db.exec(rd('0007_opsmap_observer.sql')); await db.exec(rd('0007_opsmap_observer.sql'));
check('migration 0007 runs twice cleanly', true);
const newUser = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } };
const tryq = async (q, p) => { try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { error: e.message }; } };

const mike = await newUser('mike@wakingdreamfpv.com');
await db.query(`insert into public.invites (email, full_name, role) values ('ben@test.com','Ben Walker','pilot'),('tp2@test.com','Test Pilot 2','pilot'),('obs@test.com','Olivia Obs','observer')`);
const benU = await newUser('ben@test.com'), tp2U = await newUser('tp2@test.com'), obsU = await newUser('obs@test.com');
const pid = async (u) => (await db.query(`select id from public.people where user_id=$1`, [u])).rows[0].id;
const ben = await pid(benU), tp2 = await pid(tp2U), obs = await pid(obsU);



const asAnon = async (fn) => { await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`); try { return await fn(); } finally { await db.exec(`reset role;`); } };

const plan = { overview: { location: 'Stadium', clientName: 'Secret Client' }, jsa: { operationTypes: ['OONP'] }, mapData: { launches: [] },
  risks: [{ hazard: 'Crowd', riskDescription: 'Strike' }],
  opsMap: { v: 1, mode: 'geo', zones: [{ id: 'z1', kind: 'oonp', shape: 'poly', name: 'Floor', pts: [[-33.8, 151], [-33.8, 151.001], [-33.801, 151.001]], h: 3, v: 8, drone: 'DJI Avata 2', energy: 34 }],
    paths: [], points: [{ id: 'p1', kind: 'poi', lat: -33.8, lng: 151, title: 'Truss', text: '14 m' }],
    overlay: { name: 'plan.pdf', src: 'data:image/jpeg;base64,' + 'A'.repeat(5000), center: [-33.8, 151], widthM: 120, rot: 0 } } };
const j1 = (await as(mike, () => db.query(`insert into public.jobs (plan_uid, op_id, title, status, plan) values ('u1','OP-1','Concert','approved',$1) returning id`, [JSON.stringify(plan)]))).rows[0].id;
const j2 = (await as(mike, () => db.query(`insert into public.jobs (plan_uid, op_id, title, status, plan) values ('u2','OP-2','Old job','approved',$1) returning id`, [JSON.stringify({ overview: { location: 'Park' } })]))).rows[0].id;
const tok = (await as(mike, () => db.query(`select public.create_observer_token($1) t`, [j1]))).rows[0].t;
const f = (await asAnon(() => db.query(`select public.get_observer_form($1) f`, [tok]))).rows[0].f;
check('job link includes the ops map zones and cautions', f.opsMap && f.opsMap.zones[0].h === 3 && f.opsMap.points[0].title === 'Truss');
check('…without the floor-plan picture (but keeps where it sits)', f.opsMap.overlay && !('src' in f.opsMap.overlay) && f.opsMap.overlay.widthM === 120 && !JSON.stringify(f).includes('AAAAAAAAAA'));
check('…and still never the client', !JSON.stringify(f).includes('Secret Client'));
const t2 = (await as(mike, () => db.query(`select public.create_observer_token($1) t`, [j2]))).rows[0].t;
const f2 = (await asAnon(() => db.query(`select public.get_observer_form($1) f`, [t2]))).rows[0].f;
check('a job without an ops map still works', f2.opsMap === null && f2.overview.location === 'Park', JSON.stringify(f2).slice(0, 200));
const tt = (await as(mike, () => db.query(`select public.create_observer_token(null) t`))).rows[0].t;
const tf = (await asAnon(() => db.query(`select public.get_observer_form($1) f`, [tt]))).rows[0].f;
check('training links unchanged', tf.training === true);
console.log(pass + ' / ' + (pass + fail)); if (fail) process.exit(1);
