-- ═══ Dream Planner RPA v7.7 · migration 0005_chunk4_evlos_observer.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again.
-- Dream Planner RPA — Chunk 4: EVLOS Class 1 observer sign-off
-- Safe to run more than once. Builds on 0001–0004.
--
-- Three ways an observer signs:
--   1. QR / link on their own phone, no login: the CRP makes a one-time link for a job; the observer's part is
--      submitted through submit_observer_signoff(token, …) and waits for the CRP to countersign.
--   2. On the CRP's device (works offline): the observer fills their part, the CRP countersigns straight after;
--      record_observer_signoff(…) saves both at once when the device is online.
--   3. A logged-in observer on the job: reviews the full plan and risk assessment in the planner, then signs
--      with submit_observer_self(job, …).
-- The CRP certifies with certify_observer(…): the record locks and an evlos_observer certification is made (12 months).

-- observers can be certified as EVLOS observers
alter table public.certifications drop constraint if exists certifications_competency_check;
alter table public.certifications add constraint certifications_competency_check
  check (competency in ('induction','evlos','oonp','night','evlos_observer') or competency like 'type:%');

-- ── One-time observer links ─────────────────────────────────────────────────────────────────────
create table if not exists public.observer_tokens (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  uses_left   int not null default 5 check (uses_left >= 0)   -- one link can sign a few observers on the same job
);
alter table public.observer_tokens enable row level security;
drop policy if exists "observer tokens: CRP reads" on public.observer_tokens;
create policy "observer tokens: CRP reads" on public.observer_tokens for select to authenticated using (public.is_crp());
revoke all on public.observer_tokens from anon, authenticated;
grant select on public.observer_tokens to authenticated;

create or replace function public.wd_hash(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(coalesce(t, ''), 'UTF8')), 'hex') $$;

-- the CRP makes a link for a job; the token itself is returned once and only its hash is kept
create or replace function public.create_observer_token(p_job_id uuid, p_days int default 7) returns text
language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.is_crp() then raise exception 'Only the CRP can make observer links'; end if;
  if not exists (select 1 from public.jobs where id = p_job_id) then raise exception 'Job not found: save it first'; end if;
  insert into public.observer_tokens (token_hash, job_id, expires_at) values (public.wd_hash(t), p_job_id, now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))));
  return t;
end $$;

