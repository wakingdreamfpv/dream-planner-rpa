// v7.11: crew currency (12 / 24 months + 3 flights a year), flight counts, checks, email settings (PGlite).
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
await db.exec(rd('0008_currency_registers_digest.sql')); await db.exec(rd('0008_currency_registers_digest.sql'));
check('migration 0008 runs twice cleanly', true);
const newUser = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } };
const tryq = async (q, p) => { try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { error: e.message }; } };

const mike = await newUser('mike@wakingdreamfpv.com');
await db.query(`insert into public.invites (email, full_name, role) values ('ben@test.com','Ben Walker','pilot'),('tp2@test.com','Test Pilot 2','pilot'),('obs@test.com','Olivia Obs','observer')`);
const benU = await newUser('ben@test.com'), tp2U = await newUser('tp2@test.com'), obsU = await newUser('obs@test.com');
const pid = async (u) => (await db.query(`select id from public.people where user_id=$1`, [u])).rows[0].id;
const ben = await pid(benU), tp2 = await pid(tp2U), obs = await pid(obsU);



const asAnon = async (fn) => { await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`); try { return await fn(); } finally { await db.exec(`reset role;`); } };


const ago = (m, d = 0) => `(current_date - interval '${m} months' - interval '${d} days')::date`;
const cert = (p, c, m) => db.query(`insert into public.certifications (person_id, competency, check_date, next_due, assessor) values ($1, $2, ${ago(m)}, (${ago(m)} + interval '12 months')::date, 'Mike')`, [p, c]);
const fl = (p, c, m, d, ref) => db.query(`insert into public.flight_counts (person_id, competency, flight_date, flight_ref) values ($1, $2, ${ago(m, d)}, $3)`, [p, c, ref]);
// Ben: EVLOS checked 6 months ago (plain 12 months); type checked 18 months ago with 3 flights in year one and 3 in the last 12 months
await cert(ben, 'evlos', 6);
await cert(ben, 'type:DJI Avata 2', 18);
for (const [m, k] of [[17, 'a'], [16, 'b'], [15, 'c'], [5, 'd'], [4, 'e'], [3, 'f']]) await fl(ben, 'type:DJI Avata 2', m, 0, 'r' + k);
// TP2: night 18 months ago, 3 flights in year one but only 2 in the last 12 months → expired; OONP 26 months ago → expired; type 11 months → due soon
await cert(tp2, 'night', 18);
for (const [m, k] of [[17, 'a'], [16, 'b'], [15, 'c'], [5, 'd'], [4, 'e']]) await fl(tp2, 'night', m, 0, 'n' + k);
await cert(tp2, 'oonp', 26);
await cert(tp2, 'type:DJI Mini 4 Pro', 11);
const cur = (await as(mike, () => db.query(`select * from public.crew_currency()`))).rows;
const get = (p, c) => cur.find(r => r.person_id === p && r.competency === c);
const iso = (d) => d ? new Date(d).toISOString().slice(0, 10) : null;
const today = (await db.query(`select current_date d`)).rows[0].d;
const addM = (base, m) => (db.query(`select ($1::date + interval '${m} months')::date d`, [base]));
const e1 = get(ben, 'evlos');
check('checked 6 months ago: current, due 12 months after the check', e1 && e1.status === 'current' && !e1.extended && iso(e1.due) === iso((await addM(e1.check_date, 12)).rows[0].d), JSON.stringify(e1));
const t1 = get(ben, 'type:DJI Avata 2');
const third = (await db.query(`select ${ago(3)} d`)).rows[0].d, ext = (await db.query(`select least(($1::date + interval '24 months')::date, ($2::date + interval '12 months')::date) d`, [t1.check_date, third])).rows[0].d;
check('18 months, 3 flights each year: still current, extended to the 3rd-latest flight + 12 months', t1.status === 'current' && t1.extended && iso(t1.due) === iso(ext) && t1.flights_first === 3 && t1.flights_recent === 3, JSON.stringify(t1));
const n2 = get(tp2, 'night');
check('18 months, only 2 flights in the last 12 months: expired', n2.status === 'expired' && n2.flights_recent === 2, JSON.stringify(n2));
check('26 months ago: expired', get(tp2, 'oonp').status === 'expired');
check('checked 11 months ago: due soon (within 60 days)', get(tp2, 'type:DJI Mini 4 Pro').status === 'due_soon');
// flight counts: CRP only, never twice
const rc = await as(mike, () => db.query(`select public.record_flight_counts($1::jsonb) n`, [JSON.stringify([{ person_id: ben, competency: 'evlos', flight_date: '2026-10-01', flight_ref: 'job1:f1' }, { person_id: ben, competency: 'evlos', flight_date: '2026-10-01', flight_ref: 'job1:f1' }, { person_id: ben, competency: 'evlos', flight_date: '2026-10-02', flight_ref: 'job1:f2' }])]));
const rc2 = await as(mike, () => db.query(`select public.record_flight_counts($1::jsonb) n`, [JSON.stringify([{ person_id: ben, competency: 'evlos', flight_date: '2026-10-01', flight_ref: 'job1:f1' }])]));
check('flight counts recorded once each', rc.rows[0].n === 2 && rc2.rows[0].n === 0, JSON.stringify([rc.rows, rc2.rows]));
const rcP = await as(benU, () => tryq(`select public.record_flight_counts('[]'::jsonb)`));
check('a pilot cannot record flight counts', !!rcP.error);
// crew see only their own currency
const own = (await as(benU, () => db.query(`select distinct person_id from public.crew_currency()`))).rows;
check('a pilot sees only their own currency', own.length === 1 && own[0].person_id === ben);
const an = await asAnon(() => tryq(`select * from public.crew_currency()`));
check('no currency without a login', !!an.error || an.rows.length === 0);
const sa = await as(benU, () => tryq(`select * from public._currency_all()`));
check('the internal all-crew function is not open to crew', !!sa.error);
// record a check
const ck = await as(mike, () => tryq(`select public.record_check($1, 'oonp', current_date - 2, 'Michael Rubio') id`, [tp2]));
const o2 = (await as(mike, () => db.query(`select * from public.crew_currency() where person_id = $1 and competency = 'oonp'`, [tp2]))).rows[0];
check('CRP records a recurrent check: OONP current again', !ck.error && o2.status === 'current' && o2.assessor === 'Michael Rubio', ck.error || JSON.stringify(o2));
const ckP = await as(benU, () => tryq(`select public.record_check($1, 'evlos', current_date, 'Ben')`, [ben]));
check('a pilot cannot record a check', !!ckP.error);
const ckF = await as(mike, () => tryq(`select public.record_check($1, 'evlos', current_date + 3, 'Mike')`, [ben]));
check('a check cannot be in the future', !!ckF.error);
// email settings: each login their own
const ip = await as(benU, () => tryq(`insert into public.notification_prefs (user_id, digest, digest_day, events) values ($1, 'fortnightly', 3, '{"log_request":false}'::jsonb)`, [benU]));
check('a pilot saves their own email settings', !ip.error, ip.error);
const ipx = await as(benU, () => tryq(`insert into public.notification_prefs (user_id) values ($1)`, [tp2U]));
check("…but not someone else's", !!ipx.error);
const rdP = (await as(tp2U, () => db.query(`select * from public.notification_prefs`))).rows;
check("a pilot can't read others' settings", rdP.length === 0);
const rdC = (await as(mike, () => db.query(`select * from public.notification_prefs`))).rows;
check('the CRP can read them (for the digest preview)', rdC.length === 1 && rdC[0].digest === 'fortnightly');
const bad = await as(benU, () => tryq(`update public.notification_prefs set digest = 'daily' where user_id = $1`, [benU]));
check('only weekly / fortnightly / off', !!bad.error);
console.log(pass + ' / ' + (pass + fail)); if (fail) process.exit(1);
