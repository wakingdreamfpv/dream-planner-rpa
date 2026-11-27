# v7.74: built-in risk template "OONP Pathway 2 + EVLOS — Fully outdoor music festival" (sub-250 g, below 20 m, light pyro).
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
V = 'oonpP2OutdoorFestival'
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp'); pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate(JS_INC, 'JSA & Risk'); pg.wait_for_timeout(700)
    sel = pg.locator('select:has(option[value=%s])' % V).first
    R.check('template listed', sel.count() == 1 and 'Fully outdoor music festival' in pg.inner_text('option[value=%s]' % V))
    sel.select_option(V); pg.wait_for_timeout(200)
    pg.evaluate("()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Load'&&x.offsetParent); b&&b.click(); return !!b}"); pg.wait_for_timeout(1200)
    txt = pg.inner_text('body')
    R.check('festival risks loaded', all(s in txt for s in ['outdoor festival, sub-250 g', 'Height limits — 45 m zone max, 20 m max over people', 'Return to home (RTH) / failsafe climb', 'site within 3 nm of an aerodrome', 'rain, storms and lightning', 'Heat, sun and crew fatigue', 'Crowd movement in open areas', 'limited pyro']))
    R.check('RTH no higher than max height flown', 'RTH height set no higher than the max height flown' in txt)
    R.check('no venue structure, laser or confetti risks', all(s not in txt for s in ['Lasers —', 'confetti', 'Collision with venue', 'open-roof']))
    R.check('no page errors', not errs, errs[:3])
    b.close()
R.done()
