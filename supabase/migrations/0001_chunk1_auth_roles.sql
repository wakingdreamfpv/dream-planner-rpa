-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Dream Planner RPA — Chunk 1: logins, roles and row-level security
-- Run once in Supabase › SQL Editor (safe to re-run).
--
-- Roles:  crp (Chief Remote Pilot / admin) · pilot · observer
-- Rules:  • crew see and edit only their own profile (and can never change their own role or status)
--         • the CRP sees and manages everyone
--         • nobody can sign up on their own: a role only comes from an invite the CRP sent
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── Invites: written only by the invite-user function (service role) or the CRP ──────────────────
create table if not exists public.invites (
  email            text primary key check (email = lower(email) and position('@' in email) > 1),
  full_name        text not null default '',
  role             text not null check (role in ('crp','pilot','observer')),
  invited_by       uuid references auth.users(id) on delete set null,
  invited_at       timestamptz not null default now(),
  accepted_user_id uuid references auth.users(id) on delete set null
);

-- ── Profiles: one per login ─────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'pilot' check (role in ('crp','pilot','observer')),
  active      boolean not null default false,   -- only invited people are active
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Helpers (security definer so they can read profiles without tripping RLS) ───────────────────
create or replace function public.is_crp() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'crp' and active);
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

-- ── New login → profile, with the role from the matching invite (none → inactive) ──────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  select * into inv from public.invites where email = lower(new.email);
  insert into public.profiles (id, email, full_name, role, active)
  values (new.id, lower(new.email),
          coalesce(nullif(inv.full_name, ''), new.raw_user_meta_data->>'full_name', ''),
          coalesce(inv.role, 'pilot'),
          inv.email is not null)
  on conflict (id) do nothing;
  if inv.email is not null then
    update public.invites set accepted_user_id = new.id where email = inv.email;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Guard: only the CRP can change role / active / email; crew can only edit their own name ─────
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_crp() then
    if new.role is distinct from old.role or new.active is distinct from old.active
       or new.email is distinct from old.email or new.id is distinct from old.id then
      raise exception 'Only the CRP can change role, status or email';
    end if;
  end if;
  -- the CRP can't lock themselves out by demoting or deactivating their own account
  if auth.uid() = old.id and old.role = 'crp' and (new.role <> 'crp' or not new.active) then
    raise exception 'You cannot remove your own CRP access';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ── Row-level security ─────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.invites  enable row level security;

drop policy if exists "profiles: read own or CRP reads all" on public.profiles;
create policy "profiles: read own or CRP reads all" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_crp());

drop policy if exists "profiles: update own or CRP updates all" on public.profiles;
create policy "profiles: update own or CRP updates all" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_crp())
  with check (id = auth.uid() or public.is_crp());
-- no insert / delete policies: profiles are created by the trigger; people are deactivated, never deleted

drop policy if exists "invites: CRP only" on public.invites;
create policy "invites: CRP only" on public.invites
  for all to authenticated using (public.is_crp()) with check (public.is_crp());

revoke all on public.profiles, public.invites from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.invites to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Bootstrap: make yourself the CRP. Change the email to the one you'll log in with, then run.
-- (Then invite that email from Authentication › Users › Invite user, and accept the email.)
-- If you already have a login with that email, the last statement upgrades it straight away.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
insert into public.invites (email, full_name, role)
values (lower('CHANGE-ME@example.com'), 'Michael Rubio', 'crp')
on conflict (email) do update set role = 'crp', full_name = excluded.full_name;

update public.profiles set role = 'crp', active = true
where email = lower('CHANGE-ME@example.com');
