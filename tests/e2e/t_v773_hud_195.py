# v7.73: HUD Studio 1.9.5. (1) Arcade cabinet burn-in keeps the footage (it was punched out to black). (2) The sync is
# remembered for each video + flight and put back after a reload. (3) Playback draws the HUD per video frame.
import sys, os, base64, tempfile; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
MK = '''async()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const g=c.getContext('2d');const st=c.captureStream(30);
const rec=new MediaRecorder(st,{mimeType:'video/webm;codecs=vp8'});const ch=[];rec.ondataavailable=e=>ch.push(e.data);rec.start();const t0=performance.now();
await new Promise(res=>{const f=()=>{const t=(performance.now()-t0)/1000;g.fillStyle='hsl('+(t*90%360)+',70%,50%)';g.fillRect(0,0,320,180);if(t<4)requestAnimationFrame(f);else res();};f();});
rec.stop();await new Promise(r=>rec.onstop=r);const b=new Uint8Array(await new Blob(ch).arrayBuffer());let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);}'''
LOAD = "()=>{[...document.querySelectorAll('button')].find(x=>/sample flight/i.test(x.textContent)).click()}"
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1500, 'height': 1000})
    ctx.route('**/*', lambda r: r.abort() if (r.request.url.startswith('http') and 'localhost' not in r.request.url) else r.continue_())
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + 'hud/'); pg.wait_for_timeout(1200)
    R.check('HUD Studio is 1.9.5', pg.inner_text('#hudVer').strip() == 'v1.9.5', pg.inner_text('#hudVer'))
    vid = os.path.join(tempfile.mkdtemp(), 'clip.webm'); open(vid, 'wb').write(base64.b64decode(pg.evaluate(MK)))
    pg.evaluate(LOAD); pg.wait_for_timeout(2000); pg.set_input_files('#vidIn', vid); pg.wait_for_timeout(1500)
    # (1) burn-in: a red "video" frame, then the cabinet drawn on top on a canvas without transparency (like the export)
    pg.evaluate("()=>document.querySelector('.sty[data-s=cabinet]').click()"); pg.wait_for_timeout(600)
    pg.evaluate("()=>{const s=document.getElementById('scrub'); s.value=s.max*0.4; s.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(300)
    px = pg.evaluate("""()=>{const w=1280,h=720,cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d',{alpha:false});
      const q=window.WD_BETA.cabScr(w,h);c.fillStyle='#000';c.fillRect(0,0,w,h);c.fillStyle='#ff0000';c.fillRect(q.x,q.y,q.w,q.h);window.WD_BETA.drawOnto(c,w,h);
      return [...c.getImageData(Math.round(q.x+q.w*0.3),Math.round(q.y+q.h*0.6),1,1).data]}""")
    R.check('burn-in: the footage still shows on the arcade screen', px[0] > 120 and px[1] < 90, px)
    # (3) playback moves smoothly with no errors
    pg.click('#play'); pg.wait_for_timeout(1500); t1 = pg.inner_text('#tcode'); pg.wait_for_timeout(800); t2 = pg.inner_text('#tcode'); pg.click('#play')
    R.check('playback with a video moves the time on', t1 != t2, (t1, t2))
    # (4) export a section: start / end buttons and typed times; the length shows just that part
    pg.evaluate("()=>{const s=document.getElementById('scrub'); s.value=1; s.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(200); pg.click('#rngA')
    pg.evaluate("()=>{const s=document.getElementById('scrub'); s.value=2.5; s.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(200); pg.click('#rngB')
    li = pg.inner_text('#lenInfo')
    R.check('Section: start and end set from the video position', pg.input_value('#rngAIn') == '1.00' and pg.input_value('#rngBIn') == '2.50', (pg.input_value('#rngAIn'), pg.input_value('#rngBIn')))
    R.check('Section: the length shows only that part (1.5 s = 45 frames at 30 fps)', 'Section' in li and '45 frames' in li, li)
    pg.fill('#rngBIn', '3.00'); pg.dispatch_event('#rngBIn', 'change'); pg.wait_for_timeout(200)
    R.check('Section: typing an end time works', '60 frames' in pg.inner_text('#lenInfo'), pg.inner_text('#lenInfo'))
    pg.click('#rngGo'); pg.wait_for_timeout(300)
    R.check('Go to start jumps to the section start', abs(float(pg.evaluate("()=>document.getElementById('vid').currentTime")) - 1.0) < 0.05)
    # (2) sync remembered
    pg.fill('#armAt', '2.35'); pg.press('#armAt', 'Enter'); pg.dispatch_event('#armAt', 'change'); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(1500)
    R.check('after a reload the sync starts empty', pg.input_value('#armAt') in ('0', '0.00', '3.00'), pg.input_value('#armAt'))
    pg.evaluate(LOAD); pg.wait_for_timeout(2000); pg.set_input_files('#vidIn', vid); pg.wait_for_timeout(1800)
    R.check('opening the same video and flight puts the sync back', pg.input_value('#armAt') == '2.35', pg.input_value('#armAt'))
    R.check('it says the sync was put back', 'put back' in pg.inner_text('#autoNote'), pg.inner_text('#autoNote'))
    R.check('the export section is remembered too', pg.input_value('#rngAIn') == '1.00' and pg.input_value('#rngBIn') == '3.00', (pg.input_value('#rngAIn'), pg.input_value('#rngBIn')))
    pg.click('#rngAll'); pg.wait_for_timeout(200)
    R.check('Whole video clears the section', pg.input_value('#rngAIn') == '' and 'Section' not in pg.inner_text('#lenInfo'), pg.inner_text('#lenInfo'))
    # video first, then the log, also works
    pg.reload(); pg.wait_for_timeout(1500); pg.set_input_files('#vidIn', vid); pg.wait_for_timeout(1500); pg.evaluate(LOAD); pg.wait_for_timeout(2200)
    R.check('video first, then the log: the sync is put back too', pg.input_value('#armAt') == '2.35', pg.input_value('#armAt'))
    R.check('no page errors', errs == [], errs)
    ctx.close(); b.close()
R.done()
