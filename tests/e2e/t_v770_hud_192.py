# v7.70: HUD Studio 1.9.2. New "Arcade cabinet" style (Mike's two photos): the footage plays inside the arcade screen,
# the tall photo is used for 9:16 and the wide one for 16:9; the screen, joysticks, stick boxes and buttons follow the flight.
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SPY = """()=>{window.__txt=[];window.__img=[];const P=CanvasRenderingContext2D.prototype;if(!window.__spy){window.__spy=1;const f=P.fillText,d=P.drawImage;
 P.fillText=function(t,...r){if(this.canvas.id==='hud')window.__txt.push(String(t));return f.call(this,t,...r)};
 P.drawImage=function(im,...r){if(this.canvas.id==='hud'||im.naturalWidth>800){const m=this.getTransform();window.__img.push([im.naturalWidth,im.naturalHeight,Math.round(m.e),Math.round(m.f),+m.b.toFixed(3)])}return d.call(this,im,...r)}}}"""
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1500, 'height': 1000})
    ctx.route('**/*', lambda r: r.abort() if (r.request.url.startswith('http') and 'localhost' not in r.request.url) else r.continue_())
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + 'hud/'); pg.wait_for_timeout(1200)
    R.check('HUD Studio is 1.9.2 or later', pg.inner_text('#hudVer').strip().startswith('v1.9.'), pg.inner_text('#hudVer'))
    R.check('there is an Arcade cabinet style card', pg.is_visible('.sty[data-s=cabinet]') and 'Arcade cabinet' in pg.inner_text('.sty[data-s=cabinet]'))
    pg.evaluate("()=>{[...document.querySelectorAll('button')].find(x=>/sample flight/i.test(x.textContent)).click()}"); pg.wait_for_timeout(2000)
    pg.evaluate("()=>document.querySelector('.sty[data-s=cabinet]').click()"); pg.wait_for_timeout(800)
    def frame(ar, f):
        pg.evaluate("a=>document.querySelector('#arSeg button[data-v=\"'+a+'\"]').click()", ar); pg.wait_for_timeout(300)
        pg.evaluate(SPY); pg.evaluate("f=>{const s=document.getElementById('scrub'); s.value=s.max*f; s.dispatchEvent(new Event('input',{bubbles:true}))}", f); pg.wait_for_timeout(500)
        return pg.evaluate("()=>({t:window.__txt,i:window.__img})")
    for ar, base in (('16:9', (1672, 941)), ('9:16', (941, 1672))):
        a = frame(ar, 0.3); bb = frame(ar, 0.6)
        R.check(ar + ': draws the right cabinet photo', any(x[0] == base[0] and x[1] == base[1] for x in a['i']), a['i'][:3])
        R.check(ar + ': screen and panels show live text', any(t.startswith('SCORE') for t in a['t']) and 'BATTERY' in a['t'] and 'SPEED' in a['t'], a['t'][:12])
        stk = lambda d: [x for x in d['i'] if x[0] < 200]
        R.check(ar + ': the two joysticks are drawn and move as the flight plays', len(stk(a)) == 2 and stk(a) != stk(bb), (stk(a), stk(bb)))
        R.check(ar + ': the readouts change as the flight plays', a['t'] != bb['t'])
        # the footage sits inside the arcade screen (smaller than the frame)
        r = pg.evaluate("()=>{const s=document.getElementById('stage').getBoundingClientRect(),v=document.getElementById('vid');return [s.height,parseFloat(v.style.height)||0]}")
        R.check(ar + ': the footage is fitted into the arcade screen', 0 < r[1] < r[0] * 0.8, r)
    pg.evaluate("()=>document.querySelector('.sty[data-s=fighter]').click()"); pg.wait_for_timeout(400)
    r = pg.evaluate("()=>{const s=document.getElementById('stage').getBoundingClientRect(),v=document.getElementById('vid');return [s.width,parseFloat(v.style.width)||0]}")
    R.check('other styles fill the frame with the footage again', r[1] >= r[0] * 0.99, r)
    R.check('no page errors', errs == [], errs)
    ctx.close(); b.close()
R.done()
