// v7.21: locked copies with fingerprints, corrections as versions, job plan copies (PGlite).
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
await db.exec(rd('0009_records_import_backup.sql'));
await db.exec(rd('0010_comments_links_briefs.sql')); await db.exec(rd('0010_comments_links_briefs.sql'));
// v7.23: like the live database, there are already locked sign-offs when 0011 is installed
const preU = (await db.query(`insert into auth.users (email) values ('early@test.com') returning id`)).rows[0].id;
await db.query(`insert into public.invites (email, full_name, role) values ('early@test.com','Early Pilot','pilot')`).catch(() => {});
const preP = (await db.query(`insert into public.people (full_name, role) values ('Early Observer','observer') returning id`)).rows[0].id;
const preS = (await db.query(`insert into public.signoff_records (person_id, type, status, answers, locked) values ($1,'evlos_observer','certified','{"crp":{"callsign":"Old"}}',true) returning id`, [preP])).rows[0].id;
await db.exec(rd('0011_locked_copies_versions.sql')); await db.exec(rd('0011_locked_copies_versions.sql'));
const pre = (await db.query(`select s.chain_id, (select count(*)::int from public.record_versions v where v.record_id = s.id) n, (select reason from public.record_versions v where v.record_id = s.id limit 1) r from public.signoff_records s where s.id = $1`, [preS])).rows[0];
check('installs on a database that already has locked sign-offs; each gets its copy once', pre.chain_id === preS && pre.n === 1 && /installed/.test(pre.r || ''), JSON.stringify(pre));
const preLock = await db.query(`update public.signoff_records set answers='{}' where id=$1`, [preS]).then(() => 'changed', (e) => e.message);
check('and they stay locked afterwards', /locked/.test(preLock), preLock);
check('migrations 0010 and 0011 run twice cleanly', true);
const newUser = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } };
const tryq = async (q, p) => { try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { error: e.message }; } };
const mike = await newUser('mike@wakingdreamfpv.com');
await db.query(`insert into public.invites (email, full_name, role) values ('ben@test.com','Ben Walker','pilot'),('mitch@test.com','Mitch','pilot')`);
const benU = await newUser('ben@test.com'), mitchU = await newUser('mitch@test.com');
const pid = async (u) => (await db.query(`select id from public.people where user_id=$1`, [u])).rows[0].id;
const ben = await pid(benU), mitch = await pid(mitchU);

// a pilot induction, submitted and certified
const id = (await as(benU, () => db.query(`insert into public.signoff_records (person_id, type, answers) values ($1,'pilot_induction','{"types":["Pavo 20 Pro"],"declaration":true,"confidentiality":true,"licenceNotes":"RePL 1234"}') returning id`, [ben]))).rows[0].id;
await as(benU, () => db.query(`update public.signoff_records set person_signature='{"typed":"Ben Walker","name":"Ben Walker"}' where id=$1`, [id]));
await as(benU, () => db.query(`select public.submit_induction($1)`, [id]));
let v = await as(mike, () => tryq(`select count(*)::int n from public.record_versions where record_id=$1`, [id]));
check('no copy while the record is still open', v.rows[0].n === 0, JSON.stringify(v));
await as(mike, () => db.query(`select * from public.certify_induction($1,'certified','{"crpCertifies":true,"competencies":["induction"],"checkDate":"2026-10-30"}','{"typed":"Michael Rubio"}')`, [id]));
v = await as(mike, () => tryq(`select * from public.record_versions where kind='signoff' and record_id=$1`, [id]));
const v1 = v.rows[0];
check('certifying locks it and keeps version 1 with a fingerprint', v.rows.length === 1 && v1.version === 1 && /^[0-9a-f]{64}$/.test(v1.data_hash) && v1.data.status === 'certified' && v1.chain_id === id, JSON.stringify(v.rows.map(r => [r.version, r.data_hash])));
const ok1 = await as(mike, () => tryq(`select public.verify_record_version($1) r`, [v1.id]));
check('verify: fingerprint matches', ok1.rows[0].r.data_ok === true && ok1.rows[0].r.copy_ok === null, JSON.stringify(ok1));

// the printable copy
const a0 = await as(benU, () => tryq(`select public.attach_record_copy($1,'<html>x</html>')`, [v1.id]));
check('only the CRP adds the signed copy', /Only the CRP/.test(a0.error || ''), a0.error);
const a1 = await as(mike, () => tryq(`select public.attach_record_copy($1,'<html>signed copy</html>') h`, [v1.id]));
const hx = (await db.query(`select encode(sha256(convert_to('<html>signed copy</html>','UTF8')),'hex') h`)).rows[0].h;
check('CRP adds the signed copy; its fingerprint is the SHA-256 of the copy', a1.rows && a1.rows[0].h === hx, JSON.stringify(a1));
const a2 = await as(mike, () => tryq(`select public.attach_record_copy($1,'<html>swapped</html>')`, [v1.id]));
check("the copy can't be replaced", !!a2.error, a2.error);
const ok2 = await as(mike, () => tryq(`select public.verify_record_version($1) r`, [v1.id]));
check('verify: copy matches too', ok2.rows[0].r.copy_ok === true && ok2.rows[0].r.data_ok === true);

