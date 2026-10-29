import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
let pass = 0, fail = 0;
const check = (n, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n, info); };
// ── stand-in for Supabase's auth schema and roles ──
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
let sql = readFileSync(new URL('../migrations/0001_chunk1_auth_roles.sql', import.meta.url), 'utf8').replace(/CHANGE-ME@example\.com/g, 'mike@wakingdreamfpv.com');
await db.exec(sql);
await db.exec(sql); // re-runnable
check('migration runs twice cleanly', true);
const newUser = async (email, meta = {}) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])).rows[0].id;
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } };
const tryq = async (q, p) => { try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { error: e.message }; } };

const mike = await newUser('Mike@WakingDreamFPV.com');
const p1 = (await db.query(`select * from public.profiles where id=$1`, [mike])).rows[0];
check('bootstrap CRP: invited email becomes active CRP (case-insensitive)', p1.role === 'crp' && p1.active, JSON.stringify(p1));

// CRP invites a pilot (as the edge function would, via invites table)
await as(mike, () => db.query(`insert into public.invites (email, full_name, role, invited_by) values ('pilot@test.com','Test Pilot','pilot',$1)`, [mike]));
const pilot = await newUser('pilot@test.com', { full_name: 'ignored', role: 'crp' });
const pp = (await db.query(`select * from public.profiles where id=$1`, [pilot])).rows[0];
check('invited pilot gets pilot role from invite, not from their own metadata', pp.role === 'pilot' && pp.active && pp.full_name === 'Test Pilot', JSON.stringify(pp));
await db.query(`insert into public.invites (email, full_name, role) values ('obs@test.com','Obs One','observer')`);
const obs = await newUser('obs@test.com');
const stranger = await newUser('random@hacker.com', { role: 'crp' });
const sp = (await db.query(`select * from public.profiles where id=$1`, [stranger])).rows[0];
check('uninvited sign-up is inactive with no CRP rights', !sp.active && sp.role === 'pilot');

// visibility
const pv = await as(pilot, () => tryq(`select email from public.profiles order by email`));
check('pilot sees only their own profile', pv.rows && pv.rows.length === 1 && pv.rows[0].email === 'pilot@test.com', JSON.stringify(pv));
const cv = await as(mike, () => tryq(`select email from public.profiles order by email`));
check('CRP sees everyone', cv.rows && cv.rows.length === 4, JSON.stringify(cv.rows?.map(r => r.email)));
const pi = await as(pilot, () => tryq(`select * from public.invites`));
check('pilot cannot see invites', pi.rows && pi.rows.length === 0, JSON.stringify(pi));
const si = await as(stranger, () => tryq(`select * from public.profiles where id <> $1`, [stranger]));
check('inactive stranger sees nobody else', si.rows && si.rows.length === 0);

// edits
const e1 = await as(pilot, () => tryq(`update public.profiles set full_name='Pilot Renamed' where id=$1 returning full_name`, [pilot]));
check('pilot can edit own name', e1.rows && e1.rows[0]?.full_name === 'Pilot Renamed', JSON.stringify(e1));
const e2 = await as(pilot, () => tryq(`update public.profiles set role='crp' where id=$1`, [pilot]));
check('pilot cannot promote themselves', !!e2.error, e2.error);
const e3 = await as(pilot, () => tryq(`update public.profiles set full_name='hacked' where id=$1 returning id`, [obs]));
check("pilot cannot edit someone else's profile", e3.rows && e3.rows.length === 0, JSON.stringify(e3));
const e4 = await as(pilot, () => tryq(`insert into public.invites (email, role) values ('x@y.com','crp')`));
check('pilot cannot create invites', !!e4.error, e4.error);
const e5 = await as(stranger, () => tryq(`update public.profiles set active=true where id=$1`, [stranger]));
check('stranger cannot activate themselves', !!e5.error || (e5.rows && e5.rows.length === 0), JSON.stringify(e5));
const e6 = await as(mike, () => tryq(`update public.profiles set role='observer' where id=$1 returning role`, [pilot]));
check('CRP can change a role', e6.rows && e6.rows[0]?.role === 'observer', JSON.stringify(e6));
const e7 = await as(mike, () => tryq(`update public.profiles set active=false where id=$1 returning active`, [mike]));
check('CRP cannot lock themselves out', !!e7.error, e7.error);
const e8 = await as(pilot, () => tryq(`delete from public.profiles where id=$1`, [pilot]));
check('nobody can delete profiles', !!e8.error || (e8.rows && e8.rows.length === 0), JSON.stringify(e8));
const e9 = await as(pilot, () => tryq(`select public.is_crp() as c`));
check('is_crp() false for pilot', e9.rows && e9.rows[0].c === false);
// anon
await db.exec(`set role anon;`); const an = await tryq(`select * from public.profiles`); await db.exec(`reset role;`);
check('signed-out (anon) cannot read profiles', !!an.error, an.error);
console.log(`${pass} / ${pass + fail}`);
