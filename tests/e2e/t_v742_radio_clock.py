# v7.42: radio clock UTC vs local. Home "Add flight logs" can switch it on the check screen (flights move to the right
# day and job); inside a job, flights imported with the other setting can be moved with one button.
import sys, os, json, tempfile; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
def edgetx(day, hh, mm):
    rows = ['Date,Time,FM,Alt(m),GSpd(kmh),RxBt(V),GPS']
    st = lambda s: '%s,%02d:%02d:%02d.000' % (day, hh, mm + s // 60, s % 60)
    for s in range(0, 5): rows.append(st(s) + ',OK,12,0,25.1,-27.46 153.01')
    for s in range(5, 95): rows.append(st(s) + ',ACRO,%d,%d,%.1f,-27.46 153.01' % (12 + min(30, s - 5), 20 if s > 8 else 0, 25.0 - (s - 5) * 0.02))
    for s in range(95, 100): rows.append(st(s) + ',OK,12,0,23.0,-27.46 153.01')
    return '\n'.join(rows) + '\n'
tmp = tempfile.mkdtemp(); F = os.path.join(tmp, 'Nazgul5-2026-11-15-203000.csv'); open(F, 'w').write(edgetx('2026-11-15', 20, 30))
FLEET = {'Nazgul 5': {'weight': 0.65, 'cells': '6', 'radioModel': 'Nazgul5'}}
def plan(uid, opid, name, date):
    return {'id': opid, 'title': name, 'savedAt': '2026-11-10T00:00:00Z', 'status': 'draft', 'overview': {'uid': uid, 'identifier': opid, 'operationName': name, 'operationDate': date, 'rpaTypes': ['Nazgul 5']}, 'log': {'rpaLogs': {}}}
A, B = plan('u-a', 'OP-2026-0201', 'Evening shoot 15th', '2026-11-15'), plan('u-b', 'OP-2026-0202', 'Morning shoot 16th', '2026-11-16')
fl = lambda d, opid: next(((((x.get('log') or {}).get('rpaLogs') or {}).get('Nazgul 5') or {}).get('flights') or [] for x in (d.get('draftPlans') or []) if x['id'] == opid), [])
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Waking Dream FPV'}}, 'hash': 'h0'}]}, start='home',
                           extra="localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h0'}));localStorage.setItem('wd_tlm_clock','utc');")
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, {'companyProfile': {'name': 'Waking Dream FPV'}, 'fleet': FLEET, 'draftPlans': [A, B]}); pg.reload(); pg.wait_for_timeout(6000)
    tz = pg.evaluate("new Date('2026-11-15T00:00:00Z').getTimezoneOffset()")
    with pg.expect_file_chooser() as fc: pg.click('[data-dash-bulk-logs]')
    fc.value.set_files([F]); pg.wait_for_timeout(2500)
    job = lambda: pg.locator('[data-bulk-job]').first.input_value()
    day = lambda: pg.get_attribute('[data-bulk-day]', 'data-bulk-day')
    # read as UTC: 20:30 UTC on the 15th is the 16th in Brisbane (when the test browser is east of UTC)
    utc_day, utc_job = day(), job()
    R.check('check screen shows the radio clock switch (UTC now)', pg.locator('[data-bulk-clock="utc"]').count() == 1 and pg.locator('[data-bulk-clock-set]').count() == 2)
    pg.click('[data-bulk-clock-set="local"]'); pg.wait_for_timeout(400)
    R.check('switch to Local: the flight is on the 15th, 20:30, matched to that day\'s job', day() == '2026-11-15' and job() == 'u-a' and '20:30' in pg.inner_text('[data-bulk-row]'), (day(), job(), pg.inner_text('[data-bulk-row]')[:40]))
    R.check('...as UTC it was 10 hours later (the 16th, the other job)', utc_day == '2026-11-16' and utc_job == 'u-b', (utc_day, utc_job, tz))
    R.check('the choice is remembered for next time', pg.evaluate("localStorage.getItem('wd_tlm_clock')") == 'local')
    pg.click('[data-bulk-clock-set="utc"]'); pg.wait_for_timeout(300)
    R.check('back to UTC restores the first reading', day() == utc_day and job() == utc_job, (day(), job()))
    pg.select_option('[data-bulk-job] >> nth=0', 'u-a'); pg.wait_for_timeout(200)
    pg.click('[data-bulk-apply]'); pg.wait_for_timeout(1500)
    f0 = (fl(get_db(pg) or {}, 'OP-2026-0201') or [{}])[0]
    R.check('saved on the job, read as UTC', f0.get('telemetry', {}).get('clock') == 'utc', f0.get('telemetry', {}).get('clock'))
    utc_start = f0.get('telemetry', {}).get('startMs')
    # inside the job: switch the clock to Local → "Move 1 to local" fixes it
    pg.click('[data-bulk-open="u-a"]'); pg.wait_for_timeout(2500)
    sel = pg.locator('select:has(option[value="local"]):has(option[value="utc"])').first
    sel.select_option('local'); pg.wait_for_timeout(400)
    R.check('job log: switching to Local offers to move the flight already imported', pg.locator('[data-fix-clock]').count() == 1 and 'Move 1 to local' in pg.inner_text('[data-fix-clock]'))
    pg.click('[data-fix-clock]'); pg.wait_for_timeout(800)
    R.check('...it asks first, saying how many hours', any('move by' in m for m in dl), dl[-1:])
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(1500)
    f1 = (fl(get_db(pg) or {}, 'OP-2026-0201') or [{}])[0]; t1 = f1.get('telemetry', {})
    R.check('flight moved by the time-zone offset, now marked local, label updated', t1.get('clock') == 'local' and t1.get('startMs', 0) - utc_start == tz * 60000 and tz == -600 and '20:30' in f1.get('label', ''), (t1.get('clock'), utc_start, t1.get('startMs'), f1.get('label'), tz))
    R.check('the button goes away once all match', pg.locator('[data-fix-clock]').count() == 0)
    R.check('no page errors', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
