-- ═══ Dream Planner RPA v7.34 · migration 0015_beta_feedback.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again. Builds on 0013 and 0014.
-- Beta testers send bug reports, ideas and feedback from the planner (source 'feedback-bug', 'feedback-idea',
-- 'feedback-general'). They go into the same Enquiries list. Feedback gets its own limit of 20 a day per email address
-- (company enquiries stay at 3 a day), so a keen tester can report several bugs. Nothing else changes.

create or replace function public.submit_enquiry(p_name text, p_email text, p_company text, p_phone text,
  p_interest text, p_message text, p_source text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_email text := lower(left(btrim(coalesce(p_email, '')), 200));
  v_interest text := nullif(btrim(coalesce(p_interest, '')), '');
  v_id uuid;
  v_fb boolean := coalesce(p_source, '') like 'feedback-%';
begin
  if v_name = '' then raise exception 'enquiry: name needed'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'enquiry: email not valid'; end if;
  if coalesce(p_consent, false) is not true then raise exception 'enquiry: consent needed'; end if;
  if v_interest is not null and v_interest not in ('founder','monthly','annual','source','updates') then v_interest := null; end if;
  if (select count(*) from public.enquiries where lower(email) = v_email and created_at > now() - interval '1 day'
        and (coalesce(source, '') like 'feedback-%') = v_fb) >= (case when v_fb then 20 else 3 end) then
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
