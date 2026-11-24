# v7.52: the Dream Flight tools are on the same website: /tools/, /hud/ and /log/ serve their own pages (not the
# planner), also once the planner's service worker is installed and controlling the site; the planner header links to them.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
PAGES = [('tools', 'Dream Flight Tools'), ('hud', 'HUD Studio'), ('log', 'Dream Flight Log')]
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1) straight from the server, no service worker yet
    ctx = b.new_context(service_workers='block'); ctx.route('**/*', lambda r: r.abort() if (r.request.url.startswith('http') and 'localhost:4173' not in r.request.url) else r.continue_())
    pg = ctx.new_page()
    for path, title in PAGES:
        pg.goto(URL + path + '/'); pg.wait_for_timeout(600)
        R.check('/%s/ loads its own page (%s)' % (path, title), title in pg.title() and 'wd-account-slot' not in pg.content(), pg.title())
    ctx.close()
    # 2) after the planner's service worker has installed and controls the site
    ctx = b.new_context(service_workers='allow'); ctx.route('**/*', lambda r: r.abort() if (r.request.url.startswith('http') and 'localhost:4173' not in r.request.url) else r.continue_())
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(3000)
    sw = pg.evaluate("()=>navigator.serviceWorker ? navigator.serviceWorker.ready.then(r=>!!r.active) : false")
    if not pg.evaluate("()=>!!(navigator.serviceWorker && navigator.serviceWorker.controller)"): pg.reload(); pg.wait_for_timeout(2500)
    ctl = pg.evaluate("()=>!!(navigator.serviceWorker && navigator.serviceWorker.controller)")
    R.check('the planner\'s service worker is installed and in control', sw and ctl, (sw, ctl))
    R.check('the planner header links to Tools, HUD Studio and Flight Log', [pg.get_attribute('[data-head-tool="%s"]' % k, 'href') for k, _ in PAGES] == ['/tools/', '/hud/', '/log/'])
    for path, title in PAGES:
        pg.goto(URL + path + '/'); pg.wait_for_timeout(800)
        R.check('with the service worker: /%s/ still loads %s, not the planner' % (path, title), title in pg.title() and 'wd-account-slot' not in pg.content(), pg.title())
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate("()=>document.querySelector('[data-head-tool=\"tools\"]').click()"); pg.wait_for_timeout(1500)
    R.check('clicking Tools in the header opens the Tools page in the same tab', 'Dream Flight Tools' in pg.title() and pg.url.endswith('/tools/'), (pg.url, pg.title()))
    cached = pg.evaluate("()=>caches.keys().then(ks=>Promise.all(ks.map(k=>caches.open(k).then(c=>c.keys())))).then(a=>a.flat().map(r=>r.url).filter(u=>/\\/(tools|hud|log)\\//.test(u)))")
    R.check('the tools are not precached by the planner (HUD Studio is 1.4 MB)', cached == [], cached)
    ctx.close(); b.close()
R.done()
