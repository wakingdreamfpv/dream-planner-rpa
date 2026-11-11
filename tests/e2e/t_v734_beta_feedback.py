# v7.34: beta testers' feedback / bug reports / feature requests; new beta testers find the sample job in their list;
# "Clear sample data" in the setup wizard; a short list of popular aircraft and packs to pick; and the free planner and
# the beta never show the owner's own business details (instrument numbers, battery numbers, name and phone).
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
IDB = """(name)=>new Promise(r=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>{const g=q.result.transaction('kv').objectStore('kv').get('rpas_database');g.onsuccess=()=>r(g.result?JSON.parse(g.result):null);g.onerror=()=>r(null)}})"""
OWNER = ['9037', '1266519', '1209476', 'OONP.0079', 'EVLOS.0346', 'RPAS.1040', '0433 011 409', 'Michael Rubio', '3S-550-2025', 'Manual V7']
def leaks(pg):
    html = pg.content()
    return [w for w in OWNER if w in html]
with sync_playwright() as p:
    b = p.chromium.launch()
    # ── free planner: none of the owner's details anywhere we can open
    pg, errs, dl = ctx_for(b, 'anon', None, 'home', "localStorage.setItem('wd_free_intro','1');window.__RPC={submit_enquiry:(a)=>({data:'enq-'+(a.p_source||''),error:null})};")
    pg.goto(URL); pg.wait_for_timeout(5000)
    found = []
    for tab in ['Preliminary', 'JSA', 'Authorisation', 'Database & Settings']:
        pg.evaluate(JS_INC, tab); pg.wait_for_timeout(700); found += leaks(pg)
    R.check('free: no owner instrument numbers, ARN, ReOC, name, phone or battery numbers', not found, sorted(set(found)))
    fr = pg.evaluate(IDB, 'wakingdream_planner__free') or {}
    R.check('free: starts with the short popular aircraft list, no battery numbers', 'DJI Mini 5 Pro' in (fr.get('fleet') or {}) and 'Freefly Alta X' not in (fr.get('fleet') or {}) and not (fr.get('batteries') or []), list((fr.get('fleet') or {}).keys()))
    # ── join the beta (set up now)
    pg.evaluate(JS_INC, 'Home'); pg.wait_for_timeout(500)
    pg.click('[data-free-bar-beta]'); pg.wait_for_timeout(400)
    pg.fill('[data-beta=name]', 'Fay Tester'); pg.fill('[data-beta=email]', 'fay@example.com'); pg.check('[data-beta=consent]')
    pg.click('[data-beta-start]'); pg.wait_for_timeout(400); pg.click('[data-beta-setup-now]'); pg.wait_for_timeout(7000)
    beta = pg.evaluate(IDB, 'wakingdream_planner__beta') or {}
    plans = (beta.get('draftPlans') or []) + (beta.get('savedPlans') or [])
    R.check('new beta tester: the sample job is waiting in their job list', any(x.get('id') == 'SAMPLE-ACME' and str(x.get('title', '')).startswith('SAMPLE') for x in plans), [x.get('id') for x in plans])
    R.check('...and its aircraft are marked as sample', any((f or {}).get('sample') for f in (beta.get('fleet') or {}).values()))
    R.check('setup wizard open, offering "Clear sample data"', pg.locator('[data-testid=setup-wizard]').count() == 1 and pg.locator('[data-wiz-clear-sample]').count() == 1)
    R.check('wizard: no owner details in the placeholders', not [w for w in OWNER if w in pg.inner_html('[data-testid=setup-wizard]')])
    pg.click('[data-wiz-clear-sample]'); pg.wait_for_timeout(800)
    R.check('clearing asks first, then confirms', any('Clear all sample data' in m for m in dl) and pg.locator('[data-wiz-sample-cleared]').count() == 1)
    beta = pg.evaluate(IDB, 'wakingdream_planner__beta') or {}
    plans = (beta.get('draftPlans') or []) + (beta.get('savedPlans') or [])
    R.check('sample job and sample aircraft are gone', not any(x.get('id') == 'SAMPLE-ACME' for x in plans) and not any((f or {}).get('sample') for f in (beta.get('fleet') or {}).values()), [x.get('id') for x in plans])
    R.check('...but the job they made themselves is kept (none here) and nothing else broke', not errs, errs[:2])
    # fleet: popular picks
    pg.click('[data-wiz-next]'); pg.wait_for_timeout(200); pg.click('[data-wiz-next]'); pg.wait_for_timeout(300)
    R.check('fleet step: popular aircraft to tap, none ticked yet', pg.locator('[data-wiz-pop]').count() == 8 and pg.locator('[data-wiz-nofleet]').count() == 1)
    pg.click('[data-wiz-pop="DJI Mini 5 Pro"]'); pg.click('[data-wiz-pop="DJI Mavic 3 Pro"]'); pg.wait_for_timeout(300)
    R.check('tapping adds them as aircraft', pg.locator('[data-wiz-fleet]').count() == 2 and pg.locator('[data-wiz-nofleet]').count() == 0)
    pg.click('[data-wiz-next]'); pg.wait_for_timeout(300)
    R.check('battery step: quick-add packs for those aircraft', pg.locator('[data-wiz-poppack]').count() == 2)
    pg.click('[data-wiz-poppack="DJI Mini 5 Pro"]'); pg.wait_for_timeout(200)
    pg.click('[data-wiz-next]'); pg.wait_for_timeout(200); pg.click('[data-wiz-finish]'); pg.wait_for_timeout(1500)
    beta = pg.evaluate(IDB, 'wakingdream_planner__beta') or {}
    fl = beta.get('fleet') or {}
    R.check('finished: just their two aircraft, with the right weight', sorted(fl.keys()) == ['DJI Mavic 3 Pro', 'DJI Mini 5 Pro'] and abs(fl['DJI Mini 5 Pro'].get('weight', 0) - 0.25) < 0.001 and not fl['DJI Mini 5 Pro'].get('suggested'), {k: v.get('weight') for k, v in fl.items()})
    R.check('...and 4 packs for the Mini 5 Pro', (beta.get('rpaBatteries') or {}).get('DJI Mini 5 Pro') == ['MINI5-01', 'MINI5-02', 'MINI5-03', 'MINI5-04'], beta.get('rpaBatteries'))
    found = []
    for tab in ['Authorisation', 'Database & Settings']:
        pg.evaluate(JS_INC, tab); pg.wait_for_timeout(700); found += leaks(pg)
    R.check('beta: no owner details either', not found, sorted(set(found)))
    # feedback
    R.check('beta bar has "Feedback & bugs"', pg.locator('[data-beta-feedback]').count() == 1)
    pg.click('[data-beta-feedback]'); pg.wait_for_timeout(300)
    R.check('feedback form: bug / feature / general, name already known', pg.locator('[data-feedback-kind]').count() == 3 and 'Fay Tester' in pg.inner_text('[data-testid=beta-feedback]') and pg.locator('[data-feedback=email]').count() == 0)
    pg.click('[data-feedback-send]'); pg.wait_for_timeout(200)
    R.check('an empty report is not sent', pg.locator('[data-feedback-err]').count() == 1)
    pg.click('[data-feedback-kind=idea]'); pg.fill('[data-feedback=message]', 'Add a wind gust alert'); pg.click('[data-feedback-send]'); pg.wait_for_timeout(800)
    calls = pg.evaluate('window.__calls') or []
    sub = [c for c in calls if c.get('rpc') == 'submit_enquiry' and (c.get('args') or {}).get('p_source', '').startswith('feedback-')]
    a = (sub[-1].get('args') if sub else {}) or {}
    R.check('sent as a feature request with the app version', a.get('p_source') == 'feedback-idea' and a.get('p_email') == 'fay@example.com' and 'Add a wind gust alert' in a.get('p_message', '') and 'App v7.' in a.get('p_message', ''), a)
    R.check('...Mike is emailed', any(c.get('invoke') == 'enquiry-alert' and (c.get('body') or {}).get('id') == 'enq-feedback-idea' for c in calls))
    R.check('...and the tester is thanked', pg.locator('[data-feedback-done]').count() == 1)
    R.check('beta: no page errors', not errs, errs[:2])
    pg.context.close()
    # ── the owner (signed-in CRP) still has their own instruments
    pg, errs, dl = ctx_for(b, 'crp', {'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Test Co'}}, 'hash': 'h0'}]}, 'approval')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(800)
    R.check('CRP: own instruments unchanged (CASA.OONP.0079)', 'CASA.OONP.0079' in pg.content())
    R.check('CRP: no feedback button', pg.locator('[data-beta-feedback]').count() == 0)
    pg.context.close()
    # ── Enquiries list labels feedback
    rows = [{'id': 'e1', 'created_at': '2026-11-10T01:00:00Z', 'name': 'Fay Tester', 'email': 'fay@example.com', 'interest': None, 'message': '[Something\'s not working]\nMap froze', 'source': 'feedback-bug', 'status': 'new'}]
    pg, errs, dl = ctx_for(b, 'crp', {'enquiries': rows, 'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Test Co'}}, 'hash': 'h0'}]}, 'database')
    pg.goto(URL); pg.wait_for_timeout(5000)
    if pg.locator('[data-enquiries]').count() == 0: pg.evaluate(JS_INC, 'Enquiries'); pg.wait_for_timeout(1200)
    R.check('Enquiries: bug reports are labelled', pg.locator('[data-enquiry-feedback=feedback-bug]').count() == 1, pg.locator('[data-enquiries]').count())
    pg.context.close()
    b.close()
R.done()
