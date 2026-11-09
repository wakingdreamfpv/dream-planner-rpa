# v7.31: the free welcome's three starts (from scratch / the sample job / the tour); the sample job (Acme Corp —
# Suncorp Stadium) opens as the visitor's own copy (new id, edit, save, PDF), also from ?sample and the dashboard;
# without internet it says so; third-party pictures aren't in the public file.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SHOTS = os.environ.get('WD_SHOTS')
IDB = """(name)=>new Promise(r=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>{const g=q.result.transaction('kv').objectStore('kv').get('rpas_database');g.onsuccess=()=>r(g.result?JSON.parse(g.result):null);g.onerror=()=>r(null)}})"""
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
pub = json.load(open(os.path.join(ROOT, 'public', 'demo', 'acme-suncorp.json')))
R.check('public sample file: the job, its aircraft, the stadium map, no ticket-site picture', pub['plan']['overview']['operationName'] == 'Suncorp Stadium Test Job 1'
        and (pub['plan'].get('opsMap') or {}).get('overlay', {}).get('src', '').startswith('data:image') and not pub['plan'].get('siteAttachments') and 'DJI Mavic 3 Pro' in pub['fleet'])
import re as _re
wl = open(os.path.join(ROOT, 'public', 'welcome.html')).read()
imgs = _re.findall(r'<img src="(welcome-img/[^"]+)"', wl)
R.check('v7.32: landing page shows 6 app pictures, all present', len(imgs) == 6 and all(os.path.exists(os.path.join(ROOT, 'public', i)) for i in imgs), imgs)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'anon', None, 'home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    R.check('welcome offers the three starts', pg.locator('[data-free-start]').count() == 1 and pg.locator('[data-free-sample]').count() == 1
            and pg.locator('[data-free-tour-card] [data-free-tour]').count() == 2)
    R.check('...plus the beta and "Get it for your company"', pg.locator('[data-free-beta]').count() == 1 and pg.locator('[data-free-enquiry]').count() == 1)
    if SHOTS: pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300); pg.screenshot(path=SHOTS + '/welcome.png'); pg.set_viewport_size({'width': 1400, 'height': 950})
    pg.click('[data-free-sample]'); pg.wait_for_timeout(2500)
    R.check('the sample job opens', pg.input_value('input[name=operationName]') == 'Suncorp Stadium Test Job 1' and 'Acme Corp' in pg.inner_text('body'))
    R.check('...with a made-up sample operator', 'Sample Drone Co Pty Ltd' in pg.inner_text('[data-head-company]'))
    R.check('...on the plan, welcome closed', pg.locator('[data-free-intro-close]').count() == 0)
    pg.fill('input[name=operationName]', 'Suncorp Stadium Test Job 1 (my copy)'); pg.evaluate(JS_INC, 'Save'); pg.wait_for_timeout(1500)
    db = pg.evaluate(IDB, 'wakingdream_planner__free') or {}
    jobs = (db.get('draftPlans') or []) + (db.get('savedPlans') or [])
    mine = [j for j in jobs if 'my copy' in ((j.get('overview') or {}).get('operationName') or '')]
    R.check('saved as their own copy with a new id', mine and mine[0]['overview'].get('uid') and mine[0]['overview']['uid'] != pub['plan']['overview']['uid'], [(j.get('overview') or {}).get('uid') for j in jobs])
    R.check('the sample\'s aircraft were added', 'DJI Mavic 3 Pro' in (db.get('fleet') or {}) and 'DJI Mini 5 Pro (prop guards)' in (db.get('fleet') or {}))
    pg.evaluate(CAPTURE_PDF); pg.evaluate(JS_INC, 'Export PDF'); pg.wait_for_timeout(3500)
    pdfs = pg.evaluate('window.__pdfs') or []
    R.check('its PDF exports', pdfs and 'Suncorp Stadium Test Job 1' in pdfs[-1] and 'Acme Corp' in pdfs[-1] and 'Planned with Dream Flight RPA Planner' in pdfs[-1], len(pdfs))
    R.check('v7.32: the map\'s own checks are never on the PDF', pdfs and 'Advanced Operations Map' in pdfs[-1] and 'Map checks' not in pdfs[-1] and 'To fix' not in pdfs[-1] and 'To check' not in pdfs[-1] and 'needs 30 m' not in pdfs[-1])
    if SHOTS: pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(500); pg.screenshot(path=SHOTS + '/sample.png'); pg.set_viewport_size({'width': 1400, 'height': 950})
    R.check('sample: no page errors', not errs, errs[:2])
    pg.context.close()
    # ?sample link: straight in, no welcome
    pg, errs, dl = ctx_for(b, 'anon', None, 'home')
    pg.goto(URL + '?sample'); pg.wait_for_timeout(6000)
    R.check('a ?sample link opens it straight away', pg.locator('input[name=operationName]').count() and pg.input_value('input[name=operationName]') == 'Suncorp Stadium Test Job 1' and pg.locator('[data-free-intro-close]').count() == 0 and '?sample' not in pg.url)
    pg.context.close()
    # dashboard button, and no internet
    pg, errs, dl = ctx_for(b, 'anon', None, 'home', "localStorage.setItem('wd_free_intro','1');")
    pg.route('**/demo/acme-suncorp.json', lambda r: r.abort())
    pg.goto(URL); pg.wait_for_timeout(5000)
    R.check('free dashboard has "See a sample job"', pg.locator('[data-dash-sample]').count() == 1)
    pg.click('[data-dash-sample]'); pg.wait_for_timeout(1500)
    R.check('without internet it says so', any('internet' in m for m in dl), dl)
    pg.unroute('**/demo/acme-suncorp.json'); pg.click('[data-dash-sample]'); pg.wait_for_timeout(2500)
    R.check('...and works once back online', pg.locator('input[name=operationName]').count() and pg.input_value('input[name=operationName]') == 'Suncorp Stadium Test Job 1')
    pg.context.close()
    # the tour still works
    pg, errs, dl = ctx_for(b, 'anon', None, 'home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.click('[data-free-tour=mini]'); pg.wait_for_timeout(2500)
    R.check('the 2-minute tour still starts', 'SAMPLE JOB TOUR' in pg.inner_text('body').upper())
    pg.context.close()
    b.close()
R.done()
