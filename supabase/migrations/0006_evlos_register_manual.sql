-- ═══ Dream Planner RPA v7.8 · migration 0006_evlos_register_manual.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again.
-- Dream Planner RPA — EVLOS observer register (training without a job), job links for crew without a login,
-- and the protected Operations Manual (read-only, logged). Safe to run more than once. Builds on 0001–0005.

-- ── Observer links: a job is optional (training / assessment sessions), and a link can carry the person ──
alter table public.observer_tokens alter column job_id drop not null;
alter table public.observer_tokens add column if not exists label text;          -- e.g. the observer's name the link was sent to
alter table public.signoff_records add column if not exists source_token uuid references public.observer_tokens(id) on delete set null;

create or replace function public.create_observer_token(p_job_id uuid, p_days int default 7) returns text
language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.is_crp() then raise exception 'Only the CRP can make observer links'; end if;
  if p_job_id is not null and not exists (select 1 from public.jobs where id = p_job_id) then raise exception 'Job not found: save it first'; end if;
  insert into public.observer_tokens (token_hash, job_id, expires_at) values (public.wd_hash(t), p_job_id, now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 30))));
  return t;
end $$;

-- what a link shows (no login): the job pack (plan summary, map, full hazards, emergency contacts), the company,
-- the observer briefing extract and whether the protected manual is available
create or replace function public.get_observer_form(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tk public.observer_tokens; j public.jobs; co jsonb; ex jsonb; mv jsonb; mf jsonb;
begin
  select * into tk from public.observer_tokens where token_hash = public.wd_hash(p_token);
  if tk.id is null then return jsonb_build_object('error', 'This link is not valid.'); end if;
  if tk.expires_at < now() then return jsonb_build_object('error', 'This link has expired. Ask the CRP for a new one.'); end if;
  if tk.uses_left <= 0 then return jsonb_build_object('error', 'This link has already been used. Ask the CRP for a new one.'); end if;
  select data into co from public.shared_data where area = 'company';
  select value into ex from public.app_settings where key = 'observer_extract';
  select value into mv from public.app_settings where key = 'manual_version';
  select value into mf from public.app_settings where key = 'manual_file';
  if tk.job_id is null then
    return jsonb_build_object('training', true, 'company', coalesce(co->>'name', ''), 'extract', coalesce(ex, 'null'::jsonb),
      'manual', jsonb_build_object('available', coalesce(mf->>'path', '') <> '', 'version', mv));
  end if;
  select * into j from public.jobs where id = tk.job_id;
  return jsonb_build_object(
    'job', jsonb_build_object('title', j.title, 'op_id', j.op_id, 'start_date', j.start_date, 'status', j.status),
    'company', coalesce(co->>'name', ''), 'extract', coalesce(ex, 'null'::jsonb),
    'manual', jsonb_build_object('available', coalesce(mf->>'path', '') <> '', 'version', mv),
    'overview', jsonb_build_object('location', j.plan->'overview'->'location', 'operationDate', j.plan->'overview'->'operationDate',
       'startTime', j.plan->'overview'->'startTime', 'endTime', j.plan->'overview'->'endTime', 'rpaTypes', j.plan->'overview'->'rpaTypes',
       'rpic', coalesce(j.plan->'approval'->'rpName', j.plan->'overview'->'rpic'), 'maxHeight', coalesce(j.plan->'jsa'->'maxOperatingHeightAgl', j.plan->'overview'->'maxHeightPlanned'),
       'launchSites', j.plan->'overview'->'launchSites', 'recoverySites', j.plan->'overview'->'recoverySites', 'taskOverview', j.plan->'overview'->'taskOverview'),
    'jsa', jsonb_build_object('operationTypes', j.plan->'jsa'->'operationTypes', 'emergencyContacts', j.plan->'jsa'->'emergencyContacts', 'evlosObserver', j.plan->'jsa'->'evlosObserver',
       'timeOfDay', j.plan->'jsa'->'timeOfDay', 'airspaceClass', j.plan->'jsa'->'airspaceClass'),
    'mapData', j.plan->'mapData',
    'risks', coalesce((select jsonb_agg(jsonb_build_object('hazard', r->'hazard', 'risk', r->'riskDescription',
                         'controls', concat_ws(E'\n', nullif(r->>'existingControls', ''), nullif(r->>'additionalControls', ''), nullif(r->>'controls', ''))))
                       from jsonb_array_elements(case when jsonb_typeof(j.plan->'risks') = 'array' then j.plan->'risks' else '[]'::jsonb end) r
                       where coalesce(r->>'hazard', '') <> ''), '[]'::jsonb));
end $$;

create or replace function public.submit_observer_signoff(p_token text, p_name text, p_phone text, p_email text, p_answers jsonb, p_signature jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare tk public.observer_tokens; pid uuid; sid uuid;
begin
  select * into tk from public.observer_tokens where token_hash = public.wd_hash(p_token) for update;
  if tk.id is null or tk.expires_at < now() or tk.uses_left <= 0 then raise exception 'This link is not valid any more. Ask the CRP for a new one.'; end if;
  if coalesce((p_answers->>'declaration')::boolean, false) is not true then raise exception 'Tick the observer declaration first'; end if;
  if p_signature is null or (coalesce(p_signature->>'image', '') = '' and coalesce(p_signature->>'typed', '') = '') then raise exception 'Sign first'; end if;
  pid := public.observer_person(p_name, p_phone, p_email);
  insert into public.signoff_records (person_id, type, status, answers, person_signature, person_signed_at, job_id, source_token)
    values (pid, 'evlos_observer', 'awaiting_crp', coalesce(p_answers, '{}'::jsonb) || jsonb_build_object('via', 'link', 'name', trim(p_name), 'phone', p_phone, 'training', tk.job_id is null), p_signature, now(), tk.job_id, tk.id)
    returning id into sid;
  update public.observer_tokens set uses_left = uses_left - 1 where id = tk.id;
  return sid;
end $$;

-- the CRP's device: a job is optional (training session)
create or replace function public.record_observer_signoff(p_job_id uuid, p_person jsonb, p_answers jsonb, p_person_sig jsonb, p_signed_at timestamptz,
  p_result text, p_crp jsonb, p_crp_sig jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; sid uuid;
begin
  if not public.is_crp() then raise exception 'Only the CRP can record an observer sign-off'; end if;
  if coalesce((p_answers->>'declaration')::boolean, false) is not true then raise exception 'The observer declaration is not ticked'; end if;
  pid := public.observer_person(p_person->>'name', p_person->>'phone', p_person->>'email');
  insert into public.signoff_records (person_id, type, status, answers, person_signature, person_signed_at, job_id)
    values (pid, 'evlos_observer', 'awaiting_crp', coalesce(p_answers, '{}'::jsonb) || jsonb_build_object('via', 'crp-device', 'name', p_person->>'name', 'phone', p_person->>'phone', 'training', p_job_id is null),
            p_person_sig, coalesce(p_signed_at, now()), p_job_id) returning id into sid;
  perform public.certify_observer(sid, p_result, p_crp, p_crp_sig);
  return sid;
end $$;

-- ── EVLOS observer register (CRP) ───────────────────────────────────────────────────────────────
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
    where s.type = 'evlos_observer' order by p.full_name, s.created_at desc;
end $$;

-- ── Protected Operations Manual ───────────────────────────────────────────────────────────────────
-- The PDF sits in a private bucket. Signed-in crew read it through short-lived signed links (storage RLS);
-- people with an observer link read it through the manual-link function. Every open and page is logged.
insert into storage.buckets (id, name, public) values ('ops-manual', 'ops-manual', false) on conflict (id) do nothing;
drop policy if exists "ops-manual: crew read" on storage.objects;
create policy "ops-manual: crew read" on storage.objects for select to authenticated
  using (bucket_id = 'ops-manual' and public.my_role() is not null);
drop policy if exists "ops-manual: CRP uploads" on storage.objects;
create policy "ops-manual: CRP uploads" on storage.objects for insert to authenticated with check (bucket_id = 'ops-manual' and public.is_crp());
drop policy if exists "ops-manual: CRP replaces" on storage.objects;
create policy "ops-manual: CRP replaces" on storage.objects for update to authenticated using (bucket_id = 'ops-manual' and public.is_crp()) with check (bucket_id = 'ops-manual' and public.is_crp());
insert into public.app_settings (key, value) values ('manual_file', '{}'::jsonb) on conflict do nothing;
insert into public.app_settings (key, value) values ('observer_extract', 'null'::jsonb) on conflict do nothing;

-- the read log also covers link viewers (no login): who the link was for, and which link
alter table public.document_access_log alter column user_id drop not null;
alter table public.document_access_log add column if not exists token_id uuid references public.observer_tokens(id) on delete set null;
alter table public.document_access_log add column if not exists viewer text;
create or replace function public.log_manual_page(p_token text, p_page int, p_seconds int, p_version text) returns void
language plpgsql security definer set search_path = public as $$
declare tk public.observer_tokens;
begin
  if p_token is null then
    if auth.uid() is null then raise exception 'Sign in first'; end if;
    insert into public.document_access_log (user_id, document, doc_version, page, duration_s) values (auth.uid(), 'ops-manual', p_version, p_page, greatest(0, least(coalesce(p_seconds, 0), 7200)));
    return;
  end if;
  select * into tk from public.observer_tokens where token_hash = public.wd_hash(p_token);
  if tk.id is null or tk.expires_at < now() then raise exception 'This link is not valid'; end if;
  insert into public.document_access_log (user_id, document, doc_version, page, duration_s, token_id, viewer)
    values (null, 'ops-manual', p_version, p_page, greatest(0, least(coalesce(p_seconds, 0), 7200)), tk.id, coalesce(tk.label, 'observer link'));
end $$;
revoke all on function public.log_manual_page(text, int, int, text), public.observer_register() from public;
grant execute on function public.log_manual_page(text, int, int, text) to anon, authenticated;
grant execute on function public.observer_register() to authenticated;
