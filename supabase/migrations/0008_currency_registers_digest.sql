-- ═══ Dream Planner RPA v7.11 · migration 0008_currency_registers_digest.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again.
-- Dream Planner RPA v7.11 — Chunks 7 & 8: crew currency, registers, flight counts, and email notifications
-- (weekly / fortnightly compliance digest, expiry alerts, per-event email settings). Safe to run more than once. Builds on 0001–0007.

-- ── Flight counts: one row per qualifying flight, never counted twice ──────────────────────────────
create unique index if not exists flight_counts_ref_key on public.flight_counts (person_id, competency, flight_ref);

-- The CRP's planner sends each completed flight (pilot, date, aircraft type, EVLOS / OONP / night) as it syncs
create or replace function public.record_flight_counts(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; k int;
begin
  if not public.is_crp() then raise exception 'Only the CRP can record flights for currency'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if coalesce(r->>'person_id', '') = '' or coalesce(r->>'competency', '') = '' or coalesce(r->>'flight_ref', '') = '' or coalesce(r->>'flight_date', '') = '' then continue; end if;
    if not exists (select 1 from public.people where id = (r->>'person_id')::uuid) then continue; end if;
    insert into public.flight_counts (person_id, competency, flight_date, job_id, flight_ref)
      values ((r->>'person_id')::uuid, r->>'competency', (r->>'flight_date')::date, nullif(r->>'job_id', '')::uuid, r->>'flight_ref')
      on conflict (person_id, competency, flight_ref) do nothing;
    get diagnostics k = row_count; n := n + k;
  end loop;
  return n;
end $$;

-- ── Currency (Ops manual): a check is valid for 12 months, or for up to 24 months while the person has flown at least
-- 3 flights of that kind in EACH 12-month period (the year after the check, and the latest 12 months). Applies to
-- EVLOS, OONP, night and aircraft types. Induction and EVLOS observer use the due date set when they were certified.
create or replace function public._currency_all() returns table (
  person_id uuid, full_name text, role text, email text, user_id uuid, active boolean, competency text, check_date date, due date,
  status text, flights_recent int, flights_first int, extended boolean, assessor text, cert_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare r record; f_first int; f_recent int; third date; base date; ext date; d date; recency boolean;
begin
  for r in
    select distinct on (c.person_id, c.competency) c.id cid, c.person_id pid, c.competency comp, c.check_date cd, c.next_due nd, c.assessor ass,
           p.full_name fn, p.role rl, p.email em, p.user_id uid, p.active act
      from public.certifications c join public.people p on p.id = c.person_id
     order by c.person_id, c.competency, c.check_date desc, c.created_at desc
  loop
    recency := r.comp in ('evlos', 'oonp', 'night') or r.comp like 'type:%';
    select count(*) into f_first from public.flight_counts fc where fc.person_id = r.pid and fc.competency = r.comp
       and fc.flight_date >= r.cd and fc.flight_date < (r.cd + interval '12 months')::date;
    select count(*) into f_recent from public.flight_counts fc where fc.person_id = r.pid and fc.competency = r.comp
       and fc.flight_date >= r.cd and fc.flight_date > (current_date - interval '12 months')::date;
    third := null; ext := null;
    if recency then
      base := (r.cd + interval '12 months')::date; d := base;
      if f_first >= 3 then
        select fc.flight_date into third from public.flight_counts fc where fc.person_id = r.pid and fc.competency = r.comp and fc.flight_date >= r.cd
          order by fc.flight_date desc offset 2 limit 1;
        if third is not null then ext := least((r.cd + interval '24 months')::date, (third + interval '12 months')::date); if ext > base then d := ext; end if; end if;
      end if;
    else
      d := r.nd;
    end if;
    person_id := r.pid; full_name := r.fn; role := r.rl; email := r.em; user_id := r.uid; active := r.act; competency := r.comp; check_date := r.cd; due := d;
    status := case when d is null then 'current' when d < current_date then 'expired' when d <= current_date + 60 then 'due_soon' else 'current' end;
    flights_recent := f_recent; flights_first := f_first; extended := coalesce(ext > base, false); assessor := r.ass; cert_id := r.cid;
    return next;
  end loop;
end $$;
revoke all on function public._currency_all() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant execute on function public._currency_all() to service_role'; end if;
end $$;

-- The CRP sees everyone; crew see their own
create or replace function public.crew_currency() returns table (
  person_id uuid, full_name text, role text, email text, user_id uuid, active boolean, competency text, check_date date, due date,
  status text, flights_recent int, flights_first int, extended boolean, assessor text, cert_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_person_id();
begin
  if public.is_crp() then return query select * from public._currency_all();
  elsif me is not null then return query select * from public._currency_all() a where a.person_id = me;
  end if;
end $$;
revoke all on function public.crew_currency(), public.record_flight_counts(jsonb) from public;
grant execute on function public.crew_currency(), public.record_flight_counts(jsonb) to authenticated;

-- CRP records a recurrent check from the registers (same 12-month due date as a certified induction)
create or replace function public.record_check(p_person uuid, p_competency text, p_check_date date, p_assessor text, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  if not public.is_crp() then raise exception 'Only the CRP can record a check'; end if;
  if p_check_date is null or p_check_date > current_date then raise exception 'Enter the date of the check (not in the future)'; end if;
  insert into public.certifications (person_id, competency, check_date, next_due, assessor)
    values (p_person, p_competency, p_check_date, (p_check_date + interval '12 months')::date, coalesce(nullif(trim(p_assessor), ''), 'CRP'))
    returning certifications.id into id;
  update public.people set date_last_engaged = greatest(coalesce(date_last_engaged, p_check_date), p_check_date) where people.id = p_person;
  return id;
end $$;
revoke all on function public.record_check(uuid, text, date, text, text) from public;
grant execute on function public.record_check(uuid, text, date, text, text) to authenticated;

-- ── Email notification settings (each login sets their own) ──────────────────────────────────────
create table if not exists public.notification_prefs (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  digest         text not null default 'weekly' check (digest in ('weekly', 'fortnightly', 'off')),
  digest_day     int  not null default 1 check (digest_day between 1 and 7),   -- 1 = Monday (ISO)
  expiry_alerts  boolean not null default true,                                 -- an extra email 7 days before something expires
  events         jsonb not null default '{}'::jsonb,                            -- { "rpic_signed": false, ... } turns that email off
  updated_at     timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
drop policy if exists "prefs: own" on public.notification_prefs;
create policy "prefs: own" on public.notification_prefs for select to authenticated using (user_id = auth.uid() or public.is_crp());
drop policy if exists "prefs: insert own" on public.notification_prefs;
create policy "prefs: insert own" on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "prefs: update own" on public.notification_prefs;
create policy "prefs: update own" on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.notification_prefs to authenticated;

-- what has been emailed (so a digest or an alert is never sent twice)
create table if not exists public.notification_log (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users(id) on delete cascade,
  kind     text not null,
  ref      text not null,
  sent_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
);
alter table public.notification_log enable row level security;
drop policy if exists "log: own" on public.notification_log;
create policy "log: own" on public.notification_log for select to authenticated using (user_id = auth.uid() or public.is_crp());
grant select on public.notification_log to authenticated;

-- ── Daily run of the digest function (07:30 Brisbane). Needs the pg_cron and pg_net extensions; skipped if they can't load.
do $$ begin
  begin
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
  exception when others then raise notice 'pg_cron / pg_net not available: schedule the digest from Integrations › Cron instead'; return;
  end;
  begin
    perform cron.unschedule('wd-digest');
  exception when others then null;
  end;
  perform cron.schedule('wd-digest', '30 21 * * *',
    $cron$ select net.http_post(url := 'https://jirvugtgclgdbysrfjsc.supabase.co/functions/v1/digest',
             headers := '{"Content-Type":"application/json"}'::jsonb, body := '{"mode":"cron"}'::jsonb) $cron$);
exception when others then raise notice 'Could not schedule the digest: %', sqlerrm;
end $$;

-- ── The CRP's compliance calendar (expiries, tasks, registrations) and setup to-dos, for the digest (CRP-only area) ──
alter table public.shared_data drop constraint if exists shared_data_area_check;
alter table public.shared_data add constraint shared_data_area_check check (area in ('company','fleet','batteries','records','compliance'));
