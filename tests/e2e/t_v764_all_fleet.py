# v7.64: the crew "Send … flights to the CRP" button and the CRP's add-to-fleet fix, checked for every aircraft in the fleet
# (names with " and brackets included).
import sys, os, json, copy; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
FLEET = ['FPV 5"', 'AOS 3.5', 'Avata 2', 'Cinelog', 'Cinelog 30', 'Mavic 4 Pro', 'Pavo 20 Pro', '5" FPV drone', '7" FPV drone',
         'KD50S Minilifter', 'BETAFPV Meteor 1S', 'Custom FPV Cinewhoop', 'Custom Built FPV MicroWhoop', 'DJI Mini 5 Pro (with prop guards)']
smp = json.load(open(os.path.join(ROOT, 'public/demo/acme-suncorp.json')))
plan = smp['plan']; plan['overview']['uid'] = 'uid-all'; plan['overview']['rpaTypes'] = FLEET
plan['log'] = dict(plan.get('log') or {}, rpaLogs={r: {'flights': [{'id': 1, 'duration': '', 'batteries': ''}]} for r in FLEET})
job = {'id': 'jobs-all', 'plan_uid': 'uid-all', 'op_id': 'OP-1', 'title': 'All drones', 'status': 'approved', 'plan': plan}
SETDUR = """()=>{const ls=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.innerText&&e.innerText.trim().toUpperCase()==='DURATION'&&e.offsetParent);
  const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; let n=0;
  ls.forEach((l,i)=>{const b=l.parentElement;const inp=b&&(b.querySelector('input')||b.parentElement.querySelector('input'));if(inp){set.call(inp,String(i+2));inp.dispatchEvent(new Event('input',{bubbles:true}));n++}}); return n}"""
CLICK = "(a)=>{const b=[...document.querySelectorAll('['+a[0]+']')].find(x=>x.getAttribute(a[0])===a[1]);if(b){b.click();return 1}return 0}"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'pilot', {'jobs': [job], 'job_crew': [{'job_id': 'jobs-all', 'person_id': 'pp-p1', 'job_role': 'rpic'}]}, 'home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate("window.dispatchEvent(new CustomEvent('wd-open-cloud-job',{detail:{id:'jobs-all'}}))"); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Flight Log'); pg.wait_for_timeout(2000)
    R.check('(setup) a duration typed for every aircraft', pg.evaluate(SETDUR) == len(FLEET)); pg.wait_for_timeout(1500)
    for r in FLEET:
        R.check('crew button shown: ' + r, pg.evaluate(CLICK.replace('.click()', ''), ['data-crew-rpa-send', r]) == 1)
    R.check('no old Fleet DB button for crew', pg.locator('[data-fleet-save]').count() == 0)
    # each aircraft pressed on its own, Pavo first
    for r in ['Pavo 20 Pro'] + [x for x in FLEET if x != 'Pavo 20 Pro']:
        dl.clear(); pg.evaluate(CLICK, ['data-crew-rpa-send', r]); pg.wait_for_timeout(1800)
        R.check('crew send ok: ' + r, dl and not any('not in your fleet' in d or "Couldn't" in d for d in dl), dl)
    sent = pg.evaluate("[...new Set((window.__T.job_flights||[]).filter(f=>f.job_id==='jobs-all'&&f.rpa).map(f=>f.rpa))]")
    R.check('flights from every aircraft reached the CRP (%d/%d)' % (len(sent), len(FLEET)), sorted(sent) == sorted(FLEET), set(FLEET) - set(sent))
    R.check('no duplicates', pg.evaluate("(window.__T.job_flights||[]).filter(f=>f.job_id==='jobs-all'&&f.rpa).length") == len(FLEET))
    R.check('no page errors (crew)', not errs, errs[:2])
    pg.context.close()
    # CRP: none of these in this device's fleet -> each offered to add, then logged
    plan2 = copy.deepcopy(plan)
    for i, r in enumerate(FLEET): plan2['log']['rpaLogs'][r]['flights'][0]['duration'] = str(i + 2)
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [dict(job, plan=plan2)]}, 'home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate("(p)=>window.dispatchEvent(new CustomEvent('wd-load-cloud-job',{detail:{job:{id:'jobs-all',uid:'uid-all',title:'All drones',status:'approved'},plan:p}}))", plan2); pg.wait_for_timeout(4000)
    pg.evaluate(JS_INC, 'Flight Log'); pg.wait_for_timeout(2000)
    for i, r in enumerate(FLEET):
        dl.clear(); pg.evaluate(CLICK, ['data-fleet-save', r]); pg.wait_for_timeout(700)
        R.check('CRP add+log: ' + r, any("isn't in the fleet" in d for d in dl) and any('Total airframe time: %d mins' % (i + 2) in d for d in dl), dl)
    pg.wait_for_timeout(1500); fl = (get_db(pg) or {}).get('fleet') or {}
    R.check('all aircraft saved in fleet with right minutes', all((fl.get(r) or {}).get('totalFlightTime') == i + 2 for i, r in enumerate(FLEET)), {r: (fl.get(r) or {}).get('totalFlightTime') for r in FLEET})
    # pressing again adds to the existing time (no add prompt)
    dl.clear(); pg.evaluate(CLICK, ['data-fleet-save', 'Pavo 20 Pro']); pg.wait_for_timeout(700)
    pv = FLEET.index('Pavo 20 Pro') + 2
    R.check('Pavo 20 Pro second save adds on, no prompt', not any("isn't in the fleet" in d for d in dl) and any('Total airframe time: %d mins' % (pv * 2) in d for d in dl), dl)
    R.check('no page errors (CRP)', not errs, errs[:2])
    pg.context.close(); b.close()
R.done()
