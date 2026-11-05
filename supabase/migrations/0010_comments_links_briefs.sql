-- ═══ Dream Planner RPA v7.18 · migration 0010_comments_links_briefs.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again. Builds on 0001–0009.
-- Live plan links with comments on each section, suggested edits the CRP accepts or declines, and short per-job
-- signatures for observers (a pre-flight brief and an optional post-flight sign).

-- ── Live plan links (no login): a client or crew member opens the plan view the CRP chose, and comments ──────────────
create table if not exists public.plan_links (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  token_hash   text not null unique,
  audience     text not null default 'client' check (audience in ('client', 'crew')),
  label        text,                       -- who it was made for, e.g. "Sarah (client)"
  email        text,
  view_id      text,                       -- the PDF view it shows
  view_name    text,
  snapshot     text,                       -- the plan as that view, refreshed when the CRP saves
  snapshot_at  timestamptz,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  revoked      boolean not null default false
);
alter table public.plan_links enable row level security;
drop policy if exists "plan links: CRP" on public.plan_links;
create policy "plan links: CRP" on public.plan_links for all to authenticated using (public.is_crp()) with check (public.is_crp());
revoke all on public.plan_links from anon, authenticated;
grant select, update on public.plan_links to authenticated;

create table if not exists public.plan_comments (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  link_id      uuid references public.plan_links(id) on delete set null,
  section      text not null default 'general',
  anchor       text,
  parent_id    uuid references public.plan_comments(id) on delete cascade,
  body         text not null default '' check (length(body) <= 4000),
  kind         text not null default 'comment' check (kind in ('comment', 'suggestion')),
  suggestion   jsonb,                      -- { path, label, from, to } or { kind: 'new_risk', risk: {...} } or { free: true }
  status       text not null default 'open' check (status in ('open', 'resolved', 'accepted', 'declined')),
  author_name  text not null default '',
  author_role  text not null default 'crew',
  author_user  uuid default auth.uid() references auth.users(id) on delete set null,
  decided_by   text,
  decided_at   timestamptz,
  decision_note text,
  created_at   timestamptz not null default now()
);
create index if not exists plan_comments_job on public.plan_comments (job_id, created_at);
alter table public.plan_comments enable row level security;
-- the CRP sees everything; crew on the job see the job's comments, except the private threads with clients
create or replace function public.plan_link_audience(p_link uuid) returns text
language sql stable security definer set search_path = public as $$ select audience from public.plan_links where id = p_link $$;
drop policy if exists "comments: read" on public.plan_comments;
create policy "comments: read" on public.plan_comments for select to authenticated using (
  public.is_crp() or (public.job_role_of(job_id) is not null and (link_id is null or public.plan_link_audience(link_id) <> 'client')));
drop policy if exists "comments: crew add" on public.plan_comments;
create policy "comments: crew add" on public.plan_comments for insert to authenticated with check (
  public.is_crp() or (public.job_role_of(job_id) is not null and author_user = auth.uid() and link_id is null and status = 'open'));
drop policy if exists "comments: CRP decides" on public.plan_comments;
create policy "comments: CRP decides" on public.plan_comments for update to authenticated using (public.is_crp()) with check (public.is_crp());
revoke all on public.plan_comments from anon, authenticated;
grant select, insert, update on public.plan_comments to authenticated;

-- who is writing: the login's name and role (crew can't post as someone else)
create or replace function public.plan_comments_who() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    select coalesce(nullif(full_name, ''), email), role into new.author_name, new.author_role from public.profiles where id = auth.uid();
    new.author_user := auth.uid();
    if new.kind = 'suggestion' and new.author_role = 'crp' then new.kind := 'comment'; end if;
  end if;
  return new;
end $$;
drop trigger if exists plan_comments_who on public.plan_comments;
create trigger plan_comments_who before insert on public.plan_comments for each row execute function public.plan_comments_who();

-- the CRP makes a link; the token is returned once and only its hash is kept
create or replace function public.create_plan_link(p_job_id uuid, p_audience text, p_label text, p_email text, p_days int, p_view_id text, p_view_name text, p_snapshot text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); lid uuid;
begin
  if not public.is_crp() then raise exception 'Only the CRP can share a plan'; end if;
  if not exists (select 1 from public.jobs where id = p_job_id) then raise exception 'Job not found: save it first'; end if;
  insert into public.plan_links (job_id, token_hash, audience, label, email, view_id, view_name, snapshot, snapshot_at, expires_at)
    values (p_job_id, public.wd_hash(t), case when p_audience = 'crew' then 'crew' else 'client' end, nullif(trim(p_label), ''), nullif(lower(trim(p_email)), ''),
            p_view_id, p_view_name, p_snapshot, now(), now() + make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))))
    returning id into lid;
  return jsonb_build_object('id', lid, 'token', t);
end $$;

