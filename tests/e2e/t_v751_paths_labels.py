# v7.51: drawing a flight path stays in Draw after each stroke (the next stroke carries on the same path, the map
# doesn't pan); New path / Done; each path has a colour and a 3D width (1, 2 or 3 m tube of airspace); labels are
# smaller, hide when they overlap, can be switched off, and a Key lists zones and paths; Google's city is levelled
# against our terrain over the whole area.
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
def plan(pg): return pg.evaluate("()=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv').objectStore('kv');const g=st.getAll();g.onsuccess=()=>r(g.result.map(x=>{try{return JSON.parse(x)}catch(e){return null}}))}})")
with sync_playwright() as p:
    b = p.chromium.launch(); pg, errs, dl = ctx_for(b, 'crp', extra=TERR + GOOG); pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate("""(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})""", {'googleTilesKey': 'AIzaTEST'})
    pg.reload(); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, {'overview': {'uid': 'u-751', 'identifier': 'OP-2026-0751', 'operationName': 'Paths'}, 'opsMap': OPS}); pg.reload(); pg.wait_for_timeout(5000)
    open_draft(pg); pg.wait_for_timeout(800); pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
    box = pg.locator('[data-ops-map]').bounding_box(); cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    pane = lambda: pg.evaluate("()=>document.querySelector('.leaflet-map-pane').style.transform")
    npaths = lambda: pg.evaluate("()=>[...document.querySelectorAll('[data-ops-key-path], [data-ops-path-tag]')].length")
    def stroke(x0, y0, dx, dy, n=30):
        pg.mouse.move(x0, y0); pg.mouse.down()
        for i in range(n): pg.mouse.move(x0 + i * dx, y0 + i * dy)
        pg.mouse.up(); pg.wait_for_timeout(900)
    pg.get_by_text('Flight path').first.click(); pg.wait_for_timeout(400)
    pg.click('[data-ops-pathmode="draw"]'); pg.wait_for_timeout(300)  # v7.58: Click points is the default now
    p0 = pane(); stroke(cx - 150, cy, 5, 0)
    R.check('after the first stroke you are still drawing (banner with New path / Done)', pg.locator('[data-ops-newpath]').count() == 1 and pg.locator('[data-ops-donedraw]').count() == 1)
    tags = lambda: pg.evaluate("()=>[...document.querySelectorAll('[data-ops-path-tag]')].map(e=>e.innerText)")
    t1 = tags(); stroke(cx, cy, 3, 4)
    R.check('a second stroke does not move the map', pane() == p0, (p0, pane()))
    R.check('...it carries on the same path (still one path)', len(tags()) == 1 and len(t1) == 1, (t1, tags()))
    pg.click('[data-ops-newpath]'); stroke(cx - 150, cy + 120, 5, 0)
    R.check('New path starts a second path', len(tags()) == 2, tags())
    pg.click('[data-ops-donedraw]'); pg.wait_for_timeout(400)
    R.check('Done goes back to Select', pg.locator('[data-ops-drawing]').count() == 0)
    # the second path is selected: colours and width
    cols = pg.evaluate("()=>[...document.querySelectorAll('[data-ops-path-tag]')].map(e=>getComputedStyle(e).borderColor)")
    R.check('the two paths get different colours', len(set(cols)) == 2, cols)
    pg.click('[data-ops-path-colour="#db2777"]'); pg.click('[data-ops-path-w="3"]'); pg.wait_for_timeout(600)
    cols2 = pg.evaluate("()=>[...document.querySelectorAll('[data-ops-path-tag]')].map(e=>getComputedStyle(e).borderColor)")
    R.check('picking a colour recolours the path', 'rgb(219, 39, 119)' in cols2, cols2)
    R.check('3×3 m is selected for the path', 'violet-600' in pg.get_attribute('[data-ops-path-w="3"]', 'class'))
    # Labels off / Key on (2D)
    pg.locator('label:has-text("Labels") input').uncheck(); pg.wait_for_timeout(500)
    R.check('Labels off hides the zone and path labels on the map', pg.locator('.wd-ops-tag').count() == 0 and len(tags()) == 0, pg.locator('.wd-ops-tag').count())
    pg.locator('label:has-text("Key (list") input').check(); pg.wait_for_timeout(500)
    R.check('Key lists every zone and path', pg.locator('[data-ops-key-zone]').count() == 3 and pg.locator('[data-ops-key-path]').count() == 2, pg.inner_text('[data-ops-key]') if pg.locator('[data-ops-key]').count() else '')
    pg.locator('label:has-text("Labels") input').check(); pg.wait_for_timeout(300)
    # 3D
    pg.click('[data-ops-view="3d"]'); pg.wait_for_timeout(7000)
    tubes = pg.evaluate("()=>{const out={}; window.__WD_3D.scene.traverse(o=>{ if(o.userData&&o.userData.pathTube) out[o.userData.pathTube]=o.userData.radius; }); return Object.values(out).sort();}")
    R.check('3D: paths are tubes 1 m and 3 m across', tubes == [0.5, 1.5], tubes)
    shown = pg.evaluate("()=>window.__WD_3D.labelsShown")
    R.check('3D: overlapping labels are thinned out (Exclusion 1 and 2 sit on top of each other: one hides)', shown is not None and shown <= 4, shown)
    lv = pg.evaluate("()=>window.__WD_3D.googleLevel")
    R.check('3D: Google\'s city is levelled against the terrain (its ground brought down to ours)', lv and lv['n'] > 3 and abs(lv['y'] + 45) < 1, lv)
    R.check('3D: the Key shows widths', '3 m wide' in pg.inner_text('[data-ops-key]'))
    pg.locator('label:has-text("Labels") input').uncheck(); pg.wait_for_timeout(4000)
    R.check('3D: Labels off hides them all', pg.evaluate("()=>{let n=0; window.__WD_3D.scene.traverse(o=>{ if(o.isSprite&&o.visible) n++; }); return n;}") == 0)
    R.check('no page errors', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
