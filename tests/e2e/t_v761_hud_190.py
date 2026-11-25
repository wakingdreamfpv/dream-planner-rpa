# v7.61: HUD Studio 1.9.0. Version label in the header; the sample is a real flight log (moved to a random spot);
# new over-shoulder fighter view, new sci-fi photo cockpit, 8-bit go-kart cockpit and the new Retro spaceship style,
# all with moving controls; the HUD sways a little with the cockpit.
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SHOT = "()=>{const c=document.getElementById('hud'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;let n=0,h=0;for(let i=0;i<d.length;i+=4*97){if(d[i+3]>10){n++;h=(h*31+d[i]+d[i+1]*7+d[i+2]*13)|0;}}return [n,h]}"
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1500, 'height': 1000})
    ctx.route('**/*', lambda r: r.abort() if (r.request.url.startswith('http') and 'localhost' not in r.request.url) else r.continue_())
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + 'hud/'); pg.wait_for_timeout(1200)
    R.check('the version shows next to the BETA badge', pg.is_visible('#hudVer') and pg.inner_text('#hudVer').strip().startswith('v1.9'), pg.inner_text('#hudVer') if pg.is_visible('#hudVer') else None)
    R.check('Retro spaceship is a style card', pg.is_visible('.sty[data-s=retro]') and 'Retro spaceship' in pg.inner_text('.sty[data-s=retro]'))
    pg.evaluate("()=>{[...document.querySelectorAll('button')].find(x=>/sample flight/i.test(x.textContent)).click()}"); pg.wait_for_timeout(2000)
    info = pg.evaluate("async()=>{const t=await window.WD_BETA.realSample();const L=t.trim().split('\\n');return {n:L.length,air:t.includes(',AIR,'),home:t.includes('-27.50')||t.includes(' 153.2')}}")
    R.check('the sample is the real flight (about 3½ minutes at 10 a second, AIR mode)', info['n'] > 2000 and info['air'], info)
    R.check('the sample does not contain the original flying spot', not info['home'], info)
    for sty, extra in [('fighter', "document.querySelector('#ckJetSeg button[data-v=shoulder]').click()"), ('scifi', ''), ('arcade', ''), ('retro', '')]:
        pg.evaluate("([st,x])=>{document.querySelector('.sty[data-s='+st+']').click(); const c=document.getElementById('cockpit'); if(!c.checked) c.click(); if(x) eval(x);}", [sty, extra]); pg.wait_for_timeout(500)
        for ar in ['16:9', '9:16']:
            pg.evaluate("a=>document.querySelector('#arSeg button[data-v=\"'+a+'\"]').click()", ar); pg.wait_for_timeout(300)
            sl = "v=>{const s=document.getElementById('scrub'); s.value=s.max*v; s.dispatchEvent(new Event('input',{bubbles:true}))}"
            pg.evaluate(sl, 0.35); pg.wait_for_timeout(500); a = pg.evaluate(SHOT)
            pg.evaluate(sl, 0.62); pg.wait_for_timeout(500); c2 = pg.evaluate(SHOT)
            R.check(f'{sty} cockpit draws in {ar} and changes as the flight plays (controls move)', a[0] > 50 and a[1] != c2[1], (a, c2))
    pg.evaluate("()=>{document.querySelector('.sty[data-s=retro]').click(); const c=document.getElementById('cockpit'); if(c.checked) c.click();}"); pg.wait_for_timeout(400)
    R.check('Retro spaceship HUD draws without the cockpit too', pg.evaluate(SHOT)[0] > 20)
    R.check('no page errors', errs == [], errs)
    ctx.close(); b.close()
R.done()
