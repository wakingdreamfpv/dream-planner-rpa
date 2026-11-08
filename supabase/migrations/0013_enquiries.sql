-- ═══ Dream Planner RPA v7.30 · migration 0013_enquiries.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again. Builds on 0001–0012.
-- "Get it for your company": people using the free planner (no account) leave their details. Only CRP accounts can
-- read or update them. Visitors can only add one through submit_enquiry() (checked and rate-limited); they can never
-- read, change or delete anything. Enquiries are never deleted from the app.

create table if not exists public.enquiries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 200),
  company     text check (company is null or char_length(company) <= 160),
  phone       text check (phone is null or char_length(phone) <= 40),
  interest    text check (interest is null or interest in ('founder','monthly','annual','source','updates')),
  message     text check (message is null or char_length(message) <= 2000),
  source      text check (source is null or char_length(source) <= 40),   -- e.g. 'free-banner', 'free-welcome'
  consent     boolean not null default false,                            -- OK to contact them about the planner
  status      text not null default 'new' check (status in ('new','contacted','closed')),
  handled_at  timestamptz,
  handled_by  uuid references auth.users(id) on delete set null
);
create index if not exists enquiries_created_idx on public.enquiries (created_at desc);
create index if not exists enquiries_email_idx on public.enquiries (lower(email), created_at desc);

alter table public.enquiries enable row level security;
drop policy if exists "enquiries: CRP reads" on public.enquiries;
create policy "enquiries: CRP reads" on public.enquiries for select to authenticated using (public.is_crp());
drop policy if exists "enquiries: CRP updates" on public.enquiries;
create policy "enquiries: CRP updates" on public.enquiries for update to authenticated
  using (public.is_crp()) with check (public.is_crp());
revoke all on public.enquiries from anon, authenticated;
grant select, update (status, handled_at, handled_by) on public.enquiries to authenticated;

-- The only way in: one enquiry per call, checked, at most 3 per email address a day and 200 an hour overall.
create or replace function public.submit_enquiry(p_name text, p_email text, p_company text, p_phone text,
  p_interest text, p_message text, p_source text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_email text := lower(left(btrim(coalesce(p_email, '')), 200));
  v_interest text := nullif(btrim(coalesce(p_interest, '')), '');
  v_id uuid;
begin
  if v_name = '' then raise exception 'enquiry: name needed'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'enquiry: email not valid'; end if;
  if coalesce(p_consent, false) is not true then raise exception 'enquiry: consent needed'; end if;
  if v_interest is not null and v_interest not in ('founder','monthly','annual','source','updates') then v_interest := null; end if;
  if (select count(*) from public.enquiries where lower(email) = v_email and created_at > now() - interval '1 day') >= 3 then
    raise exception 'enquiry: too many from this email';
  end if;
  if (select count(*) from public.enquiries where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'enquiry: busy';
  end if;
  insert into public.enquiries (name, email, company, phone, interest, message, source, consent)
  values (v_name, v_email,
          nullif(left(btrim(coalesce(p_company, '')), 160), ''),
          nullif(left(btrim(coalesce(p_phone, '')), 40), ''),
          v_interest,
          nullif(left(btrim(coalesce(p_message, '')), 2000), ''),
          nullif(left(btrim(coalesce(p_source, '')), 40), ''),
          true)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_enquiry(text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.submit_enquiry(text, text, text, text, text, text, text, boolean) to anon, authenticated;

-- Stamp who marked it contacted / closed, and when
create or replace function public.enquiries_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then new.handled_at := now(); new.handled_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists enquiries_stamp on public.enquiries;
create trigger enquiries_stamp before update on public.enquiries for each row execute function public.enquiries_stamp();
