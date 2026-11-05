-- ═══ Dream Planner RPA v7.21 · migration 0011_locked_copies_versions.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again. Builds on 0001–0010.
-- Chunk 5 (the rest): when a record locks, the database keeps a copy of it exactly as signed and a fingerprint
-- (SHA-256 hash) of that copy. Corrections are new versions with a reason; the original is kept. Nobody can change
-- or delete a stored copy, and "Verify" re-computes the fingerprint to prove it hasn't changed.
--   • sign-offs (pilot inductions, EVLOS observer sign-offs): copied the moment they lock
--   • job plans: copied each time the CRP approves the plan (version 2+ after an amendment)

-- ── Sign-offs: which version of the record this is ──────────────────────────────────────────────
alter table public.signoff_records add column if not exists chain_id uuid;          -- the first version's id
alter table public.signoff_records add column if not exists version int not null default 1;
alter table public.signoff_records add column if not exists supersedes uuid references public.signoff_records(id) on delete restrict;
alter table public.signoff_records add column if not exists superseded_by uuid references public.signoff_records(id) on delete restrict;
alter table public.signoff_records add column if not exists correction_reason text;
update public.signoff_records set chain_id = id where chain_id is null;

-- ── The locked copies ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.record_versions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('signoff','job')),
  record_id   uuid not null,                  -- the sign-off row (each correction is its own row) or the job
  chain_id    uuid not null,                  -- the same for every version of one record
  person_id   uuid references public.people(id) on delete restrict,
  job_id      uuid references public.jobs(id) on delete restrict,
  version     int not null,
  data        jsonb not null,                 -- the record exactly as locked
  data_hash   text not null,                  -- SHA-256 of data (worked out by the database)
  copy_html   text,                           -- the printable signed copy (print it to PDF)
  copy_hash   text,                           -- SHA-256 of copy_html (worked out by the database)
  reason      text,                           -- why this version exists (a correction or an amendment)
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (kind, chain_id, version)
);
create index if not exists record_versions_record on public.record_versions (kind, record_id);
create index if not exists record_versions_person on public.record_versions (person_id);
create index if not exists record_versions_job on public.record_versions (job_id);

create or replace function public.wd_sha256(t text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(t, ''), 'UTF8')), 'hex') $$;

-- the database works out the version number and both fingerprints; a stored copy can't be changed or deleted
create or replace function public.record_versions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Locked copies are kept permanently and cannot be deleted'; end if;
  if tg_op = 'INSERT' then
    select coalesce(max(version), 0) + 1 into new.version from public.record_versions where kind = new.kind and chain_id = new.chain_id;
    new.data_hash := public.wd_sha256(new.data::text);
    new.copy_hash := case when new.copy_html is null then null else public.wd_sha256(new.copy_html) end;
    new.created_at := now(); new.created_by := auth.uid();
    return new;
  end if;
  -- UPDATE: only adding the printable copy to a version that doesn't have one yet
  if old.copy_html is not null then raise exception 'This locked copy cannot be changed'; end if;
  if (to_jsonb(new) - 'copy_html' - 'copy_hash') is distinct from (to_jsonb(old) - 'copy_html' - 'copy_hash') then
    raise exception 'This locked copy cannot be changed'; end if;
  new.copy_hash := case when new.copy_html is null then null else public.wd_sha256(new.copy_html) end;
  return new;
end $$;
drop trigger if exists record_versions_guard on public.record_versions;
create trigger record_versions_guard before insert or update or delete on public.record_versions for each row execute function public.record_versions_guard();

-- ── Sign-offs: a copy is kept the moment one locks (certified, not yet competent, imported, or a correction) ──
create or replace function public.signoff_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.locked and (tg_op = 'INSERT' or not old.locked) then
    insert into public.record_versions (kind, record_id, chain_id, person_id, job_id, data, reason)
    values ('signoff', new.id, coalesce(new.chain_id, new.id), new.person_id, null,
            to_jsonb(new) - 'updated_at' - 'superseded_by', new.correction_reason);
  end if;
  return new;
end $$;
drop trigger if exists signoff_snapshot on public.signoff_records;
create trigger signoff_snapshot after insert or update on public.signoff_records for each row execute function public.signoff_snapshot();

