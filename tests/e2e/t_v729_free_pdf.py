# v7.29: the free edition's PDF no longer carries the "Planned with … (free edition)" credit line
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
with sync_playwright() as p:
    b = p.chromium.launch()
    # Free edition: not signed in, "Use free on this device"
    pg, errs, dl = ctx_for(b, None, extra="localStorage.setItem('wd_edition','free');localStorage.setItem('wd_free_intro','1');")
    pg.goto(URL); pg.wait_for_timeout(5000)
    R.check('free edition opens without the sign-in screen', pg.locator('[data-gate-free]').count() == 0)
    pg.evaluate(CAPTURE_PDF)
    if not pg.evaluate(JS_INC, 'Export PDF'): pg.evaluate(JS_INC, 'PDF')
    pg.wait_for_timeout(3000)
    pdfs = pg.evaluate('window.__pdfs') or []
    pdf = pdfs[-1] if pdfs else ''
    R.check('free edition still exports a PDF', 'Preliminary Assessment Checklist' in pdf, len(pdfs))
    R.check('free PDF has no "free edition" credit line', 'data-free-credit' not in pdf and 'free edition' not in pdf.lower() and 'Planned with' not in pdf)
    R.check('free edition: no page errors', not errs, errs[:2])
    pg.context.close()
    b.close()
R.done()
