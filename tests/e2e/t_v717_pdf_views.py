# v7.17: crew map opens zoomed to the job; PDF views (standard unchanged, Client / My record / WHS / CASA, one-off tweak, editor, shared with crew)
import sys, os, re; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
PLAN = {'overview': {'uid': 'uid-1', 'identifier': 'OP-2026-0101', 'operationName': 'Bridge Shoot', 'operationDate': '2026-11-20', 'rpaTypes': ['DJI Mini 4 Pro'], 'rpic': 'Test Pilot', 'location': 'Story Bridge'},
  'mapData': {'launches': [{'id': 1, 'x': 40, 'y': 50, 'label': 'Launch 1', 'lat': -27.4637, 'lng': 153.0359}], 'recoveries': [{'id': 2, 'x': 60, 'y': 50, 'label': 'Recovery 1', 'lat': -27.4640, 'lng': 153.0362}],
    'signage': [], 'areaPolygon': [{'x': 30, 'y': 30, 'lat': -27.4630, 'lng': 153.0350}, {'x': 70, 'y': 30, 'lat': -27.4630, 'lng': 153.0370}, {'x': 70, 'y': 70, 'lat': -27.4648, 'lng': 153.0370}], 'crowdZones': [], 'exclusionZones': []},
  'approval': {'rpName': 'Test Pilot'}, 'jsa': {'operationTypes': ['VLOS']}, 'risks': [{'refNo': '001', 'hazard': 'Wind', 'resL': '1', 'resC': 'D', 'initL': '3', 'initC': 'C'}], 'log': {'rpaLogs': {}}}
with sync_playwright() as p:
    b = p.chromium.launch()
    job = {'id': 'jobs-1', 'plan_uid': 'uid-1', 'title': 'Bridge Shoot', 'status': 'draft', 'start_date': '2026-11-20', 'plan': PLAN}
    for role, pid in [('pilot', 'pp-p1'), ('observer', 'pp-o1')]:
        pg, errs, dl = ctx_for(b, role, {'jobs': [job], 'job_crew': [{'job_id': 'jobs-1', 'person_id': pid, 'job_role': role}]}, 'home')
        pg.goto(URL); pg.wait_for_timeout(5500)
        pg.click('[data-crew-open=jobs-1]'); pg.wait_for_timeout(2500)
        if not pg.evaluate(JS_INC, 'Preliminary'): pg.evaluate(JS_INC, 'Plan')
        pg.wait_for_timeout(1500)
        z = pg.evaluate("(()=>{const el=[...document.querySelectorAll('.leaflet-container')].find(e=>e.offsetParent);if(!el)return null;const t=el.querySelector('.leaflet-tile');return t?t.src:null})()")
        zm = re.search(r'z=(\d+)', z or '') or re.search(r'/(\d+)/\d+/\d+$', z or '')
        R.check(role + ': map opens zoomed to the job (not the whole world)', zm and int(zm.group(1)) >= 14, z)
        R.check(role + ': no page errors', not errs, errs[:2])
        pg.context.close()
    pg, errs, dl = ctx_for(b, 'crp', {})
    pg.goto(URL); pg.wait_for_timeout(4000)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, PLAN); pg.reload(); pg.wait_for_timeout(5000); open_draft(pg)
    pg.evaluate(CAPTURE_PDF); pg.evaluate(JS_INC, 'Export PDF'); pg.wait_for_timeout(2500)
    std = (pg.evaluate('window.__pdfs') or [''])[-1]
    R.check('Export PDF is still the standard PDF', pg.locator('[data-testid=pdf-views]').count() == 0 and all(x in std for x in ['Preliminary Assessment Checklist', 'Risk Assessment Register', 'Post-Flight Log', 'Flight Log by RPA']) and 'data-pdf-view=' not in std, len(std))
    pg.click('[data-pdf-views-open]'); pg.wait_for_timeout(300)
    names = pg.evaluate("[...document.querySelectorAll('[data-testid=pdf-views] [data-pdf-view]')].map(e=>e.dataset.pdfView)")
    R.check('views menu: Standard + Client, My record, WHS inspector, CASA', names == ['standard', 'client', 'record', 'whs', 'casa'], names)
    pg.click('[data-pdf-view=client]'); pg.wait_for_timeout(2500)
    cl = pg.evaluate('window.__pdfs')[-1]
    R.check('Client view: plan, maps, risks and sign-off in', all(x in cl for x in ['Operations Overview', 'Operations Area Map', 'Risk Assessment Register', 'Approval &amp; Flight Authorisation']))
    R.check('Client view: no checklist, JSA, post-flight or flight log', not any(x in cl for x in ['Preliminary Assessment Checklist', 'Job Safety Assessment (JSA)', 'Post-Flight Log', 'Flight Log by RPA']))
    R.check('the PDF names the view', 'data-pdf-view="client"' in cl and 'Client view' in cl)
    pg.click('[data-pdf-views-open]'); pg.wait_for_timeout(300); pg.click('[data-pdf-view=whs]'); pg.wait_for_timeout(2500)
    wh = pg.evaluate('window.__pdfs')[-1]
    R.check('WHS view: JSA, risks and post-flight in; flight log out', 'Job Safety Assessment (JSA)' in wh and 'Post-Flight Log' in wh and 'Flight Log by RPA' not in wh)
    pg.click('[data-pdf-views-open]'); pg.wait_for_timeout(300); pg.click('[data-pdf-view-tweak=casa]'); pg.wait_for_timeout(300)
    R.check('tweak starts from the view', pg.locator('[data-pdf-sec]:checked').count() == 18)
    pg.uncheck('[data-pdf-sec=risks]'); pg.uncheck('[data-pdf-sec=map]'); pg.click('[data-pdf-custom-print]'); pg.wait_for_timeout(2500)
    tw = pg.evaluate('window.__pdfs')[-1]
    R.check('one-off print leaves out the unticked sections', 'Risk Assessment Register' not in tw and 'Operations Area Map' not in tw and 'Flight Log by RPA' in tw and 'CASA (adjusted)' in tw)
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(600)
    R.check('PDF views editor in Settings', pg.locator('[data-pdf-views-editor]').count() == 1 and pg.locator('[data-pdf-view-edit]').count() == 4)
    pg.fill('[data-pdf-view-name=client]', 'Client pack'); pg.uncheck('[data-pdf-view-sec="client:heatmap"]')
    pg.click('[data-pdf-view-add]'); pg.wait_for_timeout(1200)
    saved = (get_db(pg) or {}).get('pdfViews')
    R.check('views saved with the company settings', saved and len(saved) == 5 and saved[0]['name'] == 'Client pack' and saved[0]['sections']['heatmap'] is False)
    pg.wait_for_timeout(3500)
    pub = pg.evaluate("JSON.stringify(((window.__T.shared_data||[]).find(r=>r.area==='company')||{}).data||null)")
    R.check('views shared with crew', pub and 'Client pack' in pub, (pub or '')[:200])
    R.check('no page errors (CRP)', not errs, errs[:3])
    b.close()
R.done()
