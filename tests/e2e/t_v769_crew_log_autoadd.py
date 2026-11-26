# v7.69: Mike got the "log complete" email, opened the job, and nothing was added or saved: crew flights only went in via
# Home › Awaiting action › Review log plus a manual save. Now opening the job any way (job list, email link, Awaiting action)
# adds the crew's flights and answers and saves the job (device + account). They're marked as added only after the account
# has it, so a failed save leaves them waiting. Approval and signatures are never touched.
import sys, os, json, copy; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
A, B = 'BETAFPV Meteor 1S', 'Nazgul 5'
smp = json.load(open(os.path.join(ROOT, 'public/demo/acme-suncorp.json')))
plan = smp['plan']; plan['overview']['uid'] = 'uid-ax'; plan['overview']['rpaTypes'] = [A, B]
plan['overview']['identifier'] = 'OP-2026-8715'; plan['overview']['operationName'] = 'GC Media'
plan['log'] = dict(plan.get('log') or {}, rpaLogs={r: {'flights': [{'id': 1, 'duration': '', 'batteries': ''}]} for r in [A, B]})
plan['approval'] = dict(plan.get('approval') or {}, flightAuthApproved=True, crpSigned=True, rpSigned=True, crpName='Michael Rubio', rpName='Test Pilot', approvedDates='2026-11-26')
job = {'id': 'job-ax', 'plan_uid': 'uid-ax', 'op_id': 'OP-2026-8715', 'title': 'GC Media', 'status': 'approved', 'start_date': '2026-11-26', 'plan': plan}
fl = lambda i, rpa, d: {'id': 'jf-%d' % i, 'job_id': 'job-ax', 'person_id': 'pp-p1', 'rpa': rpa, 'created_at': '2026-11-26T03:40:0%dZ' % i,
                        'flight': {'id': 100 + i, 'label': '26/11 10:0%d' % i, 'duration': str(d), 'batteries': 'Pack %d' % i, 'segments': []}}
ROWS = [fl(1, A, 3), fl(2, A, 4), fl(3, B, 5),
        {'id': 'jf-8', 'job_id': 'job-ax', 'person_id': 'pp-p1', 'rpa': None, 'created_at': '2026-11-26T03:40:08Z', 'flight': {'kind': 'post_flight', 'fields': {'defects': 'Prop nick on Meteor', 'serviceableAtEnd': True}}},
        {'id': 'jf-9', 'job_id': 'job-ax', 'person_id': 'pp-p1', 'rpa': None, 'created_at': '2026-11-26T03:40:09Z', 'flight': {'kind': 'log_complete', 'flights': 3, 'minutes': 12, 'aircraft': [A, B], 'answers': True}}]
IDS = sorted(r['id'] for r in ROWS)
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
def nflights(lg): return {r: len([f for f in ((lg.get('rpaLogs') or {}).get(r) or {}).get('flights') or [] if str(f.get('duration') or '').strip()]) for r in [A, B]}
def local_plan(pg):
    d = get_db(pg) or {}
    return next((p for p in d.get('savedPlans') or [] if (p.get('overview') or {}).get('uid') == 'uid-ax'), None), d