-- the sign-off guard (from 0002), now also: a new row starts its own chain; a locked row only ever gets
-- "superseded_by" set, and only by the correction function below
create or replace function public.signoff_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.chain_id := coalesce(new.chain_id, new.id);
    if new.supersedes is null then new.version := 1; new.correction_reason := null; end if;
  end if;
  if tg_op = 'UPDATE' and old.locked then
    if current_setting('wd.correcting', true) = 'yes' and public.is_crp() and old.superseded_by is null
       and (to_jsonb(new) - 'superseded_by' - 'updated_at') = (to_jsonb(old) - 'superseded_by' - 'updated_at') then
      return new;
    end if;
    raise exception 'This sign-off is locked. Corrections are made as a new version.';
  end if;
  if tg_op = 'UPDATE' and (new.chain_id is distinct from old.chain_id or new.version is distinct from old.version
     or new.supersedes is distinct from old.supersedes or new.superseded_by is distinct from old.superseded_by) then
    raise exception 'Version details of a sign-off cannot be changed';
  end if;
  if auth.uid() is not null and not public.is_crp() then
    if new.status not in ('draft','awaiting_crp') or new.locked
       or new.crp_signature is not null or new.crp_signed_by is not null or new.crp_signed_at is not null then
      raise exception 'Only the CRP can certify, sign as CRP or lock a sign-off';
    end if;
    if tg_op = 'INSERT' and new.supersedes is not null then raise exception 'Only the CRP can correct a sign-off'; end if;
    if tg_op = 'UPDATE' and old.status <> 'draft' then
      raise exception 'Submitted sign-offs can only be changed by the CRP';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ── Correct a locked sign-off: a new version with the changes and a reason; the original is kept ─────