-- comments a link may see: a client sees their own thread; crew links see the job's comments (not client threads)
create or replace function public.plan_link_comments(p_link public.plan_links) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'section', c.section, 'anchor', c.anchor, 'parent_id', c.parent_id, 'body', c.body, 'kind', c.kind,
      'suggestion', c.suggestion, 'status', c.status, 'author_name', c.author_name, 'author_role', c.author_role, 'created_at', c.created_at,
      'decided_by', c.decided_by, 'decision_note', c.decision_note, 'mine', c.link_id = p_link.id) order by c.created_at), '[]'::jsonb)
  from public.plan_comments c
  where c.job_id = p_link.job_id and (
    (p_link.audience = 'client' and c.link_id = p_link.id) or
    (p_link.audience <> 'client' and (c.link_id is null or exists (select 1 from public.plan_links l where l.id = c.link_id and l.audience <> 'client'))))
$$;

create or replace function public.plan_link_open(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lk public.plan_links; j public.jobs; co jsonb;
begin
  select * into lk from public.plan_links where token_hash = public.wd_hash(p_token);
  if lk.id is null or lk.revoked then return jsonb_build_object('error', 'This link is not valid. Ask for a new one.'); end if;
  if lk.expires_at < now() then return jsonb_build_object('error', 'This link has expired. Ask for a new one.'); end if;
  select * into j from public.jobs where id = lk.job_id;
  select data into co from public.shared_data where area = 'company';
  return jsonb_build_object('title', j.title, 'op_id', j.op_id, 'start_date', j.start_date, 'company', coalesce(co->>'name', ''),
    'audience', lk.audience, 'label', lk.label, 'view_name', lk.view_name, 'snapshot', lk.snapshot, 'snapshot_at', lk.snapshot_at,
    'can_suggest', lk.audience = 'crew', 'comments', public.plan_link_comments(lk));
end $$;

create or replace function public.plan_link_comment(p_token text, p_name text, p_section text, p_anchor text, p_body text, p_parent uuid, p_suggestion jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lk public.plan_links; n int; cid uuid; par public.plan_comments;
begin
  select * into lk from public.plan_links where token_hash = public.wd_hash(p_token);
  if lk.id is null or lk.revoked or lk.expires_at < now() then raise exception 'This link is not valid any more.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Add your name first'; end if;
  if coalesce(trim(p_body), '') = '' and (p_suggestion is null or lk.audience <> 'crew') then raise exception 'Write a comment first'; end if;
  select count(*) into n from public.plan_comments where link_id = lk.id;
  if n >= 300 then raise exception 'This link has reached its comment limit. Ask for a new one.'; end if;
  if p_parent is not null then
    select * into par from public.plan_comments where id = p_parent and job_id = lk.job_id;
    if par.id is null then raise exception 'That comment is not on this plan'; end if;
    if lk.audience = 'client' and par.link_id is distinct from lk.id then raise exception 'That comment is not on this plan'; end if;
  end if;
  insert into public.plan_comments (job_id, link_id, section, anchor, parent_id, body, kind, suggestion, author_name, author_role, author_user)
    values (lk.job_id, lk.id, left(coalesce(nullif(p_section, ''), 'general'), 40), left(p_anchor, 80), p_parent, left(coalesce(p_body, ''), 4000),
            case when p_suggestion is not null and lk.audience = 'crew' then 'suggestion' else 'comment' end,
            case when lk.audience = 'crew' then p_suggestion end, left(trim(p_name), 80), case when lk.audience = 'crew' then 'crew-link' else 'client' end, null)
    returning id into cid;
  return jsonb_build_object('id', cid, 'comments', public.plan_link_comments(lk));
end $$;
grant execute on function public.plan_link_open(text), public.plan_link_comment(text, text, text, text, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.create_plan_link(uuid, text, text, text, int, text, text, text) to authenticated;
revoke execute on function public.plan_link_comments(public.plan_links) from public, anon, authenticated;

-- ── Short per-job observer signatures (the induction / EVLOS sign-off is done once; this is per job) ──────────────────
create table if not exists public.job_signatures (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  person_id   uuid references public.people(id) on delete set null,
  name        text not null,
  role        text not null default 'observer',
  kind        text not null check (kind in ('brief', 'post_flight')),
  declaration text,
  note        text,
  signature   jsonb not null,
  via         text not null default 'login',
  token_id    uuid,
  signed_at   timestamptz not null default now()
);
create index if not exists job_signatures_job on public.job_signatures (job_id);
alter table public.job_signatures enable row level security;
drop policy if exists "job sigs: CRP or crew on the job read" on public.job_signatures;
create policy "job sigs: CRP or crew on the job read" on public.job_signatures for select to authenticated using (public.is_crp() or public.job_role_of(job_id) is not null);
revoke all on public.job_signatures from anon, authenticated;
grant select on public.job_signatures to authenticated;

-- is this observer current (an EVLOS observer certification that hasn't expired)?
create or replace function public.observer_current(p_person uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('current', coalesce(max(next_due) >= current_date, false), 'due', max(next_due))
  from public.certifications where person_id = p_person and competency = 'evlos_observer'
$$;
revoke execute on function public.observer_current(uuid) from public, anon, authenticated;

-- find (never create) the observer from a name and phone typed on a link
create or replace function public.observer_lookup(p_name text, p_phone text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.people
  where (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '') is not null and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9))
     or lower(btrim(full_name)) = lower(btrim(p_name))
  order by (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9)) desc nulls last limit 1
$$;
revoke execute on function public.observer_lookup(text, text) from public, anon, authenticated;

-- on a job link: is this person already trained (short form) or do they need the full EVLOS sign-off?
create or replace function public.observer_link_status(p_token text, p_name text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tk public.observer_tokens; pid uuid; cur jsonb;
begin
  select * into tk from public.observer_tokens where token_hash = public.wd_hash(p_token);
  if tk.id is null or tk.expires_at < now() or tk.job_id is null then return jsonb_build_object('current', false); end if;
  pid := public.observer_lookup(p_name, p_phone);
  if pid is null then return jsonb_build_object('current', false); end if;
  cur := public.observer_current(pid);
  return jsonb_build_object('current', coalesce((cur->>'current')::boolean, false), 'due', cur->'due',
    'signed', coalesce((select jsonb_agg(kind) from public.job_signatures where job_id = tk.job_id and person_id = pid), '[]'::jsonb));
end $$;

create or replace function public.sign_job_brief_link(p_token text, p_name text, p_phone text, p_kind text, p_signature jsonb, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare tk public.observer_tokens; pid uuid; sid uuid; n int;
begin
  select * into tk from public.observer_tokens where token_hash = public.wd_hash(p_token);
  if tk.id is null or tk.job_id is null then raise exception 'This link is not valid any more. Ask the CRP for a new one.'; end if;
  -- the post-flight sign works for 7 days after the link expires
  if (p_kind = 'brief' and tk.expires_at < now()) or (tk.expires_at + interval '7 days' < now()) then raise exception 'This link has expired. Ask the CRP for a new one.'; end if;
  if p_kind not in ('brief', 'post_flight') then raise exception 'Unknown signature'; end if;
  if p_signature is null or (coalesce(p_signature->>'image', '') = '' and coalesce(p_signature->>'typed', '') = '') then raise exception 'Sign first'; end if;
  pid := public.observer_lookup(p_name, p_phone);
  if pid is null or not coalesce((public.observer_current(pid)->>'current')::boolean, false) then raise exception 'You need a current EVLOS observer sign-off first'; end if;
  select count(*) into n from public.job_signatures where token_id = tk.id;
  if n >= 40 then raise exception 'This link has been used too many times. Ask the CRP for a new one.'; end if;
  -- the newest one counts
  delete from public.job_signatures where job_id = tk.job_id and person_id = pid and kind = p_kind;
  insert into public.job_signatures (job_id, person_id, name, role, kind, declaration, note, signature, via, token_id)
    values (tk.job_id, pid, (select full_name from public.people where id = pid), 'observer', p_kind,
            case when p_kind = 'brief' then 'I have been briefed for this job, I am fit for duty, and I will follow the Remote Pilot''s lawful directions.'
                 else 'The operation was conducted as briefed, and I have reported any incident or concern to the RPIC.' end,
            left(p_note, 1000), p_signature, 'link', tk.id) returning id into sid;
  return sid;
end $$;

create or replace function public.sign_job_brief(p_job_id uuid, p_kind text, p_signature jsonb, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid := public.my_person_id(); sid uuid;
begin
  if pid is null or public.job_role_of(p_job_id) is null then raise exception 'You are not on this job'; end if;
  if p_kind not in ('brief', 'post_flight') then raise exception 'Unknown signature'; end if;
  if p_signature is null or (coalesce(p_signature->>'image', '') = '' and coalesce(p_signature->>'typed', '') = '') then raise exception 'Sign first'; end if;
  if p_kind = 'brief' and not coalesce((public.observer_current(pid)->>'current')::boolean, false) then raise exception 'You need a current EVLOS observer sign-off first'; end if;
  delete from public.job_signatures where job_id = p_job_id and person_id = pid and kind = p_kind;
  insert into public.job_signatures (job_id, person_id, name, role, kind, declaration, note, signature, via)
    values (p_job_id, pid, (select full_name from public.people where id = pid), coalesce(public.job_role_of(p_job_id), 'observer'), p_kind,
            case when p_kind = 'brief' then 'I have been briefed for this job, I am fit for duty, and I will follow the Remote Pilot''s lawful directions.'
                 else 'The operation was conducted as briefed, and I have reported any incident or concern to the RPIC.' end,
            left(p_note, 1000), p_signature, 'login') returning id into sid;
  return sid;
end $$;

-- a logged-in crew member: am I current?
create or replace function public.my_observer_status() returns jsonb
language sql stable security definer set search_path = public as $$ select public.observer_current(public.my_person_id()) $$;

grant execute on function public.observer_link_status(text, text, text), public.sign_job_brief_link(text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.sign_job_brief(uuid, text, jsonb, text), public.my_observer_status() to authenticated;
