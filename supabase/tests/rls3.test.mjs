// Chunk 3: pilot induction — submit / certify functions, fleet types, settings, document storage rules (PGlite).
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
  -- stand-in for Supabase Storage
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select, insert on storage.objects to authenticated;
`);
const rd = (f) => readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8');
await db.exec(rd('0001_chunk1_auth_roles.sql').replace(/CHANGE-ME@example\.com/g, 'mike@wakingdreamfpv.com'));
await db.exec(rd('0002_chunk2_data_model.sql'));
await db.exec(rd('0003_chunk3_induction.sql')); await db.exec(rd('0003_chunk3_induction.sql'));
check('migration 0003 runs twice cleanly', true);
const newUser = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } };
const tryq = async (q, p) => { try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { error: e.message }; } };

const mike = await newUser('mike@wakingdreamfpv.com');
await db.query(`update public.people set full_name='Michael Rubio' where user_id=$1`, [mike]);
await db.query(`insert into public.invites (email, full_name, role) values ('ben@test.com','Ben','pilot'),('mitch@test.com','Mitch','pilot')`);
const benU = await newUser('ben@test.com'), mitchU = await newUser('mitch@test.com');
const ben = (await db.query(`select id from public.people where user_id=$1`, [benU])).rows[0].id;
const mitch = (await db.query(`select id from public.people where user_id=$1`, [mitchU])).rows[0].id;

// fleet types & settings
const f1 = await as(mike, () => tryq(`insert into public.fleet_types (name) values ('Pavo 20 Pro'),('DJI Avata 2') on conflict (name) do update set active = true`));
check('CRP publishes fleet types', !f1.error, f1.error);
const f2 = await as(benU, () => tryq(`select name from public.fleet_types order by name`));
check('pilot reads fleet types for the induction', f2.rows && f2.rows.length === 2, JSON.stringify(f2));
const f3 = await as(benU, () => tryq(`insert into public.fleet_types (name) values ('Fake')`));
check('pilot cannot add fleet types', !!f3.error, f3.error);
await as(mike, () => db.query(`update public.app_settings set value='"v3.2 (Aug 2026)"' where key='manual_version'`));
const s1 = await as(benU, () => tryq(`select value from public.app_settings where key='manual_version'`));
check('pilot reads the manual version', s1.rows && s1.rows[0]?.value === 'v3.2 (Aug 2026)', JSON.stringify(s1));
const s2 = await as(benU, () => tryq(`update public.app_settings set value='"x"' where key='manual_version' returning key`));
check('pilot cannot change settings', s2.rows && s2.rows.length === 0, JSON.stringify(s2));

// Part 1
const ins = await as(benU, () => tryq(`insert into public.signoff_records (person_id, type, answers, manual_version) values ($1,'pilot_induction','{"types":["Pavo 20 Pro"],"approvals":["evlos"]}','v3.2 (Aug 2026)') returning id`, [ben]));
check('pilot starts a draft induction', ins.rows && ins.rows.length === 1, JSON.stringify(ins));
const id = ins.rows[0].id;
const dup = await as(benU, () => tryq(`insert into public.signoff_records (person_id, type) values ($1,'pilot_induction')`, [ben]));
check('only one open induction per pilot', !!dup.error, dup.error);
const sub1 = await as(benU, () => tryq(`select public.submit_induction($1)`, [id]));
check('submit refused without the declaration', /declaration/.test(sub1.error || ''), sub1.error);
await as(benU, () => db.query(`update public.signoff_records set answers = answers || '{"declaration":true}' where id=$1`, [id]));
const sub2 = await as(benU, () => tryq(`select public.submit_induction($1)`, [id]));
check('submit refused without confidentiality agreement', /confidential/.test(sub2.error || ''), sub2.error);
await as(benU, () => db.query(`update public.signoff_records set answers = answers || '{"confidentiality":true}' where id=$1`, [id]));
const sub3 = await as(benU, () => tryq(`select public.submit_induction($1)`, [id]));
check('submit refused without a signature', /Sign/.test(sub3.error || ''), sub3.error);
await as(benU, () => db.query(`update public.signoff_records set person_signature='{"typed":"Ben","name":"Ben"}' where id=$1`, [id]));
const sub4 = await as(mitchU, () => tryq(`select public.submit_induction($1)`, [id]));
check("another pilot can't submit Ben's induction", !!sub4.error, sub4.error);
const sub5 = await as(benU, () => tryq(`select public.submit_induction($1)`, [id]));
check('pilot submits when complete', !sub5.error, sub5.error);
const st = (await db.query(`select status, person_signed_at from public.signoff_records where id=$1`, [id])).rows[0];
check('status is awaiting_crp with a signed time', st.status === 'awaiting_crp' && !!st.person_signed_at, JSON.stringify(st));
const ed = await as(benU, () => tryq(`update public.signoff_records set answers='{}' where id=$1`, [id]));
check('pilot cannot edit after submitting', !!ed.error, ed.error);

// Part 2
const c0 = await as(benU, () => tryq(`select * from public.certify_induction($1,'certified','{"crpCertifies":true,"competencies":["induction"]}','{"typed":"Ben"}')`, [id]));
check('pilot cannot certify', /Only the CRP/.test(c0.error || ''), c0.error);
const c1 = await as(mike, () => tryq(`select * from public.certify_induction($1,'certified','{"crpCertifies":true,"competencies":["induction","oonp"],"checkDate":"2026-10-30"}','{"typed":"Michael Rubio"}')`, [id]));
check('OONP refused without 10+ hours on type verified', /10\+ hours/.test(c1.error || ''), c1.error);
const c2 = await as(mike, () => tryq(`select * from public.certify_induction($1,'certified','{"crpCertifies":true,"competencies":["induction"],"checkDate":"2026-10-30"}',null)`, [id]));
check('CRP must sign', /Sign as CRP/.test(c2.error || ''), c2.error);
const c3 = await as(mike, () => tryq(`select * from public.certify_induction($1,'certified','{"crpCertifies":true,"competencies":["induction","type:Pavo 20 Pro","evlos","oonp"],"oonpHoursVerified":true,"checkDate":"2026-10-30"}','{"typed":"Michael Rubio"}')`, [id]));
check('CRP certifies: returns the pilot and 4 certifications', c3.rows && c3.rows[0]?.pilot_email === 'ben@test.com' && c3.rows[0]?.certs === 4, JSON.stringify(c3));
const rec = (await db.query(`select status, locked, crp_signed_by, answers->'crp'->>'checkDate' d from public.signoff_records where id=$1`, [id])).rows[0];
check('record certified, locked, CRP recorded', rec.status === 'certified' && rec.locked && rec.crp_signed_by === mike && rec.d === '2026-10-30', JSON.stringify(rec));
const certs = (await db.query(`select competency, check_date::text c, next_due::text n, assessor from public.certifications where person_id=$1 order by competency`, [ben])).rows;
check('certifications due 12 months after the check, assessor named', certs.length === 4 && certs.every(x => x.c === '2026-10-30' && x.n === '2027-10-30' && x.assessor === 'Michael Rubio'), JSON.stringify(certs));
const again = await as(mike, () => tryq(`select * from public.certify_induction($1,'certified','{"crpCertifies":true,"competencies":["night"]}','{"typed":"M"}')`, [id]));
check('a certified induction cannot be certified again', !!again.error, again.error);
const bc = await as(benU, () => tryq(`select competency from public.certifications`));
check('pilot sees his new certifications', bc.rows && bc.rows.length === 4);
const eng = (await db.query(`select date_last_engaged::text d from public.people where id=$1`, [ben])).rows[0];
check('date last engaged updated', eng.d === '2026-10-30', JSON.stringify(eng));

// not yet competent
const m1 = (await as(mitchU, () => db.query(`insert into public.signoff_records (person_id, type, answers, person_signature) values ($1,'pilot_induction','{"declaration":true,"confidentiality":true}','{"image":"data:image/png;base64,xx"}') returning id`, [mitch]))).rows[0].id;
await as(mitchU, () => db.query(`select public.submit_induction($1)`, [m1]));
const nyc = await as(mike, () => tryq(`select * from public.certify_induction($1,'not_yet_competent','{"crpCertifies":true,"notes":"Redo type practical"}','{"typed":"Michael Rubio"}')`, [m1]));
check('CRP records not yet competent (no certifications)', nyc.rows && nyc.rows[0]?.certs === 0, JSON.stringify(nyc));
const m2 = await as(mitchU, () => tryq(`insert into public.signoff_records (person_id, type) values ($1,'pilot_induction') returning id`, [mitch]));
check('pilot can start a fresh induction after not yet competent', m2.rows && m2.rows.length === 1, JSON.stringify(m2));

// storage
const up1 = await as(benU, () => tryq(`insert into storage.objects (bucket_id, name) values ('crew-docs', $1)`, [ben + '/repl-front.jpg']));
check('pilot uploads into his own folder', !up1.error, up1.error);
const up2 = await as(benU, () => tryq(`insert into storage.objects (bucket_id, name) values ('crew-docs', $1)`, [mitch + '/x.jpg']));
check("pilot cannot upload into someone else's folder", !!up2.error, up2.error);
await as(mitchU, () => db.query(`insert into storage.objects (bucket_id, name) values ('crew-docs', $1)`, [mitch + '/logbook.pdf']));
const rd1 = await as(benU, () => tryq(`select name from storage.objects`));
check("pilot sees only his own documents", rd1.rows && rd1.rows.length === 1 && rd1.rows[0].name.startsWith(ben), JSON.stringify(rd1));
const rd2 = await as(mike, () => tryq(`select name from storage.objects`));
check('CRP sees all crew documents', rd2.rows && rd2.rows.length === 2);
const bk = (await db.query(`select public from storage.buckets where id='crew-docs'`)).rows[0];
check('crew-docs bucket is private', bk && bk.public === false);

// audit
const au = (await db.query(`select count(*)::int n from public.audit_log where table_name='certifications' and actor=$1`, [mike])).rows[0].n;
check('certifications are in the audit log under the CRP', au === 4, au);

console.log(`\n${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