// nobody can change or delete a copy
for (const [who, u] of [['CRP', mike], ['pilot', benU]]) {
  const u1 = await as(u, () => tryq(`update public.record_versions set reason='x' where id=$1 returning id`, [v1.id]));
  check(who + " can't edit a copy", !!u1.error || u1.rows.length === 0, JSON.stringify(u1));
  const d1 = await as(u, () => tryq(`delete from public.record_versions where id=$1 returning id`, [v1.id]));
  check(who + " can't delete a copy", !!d1.error || d1.rows.length === 0, JSON.stringify(d1));
  const i1 = await as(u, () => tryq(`insert into public.record_versions (kind, record_id, chain_id, data, data_hash, version) values ('signoff',$1,$1,'{}','x',9)`, [id]));
  check(who + " can't write a copy directly", !!i1.error, i1.error);
}
const t1 = await tryq(`update public.record_versions set data='{"status":"forged"}' where id=$1`, [v1.id]);
check('even the database owner is refused by the guard', /cannot be changed/.test(t1.error || ''), t1.error);
const t2 = await tryq(`delete from public.record_versions where id=$1`, [v1.id]);
check('and cannot delete one', /cannot be deleted/.test(t2.error || ''), t2.error);
// tampering past the guard is caught by Verify
await db.exec(`alter table public.record_versions disable trigger record_versions_guard`);
await db.query(`update public.record_versions set data = data || '{"status":"not_yet_competent"}' where id=$1`, [v1.id]);
await db.exec(`alter table public.record_versions enable trigger record_versions_guard`);
const bad = await as(mike, () => tryq(`select public.verify_record_version($1) r`, [v1.id]));
check('verify catches a copy changed behind the guard', bad.rows[0].r.data_ok === false && bad.rows[0].r.copy_ok === true, JSON.stringify(bad.rows[0]));
await db.exec(`alter table public.record_versions disable trigger record_versions_guard`);
await db.query(`update public.record_versions set data = data || '{"status":"certified"}' where id=$1`, [v1.id]);
await db.exec(`alter table public.record_versions enable trigger record_versions_guard`);

// who sees copies
const s1 = await as(benU, () => tryq(`select id from public.record_versions`));
check('the pilot sees their own copy', s1.rows.length === 1);
const s2 = await as(mitchU, () => tryq(`select id from public.record_versions`));
check("another pilot doesn't", s2.rows.length === 0);
const s3 = await as(mitchU, () => tryq(`select public.verify_record_version($1)`, [v1.id]));
check("another pilot can't verify it either", !!s3.error, s3.error);

// the locked record itself still can't be edited
const e1 = await as(mike, () => tryq(`update public.signoff_records set answers='{}' where id=$1`, [id]));
check('the locked sign-off is still read-only, even for the CRP', /locked/.test(e1.error || ''), e1.error);
const e2 = await as(mike, () => tryq(`update public.signoff_records set superseded_by=$1 where id=$1`, [id]));
check("superseded_by can't be set by hand", /locked/.test(e2.error || ''), e2.error);

// corrections
const answers = (await db.query(`select answers from public.signoff_records where id=$1`, [id])).rows[0].answers;
const fixed = { ...answers, licenceNotes: 'RePL 12345', crp: { ...answers.crp, checkDate: '2026-10-31' } };
const c0 = await as(benU, () => tryq(`select public.correct_signoff($1,'typo',$2)`, [id, JSON.stringify(fixed)]));
check('only the CRP corrects', /Only the CRP/.test(c0.error || ''), c0.error);
const c1 = await as(mike, () => tryq(`select public.correct_signoff($1,'  ',$2)`, [id, JSON.stringify(fixed)]));
check('a reason is required', /reason/.test(c1.error || ''), c1.error);
const c2 = await as(mike, () => tryq(`select public.correct_signoff($1,'no change',$2)`, [id, JSON.stringify(answers)]));
check('refused when nothing changed', /Nothing has changed/.test(c2.error || ''), c2.error);
const c3 = await as(mike, () => tryq(`select public.correct_signoff($1,'RePL number typo; check was on the 31st',$2) n`, [id, JSON.stringify(fixed)]));
check('CRP corrects with a reason', c3.rows && c3.rows[0].n, c3.error);
const nid = c3.rows[0].n;
const both = (await db.query(`select id, version, chain_id, supersedes, superseded_by, locked, correction_reason, answers->>'licenceNotes' ln from public.signoff_records where chain_id=$1 order by version`, [id])).rows;
check('the original is kept, unchanged, and points to the new version', both.length === 2 && both[0].ln === 'RePL 1234' && both[0].superseded_by === nid && both[0].locked, JSON.stringify(both));
check('the new version is locked, version 2, with the reason', both[1].version === 2 && both[1].supersedes === id && both[1].locked && both[1].ln === 'RePL 12345' && /typo/.test(both[1].correction_reason), JSON.stringify(both[1]));
const vv = (await db.query(`select version, reason, record_id from public.record_versions where chain_id=$1 order by version`, [id])).rows;
check('a locked copy for each version, numbered 1 and 2', vv.length === 2 && vv[1].version === 2 && vv[1].record_id === nid && /typo/.test(vv[1].reason), JSON.stringify(vv));
const cert = (await db.query(`select signoff_id, check_date::text cd, next_due::text nd from public.certifications where person_id=$1`, [ben])).rows;
check('certifications follow the new version and the corrected check date', cert.length === 1 && cert[0].signoff_id === nid && cert[0].cd === '2026-10-31' && cert[0].nd === '2027-10-31', JSON.stringify(cert));
const c4 = await as(mike, () => tryq(`select public.correct_signoff($1,'again',$2)`, [id, JSON.stringify({ ...fixed, x: 1 })]));
check('only the latest version can be corrected', /latest/.test(c4.error || ''), c4.error);
const au = (await db.query(`select count(*)::int n from public.audit_log where table_name='signoff_records' and row_id in ($1,$2)`, [id, nid])).rows[0].n;
check('the correction is in the audit log', au >= 2, au);

