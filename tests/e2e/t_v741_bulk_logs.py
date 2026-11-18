# v7.41: Home "Add flight logs": a stack of radio logs goes onto the jobs flown each day, matched to aircraft; checked,
# then saved into the jobs. Already-logged flights are skipped. Same reader as the in-job log dump.
import sys, os, json, tempfile; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
def edgetx(day, hh, secs=90):
    rows = ['Date,Time,FM,Alt(m),GSpd(kmh),RxBt(V),GPS']
    t = 0
    def stamp(s):
        m, sec = divmod(s, 60); return '%s,%02d:%02d:%02d.000' % (day, hh, m, sec)
    for s in range(0, 5): rows.append('%s,OK,12,0,25.1,-27.46 153.01' % stamp(s))
    for s in range(5, 5 + secs): rows.append('%s,ACRO,%d,%d,%.1f,-27.46 153.01' % (stamp(s), 12 + min(30, (s - 5)), 20 if s > 8 else 0, 25.0 - (s - 5) * 0.02))
    for s in range(5 + secs, 10 + secs): rows.append('%s,OK,12,0,23.0,-27.46 153.01' % stamp(s))
    return '\n'.join(rows) + '\n'
tmp = tempfile.mkdtemp()
FILES = []
for day, hh in [('2026-11-15', 1), ('2026-11-16', 2), ('2026-11-17', 3)]:
    f = os.path.join(tmp, 'Nazgul5-%s-0%d0000.csv' % (day, hh)); open(f, 'w').write(edgetx(day, hh)); FILES.append(f)
FLEET = {'Nazgul 5': {'weight': 0.65, 'cells': '6', 'radioModel': 'Nazgul5'}, 'DJI Mini 4 Pro': {'weight': 0.249, 'cells': 'none'}}
def plan(uid, opid, name, date, status='draft', approved=False):
    return {'id': opid, 'title': name, 'savedAt': '2026-11-10T00:00:00Z', 'status': status,
            'overview': {'uid': uid, 'identifier': opid, 'operationName': name, 'operationDate': date, 'rpaTypes': ['Nazgul 5']},
            'approval': {'flightAuthApproved': approved}, 'log': {'rpaLogs': {}}}
