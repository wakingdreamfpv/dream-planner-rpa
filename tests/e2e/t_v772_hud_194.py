# v7.72: HUD Studio 1.9.4. Auto-sync from takeoff: the first throttle push in the log is lined up with the first frame
# where the video starts to move. Test video: still for 3 s, then the picture moves. Also "Takeoff is here".
import sys, os, base64, tempfile; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
MK = '''async()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const g=c.getContext('2d');const st=c.captureStream(30);
const rec=new MediaRecorder(st,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:3e6});const ch=[];rec.ondataavailable=e=>ch.push(e.data);
const draw=(off)=>{for(let y=0;y<360;y+=40)for(let x=-80;x<720;x+=40){g.fillStyle=((x/40+y/40)&1)?'#2a6':'#fc3';g.fillRect(x+off%80,y,40,40);}g.fillStyle='#fff';g.fillRect(300+off%80,150,40,60);};
rec.start();const t0=performance.now();await new Promise(res=>{const f=()=>{const t=(performance.now()-t0)/1000;draw(t<3?0:(t-3)*220);if(t<9)requestAnimationFrame(f);else res();};f();});
rec.stop();await new Promise(r=>rec.onstop=r);const b=new Uint8Array(await new Blob(ch).arrayBuffer());let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);}'''
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1500, 'height': 1000})
    ctx.route('**/*', lambda r: r.abort() if (r.request.url.startswith('http') and 'localhost' not in r.request.url) else r.continue_())
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + 'hud/'); pg.wait_for_timeout(1200)
    R.check('HUD Studio is 1.9.4', pg.inner_text('#hudVer').strip() == 'v1.9.4', pg.inner_text('#hudVer'))
    vid = os.path.join(tempfile.mkdtemp(), 'still3.webm'); open(vid, 'wb').write(base64.b64decode(pg.evaluate(MK)))
    pg.evaluate("()=>{[...document.querySelectorAll('button')].find(x=>/sample flight/i.test(x.textContent)).click()}"); pg.wait_for_timeout(2000)
    pg.set_input_files('#vidIn', vid); pg.wait_for_timeout(2000)
    R.check('the Auto-sync, Takeoff is here and Go to takeoff buttons show', all(pg.is_visible(x) for x in ('#autoSync', '#takeoffHere', '#goTakeoff')))
    thr = pg.evaluate("()=>window.WD_BETA.firstThrottle()")
    R.check('the log has a first throttle push after arming', thr == thr and 0 < thr < 120, thr)
    pg.click('#autoSync')
    for _ in range(60):
        pg.wait_for_timeout(500)
        if 'Lined up' in pg.inner_text('#autoNote'): break
    note = pg.inner_text('#autoNote'); arm = float(pg.input_value('#armAt'))
    R.check('Auto-sync finishes and says what it lined up', 'Lined up' in note, note)
    R.check('the first throttle push lands where the video starts moving (3 s)', abs(arm + thr - 3.0) < 0.15, (arm, thr, arm + thr))
    R.check('the video jumped to the takeoff frame', abs(float(pg.evaluate("()=>document.getElementById('vid').currentTime")) - 3.0) < 0.2)
    pg.evaluate("()=>{const s=document.getElementById('scrub'); s.value=5; s.dispatchEvent(new Event('input',{bubbles:true}))}"); pg.wait_for_timeout(400)
    pg.click('#takeoffHere'); pg.wait_for_timeout(300); arm2 = float(pg.input_value('#armAt'))
    R.check('Takeoff is here puts the first throttle push on the current frame', abs(arm2 + thr - 5.0) < 0.02, (arm2, thr))
    pg.click('#goTakeoff'); pg.wait_for_timeout(500)
    R.check('Go to takeoff jumps the video to the first throttle push', abs(float(pg.evaluate("()=>document.getElementById('vid').currentTime")) - 5.0) < 0.05)
    R.check('no page errors', errs == [], errs)
    ctx.close(); b.close()
R.done()
