# v7.39: safe merge of the company setup between devices (changes from both kept; only real clashes are asked, item by
# item, with the newer copy pre-picked), jobs keep downloading while a question is open, and two jobs that got the same
# OP number on different devices never replace each other.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
BASE = {'companyProfile': {'name': 'Waking Dream FPV', 'phone': '0400 000 001', 'email': 'old@example.com'}}
ROW = lambda data, h='cloud-new', at='2026-11-18T01:00:00Z': {'key': 'settings', 'data': data, 'hash': h, 'device': 'iPhone · Safari', 'updated_at': at}
LS = lambda base, local_at=0: ("localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h-base'}));"
                               "localStorage.setItem('wd_setup_base', JSON.stringify({hash:'h-base', data:%s}));" % json.dumps(base))
calls = lambda pg, t: [c for c in (pg.evaluate('window.__calls') or []) if c.get('t') == t]
setup_ups = lambda pg: [c['payload'] for c in calls(pg, 'crp_store') if c['op'] == 'upsert']

def plan(uid, opid, name, saved, date='2026-11-25'):
    return {'id': opid, 'title': name, 'savedAt': saved, 'status': 'draft', 'overview': {'uid': uid, 'identifier': opid, 'operationName': name, 'operationDate': date}}

with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. different changes on each device: merged with no question
    cloud = {'companyProfile': {**BASE['companyProfile'], 'email': 'new@example.com'}}
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW(cloud)]}, extra=LS(BASE))
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, {'companyProfile': {**BASE['companyProfile'], 'phone': '0400 999 999'}}); pg.reload(); pg.wait_for_timeout(8000)
    cp = (get_db(pg) or {}).get('companyProfile') or {}
    R.check('no "which one" question when the changes are different', pg.locator('[data-setup-choice]').count() == 0)
    R.check('phone from this device AND email from the iPhone both kept', cp.get('phone') == '0400 999 999' and cp.get('email') == 'new@example.com', cp)
    R.check('it says it merged', pg.locator('[data-setup-note]').count() == 1 and 'merged' in pg.inner_text('[data-setup-note]'), pg.locator('[data-setup-note]').all_inner_texts())
    up = setup_ups(pg)
    R.check('the merged setup is saved back to the account', up and up[-1]['data']['companyProfile'].get('phone') == '0400 999 999' and up[-1]['data']['companyProfile'].get('email') == 'new@example.com', up[-1:])
    R.check('a safety copy was kept from before', pg.evaluate("""()=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const g=q.result.transaction('kv').objectStore('kv').get('rpas_database_safety');g.onsuccess=()=>r(!!g.result)}})"""))
    R.check('no page errors (auto merge)', not errs, errs[:3])
    pg.context.close()

    # 2. the same thing changed on both: ask about just that item, newer pre-picked; jobs still download meanwhile
    cloud = {'companyProfile': {**BASE['companyProfile'], 'name': 'Waking Dream FPV Pty Ltd', 'email': 'new@example.com'}}
    JOB = {'id': 'j9', 'plan_uid': 'u-hez', 'op_id': 'OP-2026-0001', 'title': 'Hezzelic homes', 'status': 'draft', 'start_date': '2026-11-25', 'updated_at': '2026-11-18T00:30:00Z',
           'plan': plan('u-hez', 'OP-2026-0001', 'Hezzelic homes', '2026-11-18T00:30:00Z')}
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW(cloud)], 'jobs': [JOB]}, extra=LS(BASE))
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, {'companyProfile': {**BASE['companyProfile'], 'name': 'Waking Dream', 'phone': '0400 999 999'},
                            'draftPlans': [plan('u-mac', 'OP-2026-0001', 'Mac job', '2026-11-17T09:00:00Z')]}); pg.reload(); pg.wait_for_timeout(9000)
    R.check('both changed the company name: a merge screen', pg.locator('[data-setup-choice]').count() == 1)
    items = pg.locator('[data-merge-item]').all()
    R.check('it asks about just that one item', len(items) == 1 and pg.get_attribute('[data-merge-item]', 'data-merge-item') == 'Company profile › Name', [i.get_attribute('data-merge-item') for i in items])
    R.check('the iPhone copy (newer) is pre-picked', 'newer' in pg.inner_text('[data-merge-item] [data-merge-pick=cloud]').lower() and pg.locator('[data-merge-item] [data-merge-pick=cloud] .fa-circle-check').count() == 1)
    R.check('nothing is uploaded or shared with crew while it asks', not setup_ups(pg) and not [c for c in calls(pg, 'shared_data')])
    d = get_db(pg) or {}
    dn = [((x.get('overview') or {}).get('operationName')) for x in d.get('draftPlans') or []]
    R.check('jobs still come down while it asks (Hezzelic homes is here)', 'Hezzelic homes' in dn, dn)
    R.check('...and the Mac job with the same number is kept beside it', 'Mac job' in dn and len(dn) == 2, dn)
    pg.click('[data-merge-item] [data-merge-pick=local]'); pg.wait_for_timeout(200)
    pg.click('[data-setup-merge-save]'); pg.wait_for_timeout(5000)
    cp = (get_db(pg) or {}).get('companyProfile') or {}
    R.check('my pick (this device\'s name) plus everything else merged', cp.get('name') == 'Waking Dream' and cp.get('phone') == '0400 999 999' and cp.get('email') == 'new@example.com', cp)
    up = setup_ups(pg)
    R.check('saved to the account', up and up[-1]['data']['companyProfile'].get('name') == 'Waking Dream' and up[-1]['data']['companyProfile'].get('email') == 'new@example.com', up[-1:])
    # same OP number, different jobs: saving or deleting one never touches the other
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(600)
    pg.evaluate("""()=>{ window.confirm = () => true; }""")
    # open the Mac job (second or first, by its name) and save it as a draft again
    pg.evaluate("""()=>{ const bs=[...document.querySelectorAll('button')].filter(b=>/Resume/.test(b.textContent)); for (const b of bs) { let n=b; for (let i=0;i<6&&n;i++){ n=n.parentElement; if(n && /Mac job/.test(n.textContent) && !/Hezzelic/.test(n.textContent)){ b.click(); return true; } } } return false; }""")
    pg.wait_for_timeout(1500)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(1500)
    d = get_db(pg) or {}
    dn = [((x.get('overview') or {}).get('operationName')) for x in d.get('draftPlans') or []]
    R.check('saving the Mac job (same number) keeps Hezzelic homes', 'Hezzelic homes' in dn and 'Mac job' in dn, dn)
    R.check('no page errors (merge screen)', not errs, errs[:3])
    pg.context.close()

    # 3. "use one copy for everything" is still there
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW(cloud)]}, extra=LS(BASE))
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, {'companyProfile': {**BASE['companyProfile'], 'name': 'Waking Dream'}}); pg.reload(); pg.wait_for_timeout(8000)
    pg.click('[data-setup-choice] summary'); pg.wait_for_timeout(200)
    pg.click('[data-setup-use-saved]'); pg.wait_for_timeout(3000)
    R.check('"Use only the one saved to my account" still works', ((get_db(pg) or {}).get('companyProfile') or {}).get('name') == 'Waking Dream FPV Pty Ltd')
    pg.context.close()

    # 4. new job numbers skip numbers already used on the account
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW(BASE, 'h-same')], 'jobs': [dict(JOB, op_id='OP-%s-0007' % __import__('datetime').date.today().year)]},
                           extra="localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h-same'}));")
    pg.goto(URL); pg.wait_for_timeout(7000)
    pg.evaluate(JS_INC, 'New'); pg.wait_for_timeout(800)
    ids = pg.evaluate("()=>[...document.querySelectorAll('input')].map(i=>i.value).filter(v=>/^OP-\\d{4}-\\d{4}$/.test(v))")
    R.check('a new job on this device gets the next number after the account\'s (0008)', any(v.endswith('-0008') for v in ids), ids)
    pg.context.close()
    b.close()
R.done()