create or replace function public.correct_signoff(p_id uuid, p_reason text, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.signoff_records; nid uuid; d_old date; d_new date;
begin
  if not public.is_crp() then raise exception 'Only the CRP can correct a sign-off'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for the correction'; end if;
  select * into r from public.signoff_records where id = p_id for update;
  if r.id is null then raise exception 'Sign-off not found'; end if;
  if not r.locked then raise exception 'Only locked sign-offs are corrected as versions (this one can still be edited)'; end if;
  if r.superseded_by is not null then raise exception 'This is not the latest version. Correct the latest one.'; end if;
  if p_answers is null or p_answers = r.answers then raise exception 'Nothing has changed'; end if;
  insert into public.signoff_records (person_id, type, status, answers, person_signature, person_signed_at, crp_signature, crp_signed_by,
      crp_signed_at, manual_version, job_id, locked, chain_id, version, supersedes, correction_reason)
    values (r.person_id, r.type, r.status, p_answers, r.person_signature, r.person_signed_at, r.crp_signature, r.crp_signed_by,
      r.crp_signed_at, r.manual_version, r.job_id, true, r.chain_id, r.version + 1, r.id, trim(p_reason))
    returning id into nid;
  perform set_config('wd.correcting', 'yes', true);
  update public.signoff_records set superseded_by = nid where id = r.id;
  perform set_config('wd.correcting', '', true);
  -- the certifications follow the latest version; a corrected check date moves them (12 months from it)
  d_old := nullif(r.answers->'crp'->>'checkDate', '')::date; d_new := nullif(p_answers->'crp'->>'checkDate', '')::date;
  update public.certifications set signoff_id = nid,
         check_date = case when d_new is not null and d_new is distinct from d_old then d_new else check_date end,
         next_due   = case when d_new is not null and d_new is distinct from d_old then (d_new + interval '12 months')::date else next_due end
   where signoff_id = r.id;
  return nid;
end $$;

-- ── Job plans: the CRP keeps a copy each time the plan is approved (the plan as stored in the cloud) ──
create or replace function public.snapshot_job(p_job_id uuid, p_reason text, p_copy text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j public.jobs; v public.record_versions;
begin
  if not public.is_crp() then raise exception 'Only the CRP can lock a copy of a job plan'; end if;
  select * into j from public.jobs where id = p_job_id;
  if j.id is null then raise exception 'Job not found'; end if;
  insert into public.record_versions (kind, record_id, chain_id, job_id, data, copy_html, reason)
    values ('job', j.id, j.id, j.id, jsonb_build_object('plan', j.plan, 'title', j.title, 'op_id', j.op_id, 'status', j.status, 'job_version', j.version),
            p_copy, nullif(trim(coalesce(p_reason, '')), ''))
    returning * into v;
  return jsonb_build_object('id', v.id, 'version', v.version, 'data_hash', v.data_hash, 'copy_hash', v.copy_hash, 'created_at', v.created_at);
end $$;

-- the CRP adds the printable copy of a sign-off version (made by the planner from the locked data)
create or replace function public.attach_record_copy(p_id uuid, p_html text) returns text
language plpgsql security definer set search_path = public as $$
declare h text;
begin
  if not public.is_crp() then raise exception 'Only the CRP can add a signed copy'; end if;
  if coalesce(p_html, '') = '' then raise exception 'The copy is empty'; end if;
  update public.record_versions set copy_html = p_html where id = p_id and copy_html is null returning copy_hash into h;
  if h is null then raise exception 'This version already has its signed copy'; end if;
  return h;
end $$;

-- Verify: works the fingerprints out again from what is stored and compares them
create or replace function public.verify_record_version(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v public.record_versions;
begin
  select * into v from public.record_versions where id = p_id;
  if v.id is null then raise exception 'Version not found'; end if;
  if not (public.is_crp() or (v.person_id is not null and v.person_id = public.my_person_id())
          or (v.job_id is not null and public.job_role_of(v.job_id) is not null)) then raise exception 'Version not found'; end if;
  return jsonb_build_object('data_ok', public.wd_sha256(v.data::text) = v.data_hash,
    'copy_ok', case when v.copy_html is null then null else public.wd_sha256(v.copy_html) = v.copy_hash end,
    'data_hash', v.data_hash, 'copy_hash', v.copy_hash, 'checked_at', now());
end $$;

-- ── Who can see the copies: the CRP; a person their own; crew on a job that job's ───────────────────
alter table public.record_versions enable row level security;
drop policy if exists "versions: read" on public.record_versions;
create policy "versions: read" on public.record_versions for select to authenticated
  using (public.is_crp() or (person_id is not null and person_id = public.my_person_id())
         or (job_id is not null and public.job_role_of(job_id) is not null));
-- no insert / update / delete policies: copies are only written by the functions and triggers above
revoke all on public.record_versions from anon, authenticated;
grant select on public.record_versions to authenticated;
revoke all on function public.correct_signoff(uuid, text, jsonb), public.snapshot_job(uuid, text, text),
  public.attach_record_copy(uuid, text), public.verify_record_version(uuid) from public, anon;
grant execute on function public.correct_signoff(uuid, text, jsonb), public.snapshot_job(uuid, text, text),
  public.attach_record_copy(uuid, text), public.verify_record_version(uuid) to authenticated;

-- (no audit-log trigger here: the copies can't change, and logging them would store every copy twice)

-- ── Sign-offs locked before this migration: keep their copy now (marked as taken at install) ────────
insert into public.record_versions (kind, record_id, chain_id, person_id, data, reason)
select 'signoff', s.id, coalesce(s.chain_id, s.id), s.person_id, to_jsonb(s) - 'updated_at' - 'superseded_by', 'Copy taken when v7.21 was installed (record locked earlier)'
  from public.signoff_records s
 where s.locked and not exists (select 1 from public.record_versions v where v.kind = 'signoff' and v.record_id = s.id);

-- ── EVLOS observer register (from 0006): list only the latest version of each sign-off ──────────────
create or replace function public.observer_register() returns table (
  signoff_id uuid, person_id uuid, full_name text, phone text, email text, status text, via text, job_title text, job_id uuid,
  signed_at timestamptz, certified_at timestamptz, next_due date, assessor text, callsign text, manual_version text, training boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crp() then raise exception 'Only the CRP can see the observer register'; end if;
  return query
    select s.id, p.id, p.full_name, p.phone, p.email, s.status, s.answers->>'via', j.title, s.job_id, s.person_signed_at, s.crp_signed_at,
      c.next_due, c.assessor, s.answers->'crp'->>'callsign', coalesce(s.answers->>'manualVersion', s.manual_version), coalesce((s.answers->>'training')::boolean, s.job_id is null)
    from public.signoff_records s join public.people p on p.id = s.person_id
    left join public.jobs j on j.id = s.job_id
    left join public.certifications c on c.signoff_id = s.id and c.competency = 'evlos_observer'
    where s.type = 'evlos_observer' and s.superseded_by is null order by p.full_name, s.created_at desc;
end $$;
