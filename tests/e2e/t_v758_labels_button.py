# v7.58: a Hide labels / Show labels button on the ops map itself (2D and 3D); in 3D it switches live without
# rebuilding the view, and the tips box can be closed. The Tools page carousel gains the Planner-over-Google-3D slide
# and its own Hide labels switch, remembered next visit.
import sys, os, json, math; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
LAT, LNG = -28.0, 153.43
KX = 111320 * math.cos(math.radians(LAT)); E = lambda m: LNG + m / KX; N = lambda m: LAT + m / 111320
TERR = "window.__WD_SAT = false; window.__WD_BUILDINGS = () => []; window.__WD_TERRAIN = async (lls) => ({ src: 'test terrain', elev: lls.map(() => 30) });"
GOOG = """window.__WD_GOOGLE3D = async (THREE) => { const group = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(400, 10, 400), new THREE.MeshBasicMaterial()); m.position.y = 40; group.add(m);
  return { tiles: { group, update(){}, deleteCamera(){} }, onChange: null, place(x, z){ group.position.set(x, 0, z); }, note: () => 'Google 3D city · Google' }; };"""
Z = [{'id': 'x1', 'kind': 'exclusion', 'shape': 'poly', 'name': 'Exclusion 1', 'ground': 0, 'buffer': 3, 'pts': [[N(-80), E(20)], [N(-80), E(80)], [N(80), E(80)], [N(80), E(20)]]},
     {'id': 'x2', 'kind': 'exclusion', 'shape': 'poly', 'name': 'Exclusion 2', 'ground': 0, 'buffer': 3, 'pts': [[N(-80), E(21)], [N(-80), E(79)], [N(80), E(79)], [N(80), E(21)]]},
     {'id': 'o1', 'kind': 'over', 'shape': 'poly', 'name': 'Over people', 'ground': 0, 'h': 10, 'pts': [[N(-80), E(-40)], [N(-80), E(15)], [N(80), E(15)], [N(80), E(-40)]]}]
OPS = {'v': 1, 'mode': 'geo', 'settings': {}, 'overlay': None, 'views': [], 'zones': Z, 'points': [], 'paths': []}
with sync_playwright() as p:
    b = p.chromium.launch(); pg, errs, dl = ctx_for(b, 'crp', extra=TERR + GOOG); pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate("""(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})""", {'googleTilesKey': 'AIzaTEST'})
    pg.reload(); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, {'overview': {'uid': 'u-756', 'identifier': 'OP-2026-0756', 'operationName': 'Paths'}, 'opsMap': OPS}); pg.reload(); pg.wait_for_timeout(5000)
    open_draft(pg); pg.wait_for_timeout(800); pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
    tagsN = lambda: pg.evaluate("()=>document.querySelectorAll('.wd-ops-tag, [data-ops-path-tag]').length")
    btn = '[data-ops-labels-btn]'
    n0 = tagsN()
    R.check('2D: labels show to start with, and the map has a Hide labels button', n0 > 0 and pg.inner_text(btn).strip() == 'Hide labels', (n0, pg.inner_text(btn)))
    pg.click(btn); pg.wait_for_timeout(500)
    R.check('2D: Hide labels hides every zone and path label', tagsN() == 0 and pg.inner_text(btn).strip() == 'Show labels', tagsN())
    R.check('2D: the Show list\'s Labels box follows the button', not pg.locator('label:has-text("Labels") input').is_checked())
    pg.click(btn); pg.wait_for_timeout(500)
    R.check('2D: Show labels brings them back', tagsN() == n0, tagsN())
    pg.click('[data-ops-view="3d"]'); pg.wait_for_timeout(7000)
    sprites = lambda: pg.evaluate("()=>{let n=0; window.__WD_3D.scene.traverse(o=>{ if(o.isSprite&&o.visible) n++; }); return n;}")
    pg.evaluate("()=>{window.__WD_3D.scene.userData.mark756 = 1}")
    s0 = sprites()
    R.check('3D: labels show and the Hide labels button is there', s0 > 0 and pg.locator(btn).is_visible(), s0)
    pg.click(btn); pg.wait_for_timeout(600)
    R.check('3D: Hide labels hides them all straight away', sprites() == 0, sprites())
    R.check('3D: ...without rebuilding the view (Google city not reloaded)', pg.evaluate("()=>window.__WD_3D.scene.userData.mark756 === 1"))
    pg.click(btn); pg.wait_for_timeout(600)
    R.check('3D: Show labels brings them back', sprites() == s0, (sprites(), s0))
    R.check('3D: the tips box can be closed', pg.locator('[data-ops-3d-tips]').is_visible())
    pg.click('[data-ops-3d-tipsclose]'); pg.wait_for_timeout(300)
    R.check('3D: ...and is gone after closing', not pg.locator('[data-ops-3d-tips]').is_visible())
    R.check('no page errors (planner)', not errs, errs[:3])
    pg.context.close()
    # Tools page carousel: the new Google 3D slide and Hide labels
    ctx = b.new_context(service_workers='block', viewport={'width': 1280, 'height': 860})
    ctx.route('**/*', lambda r: r.abort() if (r.request.url.startswith('http') and ('localhost:' + PORT) not in r.request.url) else r.continue_())
    pg = ctx.new_page(); e2 = []; pg.on('pageerror', lambda e: e2.append(str(e)))
    pg.goto(URL + 'tools/'); pg.wait_for_timeout(1200)
    srcs = pg.evaluate("()=>[...document.querySelectorAll('#car .slide img')].map(i=>i.getAttribute('src'))")
    R.check('carousel has the Planner-over-Google-3D slide right after the Planner 3D one', 'img/planner-google3d.jpg' in srcs and srcs.index('img/planner-google3d.jpg') == srcs.index('img/planner-3d.jpg') + 1, srcs)
    pg.evaluate("()=>{const i=[...document.querySelectorAll('#car img')].find(i=>i.src.includes('google3d')); i.loading='eager'; return i.complete?0:new Promise(r=>{i.onload=i.onerror=r})}")
    R.check('...and its picture loads', pg.evaluate("()=>[...document.querySelectorAll('#car img')].find(i=>i.src.includes('google3d')).naturalWidth") > 1000)
    vis = lambda: pg.evaluate("()=>getComputedStyle(document.querySelector('#car .slide .label')).opacity")
    R.check('carousel labels show to start with', vis() == '1', vis())
    pg.click('#carLabels'); pg.wait_for_timeout(500)
    R.check('Hide labels hides the carousel labels', vis() == '0' and pg.inner_text('#carLabels') == 'Show labels', vis())
    pg.reload(); pg.wait_for_timeout(1000)
    R.check('...and stays hidden next visit', vis() == '0', vis())
    pg.click('#carLabels'); pg.wait_for_timeout(500)
    R.check('Show labels brings them back', vis() == '1' and pg.inner_text('#carLabels') == 'Hide labels', vis())
    R.check('no page errors (tools page)', not e2, e2[:3])
    ctx.close(); b.close()
R.done()
