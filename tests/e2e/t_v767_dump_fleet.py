# v7.67: the "Choose aircraft" list in Log dump showed the planner's built-in starter list (DJI Avata 2, Skydio…) on a crew
# device, not the company fleet, and missed the job's own aircraft. Now: this job's aircraft first, then the company fleet.
# Also: the "Why: by radio model" column is gone; a short hint shows only when the pick may be wrong.
import sys, os, json, copy, tempfile; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
def edgetx(day, hh, mm, v):
    rows = ['Date,Time,FM,Alt(m),GSpd(kmh),RxBt(V),GPS']
    st = lambda s: '%s,%02d:%02d:%02d.000' % (day, hh, mm + s // 60, s % 60)
    for s in range(0, 5): rows.append(st(s) + ',OK,12,0,%.1f,-27.46 153.01' % v)
    for s in range(5, 95): rows.append(st(s) + ',ACRO,%d,%d,%.1f,-27.46 153.01' % (12 + min(30, s - 5), 20 if s > 8 else 0, v - (s - 5) * 0.01))
    for s in range(95, 100): rows.append(st(s) + ',OK,12,0,%.1f,-27.46 153.01' % (v - 1))
    return '\n'.join(rows) + '\n'
tmp = tempfile.mkdtemp()
F1 = os.path.join(tmp, 'fpv-2026-11-12-130832.csv'); open(F1, 'w').write(edgetx('2026-11-12', 13, 8, 12.7))      # 3S, no aircraft set to 3S
F2 = os.path.join(tmp, 'Nazgul5-2026-11-12-140000.csv'); open(F2, 'w').write(edgetx('2026-11-12', 14, 0, 25.1))   # radio model match
AIRCRAFT = [{'name': 'Nazgul 5', 'cells': '6', 'radioModel': 'Nazgul5'}, {'name': 'BETAFPV Meteor 1S', 'cells': '1', 'radioModel': ''}, {'name': 'Cinelog 30', 'cells': '4', 'radioModel': ''}]
smp = json.load(open(os.path.join(ROOT, 'public/demo/acme-suncorp.json')))
plan = smp['plan']; plan['overview']['uid'] = 'uid-d'; plan['overview']['rpaTypes'] = ['BETAFPV Meteor 1S']
plan['approval'] = dict(plan.get('approval') or {}, approvedTypes=['BETAFPV Meteor 1S'])
plan['log'] = dict(plan.get('log') or {}, rpaLogs={})
job = {'id': 'job-d', 'plan_uid': 'uid-d', 'op_id': 'OP-D', 'title': 'Meteor job', 'status': 'approved', 'plan': plan}
GROUPS = "()=>{const s=document.querySelector('[data-testid=log-dump] select');if(!s)return null;return [...s.querySelectorAll('optgroup')].map(g=>[g.label,[...g.querySelectorAll('option')].map(o=>o.value)])}"
GENERIC = ['DJI Avata 2', 'Skydio X10', 'Autel EVO Max 4T', 'Cinelog 35 (FPV)', 'Freefly Alta X']
def dump(pg, files):
    with pg.expect_file_chooser() as fc: pg.click('[data-log-dump]')
    fc.value.set_files(files); pg.wait_for_timeout(2500)
with sync_playwright() as p:
    b = p.chromium.launch()
    # crew pilot: the company list comes from what the CRP publishes
    pg, errs, dl = ctx_for(b, 'pilot', {'jobs': [job], 'job_crew': [{'job_id': 'job-d', 'person_id': 'pp-p1', 'job_role': 'pilot'}],
                                         'shared_data': [{'area': 'company', 'data': {'name': 'Waking Dream FPV', 'aircraft': AIRCRAFT}}]}, 'home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate("window.dispatchEvent(new CustomEvent('wd-open-cloud-job',{detail:{id:'job-d'}}))"); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Flight Log'); pg.wait_for_timeout(1500)
    dump(pg, [F1, F2])
    g = pg.evaluate(GROUPS) or []
    R.check('crew: first group is this job\'s aircraft', g and g[0][0] == 'On this job' and g[0][1] == ['BETAFPV Meteor 1S'], g)
    rest = (g[1][1] if len(g) > 1 else [])
    R.check('crew: then the rest of the company fleet', len(g) > 1 and g[1][0] == 'Rest of the fleet' and set(rest) == {'Nazgul 5', 'Cinelog 30'}, g)
    allv = [v for _, l in g for v in l]
    R.check('crew: no built-in starter list (Avata 2, Skydio…)', not any(x in allv for x in GENERIC), allv)
    body = pg.inner_text('[data-testid=log-dump]')
    R.check('no "Why" column or "by radio model" wording', 'by radio model' not in body and pg.locator('[data-testid=log-dump] th', has_text='Why').count() == 0, body[:400])
    rows = pg.locator('[data-dump-row]')
    r_fpv = pg.locator('[data-dump-row="fpv-2026-11-12-130832.csv#0"]'); r_naz = pg.locator('[data-dump-row="Nazgul5-2026-11-12-140000.csv#0"]')
    R.check('unknown aircraft: plain "pick" hint', r_fpv.locator('[data-dump-hint="pick"]').count() == 1, r_fpv.inner_text() if r_fpv.count() else rows.count())
    R.check('radio model match: picked, no hint', r_naz.locator('select').input_value() == 'Nazgul 5' and r_naz.locator('[data-dump-hint]').count() == 0, r_naz.inner_text() if r_naz.count() else '')
    r_fpv.locator('select').select_option('BETAFPV Meteor 1S'); pg.wait_for_timeout(200)
    pg.click('[data-dump-apply]'); pg.wait_for_timeout(1500)
    st = pg.evaluate("window.__wdFpState().overview.rpaTypes")
    R.check('import works for crew (both flights in the log)', any('2 flights imported' in d for d in dl) and 'Nazgul 5' in st, (dl[-1:], st))
    R.check('no page errors (crew)', not errs, errs[:2])
    pg.context.close()
    # CRP device: an untouched starter aircraft isn't offered; his own fleet is, job aircraft first
    SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
    fleet = {'DJI Avata 2': {'weight': 0.377, 'area': 0.015, 'cd': 1.15, 'totalFlightTime': 0}, 'Skydio X10': {'weight': 2.1, 'area': 0.05, 'cd': 1.1, 'totalFlightTime': 0},
             'Nazgul 5': {'weight': 0.65, 'cells': '6', 'radioModel': 'Nazgul5'}, 'BETAFPV Meteor 1S': {'weight': 0.03, 'cells': '1'}, 'Cinelog 30': {'weight': 0.3, 'cells': '4'}}
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [job]}, 'home')
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, {'companyProfile': {'name': 'Waking Dream FPV'}, 'fleet': fleet}); pg.reload(); pg.wait_for_timeout(5000)
    pg.evaluate("(p)=>window.dispatchEvent(new CustomEvent('wd-load-cloud-job',{detail:{job:{id:'job-d',uid:'uid-d',title:'Meteor job',status:'approved'},plan:p}}))", plan); pg.wait_for_timeout(4000)
    pg.evaluate(JS_INC, 'Flight Log'); pg.wait_for_timeout(1500)
    dump(pg, [F1])
    g = pg.evaluate(GROUPS) or []; allv = [v for _, l in g for v in l]
    R.check('CRP: job aircraft first, then his fleet', g and g[0] == ['On this job', ['BETAFPV Meteor 1S']] and set(g[1][1]) == {'Nazgul 5', 'Cinelog 30'}, g)
    R.check('CRP: untouched starter aircraft not offered', 'DJI Avata 2' not in allv and 'Skydio X10' not in allv, allv)
    pub = pg.evaluate("(()=>{const c=window.__calls.filter(c=>c.t==='shared_data').map(c=>c.payload).flat().find(x=>x&&x.area==='company');return c?c.data.aircraft:null})()")
    R.check('CRP publishes the aircraft list for crew (no starter aircraft)', pub is not None and sorted(a['name'] for a in pub) == sorted(['Nazgul 5', 'BETAFPV Meteor 1S', 'Cinelog 30']) and any(a['radioModel'] == 'Nazgul5' for a in pub), pub)
    R.check('no page errors (CRP)', not errs, errs[:2])
    pg.context.close(); b.close()
R.done()
