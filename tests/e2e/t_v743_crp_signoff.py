# v7.43: the CRP is signed off on every aircraft and approval by default (missing ones recorded as checks), with a
# switch in Registers & currency to turn it off. Existing checks are never touched.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
FLEET = {'Pavo 20 Pro': {'cells': '3'}, 'BETAFPV Meteor 1S': {'cells': '1'}}
ROW = lambda data: {'key': 'settings', 'data': data, 'hash': 'h1', 'device': 'Mac', 'updated_at': '2026-11-18T01:00:00Z'}
LS = "localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h1'}));"
checks = lambda pg: [c['args'] for c in (pg.evaluate('window.__calls') or []) if c.get('rpc') == 'record_check']

with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. on by default: only the missing ones are recorded, for the CRP's own record
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW({'fleet': FLEET})], 'certifications': [{'id': 'c0', 'person_id': 'pp-crp', 'competency': 'type:Pavo 20 Pro', 'check_date': '2026-01-01'}]}, extra=LS)
    pg.goto(URL); pg.wait_for_timeout(8000)
    got = checks(pg); comps = sorted(a['p_competency'] for a in got)
    R.check('missing sign-offs recorded: induction, EVLOS, OONP, night and the Meteor 1S', comps == sorted(['induction', 'evlos', 'oonp', 'night', 'type:BETAFPV Meteor 1S']), comps)
    R.check('...all on the CRP\'s own record, dated today, marked automatic', got and all(a['p_person'] == 'pp-crp' and 'automatic' in a['p_assessor'] and len(a['p_check_date']) == 10 for a in got), got[:2])
    R.check('the existing Pavo check is left alone', 'type:Pavo 20 Pro' not in comps and not [c for c in pg.evaluate('window.__calls') if c.get('t') == 'certifications' and c.get('op') != 'select'])
    # the switch in Registers & currency
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(800)
    if pg.get_attribute('[data-dbfold="dbsec-registers"]', 'data-open') != '1': pg.click('[data-fold-toggle="dbsec-registers"]')
    pg.wait_for_timeout(1000)
    R.check('the switch shows in Registers & currency, on', pg.locator('[data-crp-auto-toggle]').count() == 1 and pg.is_checked('[data-crp-auto-toggle]'))
    pg.click('[data-crp-auto-toggle]'); pg.wait_for_timeout(1200)
    R.check('turning it off is saved in the setup', ((get_db(pg) or {}).get('compliance') or {}).get('crpAutoSignoff') is False, (get_db(pg) or {}).get('compliance'))
    R.check('no page errors', not errs, errs[:3])
    pg.context.close()

    # 2. switched off (from another device): nothing is recorded
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW({'fleet': FLEET, 'compliance': {'crpAutoSignoff': False}})]}, extra=LS)
    pg.goto(URL); pg.wait_for_timeout(8000)
    R.check('switched off: no sign-offs recorded', not checks(pg), checks(pg)[:2])
    pg.context.close()

    # 3. a pilot's login never records anything
    pg, errs, dl = ctx_for(b, 'pilot', seed={'crp_store': [ROW({'fleet': FLEET})]})
    pg.goto(URL); pg.wait_for_timeout(6000)
    R.check('a pilot login records no sign-offs', not checks(pg))
    pg.context.close()
    b.close()
R.done()
