-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Dream Planner RPA — Chunk 2: crew & job data model, row-level security, audit log
-- Run in Supabase › SQL Editor AFTER 0001 (safe to re-run).
--
-- Who sees what
--   CRP ............ everything
--   Pilot/observer . their own person record, experience, sign-offs, certifications and flight counts;
--                    jobs they are assigned to (plan read-only); flight log of those jobs:
--                      pilots/RPIC see the whole job's log, observers see their own entries;
--                    everyone adds and edits only their own flights.
--   Nobody ......... deletes records (7-year retention); locked sign-offs can't be changed;
--                    the audit log is written only by the database.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── People: everyone you fly with. A login (user_id) is optional. ─────────────────────────────
create table if not exists public.people (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid unique references auth.users(id) on delete set null,
  full_name          text not null,
  role               text not null default 'pilot' check (role in ('crp','pilot','observer')),
  email              text check (email is null or (email = lower(email) and position('@' in email) > 1)),
  phone              text,
  address            text,
  arn                text,
  repl_no            text,
  nok_name           text,
  nok_relationship   text,
  nok_phone          text,
  total_hours        numeric(8,1) check (total_hours is null or total_hours >= 0),
  medical_expiry     date,
  training_expiry    date,
  active             boolean not null default true,
  date_last_engaged  date,
  notes              text,
  local_key          text,            -- name of the matching entry in the planner's local crew list
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists people_email_key on public.people (email) where email is not null;

-- Hours per RPA type (fleet names from the planner's fleet database)
create table if not exists public.experience (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete restrict,
  rpa_type    text not null,
  hours       numeric(8,1) not null default 0 check (hours >= 0),
  updated_at  timestamptz not null default now(),
  unique (person_id, rpa_type)
);

-- Induction / observer sign-offs (filled in by Chunks 3–5)
create table if not exists public.signoff_records (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null references public.people(id) on delete restrict,
  type              text not null check (type in ('pilot_induction','evlos_observer')),
  status            text not null default 'draft' check (status in ('draft','awaiting_crp','certified','not_yet_competent')),
  answers           jsonb not null default '{}'::jsonb,
  person_signature  jsonb,          -- { image | typed, name }
  person_signed_at  timestamptz,
  crp_signature     jsonb,
  crp_signed_by     uuid references auth.users(id) on delete set null,
  crp_signed_at     timestamptz,
  manual_version    text,
  job_id            uuid,           -- observer sign-offs are tied to a job
  locked            boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Competencies with check / next-due dates (registers in Chunk 7)
create table if not exists public.certifications (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete restrict,
  competency  text not null check (competency in ('induction','evlos','oonp','night') or competency like 'type:%'),
  check_date  date not null,
  next_due    date,
  assessor    text,
  signoff_id  uuid references public.signoff_records(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- One row per qualifying flight, for the "3 flights in each 12-month period" rule
create table if not exists public.flight_counts (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people(id) on delete restrict,
  competency   text not null,
  flight_date  date not null,
  job_id       uuid,
  flight_ref   text,
  created_at   timestamptz not null default now()
);

-- Protected manual viewer (Chunk 6)
create table if not exists public.document_access_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete set null,
  document    text not null,
  doc_version text,
  page        int,
  opened_at   timestamptz not null default now(),
  duration_s  int check (duration_s is null or duration_s >= 0)
);

-- ── Jobs in the cloud ───────────────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  plan_uid    text unique,                 -- overview.uid from the planner
  op_id       text,                        -- OP-2026-0012
  title       text not null default '',
  start_date  date,
  end_date    date,
  status      text not null default 'draft' check (status in ('draft','approved','completed','cancelled')),
  plan        jsonb not null default '{}'::jsonb,   -- the whole plan as the planner saves it (no flight log)
  version     int not null default 1,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.job_crew (
  job_id     uuid not null references public.jobs(id) on delete restrict,
  person_id  uuid not null references public.people(id) on delete restrict,
  job_role   text not null check (job_role in ('rpic','pilot','observer')),
  added_at   timestamptz not null default now(),
  primary key (job_id, person_id)
);

create table if not exists public.job_flights (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete restrict,
  person_id   uuid not null references public.people(id) on delete restrict,   -- who logged it
  rpa         text,
  flight      jsonb not null default '{}'::jsonb,   -- the planner's flight object (label, duration, segments, telemetry…)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists job_flights_job on public.job_flights (job_id);

-- ── Helpers (security definer: they read through RLS safely) ──────────────────────────────────
create or replace function public.my_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.people p join public.profiles pr on pr.id = p.user_id
  where p.user_id = auth.uid() and pr.active and p.active;
$$;

create or replace function public.job_role_of(j uuid) returns text
language sql stable security definer set search_path = public as $$
  select jc.job_role from public.job_crew jc where jc.job_id = j and jc.person_id = public.my_person_id();
$$;

-- Crew names and roles for a job, for people on that job (others' contact details stay private)
create or replace function public.job_crew_list(j uuid)
returns table (person_id uuid, full_name text, job_role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, jc.job_role from public.job_crew jc join public.people p on p.id = jc.person_id
  where jc.job_id = j and (public.is_crp() or public.job_role_of(j) is not null)
  order by case jc.job_role when 'rpic' then 0 when 'pilot' then 1 else 2 end, p.full_name;
$$;

-- ── Link logins to people: a new (or newly activated) login joins the person with the same email ─
create or replace function public.link_person() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.active then return new; end if;
  update public.people set user_id = new.id, updated_at = now()
   where user_id is null and email = lower(new.email);
  if not exists (select 1 from public.people where user_id = new.id) then
    insert into public.people (user_id, full_name, role, email)
    values (new.id, coalesce(nullif(new.full_name, ''), split_part(new.email, '@', 1)), new.role, lower(new.email))
    on conflict do nothing;
  end if;
  update public.people set role = new.role where user_id = new.id and role is distinct from new.role;
  return new;
end $$;

drop trigger if exists profiles_link_person on public.profiles;
create trigger profiles_link_person after insert or update of active, role on public.profiles
  for each row execute function public.link_person();

-- Existing logins from Chunk 1 get a person record now
insert into public.people (user_id, full_name, role, email)
select pr.id, coalesce(nullif(pr.full_name, ''), split_part(pr.email, '@', 1)), pr.role, lower(pr.email)
from public.profiles pr
where pr.active and not exists (select 1 from public.people p where p.user_id = pr.id or p.email = lower(pr.email))
on conflict do nothing;
update public.people p set user_id = pr.id
from public.profiles pr where p.user_id is null and pr.active and p.email = lower(pr.email);

-- ── Guards ───────────────────────────────────────────────────────────────────────────────────────
-- Crew may edit their own contact, licence, next-of-kin and hours; never role, status, login link or dates the CRP keeps.
create or replace function public.people_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_crp() then
    if new.role is distinct from old.role or new.active is distinct from old.active
       or new.user_id is distinct from old.user_id or new.email is distinct from old.email
       or new.date_last_engaged is distinct from old.date_last_engaged
       or new.medical_expiry is distinct from old.medical_expiry or new.training_expiry is distinct from old.training_expiry
       or new.notes is distinct from old.notes or new.local_key is distinct from old.local_key then
      raise exception 'Only the CRP can change role, status, email, currency dates or notes';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists people_guard on public.people;
create trigger people_guard before update on public.people for each row execute function public.people_guard();

-- Sign-offs: locked records never change; crew can't certify themselves or touch the CRP's part.
create or replace function public.signoff_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.locked then
    raise exception 'This sign-off is locked. Corrections are made as a new version.';
  end if;
  if auth.uid() is not null and not public.is_crp() then
    if new.status not in ('draft','awaiting_crp') or new.locked
       or new.crp_signature is not null or new.crp_signed_by is not null or new.crp_signed_at is not null then
      raise exception 'Only the CRP can certify, sign as CRP or lock a sign-off';
    end if;
    if tg_op = 'UPDATE' and old.status <> 'draft' then
      raise exception 'Submitted sign-offs can only be changed by the CRP';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists signoff_guard on public.signoff_records;
create trigger signoff_guard before insert or update on public.signoff_records for each row execute function public.signoff_guard();

-- Flights: the logger can't be swapped to someone else; completed jobs only change through the CRP.
create or replace function public.job_flights_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_crp() then
    if tg_op = 'UPDATE' and (new.person_id is distinct from old.person_id or new.job_id is distinct from old.job_id) then
      raise exception 'A flight stays with the person and job it was logged on';
    end if;
    if exists (select 1 from public.jobs where id = new.job_id and status in ('completed','cancelled')) then
      raise exception 'This job is closed. Ask the CRP to reopen it to change flights.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists job_flights_guard on public.job_flights;
create trigger job_flights_guard before insert or update on public.job_flights for each row execute function public.job_flights_guard();

create or replace function public.touch_updated() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated();
drop trigger if exists experience_touch on public.experience;
create trigger experience_touch before update on public.experience for each row execute function public.touch_updated();

-- ── Audit log: who changed what, when, before and after (written only by these triggers) ───────
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  table_name  text not null,
  row_id      text,
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  before      jsonb,
  after       jsonb
);
create index if not exists audit_log_row on public.audit_log (table_name, row_id);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare b jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
        a jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
        rid text := coalesce(a->>'id', b->>'id', concat_ws('/', coalesce(a,b)->>'job_id', coalesce(a,b)->>'person_id'));
begin
  if tg_op = 'UPDATE' and b - 'updated_at' = a - 'updated_at' then return new; end if;   -- nothing really changed
  insert into public.audit_log (actor, table_name, row_id, action, before, after)
  values (auth.uid(), tg_table_name, rid, tg_op, b, a);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['people','experience','signoff_records','certifications','flight_counts','jobs','job_crew','job_flights'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ── Row-level security ─────────────────────────────────────────────────────────────────────────
alter table public.people              enable row level security;
alter table public.experience          enable row level security;
alter table public.signoff_records     enable row level security;
alter table public.certifications      enable row level security;
alter table public.flight_counts       enable row level security;
alter table public.document_access_log enable row level security;
alter table public.audit_log           enable row level security;
alter table public.jobs                enable row level security;
alter table public.job_crew            enable row level security;
alter table public.job_flights         enable row level security;

-- people
drop policy if exists "people: own or CRP" on public.people;
create policy "people: own or CRP" on public.people for select to authenticated
  using (public.is_crp() or id = public.my_person_id());
drop policy if exists "people: CRP adds" on public.people;
create policy "people: CRP adds" on public.people for insert to authenticated with check (public.is_crp());
drop policy if exists "people: own details or CRP" on public.people;
create policy "people: own details or CRP" on public.people for update to authenticated
  using (public.is_crp() or id = public.my_person_id()) with check (public.is_crp() or id = public.my_person_id());

-- experience (crew keep their own hours)
drop policy if exists "experience: own or CRP" on public.experience;
create policy "experience: own or CRP" on public.experience for all to authenticated
  using (public.is_crp() or person_id = public.my_person_id())
  with check (public.is_crp() or person_id = public.my_person_id());

-- sign-offs
drop policy if exists "signoffs: read own or CRP" on public.signoff_records;
create policy "signoffs: read own or CRP" on public.signoff_records for select to authenticated
  using (public.is_crp() or person_id = public.my_person_id());
drop policy if exists "signoffs: start own or CRP" on public.signoff_records;
create policy "signoffs: start own or CRP" on public.signoff_records for insert to authenticated
  with check (public.is_crp() or person_id = public.my_person_id());
drop policy if exists "signoffs: edit own or CRP" on public.signoff_records;
create policy "signoffs: edit own or CRP" on public.signoff_records for update to authenticated
  using (public.is_crp() or person_id = public.my_person_id())
  with check (public.is_crp() or person_id = public.my_person_id());

-- certifications and flight counts: CRP writes, crew read their own
drop policy if exists "certs: read own or CRP" on public.certifications;
create policy "certs: read own or CRP" on public.certifications for select to authenticated
  using (public.is_crp() or person_id = public.my_person_id());
drop policy if exists "certs: CRP writes" on public.certifications;
create policy "certs: CRP writes" on public.certifications for insert to authenticated with check (public.is_crp());
drop policy if exists "certs: CRP updates" on public.certifications;
create policy "certs: CRP updates" on public.certifications for update to authenticated using (public.is_crp()) with check (public.is_crp());

drop policy if exists "counts: read own or CRP" on public.flight_counts;
create policy "counts: read own or CRP" on public.flight_counts for select to authenticated
  using (public.is_crp() or person_id = public.my_person_id());
drop policy if exists "counts: CRP writes" on public.flight_counts;
create policy "counts: CRP writes" on public.flight_counts for insert to authenticated with check (public.is_crp());

-- document access log: everyone records their own views; only the CRP reads the report
drop policy if exists "doclog: add own" on public.document_access_log;
create policy "doclog: add own" on public.document_access_log for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "doclog: CRP reads" on public.document_access_log;
create policy "doclog: CRP reads" on public.document_access_log for select to authenticated using (public.is_crp());

-- audit log: CRP reads; no one writes directly
drop policy if exists "audit: CRP reads" on public.audit_log;
create policy "audit: CRP reads" on public.audit_log for select to authenticated using (public.is_crp());

-- jobs: CRP manages; crew read only jobs they're on
drop policy if exists "jobs: CRP or assigned crew read" on public.jobs;
create policy "jobs: CRP or assigned crew read" on public.jobs for select to authenticated
  using (public.is_crp() or public.job_role_of(id) is not null);
drop policy if exists "jobs: CRP adds" on public.jobs;
create policy "jobs: CRP adds" on public.jobs for insert to authenticated with check (public.is_crp());
drop policy if exists "jobs: CRP edits" on public.jobs;
create policy "jobs: CRP edits" on public.jobs for update to authenticated using (public.is_crp()) with check (public.is_crp());

drop policy if exists "job_crew: CRP or own row" on public.job_crew;
create policy "job_crew: CRP or own row" on public.job_crew for select to authenticated
  using (public.is_crp() or person_id = public.my_person_id());
drop policy if exists "job_crew: CRP adds" on public.job_crew;
create policy "job_crew: CRP adds" on public.job_crew for insert to authenticated with check (public.is_crp());
drop policy if exists "job_crew: CRP changes" on public.job_crew;
create policy "job_crew: CRP changes" on public.job_crew for update to authenticated using (public.is_crp()) with check (public.is_crp());
drop policy if exists "job_crew: CRP removes" on public.job_crew;
create policy "job_crew: CRP removes" on public.job_crew for delete to authenticated using (public.is_crp());

-- flights: pilots/RPIC on the job see the whole log, observers their own; everyone logs only as themselves
drop policy if exists "flights: read" on public.job_flights;
create policy "flights: read" on public.job_flights for select to authenticated
  using (public.is_crp() or public.job_role_of(job_id) in ('rpic','pilot') or person_id = public.my_person_id());
drop policy if exists "flights: log own on my jobs" on public.job_flights;
create policy "flights: log own on my jobs" on public.job_flights for insert to authenticated
  with check (public.is_crp() or (person_id = public.my_person_id() and public.job_role_of(job_id) is not null));
drop policy if exists "flights: edit own" on public.job_flights;
create policy "flights: edit own" on public.job_flights for update to authenticated
  using (public.is_crp() or (person_id = public.my_person_id() and public.job_role_of(job_id) is not null))
  with check (public.is_crp() or (person_id = public.my_person_id() and public.job_role_of(job_id) is not null));

-- Table privileges (RLS above decides the rows). No deletes except crew assignments.
revoke all on public.people, public.experience, public.signoff_records, public.certifications, public.flight_counts,
  public.document_access_log, public.audit_log, public.jobs, public.job_crew, public.job_flights from anon;
grant select, insert, update on public.people, public.experience, public.signoff_records, public.certifications,
  public.flight_counts, public.jobs, public.job_flights to authenticated;
grant select, insert, update, delete on public.job_crew to authenticated;
grant select, insert on public.document_access_log to authenticated;
grant select on public.audit_log to authenticated;
grant execute on function public.my_person_id(), public.job_role_of(uuid), public.job_crew_list(uuid) to authenticated;

-- ── Seed: a test pilot and observer (no logins), for the acceptance check ────────────────────
insert into public.people (full_name, role, email, arn, phone, notes)
values ('Test Pilot (seed)', 'pilot', 'test.pilot@example.com', '0000001', '0400 000 001', 'Seed record from Chunk 2 — safe to deactivate'),
       ('Test Observer (seed)', 'observer', 'test.observer@example.com', null, '0400 000 002', 'Seed record from Chunk 2 — safe to deactivate')
on conflict do nothing;