def cloud_plan(pg): return pg.evaluate("(window.__T.jobs.find(j=>j.plan_uid==='uid-ax')||{}).plan")
imported = lambda pg: sorted(pg.evaluate("JSON.parse(localStorage.getItem('wd_cloud_imported')||'[]')"))
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1) the approved job is on this device; the CRP opens it from Saved approved plans
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [copy.deepcopy(job)], 'job_flights': copy.deepcopy(ROWS)}, 'home')
    pg.goto(URL); pg.wait_for_timeout(2500)
    saved = dict(copy.deepcopy(plan), id='OP-2026-8715', title='GC Media', status='approved', savedAt='2026-11-26T00:20:00Z')
    pg.evaluate(SET_LOCAL, {'companyProfile': {'name': 'Waking Dream FPV'}, 'savedPlans': [saved]}); pg.reload(); pg.wait_for_timeout(5000)
    R.check('(setup) waiting in Awaiting action first', pg.locator('[data-await="crew-log-complete"]').count() == 1)
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(1200)
    pg.click('[data-dbfold="dbsec-approved"] button.bg-blue-600'); pg.wait_for_timeout(9000)
    lp, d = local_plan(pg); cp = cloud_plan(pg) or {}
    R.check('job list: flights added to the job on this device (2 + 1)', lp and nflights(lp.get('log') or {}) == {A: 2, B: 1}, lp and nflights(lp.get('log') or {}))
    R.check('...post-flight answers added', lp and (lp.get('log') or {}).get('defects') == 'Prop nick on Meteor', lp and (lp.get('log') or {}).get('defects'))
    R.check('...and saved to the account', nflights(cp.get('log') or {}) == {A: 2, B: 1}, nflights(cp.get('log') or {}))
    ap = (lp or {}).get('approval') or {}
    R.check('approval and signatures untouched, still an approved plan', ap.get('flightAuthApproved') and ap.get('crpSigned') and ap.get('rpSigned') and lp.get('status') == 'approved' and not any((x.get('overview') or {}).get('uid') == 'uid-ax' for x in d.get('draftPlans') or []), ap)
    R.check('CRP told what was added', any('Added from Test Pilot and saved' in m and 'log is complete' in m for m in dl), dl[-1:])
    R.check('marked as added only now (all 5 rows)', imported(pg) == IDS, imported(pg))
    pg.evaluate(JS_INC, 'Home'); pg.wait_for_timeout(1000)
    R.check('gone from Awaiting action', pg.locator('[data-await="crew-log-complete"]').count() == 0 and pg.locator('[data-await="crew-flights"]').count() == 0)
    # opening again adds nothing twice
    n0 = len(dl); pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(800); pg.click('[data-dbfold="dbsec-approved"] button.bg-blue-600'); pg.wait_for_timeout(5000)
    lp, _ = local_plan(pg)
    R.check('opening again: no duplicates, no message', nflights(lp.get('log') or {}) == {A: 2, B: 1} and not any('Added from' in m for m in dl[n0:]), (nflights(lp.get('log') or {}), dl[n0:]))
    R.check('no page errors (job list)', not errs, errs[:2])
    pg.context.close()
    # 2) the email link #crew-log=<job id>, job not on this device (opened from the account)
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [copy.deepcopy(job)], 'job_flights': copy.deepcopy(ROWS)}, 'home')
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, {'companyProfile': {'name': 'Waking Dream FPV'}}); pg.goto(URL + '#crew-log=job-ax'); pg.reload(); pg.wait_for_timeout(14000)
    lp, d = local_plan(pg); cp = cloud_plan(pg) or {}
    R.check('email link: job opened with the flights added', pg.evaluate("window.__wdFpState().overview.uid") == 'uid-ax' and any('Added from Test Pilot' in m for m in dl), dl[-1:])
    R.check('...saved on this device as approved', lp and nflights(lp.get('log') or {}) == {A: 2, B: 1}, (lp and nflights(lp.get('log') or {}), [x.get('id') for x in d.get('draftPlans') or []]))
    R.check('...and in the account', nflights(cp.get('log') or {}) == {A: 2, B: 1}, nflights(cp.get('log') or {}))
    R.check('...marked as added', imported(pg) == IDS, imported(pg))
    R.check('...link cleared from the address bar', '#crew-log' not in pg.url, pg.url)
    R.check('no page errors (link)', not errs, errs[:2])
    pg.context.close()
    # 3) account save fails: stays in Awaiting action
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [copy.deepcopy(job)], 'job_flights': copy.deepcopy(ROWS)}, 'home')
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, {'companyProfile': {'name': 'Waking Dream FPV'}, 'savedPlans': [saved]}); pg.reload(); pg.wait_for_timeout(5000)
    pg.evaluate("""()=>{const m=window.__WD_SUPABASE_MOCK__,f=m.from;m.from=(t)=>{const a=f(t);if(t!=='jobs')return a;const u=a.upsert;a.upsert=(...x)=>{u(...x);return {select(){return {single:async()=>({data:null,error:{message:'offline'}})}}}};return a}}""")
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(1000)
    pg.click('[data-dbfold="dbsec-approved"] button.bg-blue-600'); pg.wait_for_timeout(9000)
    lp, _ = local_plan(pg)
    R.check('failed account save: still saved on this device', lp and nflights(lp.get('log') or {}) == {A: 2, B: 1}, lp and nflights(lp.get('log') or {}))
    R.check('...not marked as added', imported(pg) == [], imported(pg))
    R.check('...CRP told it stays in Awaiting action', any("couldn't be saved to your account" in m for m in dl), dl[-1:])
    pg.evaluate(JS_INC, 'Home'); pg.wait_for_timeout(1000)
    R.check('...still in Awaiting action', pg.locator('[data-await="crew-log-complete"]').count() == 1)
    R.check('no page errors (failed save)', not errs, errs[:2])
    pg.context.close(); b.close()
R.done()
