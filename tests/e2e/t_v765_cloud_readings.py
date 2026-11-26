# v7.65: the flight chart readings now go to the cloud with the job (they used to stay on the device that imported the
# log), so a flight opened on another device, or added through the connector, still draws its height / speed chart.
import sys, os, json, tempfile; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
def edgetx(day, hh, mm, gps):
    rows = ['Date,Time,FM,RxBt(V),Curr(A),Capa(mAh),Ptch(rad),Roll(rad),GPS,GSpd(kmh),Alt(m),Sats,Thr']
    st = lambda s: '%s,%02d:%02d:%02d.000' % (day, hh, mm + s // 60, s % 60)
    g = lambda s: ('-27.46 153.01,%d,%d,12' % (20 if s > 8 else 0, min(30, s))) if gps else ',0,0,0'
    for s in range(0, 3): rows.append(st(s) + ',WAIT*,25.1,0.2,0,0,0,' + g(s) + ',-1024')
    for s in range(3, 93): rows.append(st(s) + ',AIR,%.1f,%.1f,%d,%.2f,%.2f,' % (25.0 - s * 0.02, 10 + (s % 20), s * 8, 0.1, 3.05 if s == 50 else 0.2) + g(s) + ',%d' % (-1024 + (s % 40) * 40))
    for s in range(93, 96): rows.append(st(s) + ',OK,23.0,0.2,720,0,0,' + g(s) + ',-1024')
    return '\n'.join(rows) + '\n'
tmp = tempfile.mkdtemp()
F1 = os.path.join(tmp, 'Nazgul5-2026-11-15-083000.csv'); open(F1, 'w').write(edgetx('2026-11-15', 8, 30, False))
F2 = os.path.join(tmp, 'Nazgul5-2026-11-15-090000.csv'); open(F2, 'w').write(edgetx('2026-11-15', 9, 0, True))
FLEET = {'Nazgul 5': {'weight': 0.65, 'cells': '6', 'radioModel': 'Nazgul5'}}
A = {'id': 'OP-2026-0301', 'title': 'Indoor test', 'savedAt': '2026-11-10T00:00:00Z', 'status': 'draft', 'overview': {'uid': 'u-a', 'identifier': 'OP-2026-0301', 'operationName': 'Indoor test', 'operationDate': '2026-11-15', 'rpaTypes': ['Nazgul 5']}, 'log': {'rpaLogs': {}}}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Waking Dream FPV'}}, 'hash': 'h0'}]}, start='home',
                           extra="localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h0'}));localStorage.setItem('wd_tlm_clock','local');")
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, {'companyProfile': {'name': 'Waking Dream FPV'}, 'fleet': FLEET, 'draftPlans': [A]}); pg.reload(); pg.wait_for_timeout(6000)
    with pg.expect_file_chooser() as fc: pg.click('[data-dash-bulk-logs]')
    fc.value.set_files([F2]); pg.wait_for_timeout(2500)
    pg.locator('[data-bulk-job]').nth(0).select_option('u-a'); pg.wait_for_timeout(200)
    pg.click('[data-bulk-apply]'); pg.wait_for_timeout(5000)
    ups = pg.evaluate("(window.__calls||[]).filter(c=>c.t==='jobs'&&c.op==='upsert').map(c=>c.payload)")
    sent = [u for u in ups if u and (u.get('plan_uid') == 'u-a')]
    tr = []
    if sent:
        fl = ((sent[-1]['plan'].get('log') or {}).get('rpaLogs') or {}).get('Nazgul 5', {}).get('flights') or []
        tr = ((fl[0] if fl else {}).get('telemetry') or {}).get('trace') or []
    R.check('the job went to the cloud with the flight chart readings', len(tr) > 20, (len(sent), len(tr)))
    R.check('no page errors (importing device)', not errs, errs[:3])
    plan = sent[-1]['plan'] if sent else A
    pg.context.close()
    # another device: the job comes from the cloud, never imported here
    pg, errs, dl = ctx_for(b, 'crp', seed={'jobs': [{'id': 'jobs-a', 'plan_uid': 'u-a', 'op_id': 'OP-2026-0301', 'title': 'Indoor test', 'status': 'draft', 'plan': plan}]}, start='home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate("(p)=>window.dispatchEvent(new CustomEvent('wd-load-cloud-job',{detail:{job:{id:'jobs-a',uid:'u-a',title:'Indoor test',status:'draft'},plan:p}}))", plan)
    pg.wait_for_timeout(3500); pg.evaluate(JS_INC, 'Flight Log'); pg.wait_for_timeout(2000)
    lines = pg.evaluate("[...document.querySelectorAll('[data-tlm-panel=\"gps\"] [data-tlm-line]')].map(e=>e.dataset.tlmLine)")
    R.check('on the other device the chart draws height and speed', lines == ['alt', 'spd'], lines)
    R.check('...and "Pick a reading below" is not shown', 'Pick a reading below' not in pg.inner_text('body'))
    R.check('no page errors (other device)', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