// imported (already locked) sign-offs get a copy too
await as(mike, () => db.query(`insert into public.signoff_records (person_id, type, status, answers, locked) values ($1,'evlos_observer','certified','{"source":"Imported from Google Forms"}',true)`, [mitch]));
const imp = (await db.query(`select count(*)::int n from public.record_versions where person_id=$1`, [mitch])).rows[0].n;
check('an imported, locked sign-off gets its copy', imp === 1, imp);

// job plans
const job = (await as(mike, () => db.query(`insert into public.jobs (op_id, title, plan, status) values ('OP-1','Bridge','{"overview":{"operationName":"Bridge"}}','approved') returning id`))).rows[0].id;
await as(mike, () => db.query(`insert into public.job_crew (job_id, person_id, job_role) values ($1,$2,'rpic')`, [job, ben]));
const j0 = await as(benU, () => tryq(`select public.snapshot_job($1,null,'<html>plan</html>')`, [job]));
check('only the CRP locks a job copy', /Only the CRP/.test(j0.error || ''), j0.error);
const j1 = await as(mike, () => tryq(`select public.snapshot_job($1,null,'<html>plan v1</html>') r`, [job]));
check('CRP locks job copy version 1 with both fingerprints', j1.rows && j1.rows[0].r.version === 1 && j1.rows[0].r.copy_hash && j1.rows[0].r.data_hash, JSON.stringify(j1));
await as(mike, () => db.query(`update public.jobs set plan='{"overview":{"operationName":"Bridge (amended)"}}' where id=$1`, [job]));
const j2 = await as(mike, () => tryq(`select public.snapshot_job($1,'Amended: launch site moved','<html>plan v2</html>') r`, [job]));
check('re-approval after an amendment is version 2 with the reason', j2.rows[0].r.version === 2, JSON.stringify(j2));
const jv = (await db.query(`select version, reason, data->'plan'->'overview'->>'operationName' n from public.record_versions where kind='job' and job_id=$1 order by version`, [job])).rows;
check('both job versions kept as they were', jv[0].n === 'Bridge' && jv[1].n === 'Bridge (amended)' && /launch site/.test(jv[1].reason), JSON.stringify(jv));
const jb = await as(benU, () => tryq(`select version from public.record_versions where kind='job'`));
check('crew on the job can see its copies', jb.rows.length === 2, JSON.stringify(jb));
const jm = await as(mitchU, () => tryq(`select version from public.record_versions where kind='job'`));
check('crew not on the job cannot', jm.rows.length === 0);
const jvf = await as(benU, () => tryq(`select public.verify_record_version(id) r from public.record_versions where kind='job' order by version limit 1`));
check('crew on the job can verify it', jvf.rows[0].r.data_ok && jvf.rows[0].r.copy_ok, JSON.stringify(jvf));
await db.exec('set role anon'); const an = await tryq(`select id from public.record_versions`); await db.exec('reset role');
check('anonymous visitors see nothing', !!an.error || an.rows.length === 0, JSON.stringify(an));
// the observer register lists only the latest version
const ob = (await db.query(`insert into public.signoff_records (person_id, type, status, answers, locked) values ($1,'evlos_observer','certified','{"crp":{"callsign":"Eagle"}}',true) returning id`, [ben])).rows[0].id;
await as(mike, () => db.query(`select public.correct_signoff($1,'callsign typo','{"crp":{"callsign":"Eagle 1"}}')`, [ob]));
const reg = await as(mike, () => tryq(`select callsign from public.observer_register() where person_id=$1`, [ben]));
check('observer register shows only the corrected version', reg.rows.length === 1 && reg.rows[0].callsign === 'Eagle 1', JSON.stringify(reg));
console.log(pass + ' / ' + (pass + fail));
if (fail) process.exit(1);
