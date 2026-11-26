# v7.62: HUD Studio 1.9.1. Tall (9:16) fighter frames: the timer / mode / throttle and the small sticks sit above the
# battery and link lines instead of between them (they overlapped); wide frames keep them on the bottom row.
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SPY = """()=>{window.__txt=[];const f=CanvasRenderingContext2D.prototype.fillText;if(!window.__spy){window.__spy=1;CanvasRenderingContext2D.prototype.fillText=function(t,x,y,...r){if(this.canvas.id==='hud')window.__txt.push([String(t),y]);return f.call(this,t,x,y,...r)}}}"""
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1500, 'height': 1000})
    ctx.route('**/*', lambda r: r.abort() if (r.request.url.startswith('http') and 'localhost' not in r.request.url) else r.continue_())
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + 'hud/'); pg.wait_for_timeout(1200)
    R.check('HUD Studio is 1.9.1 or later', pg.inner_text('#hudVer').strip().startswith('v1.9.'), pg.inner_text('#hudVer'))
    pg.evaluate("()=>{[...document.querySelectorAll('button')].find(x=>/sample flight/i.test(x.textContent)).click()}"); pg.wait_for_timeout(2000)
    pg.evaluate("()=>{document.querySelector('.sty[data-s=fighter]').click(); const c=document.getElementById('cockpit'); if(c.checked) c.click();}"); pg.wait_for_timeout(300)
    def ys(ar):
        pg.evaluate("a=>document.querySelector('#arSeg button[data-v=\"'+a+'\"]').click()", ar); pg.wait_for_timeout(300)
        pg.evaluate(SPY); pg.evaluate("()=>{const s=document.getElementById('scrub'); s.value=s.max*0.5; s.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(500)
        t = pg.evaluate("()=>window.__txt"); y = lambda pre: max([v for s, v in t if s.startswith(pre)] or [None])
        return y('T+') or y('T-'), y('BAT')
    tt, bat = ys('9:16')
    R.check('9:16: the timer sits above the battery block', tt is not None and bat is not None and tt < bat - 60, (tt, bat))
    tw, bw = ys('16:9')
    R.check('16:9: the timer stays on the bottom row', tw is not None and bw is not None and tw > bw, (tw, bw))
    R.check('no page errors', errs == [], errs)
    ctx.close(); b.close()
R.done()
