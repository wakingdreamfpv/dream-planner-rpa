-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Dream Planner RPA — Chunk 3: pilot induction (Part 1 by the pilot, Part 2 by the CRP)
-- Run in Supabase › SQL Editor AFTER 0001 and 0002 (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── Company RPA types, so pilots can pick the types they'll fly (the CRP's planner keeps this in step) ─
create table if not exists public.fleet_types (
  name        text primary key,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public.fleet_types enable row level security;
drop policy if exists "fleet types: crew read" on public.fleet_types;
create policy "fleet types: crew read" on public.fleet_types for select to authenticated using (public.my_role() is not null);
drop policy if exists "fleet types: CRP adds" on public.fleet_types;
create policy "fleet types: CRP adds" on public.fleet_types for insert to authenticated with check (public.is_crp());
drop policy if exists "fleet types: CRP edits" on public.fleet_types;
create policy "fleet types: CRP edits" on public.fleet_types for update to authenticated using (public.is_crp()) with check (public.is_crp());
revoke all on public.fleet_types from anon;
grant select, insert, update on public.fleet_types to authenticated;

-- ── Company settings crew can read (e.g. the current Operations Manual version) ──────────────────
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null default 'null'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "settings: crew read" on public.app_settings;
create policy "settings: crew read" on public.app_settings for select to authenticated using (public.my_role() is not null);
drop policy if exists "settings: CRP adds" on public.app_settings;
create policy "settings: CRP adds" on public.app_settings for insert to authenticated with check (public.is_crp());
drop policy if exists "settings: CRP edits" on public.app_settings;
create policy "settings: CRP edits" on public.app_settings for update to authenticated using (public.is_crp()) with check (public.is_crp());
revoke all on public.app_settings from anon;
grant select, insert, update on public.app_settings to authenticated;
insert into public.app_settings (key, value) values ('manual_version', '""'::jsonb) on conflict do nothing;

-- ── One induction per pilot at a time ────────────────────────────────────────────────────────────
create unique index if not exists one_open_induction on public.signoff_records (person_id)
  where type = 'pilot_induction' and status in ('draft','awaiting_crp');

-- ── Part 1 submit: checks the declaration, confidentiality and signature, then sends it to the CRP ──
create or replace function public.submit_induction(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.signoff_records; me uuid := public.my_person_id();
begin
  select * into r from public.signoff_records where id = p_id for update;
  if r.id is null or r.type <> 'pilot_induction' then raise exception 'Induction not found'; end if;
  if r.person_id is distinct from me then raise exception 'You can only submit your own induction'; end if;
  if r.status <> 'draft' then raise exception 'This induction has already been submitted'; end if;
  if coalesce((r.answers->>'declaration')::boolean, false) is not true then raise exception 'Tick the declaration before submitting'; end if;
  if coalesce((r.answers->>'confidentiality')::boolean, false) is not true then raise exception 'Agree to the confidentiality clause before submitting'; end if;
  if r.person_signature is null or coalesce(r.person_signature->>'image', r.person_signature->>'typed', '') = '' then
    raise exception 'Sign before submitting'; end if;
  update public.signoff_records set status = 'awaiting_crp', person_signed_at = now() where id = p_id;
end $$;

-- ── Part 2: the CRP certifies (or records not yet competent). Locks the record and creates the
--    certifications with next-due dates, all in one step. ────────────────────────────────────────
create or replace function public.certify_induction(p_id uuid, p_result text, p_crp jsonb, p_signature jsonb)
returns table (pilot_email text, pilot_name text, certs int)
language plpgsql security definer set search_path = public as $$
declare r public.signoff_records; c text; n int := 0; d date; assessor text;
begin
  if not public.is_crp() then raise exception 'Only the CRP can certify an induction'; end if;
  if p_result not in ('certified','not_yet_competent') then raise exception 'Result must be certified or not_yet_competent'; end if;
  select * into r from public.signoff_records where id = p_id for update;
  if r.id is null or r.type <> 'pilot_induction' then raise exception 'Induction not found'; end if;
  if r.status <> 'awaiting_crp' then raise exception 'This induction is not waiting for the CRP'; end if;
  if p_signature is null or coalesce(p_signature->>'image', p_signature->>'typed', '') = '' then raise exception 'Sign as CRP first'; end if;
  if coalesce((p_crp->>'crpCertifies')::boolean, false) is not true then raise exception 'Tick the CRP certification first'; end if;
  d := coalesce(nullif(p_crp->>'checkDate', '')::date, current_date);
  if p_result = 'certified' then
    if jsonb_array_length(coalesce(p_crp->'competencies', '[]'::jsonb)) = 0 then raise exception 'Tick at least one competency to certify'; end if;
    if (p_crp->'competencies') ? 'oonp' and coalesce((p_crp->>'oonpHoursVerified')::boolean, false) is not true then
      raise exception 'OONP needs 10+ hours on type verified'; end if;
  end if;
  select coalesce(nullif(full_name, ''), email) into assessor from public.people where user_id = auth.uid();
  update public.signoff_records
     set answers = answers || jsonb_build_object('crp', p_crp), crp_signature = p_signature,
         crp_signed_by = auth.uid(), crp_signed_at = now(), status = p_result, locked = true
   where id = p_id;
  if p_result = 'certified' then
    for c in select jsonb_array_elements_text(p_crp->'competencies') loop
      insert into public.certifications (person_id, competency, check_date, next_due, assessor, signoff_id)
      values (r.person_id, c, d, (d + interval '12 months')::date, assessor, p_id);
      n := n + 1;
    end loop;
    update public.people set date_last_engaged = greatest(coalesce(date_last_engaged, d), d) where id = r.person_id;
  end if;
  return query select p.email, p.full_name, n from public.people p where p.id = r.person_id;
end $$;

grant execute on function public.submit_induction(uuid), public.certify_induction(uuid, text, jsonb, jsonb) to authenticated;

-- ── Private storage for licence photos and logbook summaries: crew folder = their person id ──────
insert into storage.buckets (id, name, public) values ('crew-docs', 'crew-docs', false) on conflict (id) do nothing;
drop policy if exists "crew-docs: own folder or CRP reads" on storage.objects;
create policy "crew-docs: own folder or CRP reads" on storage.objects for select to authenticated
  using (bucket_id = 'crew-docs' and ((storage.foldername(name))[1] = public.my_person_id()::text or public.is_crp()));
drop policy if exists "crew-docs: upload to own folder" on storage.objects;
create policy "crew-docs: upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'crew-docs' and ((storage.foldername(name))[1] = public.my_person_id()::text or public.is_crp()));
-- no update / delete policies: uploaded documents are kept (7-year retention)
