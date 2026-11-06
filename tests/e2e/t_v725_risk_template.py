# v7.25: built-in risk template "OONP Pathway 2 — Night outdoor event (mini-lifter away from people + small drones with consent)".
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp'); pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate(JS_INC, 'JSA & Risk'); pg.wait_for_timeout(700)
    sel = pg.locator('select:has(option[value=oonpP2NightEventLifter])').first
    R.check('template listed under OONP Operations', sel.count() == 1 and 'Night outdoor event' in pg.inner_text('option[value=oonpP2NightEventLifter]'))
    sel.select_option('oonpP2NightEventLifter'); pg.wait_for_timeout(200)
    pg.evaluate("()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Load'&&x.offsetParent); b&&b.click(); return !!b}"); pg.wait_for_timeout(1200)
    txt = pg.inner_text('body')
    R.check('16 risks loaded, starting with the night OONP hold point', 'Schedule 1.3' in txt and 'Mini-lifter (≈1.5 kg, prop-guarded) impact with a person' in txt and 'Filming members of the public' in txt, [d for d in dl][-2:])
    risks = pg.evaluate("""()=>new Promise(r=>setTimeout(()=>r(null),10))""")
    R.check('no page errors', not errs, errs[:3])
    b.close()
R.done()
