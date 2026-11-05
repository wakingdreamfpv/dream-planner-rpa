-- ═══ Dream Planner RPA v7.9 · migration 0007_opsmap_observer.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again.
-- Dream Planner RPA v7.9 — observers with a job link also see the advanced ops map (zones with their limits, buffers,
-- flight paths, take-off / emergency landing points and cautions). The floor-plan picture itself is left out to keep
-- the link light on mobile data. Safe to run more than once. Builds on 0006.
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
    'opsMap', case when jsonb_typeof(j.plan->'opsMap') = 'object' then (j.plan->'opsMap') #- '{overlay,src}' else null end,
    'risks', coalesce((select jsonb_agg(jsonb_build_object('hazard', r->'hazard', 'risk', r->'riskDescription',
                         'controls', concat_ws(E'\n', nullif(r->>'existingControls', ''), nullif(r->>'additionalControls', ''), nullif(r->>'controls', ''))))
                       from jsonb_array_elements(case when jsonb_typeof(j.plan->'risks') = 'array' then j.plan->'risks' else '[]'::jsonb end) r
                       where coalesce(r->>'hazard', '') <> ''), '[]'::jsonb));
end $$;
