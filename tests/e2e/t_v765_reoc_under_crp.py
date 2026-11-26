# v7.65: "Flown under another operator's ReOC" moved from a box at the top of Authorisation into the CRP block:
# it shows our ReOC number with a small Ours / Another operator's choice beside it. Also: Sign in on the free welcome.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', {'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Test Co', 'reocNumber': 'CASA.ReOC.9037'}}, 'hash': 'h0'}]}, 'approval',
                           "localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'h0'}));")
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Authorisation'); pg.wait_for_timeout(800)
    R.check('the old box is gone', "Flown under another operator's ReOC (not ours)" not in pg.inner_text('body'))
    box = pg.locator('[data-other-reoc]')
    R.check('the ReOC sits in the CRP block', box.count() == 1 and pg.evaluate("!!document.querySelector('[data-other-reoc]').closest('div.space-y-4').innerText.toUpperCase().includes('CHIEF REMOTE PILOT')"))
    R.check('...showing our ReOC number, set to Ours', 'CASA.ReOC.9037' in box.inner_text() and pg.input_value('[data-other-reoc-toggle]') == 'ours', box.inner_text())
    box.scroll_into_view_if_needed(); pg.screenshot(path='/private/tmp/claude-501/-Users-michaelrubio-Desktop-RPAS-App-Projects/66e86ef4-8421-4dc3-a338-7399062c82d5/scratchpad/reoc_ours.png', clip=pg.locator('[data-other-reoc]').locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]').bounding_box())
    pg.select_option('[data-other-reoc-toggle]', 'other'); pg.wait_for_timeout(300)
    pg.fill('[data-other-reoc-operator]', 'Drone Action Team · CASA.ReOC.1234'); pg.wait_for_timeout(500)
    R.check("choosing another operator's asks whose and explains", pg.locator('[data-other-reoc="1"]').count() == 1 and 'crew currency checks' in box.inner_text() and 'Drone Action Team' in box.inner_text())
    pg.screenshot(path='/private/tmp/claude-501/-Users-michaelrubio-Desktop-RPAS-App-Projects/66e86ef4-8421-4dc3-a338-7399062c82d5/scratchpad/reoc_other.png', clip=pg.locator('[data-other-reoc]').locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]').bounding_box())
    pg.select_option('[data-other-reoc-toggle]', 'ours'); pg.wait_for_timeout(300)
    R.check('switching back to Ours clears it', pg.locator('[data-other-reoc="0"]').count() == 1 and 'CASA.ReOC.9037' in box.inner_text())
    R.check('no page errors', not errs, errs[:2])
    pg.context.close()
    # v7.65: the free welcome has a Sign in for existing users
    pg, errs, dl = ctx_for(b, None)
    pg.goto(URL); pg.wait_for_timeout(7500)
    R.check('free welcome: "Already have an account?" with Sign in', pg.locator('[data-free-signin]').count() == 1 and 'Already have an account?' in pg.inner_text('[data-testid=free-intro]'))
    pg.locator('[data-testid=free-intro] > div').screenshot(path='/private/tmp/claude-501/-Users-michaelrubio-Desktop-RPAS-App-Projects/66e86ef4-8421-4dc3-a338-7399062c82d5/scratchpad/free_signin.png')
    pg.click('[data-free-signin]'); pg.wait_for_timeout(800)
    R.check('...it closes the welcome and opens the sign-in form', pg.locator('[data-testid=free-intro]').count() == 0 and pg.locator('[data-testid=signin-email]').count() == 1)
    R.check('no page errors (free)', not errs, errs[:2])
    pg.context.close(); b.close()
R.done()
