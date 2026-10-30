# Chunk 2 setup: crew & job data model (about 5 minutes)

Run this after Chunk 1 is working (you can sign in as CRP).

1. Open **Supabase › SQL Editor › New query**.
2. Paste the whole of `migrations/0002_chunk2_data_model.sql` (the file contents, not its name). Nothing to edit.
3. Click **Run**. You should see *Success. No rows returned*. It's safe to run again.

## Check it worked (acceptance)
In **Table Editor** you should see these new tables: `people`, `experience`, `signoff_records`, `certifications`,
`flight_counts`, `document_access_log`, `audit_log`, `jobs`, `job_crew`, `job_flights`.

Run this in a new query:

```sql
select full_name, role, email, user_id is not null as has_login from public.people order by role, full_name;
```

You should see **yourself** (crp, has_login true), any crew who've accepted invites, plus **Test Pilot (seed)** and
**Test Observer (seed)** (no login). The two seed records are for testing and can be deactivated later.

## What it does
- **people:** everyone you fly with. A login is optional; when someone accepts an invite they're linked to the person
  with the same email (or a record is created for them).
- Crew can read and edit **their own** contact details, ARN/RePL, next of kin and hours. Role, status, currency dates
  and notes stay with the CRP.
- **jobs / job_crew / job_flights:** crew see only jobs they're assigned to (plan read-only). Pilots and the RPIC on
  a job see its whole flight log; observers see their own entries. Everyone logs flights only as themselves, and
  flights lock when the job is closed.
- **signoff_records, certifications, flight_counts, document_access_log:** ready for Chunks 3–7. Locked sign-offs
  can't be changed by anyone.
- **audit_log:** every change to the tables above is recorded automatically (who, when, before/after). Only the CRP can
  read it, and nobody can edit or delete it.
- Nothing can be deleted (7-year retention); people are deactivated instead.
