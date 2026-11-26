# v7.67: crew fill in their whole log, then one "Log completed flight" button sends every aircraft's flights and the
# post-flight answers, and tells the CRP (email + Awaiting action "ready for final review"). No per-aircraft send buttons.
import sys, os, json, copy; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
A, B = 'BETAFPV Meteor 1S', 'Nazgul 5'
smp = json.load(open(os.path.join(ROOT, 'public/demo/acme-suncorp.json')))
plan = smp['plan']; plan['overview']['uid'] = 'uid-lc'; plan['overview']['rpaTypes'] = [A, B]
plan['log'] = dict(plan.get('log') or {}, rpaLogs={r: {'flights': [{'id': 1, 'duration': '', 'batteries': ''}]} for r in [A, B]})
job = {'id': 'job-lc', 'plan_uid': 'uid-lc', 'op_id': 'OP-LC', 'title': 'Two quads', 'status': 'approved', 'plan': plan}
SETDUR = """()=>{const ls=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.innerText&&e.innerText.trim().toUpperCase()==='DURATION'&&e.offsetParent);
  const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; let n=0;
  ls.forEach((l,i)=>{const b=l.parentElement;const inp=b&&(b.querySelector('input')||b.parentElement.querySelector('input'));if(inp){set.call(inp,String(i+4));inp.dispatchEvent(new Event('input',{bubbles:true}));n++}}); return n}"""
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'pilot', {'jobs': [job], 'job_crew': [{'job_id': 'job-lc', 'person_id': 'pp-p1', 'job_role': 'pilot'}]}, 'home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate("window.dispatchEvent(new CustomEvent('wd-open-cloud-job',{detail:{id:'job-lc'}}))"); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Flight Log'); pg.wait_for_timeout(1500)
    R.check('no per-aircraft "Send … flights to the CRP" buttons', pg.locator('[data-crew-rpa-send]').count() == 0 and 'flights to the CRP' not in pg.inner_text('body'))
    R.check('no "Send my log to the CRP" banner button', pg.locator('[data-cloud-send]').count() == 0)
    R.check('banner says to press Log completed flight', 'Log completed flight' in pg.inner_text('[data-cloud-push]'))
    R.check('(setup) durations typed for both aircraft', pg.evaluate(SETDUR) == 2); pg.wait_for_timeout(1200)
    btn = pg.locator('[data-log-complete]')
    R.check('one "Log completed flight" button', btn.count() == 1 and 'Log completed flight' in btn.inner_text(), btn.count())
    btn.click(); pg.wait_for_timeout(3000)
    R.check('asks first, listing each aircraft', any('Log completed flight?' in d and A in d and B in d for d in dl), dl[:1])
    T = pg.evaluate("window.__T.job_flights.filter(f=>f.job_id==='job-lc')")
    rpas = sorted(set(f['rpa'] for f in T if f.get('rpa')))
    R.check('flights for both aircraft sent in one go', rpas == sorted([A, B]), rpas)
    mk = [f for f in T if (f.get('flight') or {}).get('kind') == 'log_complete']
    R.check('a "log complete" note went with them', len(mk) == 1 and mk[0]['flight'].get('flights') == 2 and sorted(mk[0]['flight'].get('aircraft')) == sorted([A, B]), mk)
    inv = pg.evaluate("window.__calls.filter(c=>c.invoke==='notify').map(c=>c.body)")
    R.check('CRP emailed (notify log_complete)', any(x.get('event') == 'log_complete' and x.get('flight_id') == (mk[0]['id'] if mk else None) for x in inv), inv)
    R.check('pilot told: log completed, ready for final review', any('Log completed' in d and 'final review' in d for d in dl), dl[-1:])
    R.check('banner shows it was sent for final review', pg.locator('[data-cloud-complete]').count() == 1)
    n = len(T); dl.clear(); btn.click(); pg.wait_for_timeout(800)
    R.check('pressing again: already sent, nothing duplicated', any('already sent' in d for d in dl) and len(pg.evaluate("window.__T.job_flights.filter(f=>f.job_id==='job-lc')")) == n, dl)
    R.check('no page errors (crew)', not errs, errs[:2])
    pg.context.close()
    # CRP: Awaiting action says the log is ready for final review; Review log adds the flights
    rows = [dict(f, person_id='pp-p1') for f in T]
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [job], 'job_flights': rows}, 'home')
    pg.goto(URL); pg.wait_for_timeout(6000)
    aw = pg.locator('[data-await="crew-log-complete"]')
    R.check('CRP Awaiting action: "log is complete: ready for final review"', aw.count() == 1 and 'ready for final review' in aw.inner_text() and 'Test Pilot' in aw.inner_text(), aw.inner_text() if aw.count() else pg.inner_text('body')[:300])
    R.check('...no separate plain "flights from" row for the same log', pg.locator('[data-await="crew-flights"]').count() == 0)
    aw.locator('[data-await-act]').click(); pg.wait_for_timeout(9000)
    lg = pg.evaluate("window.__wdFpState().overview.uid")
    R.check('Review log opens the job, adds and saves the flights to the account (v7.69)', lg == 'uid-lc' and any('Added from Test Pilot and saved (on this device and in your account)' in d for d in dl), (lg, dl[-1:]))
    R.check('no page errors (CRP)', not errs, errs[:2])
    pg.context.close(); b.close()
R.done()
