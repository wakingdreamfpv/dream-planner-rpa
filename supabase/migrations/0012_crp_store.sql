-- ═══ Dream Planner RPA v7.28 · migration 0012_crp_store.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again. Builds on 0001–0011.
-- The CRP's whole company setup (company profile, fleet, batteries, crew lists, clients, templates, PDF views, compliance
-- calendar, settings: everything except the jobs, which already sync on their own), saved to the account so every
-- device the CRP signs in on gets it. Only CRP accounts can read or write it; crew never see it.

create table if not exists public.crp_store (
  key         text primary key check (key in ('settings')),
  data        jsonb not null,
  hash        text,                                  -- fingerprint of data, so devices can tell if they're up to date
  device      text,                                  -- which device saved it last (for the "which one to keep" choice)
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users(id) on delete set null
);

alter table public.crp_store enable row level security;
drop policy if exists "crp store: CRP only" on public.crp_store;
create policy "crp store: CRP only" on public.crp_store for all to authenticated
  using (public.is_crp()) with check (public.is_crp());
revoke all on public.crp_store from anon, authenticated;
grant select, insert, update on public.crp_store to authenticated;

create or replace function public.crp_store_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists crp_store_stamp on public.crp_store;
create trigger crp_store_stamp before insert or update on public.crp_store for each row execute function public.crp_store_stamp();
