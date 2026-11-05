# Core smoke (CRP login, mocked cloud): planner loads, every tab opens, draft saves and reloads, CRP + RPIC sign, approve, PDF exports.
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
PLAN = {'overview': {'identifier': 'OP-2026-0201', 'operationName': 'Smoke Job', 'operationDate': '2026-11-20', 'rpaTypes': ['DJI Mini 4 Pro'], 'rpic': 'Test Pilot', 'location': 'Story Bridge'},
  'mapData': {'launches': [{'id': 1, 'x': 40, 'y': 50, 'label': 'Launch 1', 'lat': -27.4637, 'lng': 153.0359}], 'recoveries': [], 'signage': [], 'areaPolygon': [], 'crowdZones': [], 'exclusionZones': []},
  'approval': {'rpName': 'Test Pilot', 'crpName': 'Michael Rubio'}, 'jsa': {'operationTypes': ['VLOS']},
  'risks': [{'refNo': '001', 'hazard': 'Wind', 'riskDescription': 'Gusts', 'existingControls': 'Limits', 'initL': '3', 'initC': 'C', 'resL': '1', 'resC': 'D', 'riskOwner': 'RPIC'}]}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', {})
    pg.goto(URL); pg.wait_for_timeout(4000)
    R.check('planner loads with the version', 'v7.' in pg.inner_text('body'))
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, PLAN); pg.reload(); pg.wait_for_timeout(4000); open_draft(pg)
    R.check('draft reloads', 'Smoke Job' in pg.inner_text('body'))
    for t in ['Preliminary', 'JSA & Risk', 'Authorisation', 'Flight Log', 'Compliance Calendar', 'Database & Settings', 'Home']:
        ok = pg.evaluate(JS_INC, t); pg.wait_for_timeout(500)
        R.check('tab opens: ' + t, ok)
    pg.evaluate(JS_INC, 'Authorisation'); pg.wait_for_timeout(500)
    pg.click('[data-sign-crp]'); sign_dialog(pg)
    pg.click('[data-sign-rp]'); sign_dialog(pg)
    R.check('CRP and RPIC signed', pg.locator('[data-sig-shown=crp]').count() == 1 and pg.locator('[data-sig-shown=rp]').count() == 1)
    pg.evaluate(CAPTURE_PDF); pg.evaluate(JS_INC, 'Export PDF'); pg.wait_for_timeout(2500)
    h = (pg.evaluate('window.__pdfs') or [''])[-1]
    R.check('PDF exports with every section', all(x in h for x in ['Operations Overview', 'Job Safety Assessment', 'Risk Assessment Register', 'Approval &amp; Flight Authorisation', 'Post-Flight Log', 'Flight Log by RPA']), len(h))
    R.check('no page errors', not errs, errs[:3])
    b.close()
R.done()
