# Dream Planner RPA — notes for Claude Code

Operations planner (Form F.1, JSA, risk register, approvals, flight logs, crew compliance) for Waking Dream FPV /
Rubio Enterprises Pty Ltd (ReOC CASA.ReOC.9037). Owner: Mike Rubio (CRP). Mike is not a developer: explain in plain
words, keep replies short, no jargon.

## Stack
- Vite + React. Almost all of the app is `src/legacy/planner.jsx` (very large; search, don't read it whole).
  Other parts: `src/cloud/` (login, jobs sync, induction, sign dialog), `src/compliance/` (registers, audit pack,
  versions), `src/collab/` (comments, share links, live viewer), `src/observer/`, `src/dashboard/`, `src/opsmap/`.
- Hosting: Cloudflare Pages builds `main` automatically (planner.wakingdreamfpv.com). Never use "Onboard Claude" in Cloudflare.
- Backend: Supabase project `jirvugtgclgdbysrfjsc` (Sydney). SQL in `supabase/migrations/0001…`, edge functions in
  `supabase/functions/` (invite-user, notify, manual-link, digest, backup; Verify JWT OFF). Mike pastes SQL and
  function code into the Supabase dashboard himself.

## Every change (the delivery routine)
1. Bump `APP_VERSION` in `src/legacy/planner.jsx` (e.g. '7.22' → '7.23').
2. `npm run build:all` (web build in `dist/`, single offline file in `dist-single/index.html`).
3. Run the tests (below); all must pass.
4. Work on a branch `v7.xx-short-name`, then merge into `main` and push (Cloudflare deploys).
5. Prepend an entry to `CHANGELOG.md` in plain language, ending with the Supabase steps (or "nothing to do").
6. Give Mike the Supabase steps. Every SQL and edge-function file starts with a version header line, e.g.
   `-- ═══ Dream Planner RPA v7.21 · migration 0011_….sql ═══`, so he can check he's pasting the right thing.
   Migrations must be safe to run twice.

## Tests
- Browser: `bash tests/e2e/run_all.sh` (needs a build first; Python + Playwright with Chromium). Uses a mocked
  Supabase (`tests/e2e/harness.py`), so no real accounts or network. Add a `t_v7xx_*.py` suite for each change.
- Database: `cd supabase/tests && node rls11.test.mjs` etc. (PGlite, runs the migrations locally). `run_all.sh` runs them too.
- Don't use `pkill -f` with a pattern that matches your own command.

## Security rules (keep)
- Never ask for, paste or commit the Supabase database password, the service_role / sb_secret key, or the Resend
  key. The publishable (anon) key is public by design. The Resend key lives only in Supabase secrets.
- Crew only see jobs they're listed on (enforced by RLS, not just the UI). Only a CRP account can sign as CRP or approve.
- Observer / client share links never show client data beyond what the plan itself contains.
- Locked records and kept copies (record_versions) are never edited or deleted; corrections are new versions.

## Parked
- Client logins (maybe later; live share links cover viewing and commenting).
