# v7.29: visitors (QR scan / website) land straight in the free planner, no sign-in screen; Sign in stays on the purple bar;
# a BETA sticker shows in the app header; an expired invite link still gets the sign-in screen; the free PDF says "Planned with Dream Flight RPA Planner" without "(free edition)"
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
with sync_playwright() as p:
    b = p.chromium.launch()
    # A first-time visitor: nothing chosen, not signed in
    pg, errs, dl = ctx_for(b, None)
    pg.goto(URL); pg.wait_for_timeout(7500)
    R.check('a new visitor gets the free planner, not the sign-in screen', pg.locator('[data-testid=gate]').count() == 0 and pg.locator('[data-free-banner]').count() == 1)
    R.check('a new visitor sees the free welcome', pg.locator('[data-free-intro-close]').count() == 1)
    R.check('BETA sticker shows for visitors', pg.locator('header [data-beta-badge]').count() == 1 and pg.locator('header [data-beta-badge]').inner_text() == 'BETA')
    R.check('Sign in is on the free bar', pg.locator('[data-free-banner] button', has_text='Sign in').count() == 1)
    pg.click('[data-free-intro-close]'); pg.wait_for_timeout(300)
    pg.evaluate(CAPTURE_PDF)
    if not pg.evaluate(JS_INC, 'Export PDF'): pg.evaluate(JS_INC, 'PDF')
    pg.wait_for_timeout(3000)
    pdfs = pg.evaluate('window.__pdfs') or []
    pdf = pdfs[-1] if pdfs else ''
    R.check('the free planner exports a PDF', 'Preliminary Assessment Checklist' in pdf, len(pdfs))
    R.check('free PDF says "Planned with Dream Flight RPA Planner"', 'data-free-credit' in pdf and 'Planned with Dream Flight RPA Planner' in pdf)
    R.check('free PDF no longer says "(free edition)"', 'free edition' not in pdf.lower())
    R.check('new visitor: no page errors', not errs, errs[:2])
    pg.context.close()
    # The visitor's data stays in the free space only
    pg, errs, dl = ctx_for(b, None)
    pg.goto(URL); pg.wait_for_timeout(7500)
    R.check('a visitor uses the free data space', pg.evaluate('window.__WD_NS') == 'free')
    pg.context.close()
    # An expired / used invite link still shows the sign-in screen with a fresh-link form, and can go back to free
    pg, errs, dl = ctx_for(b, None)
    pg.goto(URL + '#error=access_denied&error_code=otp_expired'); pg.wait_for_timeout(7500)
    R.check('an expired invite link shows the sign-in screen', pg.locator('[data-testid=gate]').count() == 1 and pg.locator('[data-gate-link-error]').count() == 1)
    pg.click('[data-gate-free]'); pg.wait_for_timeout(500)
    R.check('...and "Use free" goes to the free planner', pg.locator('[data-testid=gate]').count() == 0 and pg.locator('[data-free-banner]').count() == 1)
    pg.context.close()
    # A signed-in CRP is not in free mode and their PDF has no credit line
    pg, errs, dl = ctx_for(b, 'crp', {'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Test Co'}}, 'hash': 'h0'}]})
    pg.goto(URL); pg.wait_for_timeout(5000)
    R.check('a signed-in CRP has no free bar', pg.locator('[data-free-banner]').count() == 0 and pg.locator('[data-testid=gate]').count() == 0)
    pg.evaluate(CAPTURE_PDF); pg.evaluate(JS_INC, 'Export PDF'); pg.wait_for_timeout(3000)
    pdfs = pg.evaluate('window.__pdfs') or []
    R.check('BETA sticker shows when signed in, but not in the PDF', pg.locator('header [data-beta-badge]').count() == 1 and pdfs and 'BETA' not in pdfs[-1])
    R.check('a CRP PDF has no credit line', pdfs and 'data-free-credit' not in pdfs[-1], len(pdfs))
    R.check('CRP: no page errors', not errs, errs[:2])
    pg.context.close()
    b.close()
R.done()
