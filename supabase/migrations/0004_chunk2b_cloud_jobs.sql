-- ═══ Dream Planner RPA v7.4 · migration 0004_chunk2b_cloud_jobs.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again.
-- Dream Planner RPA — Chunk 2b: cloud jobs for crew, crew home, access requests
-- Safe to run more than once. Builds on 0001–0003.
--
--   pilot_hours    each person's logged time per aircraft type, published by the CRP's planner
--   access_grants  a crew member asks for an area (fleet, batteries, records, planning); the CRP grants or declines
--   shared_data    read-only snapshots the CRP's planner publishes (company, fleet, batteries, records summary);
--                  crew read an area only once it is granted (company is readable by everyone signed in)
--   jobs / job_crew / job_flights already exist (0002): the planner now fills them.

-- ── Logged time per person and type ──────────────────────────────────────────────────────────────
create table if not exists public.pilot_hours (
  person_id   uuid not null references public.people(id) on delete cascade,
  rpa_type    text not null,
  flights     int not null default 0 check (flights >= 0),
  seconds     int not null default 0 check (seconds >= 0),
  last_flown  timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (person_id, rpa_type)
);
alter table public.pilot_hours enable row level security;
drop policy if exists "hours: own or CRP" on public.pilot_hours;
create policy "hours: own or CRP" on public.pilot_hours for select to authenticated
  using (public.is_crp() or person_id = public.my_person_id());
drop policy if exists "hours: CRP writes" on public.pilot_hours;
create policy "hours: CRP writes" on public.pilot_hours for insert to authenticated with check (public.is_crp());
drop policy if exists "hours: CRP updates" on public.pilot_hours;
create policy "hours: CRP updates" on public.pilot_hours for update to authenticated using (public.is_crp()) with check (public.is_crp());
drop policy if exists "hours: CRP removes" on public.pilot_hours;
create policy "hours: CRP removes" on public.pilot_hours for delete to authenticated using (public.is_crp());
revoke all on public.pilot_hours from anon;
grant select, insert, update, delete on public.pilot_hours to authenticated;

-- ── Access requests and grants ───────────────────────────────────────────────────────────────────
create table if not exists public.access_grants (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.people(id) on delete cascade,
  area          text not null check (area in ('fleet','batteries','records','planning')),
  status        text not null default 'requested' check (status in ('requested','granted','declined','revoked')),
  note          text,
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references auth.users(id) on delete set null,
  unique (person_id, area)
);
alter table public.access_grants enable row level security;
drop policy if exists "grants: own or CRP read" on public.access_grants;
create policy "grants: own or CRP read" on public.access_grants for select to authenticated
  using (public.is_crp() or person_id = public.my_person_id());
-- no direct writes: the two functions below are the only way in
revoke all on public.access_grants from anon;
grant select on public.access_grants to authenticated;

create or replace function public.has_access(p_area text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_crp() or exists (select 1 from public.access_grants g
    where g.person_id = public.my_person_id() and g.area = p_area and g.status = 'granted');
$$;

-- a crew member asks (or asks again) for an area
create or replace function public.request_access(p_area text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid := public.my_person_id(); gid uuid;
begin
  if pid is null then raise exception 'Sign in with an active crew login first'; end if;
  if p_area not in ('fleet','batteries','records','planning') then raise exception 'Unknown area %', p_area; end if;
  insert into public.access_grants (person_id, area, status, note, requested_at, decided_at, decided_by)
    values (pid, p_area, 'requested', left(coalesce(p_note, ''), 300), now(), null, null)
  on conflict (person_id, area) do update
    set status = case when public.access_grants.status = 'granted' then 'granted' else 'requested' end,
        note = excluded.note, requested_at = now(),
        decided_at = case when public.access_grants.status = 'granted' then public.access_grants.decided_at else null end
  returning id into gid;
  return gid;
end $$;

-- the CRP grants, declines or revokes
create or replace function public.decide_access(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crp() then raise exception 'Only the CRP can decide access'; end if;
  if p_status not in ('granted','declined','revoked') then raise exception 'Status must be granted, declined or revoked'; end if;
  update public.access_grants set status = p_status, decided_at = now(), decided_by = auth.uid() where id = p_id;
  if not found then raise exception 'Request not found'; end if;
end $$;
revoke all on function public.request_access(text, text) from public, anon;
revoke all on function public.decide_access(uuid, text) from public, anon;
grant execute on function public.request_access(text, text) to authenticated;
grant execute on function public.decide_access(uuid, text) to authenticated;
grant execute on function public.has_access(text) to authenticated;

-- ── Read-only snapshots from the CRP's planner ───────────────────────────────────────────────────
create table if not exists public.shared_data (
  area        text primary key check (area in ('company','fleet','batteries','records')),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.shared_data enable row level security;
drop policy if exists "shared: company for crew, areas by grant" on public.shared_data;
create policy "shared: company for crew, areas by grant" on public.shared_data for select to authenticated
  using (public.is_crp() or (public.my_role() is not null and (area = 'company' or public.has_access(area))));
drop policy if exists "shared: CRP writes" on public.shared_data;
create policy "shared: CRP writes" on public.shared_data for insert to authenticated with check (public.is_crp());
drop policy if exists "shared: CRP updates" on public.shared_data;
create policy "shared: CRP updates" on public.shared_data for update to authenticated using (public.is_crp()) with check (public.is_crp());
revoke all on public.shared_data from anon;
grant select, insert, update on public.shared_data to authenticated;

-- ── Crew can see who else is on their job (names and roles only) ─────────────────────────────────
-- job_crew_list(j) from 0002 already returns that; make sure crew can call it.
grant execute on function public.job_crew_list(uuid) to authenticated;

-- audit trail for the new tables
drop trigger if exists audit_access_grants on public.access_grants;
create trigger audit_access_grants after insert or update or delete on public.access_grants for each row execute function public.audit_row();
