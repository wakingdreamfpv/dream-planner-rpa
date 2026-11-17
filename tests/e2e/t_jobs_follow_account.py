# Jobs follow the account: a CRP device downloads every job saved to the account (draft, approved, completed);
# newer account copies update untouched local ones; local edits and completed records are never overwritten.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SETUP = {'key': 'settings', 'data': {'companyProfile': {'name': 'Waking Dream FPV'}}, 'hash': 'h0', 'device': 'Mac'}
def plan(uid, name, saved, date='2026-10-01', **kw):
    return {'id': 'OP-' + uid, 'savedAt': saved, 'overview': {'uid': uid, 'identifier': 'OP-' + uid, 'operationName': name, 'operationDate': date}, **kw}
JOBS = [
  {'id': 'j1', 'plan_uid': 'u1', 'op_id': 'OP-u1', 'title': 'Hezzelic homes flythrough', 'status': 'draft', 'start_date': '2026-11-20', 'updated_at': '2026-11-16T10:00:00Z', 'plan': plan('u1', 'Hezzelic homes flythrough', '2026-11-16T10:00:00Z', '2026-11-20')},
  {'id': 'j2', 'plan_uid': 'u2', 'op_id': 'OP-u2', 'title': 'Veteran Games', 'status': 'approved', 'start_date': '2026-10-05', 'updated_at': '2026-10-04T10:00:00Z', 'plan': plan('u2', 'Veteran Games', '2026-10-04T10:00:00Z', '2026-10-05', approval={'flightAuthApproved': True})},
  {'id': 'j3', 'plan_uid': 'u3', 'op_id': 'OP-u3', 'title': 'Mondrian promo', 'status': 'completed', 'start_date': '2026-09-10', 'updated_at': '2026-09-12T10:00:00Z', 'plan': plan('u3', 'Mondrian promo', '2026-09-11T10:00:00Z', '2026-09-10', completedAt='2026-09-12T10:00:00Z')},
]
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
names = lambda d, k: [((p.get('overview') or {}).get('operationName')) for p in (d.get(k) or [])]
ups = lambda pg: [c for c in (pg.evaluate('window.__calls') or []) if c.get('t') == 'jobs' and c.get('op') == 'upsert']
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. a new device: every job comes down into the right list
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [SETUP], 'jobs': [dict(j) for j in JOBS]}); pg.goto(URL); pg.wait_for_timeout(9000)
    d = get_db(pg) or {}
    R.check('draft job downloaded into Draft flight plans', 'Hezzelic homes flythrough' in names(d, 'draftPlans'), names(d, 'draftPlans'))
    R.check('approved (past) job downloaded into Saved approved plans', 'Veteran Games' in names(d, 'savedPlans'), names(d, 'savedPlans'))
    R.check('completed job downloaded into Completed flight records', 'Mondrian promo' in names(d, 'completedFlights'), names(d, 'completedFlights'))
    R.check('it says so', pg.locator('[data-setup-note]').count() == 1 and '3 jobs downloaded' in pg.inner_text('[data-setup-note]'), pg.locator('[data-setup-note]').all_inner_texts())
    R.check('downloaded jobs are not sent straight back up', not [c for c in ups(pg) if (c['payload'] or {}).get('plan_uid') in ('u1', 'u2', 'u3')], [c['payload'].get('plan_uid') for c in ups(pg)])
    pg.reload(); pg.wait_for_timeout(7000)
    d = get_db(pg) or {}
    R.check('after a reload nothing is doubled up', len(d.get('draftPlans') or []) == 1 and len(d.get('savedPlans') or []) == 1 and len(d.get('completedFlights') or []) == 1)
    R.check('no page errors (new device)', not errs, errs[:3])
    pg.context.close()

    # 2. this device has an older copy it hasn't touched; the account has a newer one → updated (local trace kept)
    newer = dict(JOBS[0]); newer['updated_at'] = '2026-11-17T01:00:00Z'; newer['plan'] = plan('u1', 'Hezzelic homes flythrough (v2)', '2026-11-17T01:00:00Z', '2026-11-20')
    old = plan('u1', 'Hezzelic homes flythrough', '2026-11-16T10:00:00Z', '2026-11-20', siteAttachments=[{'name': 'site.jpg'}])
    sig = 'draft|2026-11-16T10:00:00Z|[]'
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [SETUP], 'jobs': [newer]},
                           extra="localStorage.setItem('wd_cloud_synced', JSON.stringify({u1:%s})); localStorage.setItem('wd_cloud_pulled', JSON.stringify({u1:'2026-11-16T10:00:05Z'}));" % json.dumps(sig))
    pg.goto(URL); pg.wait_for_timeout(2500); pg.evaluate(SET_LOCAL, {'draftPlans': [old], 'companyProfile': {'name': 'Waking Dream FPV'}}); pg.reload(); pg.wait_for_timeout(9000)
    d = get_db(pg) or {}; dp = d.get('draftPlans') or []
    R.check('untouched older copy is updated from the account', len(dp) == 1 and dp[0]['overview']['operationName'] == 'Hezzelic homes flythrough (v2)', names(d, 'draftPlans'))
    R.check('this device\'s site attachments are kept', dp and dp[0].get('siteAttachments') == [{'name': 'site.jpg'}])
    pg.context.close()

    # 3. this device changed its copy (not sent yet) → never overwritten
    mine = plan('u1', 'Hezzelic homes — my edits', '2026-11-17T02:00:00Z', '2026-11-20')
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [SETUP], 'jobs': [newer]},
                           extra="localStorage.setItem('wd_cloud_synced', JSON.stringify({u1:%s})); localStorage.setItem('wd_cloud_pulled', JSON.stringify({u1:'2026-11-16T10:00:05Z'}));" % json.dumps(sig))
    pg.goto(URL); pg.wait_for_timeout(2500); pg.evaluate(SET_LOCAL, {'draftPlans': [mine], 'companyProfile': {'name': 'Waking Dream FPV'}}); pg.reload(); pg.wait_for_timeout(9000)
    d = get_db(pg) or {}
    R.check('local edits are kept (and sent up instead)', names(d, 'draftPlans') == ['Hezzelic homes — my edits'] and any((c['payload'] or {}).get('plan_uid') == 'u1' for c in ups(pg)), names(d, 'draftPlans'))
    pg.context.close()

    # 4. a completed record on this device is never replaced
    done = plan('u3', 'Mondrian promo (local record)', '2026-09-11T10:00:00Z', '2026-09-10', completedAt='2026-09-12T10:00:00Z')
    j3 = dict(JOBS[2]); j3['updated_at'] = '2026-11-17T01:00:00Z'
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [SETUP], 'jobs': [j3]})
    pg.goto(URL); pg.wait_for_timeout(2500); pg.evaluate(SET_LOCAL, {'completedFlights': [done], 'companyProfile': {'name': 'Waking Dream FPV'}}); pg.reload(); pg.wait_for_timeout(9000)
    d = get_db(pg) or {}
    R.check('completed record on this device is never replaced', names(d, 'completedFlights') == ['Mondrian promo (local record)'], names(d, 'completedFlights'))
    pg.context.close()

    # 5. crew never download the CRP's job list this way
    pg, errs, dl = ctx_for(b, 'pilot', seed={'jobs': [dict(j) for j in JOBS]}); pg.goto(URL); pg.wait_for_timeout(7000)
    R.check('crew: no download requests', not [c for c in (pg.evaluate('window.__calls') or []) if c.get('t') == 'jobs' and c.get('op') == 'select' and 'j1' in json.dumps(c)])
    R.check('no page errors (crew)', not errs, errs[:3])
    pg.context.close()
    b.close()
R.done()
