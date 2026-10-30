# Chunk 3 setup: pilot induction (about 10 minutes)

Do Chunk 2 first (`SETUP-CHUNK2.md`).

## 1. Database
**SQL Editor › New query**: paste the whole of `migrations/0003_chunk3_induction.sql` (contents, not the name) and **Run**.
It adds the fleet-type list, the manual-version setting, the private `crew-docs` storage for licence photos and
logbooks, and the submit / certify steps. Safe to run again.

## 2. Email function (notify)
1. **Edge Functions › Deploy a new function › Via Editor**, name it exactly `notify`.
2. Paste the whole of `functions/notify/index.ts`, then **Deploy**.
3. In its settings turn **Enforce JWT verification OFF** (the function checks who's calling itself), and save.
4. **Edge Functions › Secrets** (or Project Settings › Edge Functions): add
   - `RESEND_API_KEY` = a Resend API key with sending access (create a new one in Resend for this; don't paste it in chat)
   - optional `APP_URL` = `https://planner.wakingdreamfpv.com/`

Without the key, inductions still work; you just won't get the emails (the planner shows a badge instead).

## 3. In the planner (signed in as CRP)
- Open **Database & Settings** once so the planner publishes your fleet's RPA types (pilots pick from these).
- **Account & crew › Pilot inductions**: enter the **Ops Manual version** and click Save. It's recorded on every induction.

## 4. Acceptance test
1. Invite a test pilot (Crew & users › Invite to log in, or Account & crew › Invite crew), role Pilot.
2. As the pilot (private window): account button › **Start my induction** › fill in, upload a RePL photo and logbook,
   tick the declaration and confidentiality, sign, **Submit to the CRP**.
3. As you: the account button shows an amber **1**; you get an email. Open **Review**, tick the checks, check date,
   the CRP certification, sign, **Certify**.
4. The pilot gets an email and sees **Certified** with their certifications and due dates.
