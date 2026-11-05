-- ═══ Dream Planner RPA v7.15 · migration 0009_records_import_backup.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again.
-- Dream Planner RPA v7.15 — Chunk 9: import the Google Forms registers, keep "date last engaged" up to date for the
-- 7-year retention rule, and daily backups. Safe to run more than once. Builds on 0001–0008.

-- ── Import past sign-offs (CRP only) ─────────────────────────────────────────────────────────────
-- p_rows: [{ ref, kind: 'pilot'|'observer', person: {full_name, email, phone, address, arn, repl_no, nok_name,
--   nok_relationship, nok_phone, total_hours}, hours: [{rpa_type, hours}], answers: {...}, person_signed_at,
--   person_typed, crp_typed, crp_signed_at, certified: bool, certs: [{competency, check_date}] }]
-- Each row is imported once (by its ref). People are matched by email, then by name; their existing details are kept
-- and only empty fields are filled in. Certified rows are locked, like a sign-off done in the planner.
create or replace function public.import_register(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; pr jsonb; pid uuid; sid uuid; c jsonb; h jsonb; nm text; em text; n_people int := 0; n_signoffs int := 0; n_certs int := 0; n_skipped int := 0;
  certified boolean; last_date date;
begin
  if not public.is_crp() then raise exception 'Only the CRP can import registers'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if coalesce(r->>'ref', '') = '' then continue; end if;
    if exists (select 1 from public.signoff_records where answers->>'importRef' = r->>'ref') then n_skipped := n_skipped + 1; continue; end if;
    pr := coalesce(r->'person', '{}'::jsonb);
    nm := nullif(btrim(pr->>'full_name'), ''); em := nullif(lower(btrim(pr->>'email')), '');
    if nm is null then continue; end if;
    if em is not null and position('@' in em) <= 1 then em := null; end if;
    pid := null;
    if em is not null then select id into pid from public.people where email = em limit 1; end if;
    if pid is null then select id into pid from public.people where lower(btrim(full_name)) = lower(nm) limit 1; end if;
    if pid is null then
      insert into public.people (full_name, role, email, active) values (nm, case when r->>'kind' = 'observer' then 'observer' else 'pilot' end, em, true) returning id into pid;
      n_people := n_people + 1;
    end if;
    update public.people p set
      email = coalesce(p.email, em),
      phone = coalesce(nullif(p.phone, ''), nullif(btrim(pr->>'phone'), '')),
      address = coalesce(nullif(p.address, ''), nullif(btrim(pr->>'address'), '')),
      arn = coalesce(nullif(p.arn, ''), nullif(btrim(pr->>'arn'), '')),
      repl_no = coalesce(nullif(p.repl_no, ''), nullif(btrim(pr->>'repl_no'), '')),
      nok_name = coalesce(nullif(p.nok_name, ''), nullif(btrim(pr->>'nok_name'), '')),
      nok_relationship = coalesce(nullif(p.nok_relationship, ''), nullif(btrim(pr->>'nok_relationship'), '')),
      nok_phone = coalesce(nullif(p.nok_phone, ''), nullif(btrim(pr->>'nok_phone'), '')),
      total_hours = coalesce(p.total_hours, nullif(pr->>'total_hours', '')::numeric)
    where p.id = pid;
    for h in select * from jsonb_array_elements(coalesce(r->'hours', '[]'::jsonb)) loop
      if coalesce(h->>'rpa_type', '') <> '' and (h->>'hours') ~ '^[0-9]+(\.[0-9]+)?$' then
        insert into public.experience (person_id, rpa_type, hours) values (pid, h->>'rpa_type', (h->>'hours')::numeric)
          on conflict (person_id, rpa_type) do update set hours = greatest(public.experience.hours, excluded.hours), updated_at = now();
      end if;
    end loop;
    certified := coalesce((r->>'certified')::boolean, false);
    insert into public.signoff_records (person_id, type, status, answers, person_signature, person_signed_at, crp_signature, crp_signed_by, crp_signed_at, locked)
      values (pid, case when r->>'kind' = 'observer' then 'evlos_observer' else 'pilot_induction' end,
        case when certified then 'certified' else 'awaiting_crp' end,
        coalesce(r->'answers', '{}'::jsonb) || jsonb_build_object('importRef', r->>'ref', 'source', 'Imported from Google Forms', 'importedAt', now()),
        case when coalesce(r->>'person_typed', '') <> '' then jsonb_build_object('typed', r->>'person_typed', 'name', nm) end,
        nullif(r->>'person_signed_at', '')::timestamptz,
        case when certified then jsonb_build_object('typed', coalesce(nullif(r->>'crp_typed', ''), 'CRP')) end,
        case when certified then auth.uid() end,
        case when certified then nullif(r->>'crp_signed_at', '')::timestamptz end,
        certified)
      returning id into sid;
    n_signoffs := n_signoffs + 1;
    last_date := null;
    if certified then
      for c in select * from jsonb_array_elements(coalesce(r->'certs', '[]'::jsonb)) loop
        if coalesce(c->>'competency', '') = '' or coalesce(c->>'check_date', '') = '' then continue; end if;
        insert into public.certifications (person_id, competency, check_date, next_due, assessor, signoff_id)
          values (pid, c->>'competency', (c->>'check_date')::date, ((c->>'check_date')::date + interval '12 months')::date, coalesce(nullif(r->>'crp_typed', ''), 'CRP'), sid);
        n_certs := n_certs + 1; last_date := greatest(coalesce(last_date, (c->>'check_date')::date), (c->>'check_date')::date);
      end loop;
    end if;
    update public.people set date_last_engaged = greatest(coalesce(date_last_engaged, coalesce(last_date, (r->>'person_signed_at')::date)), coalesce(last_date, (r->>'person_signed_at')::date))
      where id = pid and coalesce(last_date, (r->>'person_signed_at')::date) is not null;
  end loop;
  return jsonb_build_object('people', n_people, 'signoffs', n_signoffs, 'certifications', n_certs, 'skipped', n_skipped);
end $$;
revoke all on function public.import_register(jsonb) from public;
grant execute on function public.import_register(jsonb) to authenticated;

-- ── "Date last engaged" follows the flying, for the 7-year retention rule ───────────────────────────
create or replace function public.flight_counts_engaged() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.people set date_last_engaged = greatest(coalesce(date_last_engaged, new.flight_date), new.flight_date) where id = new.person_id;
  return new;
end $$;
drop trigger if exists flight_counts_engaged on public.flight_counts;
create trigger flight_counts_engaged after insert on public.flight_counts for each row execute function public.flight_counts_engaged();

-- ── Backups: a private bucket for the daily snapshot (only the CRP can read it) ──────────────────────
insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing;
drop policy if exists "backups: CRP reads" on storage.objects;
create policy "backups: CRP reads" on storage.objects for select to authenticated using (bucket_id = 'backups' and public.is_crp());
-- how often the CRP gets the backup emailed (a copy outside Supabase)
alter table public.notification_prefs add column if not exists backup_email text not null default 'weekly';
alter table public.notification_prefs drop constraint if exists notification_prefs_backup_email_check;
alter table public.notification_prefs add constraint notification_prefs_backup_email_check check (backup_email in ('daily', 'weekly', 'off'));

-- daily at 02:10 Brisbane (16:10 UTC); skipped quietly if the scheduler isn't available
do $$ begin
  begin perform cron.unschedule('wd-backup'); exception when others then null; end;
  perform cron.schedule('wd-backup', '10 16 * * *',
    $cron$ select net.http_post(url := 'https://jirvugtgclgdbysrfjsc.supabase.co/functions/v1/backup',
             headers := '{"Content-Type":"application/json"}'::jsonb, body := '{"mode":"cron"}'::jsonb) $cron$);
exception when others then raise notice 'Could not schedule the backup (add it in Integrations › Cron): %', sqlerrm;
end $$;
