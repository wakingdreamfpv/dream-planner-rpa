# v7.44: Home "Compliance to-do" (missing / expired / not closed out, with Ignore), the maintenance log, and a job
# flagged as flown under another operator's ReOC (no crew checks or to-do items for it, "Other ReOC" on Home).
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
SETUP = {'fleet': {'Pavo 20 Pro': {'registrationNo': 'CASA-1', 'registrationExpiry': '2030-01-01', 'weight': '.15', 'cells': '3'},
                   'Cinelog 30': {'weight': 0, 'cells': '4'}},
         'rpaBatteries': {'Pavo 20 Pro': ['3S-01']},
         'compliance': {'expiries': [{'id': 'exp-reoc', 'label': 'ReOC expiry', 'date': '2029-01-31', 'leadDays': 60}, {'id': 'exp-insurance', 'label': 'Insurance renewal', 'date': '', 'leadDays': 30}]}}
ROW = {'key': 'settings', 'data': SETUP, 'hash': 'h1', 'device': 'Mac', 'updated_at': '2026-11-18T01:00:00Z'}
LS = "localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h1'}));"
PLAN = {'id': 'OP-2026-6456', 'title': 'Simon Lovell', 'savedAt': '2026-09-18T00:00:00Z', 'status': 'approved',
        'overview': {'uid': 'u-mitch', 'identifier': 'OP-2026-6456', 'operationName': 'Simon Lovell shoot', 'operationDate': '2026-09-19', 'rpic': 'Mitch Blunt', 'rpaTypes': ['Pavo 20 Pro']},
        'approval': {'flightAuthApproved': True, 'rpName': 'Mitch Blunt', 'rpSigned': True}, 'log': {'rpaLogs': {'Pavo 20 Pro': {'flights': [{'id': 1, 'duration': '3', 'batteries': ''}]}}}, 'jsa': {}}
ids = lambda pg: pg.evaluate("()=>[...document.querySelectorAll('[data-todo-item]')].map(e=>e.dataset.todoItem)")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW]}, extra=LS)
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, {'savedPlans': [PLAN]}); pg.reload(); pg.wait_for_timeout(8000)
    pg.evaluate(JS_INC, 'Home'); pg.wait_for_timeout(1200)
    order = pg.evaluate("()=>[...document.querySelectorAll('[data-widget]')].map(e=>e.dataset.widget)")
    R.check('Home shows the Compliance to-do near the top', 'todo' in order and order.index('todo') <= 2, order)
    got = ids(pg)
    R.check('aircraft gaps listed (Cinelog 30: no rego, no weight, no packs)', all(('fleet:Cinelog 30:' + k) in got for k in ['norego', 'noweight', 'nopacks']), got)
    R.check('the complete Pavo 20 Pro has nothing to do', not [i for i in got if i.startswith('fleet:Pavo 20 Pro')], got)
    R.check('a company date that is missing is listed (insurance)', 'exp:exp-insurance:nodate' in got and 'exp:exp-reoc:nodate' not in got, got)
    R.check('a pilot with no sign-offs is listed', any(i.startswith('crew:pp-p1:none') for i in got), got)
    R.check('the flown job is listed to close out, and its flight with no battery', any(i.endswith(':close') for i in got) and any(':nobatt:1' in i for i in got), got)
    # ignore one
    pg.click('[data-todo-ignore="fleet:Cinelog 30:norego"]'); pg.wait_for_timeout(800)
    R.check('Ignore hides it and saves it in the setup', 'fleet:Cinelog 30:norego' not in ids(pg) and 'fleet:Cinelog 30:norego' in ((get_db(pg) or {}).get('todoDismissed') or {}))
    pg.click('[data-todo-show-ignored]'); pg.wait_for_timeout(300)
    R.check('...ignored items can be shown and restored', ids(pg) == ['fleet:Cinelog 30:norego'])
    pg.click('[data-todo-show-ignored]'); pg.wait_for_timeout(300)

    # maintenance log
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(800)
    if pg.get_attribute('[data-dbfold="dbsec-maintenance"]', 'data-open') != '1': pg.click('[data-fold-toggle="dbsec-maintenance"]')
    pg.wait_for_timeout(500)
    pg.click('[data-maint-new]'); pg.wait_for_timeout(200)
    pg.fill('[data-maint-date]', '2026-10-22'); pg.click('[data-maint-ac="Pavo 20 Pro"]'); pg.fill('[data-maint-equip]', 'Goggles, Radio, Batteries')
    pg.fill('[data-maint-work]', 'Full maintenance, firmware checks'); pg.click('[data-maint-save]'); pg.wait_for_timeout(800)
    ml = (get_db(pg) or {}).get('maintenanceLog') or []
    R.check('a maintenance entry is added to the log', len(ml) == 1 and ml[0]['aircraft'] == ['Pavo 20 Pro'] and ml[0]['equipment'] == ['Goggles', 'Radio', 'Batteries'] and ml[0]['result'] == 'pass' and ml[0]['date'] == '2026-10-22', ml)
    R.check('...and shows in the table', pg.locator('[data-maint-row]').count() == 1)
    pg.click('[data-maint-new]'); pg.fill('[data-maint-work]', 'x'); pg.click('[data-maint-save]'); pg.wait_for_timeout(300)
    R.check('...an entry with no aircraft or equipment is refused', len((get_db(pg) or {}).get('maintenanceLog') or []) == 1 and 'at least one aircraft' in pg.inner_text('[data-maint-msg]'))

    # other ReOC: open the job from the to-do, flag it on the approval tab
    pg.evaluate(JS_INC, 'Home'); pg.wait_for_timeout(800)
    pg.click('[data-todo-item$=":close"] [data-todo-go]'); pg.wait_for_timeout(1500)
    pg.evaluate("()=>{const b=[...document.querySelectorAll('button')].find(b=>/^Authorisation/.test(b.innerText.trim())&&b.offsetParent);b&&b.click()}"); pg.wait_for_timeout(800)
    R.check('the approval tab has the "another operator\'s ReOC" switch', pg.locator('[data-other-reoc-toggle]').count() == 1)
    pg.select_option('[data-other-reoc-toggle]', 'other'); pg.wait_for_timeout(400)
    pg.fill('[data-other-reoc-operator]', 'Rob Mulallay'); pg.wait_for_timeout(800)
    R.check('...it is kept in the setup, not in the signed plan', ((get_db(pg) or {}).get('otherReocJobs') or {}).get('u-mitch', {}).get('operator') == 'Rob Mulallay'
            and 'otherReoc' not in json.dumps(((get_db(pg) or {}).get('savedPlans') or [{}])[0]))
    pg.evaluate(JS_INC, 'Home'); pg.wait_for_timeout(1200)
    got = ids(pg)
    R.check('Home: the job is no longer on the to-do', not [i for i in got if i.startswith('job:')], got)
    R.check('...and is marked "Other ReOC"', pg.locator('[data-other-reoc-badge]').count() >= 1)
    R.check('no page errors', not errs, errs[:3])
    pg.context.close()

    # free planner and crew: no to-do card
    pg, errs, dl = ctx_for(b, 'pilot'); pg.goto(URL); pg.wait_for_timeout(5000); pg.evaluate(JS_INC, 'Home'); pg.wait_for_timeout(1200)
    R.check('a pilot login has no Compliance to-do', pg.locator('[data-widget="todo"]').count() == 0)
    pg.context.close()
    b.close()
R.done()