A = plan('u-a', 'OP-2026-0101', 'Beach promo', '2026-11-15')
B = plan('u-b', 'OP-2026-0102', 'Hezzelic homes', '2026-11-16', 'approved', True)
flights_of = (lambda p, rpa='Nazgul 5': ((((p or {}).get('log') or {}).get('rpaLogs') or {}).get(rpa) or {}).get('flights') or [])
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Waking Dream FPV'}}, 'hash': 'h0'}]}, start='home',
                           extra="localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h0'}));")
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, {'companyProfile': {'name': 'Waking Dream FPV'}, 'fleet': FLEET, 'draftPlans': [A], 'savedPlans': [B]}); pg.reload(); pg.wait_for_timeout(6000)
    R.check('Home has "Add flight logs"', pg.locator('[data-dash-bulk-logs]').count() == 1)
    with pg.expect_file_chooser() as fc: pg.click('[data-dash-bulk-logs]')
    fc.value.set_files(FILES); pg.wait_for_timeout(2500)
    R.check('review window: 3 flights over 3 days', pg.locator('[data-testid=bulk-logs]').count() == 1 and pg.locator('[data-bulk-row]').count() == 3 and pg.locator('[data-bulk-day]').count() == 3)
    rows = pg.locator('[data-bulk-row]').all()
    job = lambda i: pg.locator('[data-bulk-job]').nth(i).input_value()
    rpa = lambda i: pg.locator('[data-bulk-rpa]').nth(i).input_value()
    R.check('15 Nov flight → Beach promo (job on that day), aircraft from the radio model', job(0) == 'u-a' and rpa(0) == 'Nazgul 5', (job(0), rpa(0)))
    R.check('16 Nov flight → Hezzelic homes (the approved plan)', job(1) == 'u-b' and rpa(1) == 'Nazgul 5', (job(1), rpa(1)))
    R.check('17 Nov flight → no job that day: left for you to choose', job(2) == '' and 'no job' in pg.inner_text('[data-bulk-job] >> nth=2'), job(2))
    R.check('button says how many go in and how many are skipped', 'Add 2 flights (skip 1)' in pg.inner_text('[data-bulk-apply]'), pg.inner_text('[data-bulk-apply]'))
    pg.click('[data-bulk-apply]'); pg.wait_for_timeout(2000)
    R.check('done: lists both jobs with what is left to fill in', pg.locator('[data-bulk-done-job]').count() == 2 and 'battery used' in pg.inner_text('[data-bulk-done]'))
    d = get_db(pg) or {}
    a = next((x for x in d.get('draftPlans') or [] if x['id'] == 'OP-2026-0101'), None); bb = next((x for x in d.get('savedPlans') or [] if x['id'] == 'OP-2026-0102'), None)
    fa, fb = flights_of(a), flights_of(bb)
    R.check('Beach promo now has the flight, with its telemetry and duration', len(fa) == 1 and fa[0].get('telemetry') and int(fa[0].get('duration') or 0) >= 1 and fa[0].get('batteries') == '', fa[:1] and {k: fa[0].get(k) for k in ('duration', 'batteries', 'label')})
    R.check('Hezzelic homes (approved) has its flight, approval kept (aircraft was on the plan)', len(fb) == 1 and (bb.get('approval') or {}).get('flightAuthApproved') is True)
    R.check('saved time updated so the account picks the change up', a and a.get('savedAt') > '2026-11-10' and bb.get('savedAt') > '2026-11-10')
    R.check('a safety copy from before was kept', pg.evaluate("""()=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const g=q.result.transaction('kv').objectStore('kv').get('rpas_database_safety');g.onsuccess=()=>r(!!g.result)}})"""))
    pg.click('[data-bulk-open="u-a"]'); pg.wait_for_timeout(2000)
    R.check('"Open its flight log" opens the job on the flight log', pg.locator('[data-testid=bulk-logs]').count() == 0 and 'Beach promo' in pg.inner_text('body'))
    # again: already logged → skipped
    pg.evaluate(JS_INC, 'Home'); pg.wait_for_timeout(800)
    with pg.expect_file_chooser() as fc: pg.click('[data-dash-bulk-logs]')
    fc.value.set_files(FILES[:2]); pg.wait_for_timeout(2500)
    R.check('the same logs again: nothing doubled up', pg.locator('[data-testid=bulk-logs]').count() == 0 and any('already logged' in m for m in dl), dl[-1:])
    # choose a job for the leftover day using "All to"
    with pg.expect_file_chooser() as fc: pg.click('[data-dash-bulk-logs]')
    fc.value.set_files(FILES[2:]); pg.wait_for_timeout(2500)
    pg.select_option('[data-bulk-day-job="2026-11-17"]', 'u-a'); pg.wait_for_timeout(300)
    R.check('"All to" a job fills the day in', job(0) == 'u-a' and rpa(0) == 'Nazgul 5')
    pg.click('[data-bulk-apply]'); pg.wait_for_timeout(1500)
    d = get_db(pg) or {}; a = next((x for x in d.get('draftPlans') or [] if x['id'] == 'OP-2026-0101'), None)
    R.check('...and it is added to that job (now 2 flights)', len(flights_of(a)) == 2, len(flights_of(a)))
    R.check('no page errors', not errs, errs[:3])
    pg.context.close()
    # free planner has it too
    pg, errs, dl = ctx_for(b, 'anon', None, 'home', "localStorage.setItem('wd_free_intro','1');"); pg.goto(URL); pg.wait_for_timeout(5000)
    R.check('free planner: "Add flight logs" on Home too', pg.locator('[data-dash-bulk-logs]').count() == 1)
    pg.context.close()
    b.close()
R.done()
