# v7.55: the Tools landing page has a big carousel at the top: a slide per tool (HUD Studio, Flight Log, Planner and
# more HUD styles), each with a label and a working picture; next/prev and the dots move it; it fits a phone.
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp in [('desktop', {'width': 1280, 'height': 860}), ('phone', {'width': 390, 'height': 844})]:
        ctx = b.new_context(service_workers='block', viewport=vp)
        ctx.route('**/*', lambda r: r.abort() if (r.request.url.startswith('http') and ('localhost:' + PORT) not in r.request.url) else r.continue_())
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL + 'tools/'); pg.wait_for_timeout(1200)
        info = pg.evaluate("""()=>[...document.querySelectorAll('#car .slide')].map(s=>({href:s.getAttribute('href'),
            label:(s.querySelector('.label')||{}).textContent||'', imgs:[...s.querySelectorAll('img')].map(i=>({src:i.getAttribute('src'),w:i.naturalWidth}))}))""")
        R.check(name + ': carousel has 3+ slides', len(info) >= 3, len(info))
        hrefs = ' '.join(s['href'] or '' for s in info)
        R.check(name + ': slides for HUD Studio, Flight Log and the Planner', '/hud/' in hrefs and '/log/' in hrefs and '/' in [s['href'] for s in info], hrefs)
        R.check(name + ': every slide has a label', all(len(s['label'].strip()) > 5 for s in info), [s['label'][:30] for s in info])
        pg.evaluate("()=>Promise.all([...document.querySelectorAll('#car img')].map(i=>{i.loading='eager'; return i.complete?0:new Promise(r=>{i.onload=i.onerror=r})}))")
        bad = pg.evaluate("()=>[...document.querySelectorAll('#car img')].filter(i=>!i.naturalWidth).map(i=>i.getAttribute('src'))")
        R.check(name + ': every carousel picture loads', bad == [], bad)
        s0 = pg.get_attribute('#car', 'data-slide')
        pg.click('#car .nav.next'); pg.wait_for_timeout(700)
        s1 = pg.get_attribute('#car', 'data-slide')
        R.check(name + ': Next moves to the next slide', s0 != s1 and s1 is not None, (s0, s1))
        pg.click('#car .nav.prev'); pg.wait_for_timeout(700)
        R.check(name + ': Previous moves back', pg.get_attribute('#car', 'data-slide') == s0)
        nd = pg.evaluate("()=>document.querySelectorAll('#carDots button').length")
        R.check(name + ': one dot per slide', nd == len(info), (nd, len(info)))
        if nd > 2:
            pg.click('#carDots button:nth-child(3)'); pg.wait_for_timeout(700)
            R.check(name + ': clicking a dot jumps to that slide', pg.get_attribute('#car', 'data-slide') == '2')
        sx = pg.evaluate("()=>document.documentElement.scrollWidth - document.documentElement.clientWidth")
        R.check(name + ': no sideways scrolling', sx <= 1, sx)
        R.check(name + ': no page errors', errs == [], errs)
        ctx.close()
    b.close()
R.done()
