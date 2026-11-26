# v7.67: a pilot signed in as crew saw "Saved Approved Plans 0" in Database & Settings. They now see the approved plans for
# the jobs they're on (from the company account; RLS returns only their jobs), can open them, and get no CRP-only actions.
import sys, os, json, copy; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
smp = json.load(open(os.path.join(ROOT, 'public/demo/acme-suncorp.json')))
def mk(uid, jid, title, status):
    pl = copy.deepcopy(smp['plan']); pl['overview']['uid'] = uid
    return {'id': jid, 'plan_uid': uid, 'op_id': 'OP-' + jid, 'title': title, 'status': status, 'start_date': '2026-11-28', 'plan': pl}
jobs = [mk('uid-a', 'job-a', 'Beach promo', 'approved'), mk('uid-b', 'job-b', 'Warehouse draft', 'draft'), mk('uid-c', 'job-c', 'Bridge survey', 'approved')]
crew = [{'job_id': j['id'], 'person_id': 'pp-p1', 'job_role': r} for j, r in zip(jobs, ['pilot', 'pilot', 'rpic'])]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'pilot', {'jobs': jobs, 'job_crew': crew}, 'home')
    pg.goto(URL); pg.wait_for_timeout(5000)
    home = pg.inner_text('body')
    R.check('Home: My jobs lists the approved jobs with Open', pg.locator('[data-crew-open="job-a"]').count() == 1 and pg.locator('[data-crew-open="job-c"]').count() == 1 and 'Approved' in home)
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(1500)
    sec = pg.locator('[data-dbfold="dbsec-approved"]')
    txt = sec.inner_text() if sec.count() else ''
    R.check('Database: approved plans for my jobs (2), not "No saved plans yet"', pg.locator('[data-crew-approved-count="2"]').count() == 1 and 'No saved plans yet' not in txt, txt[:300])
    R.check('both approved jobs listed, the draft one not', 'Beach promo' in txt and 'Bridge survey' in txt and 'Warehouse draft' not in txt, txt[:300])
    R.check('my role shown', 'You: Pilot' in txt and 'You: RPIC' in txt, txt[:300])
    R.check('no CRP-only actions (delete / approve / sign as CRP)', sec.locator('[data-del-job]').count() == 0 and sec.locator('button').evaluate_all("bs=>bs.every(b=>b.innerText.trim()==='Open'||/^Beach|^Bridge/.test(b.innerText.trim()))"), sec.locator('button').all_inner_texts())
    pg.click('[data-crew-approved-open="job-c"]'); pg.wait_for_timeout(5000)
    uid = pg.evaluate("(window.__wdFpState&&window.__wdFpState().overview||{}).uid")
    R.check('Open loads that job', uid == 'uid-c', uid)
    R.check('no page errors', not errs, errs[:2])
    pg.context.close(); b.close()
R.done()
