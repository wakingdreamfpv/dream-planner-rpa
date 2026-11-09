-- ═══ Dream Planner RPA v7.32 · migration 0014_enquiry_emails.sql ═══
-- Paste into: Supabase › SQL Editor › New query › Run. Safe to run again. Builds on 0013.
-- Each new enquiry / beta sign-up is emailed to Mike once, by the "enquiry-alert" edge function. This column records
-- when that email went, so the same enquiry can never be emailed twice. Visitors still can't read or change anything.
alter table public.enquiries add column if not exists emailed_at timestamptz;
