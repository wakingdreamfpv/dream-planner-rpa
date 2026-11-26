# v7.63: an RPIC signature for a job that's already approved (e.g. with the CRP override) kept popping up
# "signed an earlier version of this plan" every time the job opened, and sat in Awaiting action. It's now settled:
# no pop-up, not listed. A signature for a job that isn't approved yet still shows as before.
import sys, os, json, copy; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
smp = json.load(open(os.path.join(ROOT, 'public/demo/acme-suncorp.json')))
plan = smp['plan']; plan['overview']['uid'] = 'uid-ok'
ok = copy.deepcopy(plan)
ok['approval'] = dict(ok.get('approval') or {}, crpSigned=True, flightAuthApproved=True, approvedAt='2026-11-19T05:34:21Z',
                      rpOverride={'reason': 'Pilot signed in the planner on 11 Nov.', 'at': '2026-11-19T05:34:21Z', 'by': {'name': 'Michael Rubio'}, 'rpicSignatures': ['fl-ok']})
dr = copy.deepcopy(plan); dr['overview']['uid'] = 'uid-dr'; dr['overview']['operationName'] = 'Draft Shoot'
sig = lambda t: {'kind': 'rpic_signature', 'name': 'Test Pilot', 'arn': '1', 'date': '2026-11-11', 'fingerprint': 'sha256:' + 'b5c7e1d80a' * 6 + 'abcd', 'title': t,
                 'sig': {'at': '2026-11-11T05:37:00Z', 'method': 'click'}}
seed = {'jobs': [{'id': 'jobs-ok', 'plan_uid': 'uid-ok', 'op_id': 'OP-1', 'title': 'Approved Job', 'status': 'approved', 'plan': ok},
                 {'id': 'jobs-dr', 'plan_uid': 'uid-dr', 'op_id': 'OP-2', 'title': 'Draft Job', 'status': 'draft', 'plan': dr}],
        'job_flights': [{'id': 'fl-ok', 'job_id': 'jobs-ok', 'rpa': None, 'person_id': 'pp-p1', 'created_at': '2026-11-11T05:37:00Z', 'flight': sig('Approved Job')},
                        {'id': 'fl-dr', 'job_id': 'jobs-dr', 'rpa': None, 'person_id': 'pp-p1', 'created_at': '2026-11-11T05:38:00Z', 'flight': sig('Draft Job')}]}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', seed, 'home')
    dialogs = []
    pg.on('dialog', lambda d: dialogs.append(d.message))
    pg.goto(URL); pg.wait_for_timeout(6000)
    fl = pg.evaluate('(window.wdCrewFlights||[]).map(f=>f.id)')
    R.check('(setup) both signatures reached the CRP', 'fl-ok' in fl and 'fl-dr' in fl, fl)
    home = pg.inner_text('body')
    R.check('Awaiting action: the draft job\'s signature is still listed', 'signed as RPIC: Draft Job' in home, home[:400])
    R.check('Awaiting action: the approved job\'s signature is not listed', 'signed as RPIC: Approved Job' not in home)
    # open the approved job: no "signed an earlier version" pop-up
    pg.evaluate("(p)=>window.dispatchEvent(new CustomEvent('wd-load-cloud-job',{detail:{job:{id:'jobs-ok',uid:'uid-ok',title:'Approved Job',status:'approved'},plan:p}}))", ok)
    pg.wait_for_timeout(4000)
    R.check('opening the approved job: no signature pop-up', not any('earlier version' in d for d in dialogs), dialogs)
    R.check('the approval and the override are untouched', pg.evaluate('(()=>{const a=window.__wdFpState().approval;return !!(a.flightAuthApproved&&a.rpOverride)})()'))
    # open the draft job: its (mismatched) signature is still checked, so the warning still appears there
    pg.evaluate("(p)=>window.dispatchEvent(new CustomEvent('wd-load-cloud-job',{detail:{job:{id:'jobs-dr',uid:'uid-dr',title:'Draft Job',status:'draft'},plan:p}}))", dr)
    pg.wait_for_timeout(4000)
    R.check('opening the draft job: its signature is still checked', any('earlier version' in d for d in dialogs), dialogs)
    R.check('no page errors', not errs, errs[:2])
    pg.context.close(); b.close()
R.done()
