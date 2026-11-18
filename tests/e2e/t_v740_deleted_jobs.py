# v7.40: a job deleted on one device is marked cancelled in the account (not erased); other devices that still have it
# ask "delete here too / keep it"; "keep" puts it back in the account; deleted jobs are never downloaded again.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SETUP = {'key': 'settings', 'data': {'companyProfile': {'name': 'Waking Dream FPV'}}, 'hash': 'h0', 'device': 'Mac'}
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
def plan(uid, opid, name, saved='2026-11-18T00:30:00Z'):
    return {'id': opid, 'title': name, 'savedAt': saved, 'status': 'draft', 'overview': {'uid': uid, 'identifier': opid, 'operationName': name, 'operationDate': '2026-11-25'}}
def row(uid, opid, name, status='draft', at='2026-11-18T00:30:00Z'):
    return {'id': 'j-' + uid, 'plan_uid': uid, 'op_id': opid, 'title': name, 'status': status, 'start_date': '2026-11-25', 'updated_at': at, 'plan': plan(uid, opid, name)}
HEZ, OTH = plan('u-hez', 'OP-2026-0001', 'Hezzelic homes'), plan('u-oth', 'OP-2026-0002', 'Other job')
SYNCED = "localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h0'}));localStorage.setItem('wd_cloud_synced', JSON.stringify({'u-hez':'draft|2026-11-18T00:30:00Z|[]','u-oth':'draft|2026-11-18T00:30:00Z|[]'}));"
names = lambda pg: [((x.get('overview') or {}).get('operationName')) for x in ((get_db(pg) or {}).get('draftPlans') or [])]
job_calls = lambda pg, op: [c for c in (pg.evaluate('window.__calls') or []) if c.get('t') == 'jobs' and c.get('op') == op]
def device(seed_jobs):
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [SETUP], 'jobs': seed_jobs}, extra=SYNCED)
    pg.goto(URL); pg.wait_for_timeout(2500); pg.evaluate(SET_LOCAL, {'companyProfile': {'name': 'Waking Dream FPV'}, 'draftPlans': [HEZ, OTH]}); pg.reload(); pg.wait_for_timeout(7000)
    return pg, errs, dl
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. the computer deletes the draft → marked cancelled in the account, not downloaded back
    pg, errs, dl = device([row('u-hez', 'OP-2026-0001', 'Hezzelic homes'), row('u-oth', 'OP-2026-0002', 'Other job')])
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(600)
    pg.evaluate("""()=>{ const bs=[...document.querySelectorAll('[data-del-job=draftPlans]')]; for (const b of bs) { let n=b; for (let i=0;i<6&&n;i++){ n=n.parentElement; if(n && /Hezzelic/.test(n.textContent) && !/Other job/.test(n.textContent)){ b.click(); return true; } } } return false; }""")
    pg.wait_for_timeout(2500)
    R.check('deleting asks first and says the other devices will ask too', any('other devices will ask' in m for m in dl), dl[-1:])
    R.check('gone from this device, the other job kept', names(pg) == ['Other job'], names(pg))
    up = job_calls(pg, 'update')
    R.check('marked as deleted (cancelled) in the account, not erased', any((c.get('payload') or {}).get('status') == 'cancelled' for c in up) and not job_calls(pg, 'delete'), up[-1:])
    pg.evaluate("window.dispatchEvent(new Event('wd-cloud-refresh'))"); pg.wait_for_timeout(6000)
    R.check('...and not downloaded back when the account list refreshes', names(pg) == ['Other job'], names(pg))
    R.check('no page errors (delete)', not errs, errs[:3])
    pg.context.close()

    # 2. the phone still has it: asks, and doesn't send it back meanwhile
    jobs2 = [row('u-hez', 'OP-2026-0001', 'Hezzelic homes', 'cancelled', '2026-11-18T05:00:00Z'), row('u-oth', 'OP-2026-0002', 'Other job')]
    pg, errs, dl = device(jobs2)
    R.check('phone: "deleted on another device" with just that job', pg.locator('[data-gone-elsewhere]').count() == 1 and pg.locator('[data-gone-job]').count() == 1 and 'Hezzelic homes' in pg.inner_text('[data-gone-elsewhere]'))
    R.check('...still on the phone until you answer', 'Hezzelic homes' in names(pg))
    pg.evaluate(SET_LOCAL, {'draftPlans': [dict(HEZ, savedAt='2026-11-18T06:00:00Z'), OTH]}); pg.reload(); pg.wait_for_timeout(7000)
    R.check('...and an edit to it is not sent back to the account before you answer', not [c for c in job_calls(pg, 'upsert') if (c.get('payload') or {}).get('plan_uid') == 'u-hez'])
    pg.click('[data-gone-keep="u-hez"]'); pg.wait_for_timeout(3000)
    ups = [c for c in job_calls(pg, 'upsert') if (c.get('payload') or {}).get('plan_uid') == 'u-hez']
    R.check('"Keep it" puts it back in the account as a draft', ups and ups[-1]['payload'].get('status') == 'draft', ups[-1:])
    R.check('...and the question goes away', pg.locator('[data-gone-elsewhere]').count() == 0)
    R.check('no page errors (keep)', not errs, errs[:3])
    pg.context.close()

    # 3. "Delete here too"
    pg, errs, dl = device(jobs2)
    pg.click('[data-gone-delete="u-hez"]'); pg.wait_for_timeout(1500)
    R.check('"Delete here too" removes it from the phone, other job kept', names(pg) == ['Other job'], names(pg))
    R.check('...not sent back to the account', not [c for c in job_calls(pg, 'upsert') if (c.get('payload') or {}).get('plan_uid') == 'u-hez'])
    R.check('...a safety copy from before is kept', pg.evaluate("""()=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const g=q.result.transaction('kv').objectStore('kv').get('rpas_database_safety');g.onsuccess=()=>r(!!g.result && /Hezzelic/.test(g.result))}})"""))
    pg.wait_for_timeout(1000)
    R.check('...and the question goes away', pg.locator('[data-gone-elsewhere]').count() == 0)
    pg.context.close()

    # 4. a new device never downloads a deleted job, and Home doesn't list it
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [SETUP], 'jobs': jobs2}, start='home', extra="localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h0'}));")
    pg.goto(URL); pg.wait_for_timeout(9000)
    R.check('new device: deleted job not downloaded, the other one is', names(pg) == ['Other job'], names(pg))
    R.check('...and not on Home', 'Hezzelic' not in pg.inner_text('body'))
    R.check('no page errors (new device)', not errs, errs[:3])
    pg.context.close()
    b.close()
R.done()
