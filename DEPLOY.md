# Deploying Dream Planner RPA to planner.wakingdreamfpv.com

Squarespace can't host a separate app at a page path such as `wakingdreamfpv.com/dreamplannerRPA`, because every
path on that domain is a Squarespace page. Use a **subdomain** instead: the app is hosted on a free static host
and Squarespace only needs one DNS record. Your main website is untouched.

Recommended host: **Cloudflare Pages**. It's free, fast in Australia and has unlimited bandwidth. Netlify works
the same way.

## 1. Put the code on GitHub (one-off)
1. Create a free GitHub account, then a **private** repository called `dream-planner-rpa`.
2. Upload this project folder. Don't upload `node_modules`, `dist` or `dist-single`; `.gitignore` excludes them.

## 2. Connect Cloudflare (one-off)

The project is deployed as a **Cloudflare Worker with static assets** (Workers Builds): build command `npm run build`,
deploy command `npx wrangler deploy`. `wrangler.jsonc` in the repo tells it to publish `dist/` as a single-page app.
(The older "Pages" flow below also works if you prefer it.)

### Older alternative: Cloudflare Pages
1. Create a free Cloudflare account, then go to **Workers & Pages › Create › Pages › Connect to Git** and pick the repo.
2. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variable: `NODE_VERSION` = `20`
3. Deploy. You get a test address like `dream-planner-rpa.pages.dev`; check it works there first.

## 3. Add the subdomain
1. In Cloudflare Pages: **Custom domains › Set up a domain**, then enter `planner.wakingdreamfpv.com`.
   Cloudflare shows a **CNAME** target (your `*.pages.dev` address).
2. In Squarespace: **Settings › Domains › wakingdreamfpv.com › DNS settings › Add record**:
   - Type **CNAME**
   - Host `planner`
   - Data: the `*.pages.dev` address from step 1
3. Wait for DNS to update (usually minutes, up to a few hours). Cloudflare adds the HTTPS certificate automatically.

If your domain is managed somewhere other than Squarespace (for example it was bought elsewhere), add the same
CNAME record there instead.

## 4. Updates
Every push to the GitHub repo rebuilds and redeploys automatically. Open copies of the app pick up the new
version the next time they load.

## 5. Moving your existing data (important)
Browsers keep each website's data separately. Plans saved in the local file version **won't appear automatically**
in the hosted app (or the other way round):
1. In the local file version: **Database & Settings › Export backup (JSON)**.
2. In the hosted app: **Database & Settings › Import backup**.

From Chunk 1 onwards, the cloud sync modes remove the need for this.
