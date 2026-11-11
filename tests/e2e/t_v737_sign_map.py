# v7.37: an RPIC who signed on their own device couldn't be accepted by the CRP: the site map's pins carry a screen
# position worked out on each device (blank when the map hadn't been shown), and it was part of the signed fingerprint.
# Now only the GPS positions are signed, and signatures made the old way on a device without the map still match.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
smp = json.load(open(os.path.join(ROOT, 'public/demo/acme-suncorp.json')))
plan = smp['plan']; plan['overview']['uid'] = 'uid-acme'
job = {'id': 'jobs-1', 'plan_uid': 'uid-acme', 'op_id': plan['overview']['identifier'], 'title': 'Acme', 'status': 'draft', 'plan': plan}
FPS = """async () => { const st = window.__wdFpState(); return { now: await window.__wdFp.planFingerprint(st), old: await window.__wdFp.planFingerprint(st, false, true, 'keep'),
  x: ((st.mapData || {}).launches || [{}])[0].x }; }"""
with sync_playwright() as p:
    b = p.chromium.launch()
    # the RPIC on a phone opens the job (straight to the log, the map never drawn) and signs
    pg = ctx_for(b, 'pilot', {'jobs': [job], 'job_crew': [{'job_id': 'jobs-1', 'person_id': 'pp-p1', 'job_role': 'rpic'}]}, 'home')[0]
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate("window.dispatchEvent(new CustomEvent('wd-open-cloud-job',{detail:{id:'jobs-1'}}))"); pg.wait_for_timeout(5000)
    pilot = pg.evaluate(FPS); pg.context.close()
    # the CRP on a computer opens the same job and looks at the map
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [job]}, 'home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate("(p)=>window.dispatchEvent(new CustomEvent('wd-load-cloud-job',{detail:{job:{id:'jobs-1',uid:'uid-acme',title:'Acme',status:'draft'},plan:p}}))", plan); pg.wait_for_timeout(4000)
    for t in ['Preliminary', 'JSA', 'Authorisation']: pg.evaluate(JS_INC, t); pg.wait_for_timeout(1500)
    crp = pg.evaluate(FPS)
    R.check('(setup) the map positions really differ between the two devices', pilot['x'] != crp['x'], (pilot['x'], crp['x']))
    R.check('the pilot and the CRP now get the same plan version', pilot['now'] == crp['now'], (pilot['now'][:20], crp['now'][:20]))
    R.check('a signature made the old way on the phone is accepted', pg.evaluate("(f)=>window.__wdFp.fpMatches(f, window.__wdFpState())", pilot['old']))
    pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.fill('input[name=operationName]', 'Changed after signing'); pg.wait_for_timeout(600)
    R.check('a real change still voids it', not pg.evaluate("(f)=>window.__wdFp.fpMatches(f, window.__wdFpState())", pilot['now']))
    R.check('no page errors', not errs, errs[:2])
    pg.context.close(); b.close()

# v7.37: CRP override: approve without the RPIC's signature in the planner, with a written reason (shown on the PDF)
R2 = R
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', {'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Test Co'}}, 'hash': 'h0'}]}, 'approval')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Authorisation'); pg.wait_for_timeout(600)
    pg.click('[data-sign-crp]'); sign_dialog(pg); pg.wait_for_timeout(800)
    miss = lambda: pg.inner_text('[data-approve-panel]')
    R.check('override: offered while the RPIC signature is missing', pg.locator('[data-rp-override]').count() == 1 and 'RPIC signature' in miss())
    pg.click('[data-rp-override]'); pg.wait_for_timeout(200)
    pg.fill('[data-rp-override-reason]', 'short')
    R.check('override: needs a reason and the tick', pg.locator('[data-rp-override-save]').is_disabled())
    pg.fill('[data-rp-override-reason]', 'Ben Walker signed digitally in the planner on 11 Nov 2026 at 3:37 pm.'); pg.check('[data-rp-override-declare]')
    pg.click('[data-rp-override-save]'); pg.wait_for_timeout(500)
    ap = pg.evaluate('window.__wdFpState().approval')
    R.check('override: recorded with the reason, who and when', (ap.get('rpOverride') or {}).get('reason', '').startswith('Ben Walker signed') and (ap.get('rpOverride') or {}).get('at') and (ap.get('rpOverride') or {}).get('by'), ap.get('rpOverride'))
    R.check('override: the RPIC signature is no longer blocking', 'RPIC signature' not in miss().split('RPIC signature: CRP override')[0] and pg.locator('[data-rp-override-shown]').count() == 1, miss()[:300])
    pg.evaluate(CAPTURE_PDF); pg.evaluate(JS_INC, 'Export PDF'); pg.wait_for_timeout(2500)
    pdfs = pg.evaluate('window.__pdfs') or []
    R.check('override: printed on the PDF', pdfs and 'RPIC signature: CRP override' in pdfs[-1] and 'Ben Walker signed digitally' in pdfs[-1], len(pdfs))
    pg.click('[data-rp-override-remove]'); pg.wait_for_timeout(300)
    R.check('override: can be removed before approval', not pg.evaluate('window.__wdFpState().approval.rpOverride') and 'RPIC signature' in miss())
    R.check('override: no page errors', not errs, errs[:2])
    pg.context.close(); b.close()
R.done()
