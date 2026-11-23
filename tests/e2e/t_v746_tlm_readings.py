# v7.46: a flight log with no GPS shows current, throttle and tilt (tiles and chart) instead of height, speed and
# distance; the chart's readings can be picked per flight type (with / without GPS) and the choice is remembered.
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
    fc.value.set_files([F1, F2]); pg.wait_for_timeout(2500)
    pg.locator('[data-bulk-job]').nth(0).select_option('u-a'); pg.locator('[data-bulk-job]').nth(1).select_option('u-a'); pg.wait_for_timeout(200)
    pg.click('[data-bulk-apply]'); pg.wait_for_timeout(1500)
    fls = [x for x in (get_db(pg) or {}).get('draftPlans', []) if x['id'] == 'OP-2026-0301'][0]['log']['rpaLogs']['Nazgul 5']['flights']
    t0 = fls[0].get('telemetry', {})
    R.check('the log reader keeps throttle and tilt', t0.get('maxThrPct') == 76 and t0.get('avgThrPct') and t0.get('maxTiltDeg') and 170 <= t0['maxTiltDeg'] <= 180 and len(t0['trace'][10]) == 11, (t0.get('maxThrPct'), t0.get('avgThrPct'), t0.get('maxTiltDeg')))
    pg.click('[data-bulk-open="u-a"]'); pg.wait_for_timeout(2500)
    ng, gp = '[data-tlm-panel="nogps"]', '[data-tlm-panel="gps"]'
    R.check('one flight shows as no-GPS, the other as GPS', pg.locator(ng).count() == 1 and pg.locator(gp).count() == 1)
    txt = pg.inner_text(ng)
    R.check('no GPS: tiles show current, throttle and tilt instead of height, speed and distance', all(k in txt.upper() for k in ['MAX CURRENT', 'THROTTLE', 'MAX TILT']) and 'MAX ALT' not in txt.upper() and 'MAX DISTANCE' not in txt.upper(), txt[:300])
    R.check('...says there is no GPS, and no 0 J kinetic-energy line', 'No GPS in this log' in txt and 'Peak KE' not in txt)
    lines = lambda sel: pg.evaluate("(s)=>[...document.querySelectorAll(s+' [data-tlm-line]')].map(e=>e.dataset.tlmLine)", sel)
    R.check('no GPS: the chart draws current, throttle and tilt', lines(ng) == ['amps', 'thr', 'tilt'], lines(ng))
    R.check('...and altitude / speed are not offered', pg.locator(ng + ' [data-tlm-series="alt"]').count() == 0 and pg.locator(ng + ' [data-tlm-series="volts"]').count() == 1)
    R.check('with GPS: the normal tiles and altitude + speed chart stay the default', 'MAX ALT' in pg.inner_text(gp).upper() and lines(gp) == ['alt', 'spd'], lines(gp))
    pg.click(ng + ' [data-tlm-series="tilt"]'); pg.click(ng + ' [data-tlm-series="volts"]'); pg.wait_for_timeout(300)
    R.check('picking readings changes the chart', lines(ng) == ['amps', 'thr', 'volts'], lines(ng))
    saved = json.loads(pg.evaluate("localStorage.getItem('wd_tlm_series')") or '{}')
    R.check('...the choice is remembered for logs without GPS only', saved.get('nogps') == ['amps', 'thr', 'volts'] and 'gps' not in saved and lines(gp) == ['alt', 'spd'], saved)
    pg.click(gp + ' [data-tlm-series="thr"]'); pg.wait_for_timeout(300)
    R.check('GPS logs can add throttle too', lines(gp) == ['alt', 'spd', 'thr'], lines(gp))
    R.check('no page errors', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