-- what the observer's phone shows (no login): the job, a plan summary and the company name
create or replace function public.get_observer_form(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tk public.observer_tokens; j public.jobs; co jsonb;
begin
  select * into tk from public.observer_tokens where token_hash = public.wd_hash(p_token);
  if tk.id is null then return jsonb_build_object('error', 'This link is not valid.'); end if;
  if tk.expires_at < now() then return jsonb_build_object('error', 'This link has expired. Ask the CRP for a new one.'); end if;
  if tk.uses_left <= 0 then return jsonb_build_object('error', 'This link has already been used. Ask the CRP for a new one.'); end if;
  select * into j from public.jobs where id = tk.job_id;
  select data into co from public.shared_data where area = 'company';
  return jsonb_build_object(
    'job', jsonb_build_object('title', j.title, 'op_id', j.op_id, 'start_date', j.start_date),
    'company', coalesce(co->>'name', ''),
    'overview', jsonb_build_object('location', j.plan->'overview'->'location', 'operationDate', j.plan->'overview'->'operationDate',
       'startTime', j.plan->'overview'->'startTime', 'endTime', j.plan->'overview'->'endTime', 'rpaTypes', j.plan->'overview'->'rpaTypes',
       'rpic', j.plan->'overview'->'rpic', 'maxHeight', coalesce(j.plan->'jsa'->'maxOperatingHeightAgl', j.plan->'overview'->'maxHeightPlanned')),
    'jsa', jsonb_build_object('operationTypes', j.plan->'jsa'->'operationTypes', 'emergencyContacts', j.plan->'jsa'->'emergencyContacts', 'evlosObserver', j.plan->'jsa'->'evlosObserver'),
    'risks', coalesce((select jsonb_agg(jsonb_build_object('hazard', r->'hazard', 'risk', r->'riskDescription',
                         'controls', concat_ws(E'\n', nullif(r->>'existingControls', ''), nullif(r->>'additionalControls', ''), nullif(r->>'controls', ''))))
                       from jsonb_array_elements(case when jsonb_typeof(j.plan->'risks') = 'array' then j.plan->'risks' else '[]'::jsonb end) r
                       where coalesce(r->>'hazard', '') <> ''), '[]'::jsonb));
end $$;

-- the person record for an observer (matched by email, else by name + phone, else new)
create or replace function public.observer_person(p_name text, p_phone text, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; em text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Name is required'; end if;
  if em is not null then select id into pid from public.people where email = em; end if;
  if pid is null and coalesce(trim(p_phone), '') <> '' then
    select id into pid from public.people where lower(full_name) = lower(trim(p_name)) and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g') limit 1;
  end if;
  if pid is null then
    insert into public.people (full_name, role, email, phone) values (trim(p_name), 'observer', em, nullif(trim(coalesce(p_phone, '')), '')) returning id into pid;
  end if;
  return pid;
end $$;
revoke all on function public.observer_person(text, text, text) from public, anon, authenticated;

-- 1. no-login observer submits their part
create or replace function public.submit_observer_signoff(p_token text, p_name text, p_phone text, p_email text, p_answers jsonb, p_signature jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare tk public.observer_tokens; pid uuid; sid uuid;
begin
  select * into tk from public.observer_tokens where token_hash = public.wd_hash(p_token) for update;
  if tk.id is null or tk.expires_at < now() or tk.uses_left <= 0 then raise exception 'This link is not valid any more. Ask the CRP for a new one.'; end if;
  if coalesce((p_answers->>'declaration')::boolean, false) is not true then raise exception 'Tick the observer declaration first'; end if;
  if p_signature is null or (coalesce(p_signature->>'image', '') = '' and coalesce(p_signature->>'typed', '') = '') then raise exception 'Sign first'; end if;
  pid := public.observer_person(p_name, p_phone, p_email);
  insert into public.signoff_records (person_id, type, status, answers, person_signature, person_signed_at, job_id)
    values (pid, 'evlos_observer', 'awaiting_crp', coalesce(p_answers, '{}'::jsonb) || jsonb_build_object('via', 'link', 'name', trim(p_name), 'phone', p_phone), p_signature, now(), tk.job_id)
    returning id into sid;
  update public.observer_tokens set uses_left = uses_left - 1 where id = tk.id;
  return sid;
end $$;

-- 3. a logged-in observer on the job signs their part
create or replace function public.submit_observer_self(p_job_id uuid, p_answers jsonb, p_signature jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid := public.my_person_id(); sid uuid;
begin
  if pid is null then raise exception 'Sign in with an active crew login first'; end if;
  if not exists (select 1 from public.job_crew where job_id = p_job_id and person_id = pid) then raise exception 'You are not on this job'; end if;
  if coalesce((p_answers->>'declaration')::boolean, false) is not true then raise exception 'Tick the observer declaration first'; end if;
  if coalesce((p_answers->>'reviewedPlan')::boolean, false) is not true then raise exception 'Confirm you have reviewed the flight plan and risk assessment'; end if;
  if p_signature is null or (coalesce(p_signature->>'image', '') = '' and coalesce(p_signature->>'typed', '') = '') then raise exception 'Sign first'; end if;
  insert into public.signoff_records (person_id, type, status, answers, person_signature, person_signed_at, job_id)
    values (pid, 'evlos_observer', 'awaiting_crp', coalesce(p_answers, '{}'::jsonb) || jsonb_build_object('via', 'login'), p_signature, now(), p_job_id)
    returning id into sid;
  return sid;
end $$;

-- the CRP certifies (or records not yet competent); the record locks
create or replace function public.certify_observer(p_id uuid, p_result text, p_crp jsonb, p_signature jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r public.signoff_records;
begin
  if not public.is_crp() then raise exception 'Only the CRP can certify an observer'; end if;
  if p_result not in ('certified','not_yet_competent') then raise exception 'Result must be certified or not_yet_competent'; end if;
  select * into r from public.signoff_records where id = p_id for update;
  if r.id is null or r.type <> 'evlos_observer' then raise exception 'Observer sign-off not found'; end if;
  if r.locked then raise exception 'This sign-off is already locked'; end if;
  if r.status <> 'awaiting_crp' then raise exception 'The observer has not signed yet'; end if;
  if coalesce((p_crp->>'crpCertifies')::boolean, false) is not true then raise exception 'Tick the CRP checks first'; end if;
  if p_signature is null or (coalesce(p_signature->>'image', '') = '' and coalesce(p_signature->>'typed', '') = '') then raise exception 'Sign first'; end if;
  update public.signoff_records set status = p_result, answers = answers || jsonb_build_object('crp', p_crp), crp_signature = p_signature,
    crp_signed_by = auth.uid(), crp_signed_at = now(), locked = true where id = p_id;
  if p_result = 'certified' then
    insert into public.certifications (person_id, competency, check_date, next_due, assessor, signoff_id)
      values (r.person_id, 'evlos_observer', current_date, (current_date + interval '12 months')::date, coalesce(p_crp->>'assessor', ''), p_id);
    update public.people set date_last_engaged = current_date where id = r.person_id;
  end if;
end $$;

-- 2. both parts done on the CRP's device (synced when online)
create or replace function public.record_observer_signoff(p_job_id uuid, p_person jsonb, p_answers jsonb, p_person_sig jsonb, p_signed_at timestamptz,
  p_result text, p_crp jsonb, p_crp_sig jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; sid uuid;
begin
  if not public.is_crp() then raise exception 'Only the CRP can record an observer sign-off'; end if;
  if coalesce((p_answers->>'declaration')::boolean, false) is not true then raise exception 'The observer declaration is not ticked'; end if;
  pid := public.observer_person(p_person->>'name', p_person->>'phone', p_person->>'email');
  insert into public.signoff_records (person_id, type, status, answers, person_signature, person_signed_at, job_id)
    values (pid, 'evlos_observer', 'awaiting_crp', coalesce(p_answers, '{}'::jsonb) || jsonb_build_object('via', 'crp-device', 'name', p_person->>'name', 'phone', p_person->>'phone'),
            p_person_sig, coalesce(p_signed_at, now()), p_job_id) returning id into sid;
  perform public.certify_observer(sid, p_result, p_crp, p_crp_sig);
  return sid;
end $$;

revoke all on function public.create_observer_token(uuid, int), public.get_observer_form(text), public.submit_observer_signoff(text, text, text, text, jsonb, jsonb),
  public.submit_observer_self(uuid, jsonb, jsonb), public.certify_observer(uuid, text, jsonb, jsonb),
  public.record_observer_signoff(uuid, jsonb, jsonb, jsonb, timestamptz, text, jsonb, jsonb) from public;
grant execute on function public.get_observer_form(text), public.submit_observer_signoff(text, text, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.create_observer_token(uuid, int), public.submit_observer_self(uuid, jsonb, jsonb), public.certify_observer(uuid, text, jsonb, jsonb),
  public.record_observer_signoff(uuid, jsonb, jsonb, jsonb, timestamptz, text, jsonb, jsonb) to authenticated;
grant execute on function public.wd_hash(text) to anon, authenticated;

drop trigger if exists audit_observer_tokens on public.observer_tokens;
create trigger audit_observer_tokens after insert or update or delete on public.observer_tokens for each row execute function public.audit_row();
