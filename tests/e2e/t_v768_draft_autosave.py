# v7.68: (1) "New Operation" saves the new job as a draft straight away (and to the account for the CRP). Leaving it before
# it's saved on purpose asks: keep the draft, or discard it (discard = removed here, marked cancelled in the account).
# A draft left without being asked (tab closed) is asked about with a banner next time. A draft saved on purpose is never asked about.
# (2) As soon as the plan has both signatures (or the CRP override) and Approved for Flight is switched on, it's saved into
# Saved approved plans (and to the account as approved) without pressing Save.
import sys, os, json, copy; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SETUP = {'key': 'settings', 'data': {'companyProfile': {'name': 'Waking Dream FPV'}}, 'hash': 'h0', 'device': 'Mac'}
LS = "localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h0'}));"
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
drafts = lambda pg: [(x.get('overview') or {}).get('uid') for x in ((get_db(pg) or {}).get('draftPlans') or [])]
saved = lambda pg: [(x.get('overview') or {}).get('uid') for x in ((get_db(pg) or {}).get('savedPlans') or [])]
cur_uid = lambda pg: (pg.evaluate("JSON.parse(localStorage.getItem('wd_auto_draft')||'null')") or {}).get('uid')
job_calls = lambda pg, op: [c for c in (pg.evaluate('window.__calls') or []) if c.get('t') == 'jobs' and c.get('op') == op]
new_op = lambda pg: pg.click('header button:has-text("New Operation")')
with sync_playwright() as p:
    b = p.chromium.launch()
    # ── 1. auto draft, discard, keep, stay, saved on purpose ───────────────────────────────────────────────
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [SETUP]}, extra=LS)
    pg.goto(URL); pg.wait_for_timeout(6000)
    R.check('(setup) no draft just from opening the planner', drafts(pg) == [], drafts(pg))
    new_op(pg); pg.wait_for_timeout(2500)
    d1 = drafts(pg); a1 = cur_uid(pg)
    R.check('New Operation saves the new job as a draft straight away', len(d1) == 1 and a1 == d1[0], (d1, a1))
    R.check('...a note says so', pg.locator('[data-job-note=draft]').count() == 1)
    pg.wait_for_timeout(2500)
    ups = [c for c in job_calls(pg, 'upsert') if (c.get('payload') or {}).get('plan_uid') == a1]
    R.check('...and it is sent to the account as a draft', ups and ups[-1]['payload'].get('status') == 'draft', job_calls(pg, 'upsert')[-1:])
    # leaving it asks; Stay keeps it open
    n_dl = len(dl); new_op(pg); pg.wait_for_timeout(600)
    R.check('leaving the new draft asks keep or discard', pg.locator('[data-auto-draft-ask=leave]').count() == 1 and len(dl) == n_dl, dl[n_dl:])
    pg.click('[data-auto-draft-stay]'); pg.wait_for_timeout(500)
    R.check('"Stay on this job" closes the question, nothing changes', pg.locator('[data-auto-draft-ask]').count() == 0 and drafts(pg) == d1 and cur_uid(pg) == a1)
    # Discard
    new_op(pg); pg.wait_for_timeout(500); pg.click('[data-auto-draft-discard]'); pg.wait_for_timeout(3500)
    d2 = drafts(pg); a2 = cur_uid(pg)
    R.check('Discard removes that draft and starts the new job (also saved as a draft)', a1 not in d2 and len(d2) == 1 and a2 == d2[0] and a2 != a1, (d2, a1, a2))
    up = [c for c in job_calls(pg, 'update') if (c.get('payload') or {}).get('status') == 'cancelled']
    R.check('...the discarded draft is marked cancelled in the account (not erased)', up and not job_calls(pg, 'delete'), up[-1:])
    # Saved on purpose → never asked
    pg.click('header button:has-text("Save Draft")'); pg.wait_for_timeout(1500)
    R.check('Save Draft keeps it for good (no longer "not kept")', cur_uid(pg) is None, cur_uid(pg))
    n_dl = len(dl); new_op(pg); pg.wait_for_timeout(2500)
    R.check('...so New Operation does not ask keep / discard (just the usual confirm)', pg.locator('[data-auto-draft-ask]').count() == 0 and len(dl) > n_dl)
    d3 = drafts(pg); a3 = cur_uid(pg)
    R.check('...the saved job is still there and the new one is a draft too', a2 in d3 and a3 in d3 and len(d3) == 2, (d3, a2, a3))
    # Keep, when opening another job from the drafts list
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(700)
    pg.evaluate("""()=>{ const bs=[...document.querySelectorAll('button')].filter(b=>b.innerText.trim()==='Resume'&&b.offsetParent); if(bs.length) bs[bs.length-1].click(); return bs.length }"""); pg.wait_for_timeout(700)
    R.check('opening another job asks about the new draft first', pg.locator('[data-auto-draft-ask=leave]').count() == 1)
    pg.click('[data-auto-draft-keep]'); pg.wait_for_timeout(2500)
    R.check('Keep: the new draft stays in Draft plans, and the other job opens', a3 in drafts(pg) and cur_uid(pg) is None and pg.evaluate("document.querySelector('[data-auto-draft-ask]')") is None, (drafts(pg), cur_uid(pg)))
    # Left without being asked (tab closed) → banner next time
    new_op(pg); pg.wait_for_timeout(2500); a4 = cur_uid(pg)
    R.check('(setup) another new draft', a4 and a4 in drafts(pg))
    pg.reload(); pg.wait_for_timeout(6000)
    R.check('reopening the planner asks about the draft left without saving', pg.locator('[data-auto-draft-ask=left]').count() == 1)
    pg.click('[data-auto-draft-discard]'); pg.wait_for_timeout(1500)
    R.check('...Discard removes only that draft', a4 not in drafts(pg) and a2 in drafts(pg) and a3 in drafts(pg) and pg.locator('[data-auto-draft-ask]').count() == 0, drafts(pg))
    R.check('...and a safety copy from before is kept', pg.evaluate("""()=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const g=q.result.transaction('kv').objectStore('kv').get('rpas_database_safety');g.onsuccess=()=>r(!!g.result)}})"""))
    R.check('no page errors (drafts)', not errs, errs[:3])
    pg.context.close()

    # (the jobs are flown under another ReOC here, so the crew-currency checks don't apply)
    # ── 2. approved with both signatures → saved approved by itself ────────────────────────────────────
    smp = json.load(open(os.path.join(ROOT, 'public/demo/acme-suncorp.json')))
    plan = copy.deepcopy(smp['plan']); plan['overview']['uid'] = 'uid-appr'; plan['overview']['identifier'] = 'OP-2026-0765'
    ids = ['taskOverview', 'assessor', 'rpic', 'dates', 'rpaTypes', 'rps', 'maxHeight', 'launch', 'recovery', 'prelim', 'opTypes', 'airspace', 'risks',
           'sopMitigatesAll', 'jsaCorrect', 'officialAuth', 'notams', 'releaseServiceable', 'approvedDates', 'approvedTypes']
    ov = {i: {'reason': 'Recorded outside the planner for this test', 'by': {'name': 'Michael Rubio'}, 'at': '2026-11-26T00:00:00Z'} for i in ids}
    plan['approval'] = dict(plan.get('approval') or {}, crpName='Michael Rubio', crpSigned=True, crpDate='2026-11-26', rpName='Test Pilot', rpSigned=True, rpDate='2026-11-26',
                            flightAuthApproved=False, approvedAt=None, rpRemote=None, reqOverrides=ov)
    plan.update({'id': 'OP-2026-0765', 'title': 'Approve me', 'status': 'draft', 'savedAt': '2026-11-26T00:00:00Z'})
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [SETUP]}, extra=LS)
    pg.goto(URL); pg.wait_for_timeout(2500); pg.evaluate(SET_LOCAL, {'companyProfile': {'name': 'Waking Dream FPV'}, 'draftPlans': [plan], 'savedPlans': [], 'otherReocJobs': {'uid-appr': {'name': 'Test ReOC'}}}); pg.reload(); pg.wait_for_timeout(6000)
    open_draft(pg); pg.wait_for_timeout(800)
    R.check('(setup) opening a signed, not-yet-approved draft saves nothing by itself', saved(pg) == [], saved(pg))
    pg.evaluate(JS_INC, 'Approval'); pg.wait_for_timeout(800)
    n_dl = len(dl)
    pg.evaluate("document.querySelector('[data-approve-toggle]').click()"); pg.wait_for_timeout(3000)
    R.check('switching on Approved for Flight saves it into Saved approved plans', saved(pg) == ['uid-appr'], (saved(pg), dl[n_dl:]))
    R.check('...and takes it out of Draft plans', 'uid-appr' not in drafts(pg), drafts(pg))
    R.check('...without a Save click or a pop-up, with a note instead', pg.locator('[data-job-note=approved]').count() == 1 and not [m for m in dl[n_dl:] if 'Plan saved' in m], dl[n_dl:])
    sp = (get_db(pg).get('savedPlans') or [{}])[0]
    R.check('...the saved copy is approved with both signatures', sp.get('status') == 'approved' and (sp.get('approval') or {}).get('flightAuthApproved') and (sp.get('approval') or {}).get('rpSigned'))
    pg.wait_for_timeout(2500)
    ups = [c for c in job_calls(pg, 'upsert') if (c.get('payload') or {}).get('plan_uid') == 'uid-appr']
    R.check('...and sent to the account as approved', ups and ups[-1]['payload'].get('status') == 'approved', ups[-1:])
    at = sp.get('savedAt')
    pg.reload(); pg.wait_for_timeout(6000)
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(600)
    pg.evaluate("""()=>{ const b=[...document.querySelectorAll('button')].find(b=>/Load|Open|Resume/.test(b.innerText)&&b.closest('[data-dbfold=dbsec-approved]')); if(b) b.click(); return !!b }"""); pg.wait_for_timeout(3000)
    R.check('opening the approved plan later does not save it again', [x.get('savedAt') for x in (get_db(pg).get('savedPlans') or [])] == [at])
    R.check('no page errors (approval)', not errs, errs[:3])
    pg.context.close()

    # ── 3. CRP override instead of the RPIC signature ──────────────────────────────────────────────────
    p2 = copy.deepcopy(plan); p2['overview']['uid'] = 'uid-ovr'; p2['overview']['identifier'] = 'OP-2026-0766'; p2['id'] = 'OP-2026-0766'
    p2['approval'].update({'rpSigned': False, 'rpDate': '', 'rpOverride': {'reason': 'RPIC reviewed and accepted the plan by phone.', 'at': '2026-11-26T00:00:00Z', 'by': {'name': 'Michael Rubio'}}})
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [SETUP]}, extra=LS)
    pg.goto(URL); pg.wait_for_timeout(2500); pg.evaluate(SET_LOCAL, {'companyProfile': {'name': 'Waking Dream FPV'}, 'draftPlans': [p2], 'savedPlans': [], 'otherReocJobs': {'uid-ovr': {'name': 'Test ReOC'}}}); pg.reload(); pg.wait_for_timeout(6000)
    open_draft(pg); pg.wait_for_timeout(800); pg.evaluate(JS_INC, 'Approval'); pg.wait_for_timeout(800)
    n_dl = len(dl); pg.evaluate("document.querySelector('[data-approve-toggle]').click()"); pg.wait_for_timeout(3000)
    R.check('with the CRP override (no RPIC signature) it is saved approved too', saved(pg) == ['uid-ovr'], (saved(pg), dl[n_dl:]))
    R.check('no page errors (override)', not errs, errs[:3])
    pg.context.close()
    b.close()
R.done()
