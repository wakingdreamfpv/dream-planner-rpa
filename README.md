# Dream Planner RPA (Waking Dream FPV)

Operations planner, JSA and Flight Record app for Rubio Enterprises Pty Ltd (ReOC, ARN 1266519).

This is the **Vite project** version of the planner (Chunk 0 of the crew compliance roadmap). The app code is
the same as the single-file planner up to v5.47, moved in unchanged, so every existing feature keeps working.

## Two builds from one codebase

| Command | Output | Use |
|---|---|---|
| `npm run build` | `dist/` | **Hosted app**, e.g. https://planner.wakingdreamfpv.com. Installable (Add to Home Screen / Install app) and works offline after the first visit. |
| `npm run build:single` | `dist-single/index.html` | **Single offline file**, like the old `WakingDream_vX.YY.html`. Open it straight from your computer; no internet needed. |
| `npm run dev` | dev server | Local development with live reload. |

Requirements: Node 20+ (`node -v`), then `npm install` once.

## Project layout

```
index.html                 page shell (print styles, Leaflet inlined for the PDF export)
src/main.jsx               entry: globals → styles → storage → planner → offline support
src/globals.js             React / ReactDOM globals the planner was written against
src/legacy/planner.jsx     the planner app (from the single-file version, unchanged)
src/storage/index.js       storage-mode setting: local / sync / cloud (only 'local' active so far)
src/cloud/                 Supabase client + Account & crew panel (hosted app only; Chunk 1)
src/pwa.js                 service worker registration (hosted build only)
src/styles/app.css         Tailwind + Font Awesome (solid + regular, woff2)
public/                    app icons
scripts/vendor-fa.mjs      regenerates the trimmed Font Awesome CSS when upgrading
supabase/migrations/       database schema + row-level security (run in Supabase SQL Editor)
supabase/functions/        edge functions (invite-user)
supabase/tests/            RLS tests: `cd supabase/tests && npm i @electric-sql/pglite && node rls.test.mjs && node rls2.test.mjs`
```

The app version is `APP_VERSION` in `src/legacy/planner.jsx`; the page title uses it automatically.

Build notes:
- The planner relies on classic-script hoisting, so `let`/`const` are compiled to `var`
  (`@babel/plugin-transform-block-scoping`, see `vite.config.js`). Don't remove it, or the app will crash on load
  with "Cannot access … before initialization".
- Leaflet's CSS/JS stay inline in `index.html` with ids `wd-leaflet-css` / `wd-leaflet-js`, because the PDF export
  copies them into the print window.

## Storage modes (decided 26 Oct 2026)

Each device chooses one:
- **Local only.** Everything stays in this browser (IndexedDB). No account needed. *This is the only mode in Chunk 0.*
- **Local + cloud sync.** Works offline and syncs jobs to the cloud when online.
- **Cloud only.** Every save goes straight to the server, so all devices are always in sync.

The sync and cloud modes arrive with the backend (Chunks 1–2), behind the same storage interface the planner
already uses (`wdStore`).

## Deploying the hosted app

Pushing to `main` deploys to https://planner.wakingdreamfpv.com (Cloudflare Pages). See `DEPLOY.md`.
