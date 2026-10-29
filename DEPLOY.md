# Deploying Dream Planner RPA

## How it's set up (Oct 2026)
- **Code:** private GitHub repo `wakingdreamfpv/dream-planner-rpa` (branch `main`).
- **Hosting:** Cloudflare **Pages** project `dream-planner`. It builds `npm run build`, publishes `dist/` and deploys on
  every push to `main`.
  - Addresses: `https://planner.wakingdreamfpv.com` (CNAME `planner` → `dream-planner-6f6.pages.dev` in Squarespace DNS)
    and `https://dream-planner-6f6.pages.dev`.
  - Build variable: `NODE_VERSION` = `20`.
- **Cloud database / logins:** Supabase project `jirvugtgclgdbysrfjsc` (Sydney). Setup steps are in `supabase/SETUP-CHUNK1.md`.
- **Offline file:** `npm run build:single` produces `dist-single/index.html`, delivered as `WakingDream_vX.YY.html`.

A Cloudflare **Worker** (`dream-planner-rpa`, `*.workers.dev`) was created by mistake during the first setup. It
deploys with `npx wrangler deploy` using `wrangler.jsonc`. It isn't needed: delete it in Cloudflare and then
delete `wrangler.jsonc` and the `wrangler` dev-dependency.

## Releasing a change
1. Edit the code (the app is `src/legacy/planner.jsx` plus modules in `src/`) and bump `APP_VERSION` in
   `src/legacy/planner.jsx`. The page title picks it up automatically.
2. `npm run build:all`, then test (see README).
3. Commit and push to `main`. Cloudflare publishes within about 2 minutes, and open copies of the app update next
   time they load.

## Moving data between copies
Browsers keep each website's data separately: Database & Settings › **Export backup** in one copy, then
**Import backup** in the other. The welcome screen on a new device offers this too. Cloud sync (later chunks)
removes the need.
