# v7.64: a pilot signed in as crew (Ben) pressed "Save Custom FPV Cinewhoop Time to Fleet DB" on a company job and got
# "That RPA is not in your fleet database yet." Crew don't hold the company fleet on their device. On a company job the
# button now sends the flights to the CRP. On the CRP's own device, a missing aircraft can be added instead of a dead end.
import sys, os, json, copy; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
RPA = 'Custom FPV Cinewhoop'
smp = json.load(open(os.path.join(ROOT, 'public/demo/acme-suncorp.json')))
plan = smp['plan']; plan['overview']['uid'] = 'uid-cw'; plan['overview']['rpaTypes'] = [RPA]
plan['log'] = dict(plan.get('log') or {}, rpaLogs={RPA: {'flights': [{'id': 1, 'duration': '', 'batteries': ''}]}})
crew_plan = copy.deepcopy(plan)
plan['log']['rpaLogs'][RPA]['flights'][0]['duration'] = '3'
job = {'id': 'jobs-cw', 'plan_uid': 'uid-cw', 'op_id': plan['overview']['identifier'], 'title': 'Lifestyle shoot', 'status': 'approved', 'plan': plan}
btn_text = lambda pg: pg.evaluate("()=>[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.innerText.trim())")
with sync_playwright() as p:
    b = p.chromium.launch()
    # crew pilot on a company job
    pg, errs, dl = ctx_for(b, 'pilot', {'jobs': [dict(job, plan=crew_plan)], 'job_crew': [{'job_id': 'jobs-cw', 'person_id': 'pp-p1', 'job_role': 'rpic'}]}, 'home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate("window.dispatchEvent(new CustomEvent('wd-open-cloud-job',{detail:{id:'jobs-cw'}}))"); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Flight Log'); pg.wait_for_timeout(1500)
    pg.evaluate(JS_INC, '%s flights to the CRP' % RPA); pg.wait_for_timeout(500)
    R.check('no duration yet: asked to enter one', any('Enter at least one flight duration' in d for d in dl), dl)
    # like Ben: type 3 minutes into the flight's duration
    pg.evaluate("""()=>{const lbl=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.innerText&&e.innerText.trim().toUpperCase()==='DURATION'&&e.offsetParent);
      const box=lbl&&lbl.parentElement; const inp=box&&(box.querySelector('input')||box.parentElement.querySelector('input'));
      if(!inp)return 0; const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(inp,'3'); inp.dispatchEvent(new Event('input',{bubbles:true})); return 1}""")
    pg.wait_for_timeout(800)
    bt = btn_text(pg)
    R.check('crew see "Send … flights to the CRP" for the aircraft', any(('Send %s flights to the CRP' % RPA) in t for t in bt), bt[-15:])
    R.check('crew no longer see the Fleet DB button', not any('Time to Fleet DB' in t for t in bt))
    pg.click('[data-crew-rpa-send="%s"]' % RPA); pg.wait_for_timeout(2500)
    R.check('no "not in your fleet database" message', not any('not in your fleet' in d for d in dl), dl)
    sent = pg.evaluate("(window.__T.job_flights||[]).filter(f=>f.job_id==='jobs-cw'&&f.rpa===%s).length" % json.dumps(RPA))
    R.check('the flight went to the CRP', sent >= 1, (sent, dl))
    R.check('pilot told it was sent', any('sent to the CRP' in d for d in dl), dl)
    pg.click('[data-crew-rpa-send="%s"]' % RPA); pg.wait_for_timeout(800)
    R.check('pressing again says already sent (no duplicates)', any('already been sent' in d for d in dl) and pg.evaluate("(window.__T.job_flights||[]).filter(f=>f.job_id==='jobs-cw'&&f.rpa===%s).length" % json.dumps(RPA)) == sent, dl)
    R.check('no page errors (crew)', not errs, errs[:2])
    pg.context.close()

    # CRP's own device, aircraft missing from the fleet: offered to add it, then time is logged
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [job]}, 'home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate("(p)=>window.dispatchEvent(new CustomEvent('wd-load-cloud-job',{detail:{job:{id:'jobs-cw',uid:'uid-cw',title:'Lifestyle shoot',status:'approved'},plan:p}}))", plan); pg.wait_for_timeout(4000)
    pg.evaluate(JS_INC, 'Flight Log'); pg.wait_for_timeout(1500)
    R.check('CRP still sees the Fleet DB button', pg.locator('[data-fleet-save="%s"]' % RPA).count() == 1)
    pg.click('[data-fleet-save="%s"]' % RPA); pg.wait_for_timeout(1500)
    R.check('CRP asked to add the aircraft instead of a dead end', any("isn't in the fleet on this device" in d for d in dl), dl)
    R.check('time logged after adding', any('Total airframe time: 3 mins' in d for d in dl), dl)
    db = get_db(pg) or {}
    R.check('aircraft now in the fleet with 3 mins', ((db.get('fleet') or {}).get(RPA) or {}).get('totalFlightTime') == 3, (db.get('fleet') or {}).get(RPA))
    R.check('no page errors (CRP)', not errs, errs[:2])
    pg.context.close(); b.close()
R.done()
