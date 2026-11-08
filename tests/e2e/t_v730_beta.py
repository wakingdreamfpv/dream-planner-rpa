# v7.30: the free beta. A visitor joins (name, email, company, no payment): the full planner on their device until
# 10 Jan 2027, their free job comes too, the sign-up goes to the CRP's Enquiries (retried if offline). After the end
# date they're back on the free planner and can download everything they made.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SHOTS = os.environ.get('WD_SHOTS')
IDB = """(name)=>new Promise(r=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>{const g=q.result.transaction('kv').objectStore('kv').get('rpas_database');g.onsuccess=()=>r(g.result?JSON.parse(g.result):null);g.onerror=()=>r(null)}})"""
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'anon', None, 'home', "localStorage.setItem('wd_free_intro','1');")
    pg.goto(URL); pg.wait_for_timeout(5000)
    R.check('free bar offers the beta', pg.locator('[data-free-bar-beta]').count() == 1 and pg.locator('[data-dash-beta]').count() == 1)
    # a job in the free planner first
    pg.evaluate(JS_INC, 'New operation'); pg.wait_for_timeout(800)
    if pg.locator('input[name=operationName]').count(): pg.fill('input[name=operationName]', 'Expo demo shoot')
    pg.evaluate(JS_INC, 'Save'); pg.wait_for_timeout(1200)
    free = pg.evaluate(IDB, 'wakingdream_planner__free') or {}
    had = [x.get('title') or (x.get('overview') or {}).get('operationName') for x in (free.get('draftPlans') or []) + (free.get('savedPlans') or [])]
    R.check('(setup) the free planner holds a job', any(str(n).startswith('Expo demo shoot') for n in had), had)
    pg.click('[data-free-bar-beta]'); pg.wait_for_timeout(400)
    R.check('beta sign-up opens', pg.locator('[data-beta-form]').count() == 1 and 'until 9 January 2027' in pg.inner_text('[data-testid=beta-join]') and 'No payment details' in pg.inner_text('[data-testid=beta-join]'))
    if SHOTS: pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300); pg.screenshot(path=SHOTS + '/beta-join.png'); pg.set_viewport_size({'width': 1400, 'height': 950})
    pg.click('[data-beta-start]'); pg.wait_for_timeout(200)
    R.check('a name is needed', 'name' in pg.inner_text('[data-beta-err]'))
    pg.fill('[data-beta=name]', 'Bea Tester'); pg.fill('[data-beta=email]', 'Bea@Example.com'); pg.fill('[data-beta=company]', 'Tester Aerial')
    pg.click('[data-beta-start]'); pg.wait_for_timeout(200)
    R.check('the sign-up tick is needed', 'tick' in pg.inner_text('[data-beta-err]'))
    pg.check('[data-beta=consent]')
    pg.click('[data-beta-start]'); pg.wait_for_timeout(6000)
    R.check('joined: the beta space, not free', pg.evaluate('window.__WD_NS') == 'beta' and pg.locator('[data-free-banner]').count() == 0 and pg.locator('[data-beta-banner]').count() == 1)
    info = json.loads(pg.evaluate("localStorage.getItem('wd_beta')") or '{}')
    R.check('sign-up sent to Enquiries (name, email, company)', info.get('sent') is True and info.get('email') == 'bea@example.com' and info.get('company') == 'Tester Aerial', info)
    R.check('beta bar shows the end date and days left', 'until 9 January 2027' in pg.inner_text('[data-beta-banner]') and 'days left' in pg.inner_text('[data-beta-banner]'))
    R.check('company setup opens straight away', pg.locator('[data-testid=setup-wizard]').count() == 1)
    beta = pg.evaluate(IDB, 'wakingdream_planner__beta') or {}
    got = [x.get('title') or (x.get('overview') or {}).get('operationName') for x in (beta.get('draftPlans') or []) + (beta.get('savedPlans') or [])]
    R.check('the free job came across', any(str(n).startswith('Expo demo shoot') for n in got), got)
    pg.keyboard.press('Escape'); pg.reload(); pg.wait_for_timeout(5000)
    R.check('still in the beta after a reload, no sign-in choice', pg.evaluate('window.__WD_NS') == 'beta' and pg.locator('[data-beta-banner]').count() == 1 and pg.locator('[data-welcome-signin]').count() == 0)
    pg.evaluate(CAPTURE_PDF); pg.evaluate(JS_INC, 'Export PDF'); pg.wait_for_timeout(3000)
    pdfs = pg.evaluate('window.__pdfs') or []
    R.check('beta PDFs carry the "Planned with" line', pdfs and 'Planned with Dream Flight RPA Planner' in pdfs[-1], len(pdfs))
    with pg.expect_download() as d: pg.click('[data-beta-backup]')
    R.check('Back up downloads a backup file', d.value.suggested_filename.endswith('.json'))
    if SHOTS: pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300); pg.screenshot(path=SHOTS + '/beta-mode.png'); pg.set_viewport_size({'width': 1400, 'height': 950})
    R.check('beta: no page errors', not errs, errs[:2])
    # the beta ends
    pg.evaluate("localStorage.setItem('wd_beta_end_test','2026-01-01T00:00:00')"); pg.reload(); pg.wait_for_timeout(5000)
    R.check('after the end date: back on the free planner', pg.evaluate('window.__WD_NS') == 'free' and pg.locator('[data-beta-banner]').count() == 0)
    R.check('...with a "thanks for testing" box', pg.locator('[data-testid=beta-ended]').count() == 1)
    with pg.expect_download() as d: pg.click('[data-beta-download]')
    rec = json.load(open(d.value.path()))
    names = [x.get('title') or (x.get('overview') or {}).get('operationName') for x in (rec.get('draftPlans') or []) + (rec.get('savedPlans') or [])]
    R.check('...and they can download everything they made', any(str(n).startswith('Expo demo shoot') for n in names) and rec.get('_backup'), names)
    pg.click('[data-beta-ended-free]'); pg.wait_for_timeout(300)
    R.check('free bar: "My beta records", no new beta', pg.locator('[data-free-bar-beta-records]').count() == 1 and pg.locator('[data-free-bar-beta]').count() == 0)
    pg.reload(); pg.wait_for_timeout(5000)
    R.check('the box only shows once', pg.locator('[data-testid=beta-ended]').count() == 0)
    R.check('ended: no page errors', not errs, errs[:2])
    pg.context.close()
    # ?beta link (landing page) opens the sign-up; with no signal the beta still starts and the sign-up is sent later
    pg, errs, dl = ctx_for(b, 'anon', None, 'home', "localStorage.setItem('wd_free_intro','1');window.__RPC={submit_enquiry:()=>({data:null,error:{message:'Failed to fetch'}})};")
    pg.goto(URL + '?beta'); pg.wait_for_timeout(5000)
    R.check('a ?beta link opens the sign-up', pg.locator('[data-beta-form]').count() == 1 and '?beta' not in pg.url)
    pg.fill('[data-beta=name]', 'No Signal'); pg.fill('[data-beta=email]', 'nosig@example.com'); pg.check('[data-beta=consent]'); pg.click('[data-beta-start]'); pg.wait_for_timeout(6000)
    info = json.loads(pg.evaluate("localStorage.getItem('wd_beta')") or '{}')
    R.check('no signal: the beta still starts, sign-up waiting', pg.evaluate('window.__WD_NS') == 'beta' and info.get('sent') is False)
    pg.context.close()
    # A signed-in CRP sees none of it
    pg, errs, dl = ctx_for(b, 'crp', {'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Test Co'}}, 'hash': 'h0'}]}, 'home')
    pg.goto(URL + '?beta'); pg.wait_for_timeout(5000)
    R.check('CRP: no beta bar, no sign-up box', pg.locator('[data-beta-banner]').count() == 0 and pg.locator('[data-beta-form]').count() == 0 and pg.locator('[data-free-bar-beta]').count() == 0)
    pg.context.close()
    b.close()
R.done()
