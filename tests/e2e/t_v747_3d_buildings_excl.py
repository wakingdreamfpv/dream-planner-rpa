# v7.47: exclusion zones with a height band (starts at / goes up to, in m or ft): the path checks only stop a path
# inside the band; the 3D view draws the zone between its floor and top, and 3D buildings stand on the terrain.
import sys, os, json, math; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
LAT, LNG = -27.4635, 153.0170
KX = 111320 * math.cos(math.radians(LAT)); E = lambda m: LNG + m / KX; N = lambda m: LAT + m / 111320
TERR = "window.__WD_SAT = false; window.__WD_TERRAIN = async (lls) => ({ src: 'test terrain', elev: lls.map(([la, ln]) => 30 + 0.05 * (ln - %f) * %f) });" % (LNG, KX)
# two buildings: one with a recorded height (30 m), one with 4 levels (13 m), 100 m east (ground 5 m up)
BLD = "window.__WD_BUILDINGS = () => [{pts:[[%f,%f],[%f,%f],[%f,%f],[%f,%f]],tags:{height:'30'}},{pts:[[%f,%f],[%f,%f],[%f,%f],[%f,%f]],tags:{'building:levels':'4'}}];" % (
    N(-60), E(100), N(-60), E(120), N(-40), E(120), N(-40), E(100), N(40), E(100), N(40), E(120), N(60), E(120), N(60), E(100))
EX = {'id': 'x1', 'kind': 'exclusion', 'shape': 'poly', 'name': 'Tower', 'ground': 0, 'buffer': 3,
      'pts': [[N(-10), E(40)], [N(-10), E(60)], [N(10), E(60)], [N(10), E(40)]]}
def ops(path_alt, ex=EX):
    return {'v': 1, 'mode': 'geo', 'settings': {}, 'overlay': None, 'views': [], 'zones': [ex], 'points': [],
            'paths': [{'id': 'pa', 'name': 'Path A', 'pts': [[LAT, E(0), path_alt], [LAT, E(100), path_alt]]}]}
VEN = os.path.join(os.path.dirname(__file__), 'vendor')
issues = lambda pg: pg.evaluate("()=>[...document.querySelectorAll('[data-ops-issue], [data-ops-issues] li')].map(e=>e.innerText).join(' | ')")
def open_ops(pg, plan_ops, uid):
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, {'overview': {'uid': uid, 'identifier': 'OP-2026-0901', 'operationName': 'Band test'}, 'opsMap': plan_ops}); pg.reload(); pg.wait_for_timeout(5000)
    open_draft(pg); pg.wait_for_timeout(800); pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', extra=TERR + BLD); pg.goto(URL); pg.wait_for_timeout(4500)
    pg.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/**', lambda r: r.fulfill(path=os.path.join(VEN, 'three.min.js'), headers={'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*'}))
    open_ops(pg, ops(25), 'uid-band')
    sel_zone = lambda: (pg.evaluate("()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Tower');b&&b.click()}"), pg.wait_for_timeout(400))
    def body():  # the checks list (shown when nothing is selected), then back to the zone
        if pg.locator('[data-ops-back]').count(): pg.click('[data-ops-back]'); pg.wait_for_timeout(400)
        t = pg.inner_text('body'); sel_zone(); return t
    R.check('a full-height exclusion stops a path flying through it at 25 m', 'enters exclusion zone "Tower"' in body())
    # select the zone and give it a band: from 0 up to 20 m → the path at 25 m (ground 2–3 m) is 22 m up: clear, but within the 3 m buffer? no (2+ m)
    sel_zone()
    R.check('the exclusion has Starts at / Goes up to fields with m / ft', pg.locator('[data-ops-ex-floor]').count() == 1 and pg.locator('[data-ops-ex-unit="ft"]').count() == 1)
    pg.click('[data-ops-ex-unit="ft"]'); pg.fill('[data-ops-ex-top]', '50'); pg.wait_for_timeout(800)
    R.check('up to 50 ft (15.2 m): a path 25 m up is clear of it', 'enters exclusion zone "Tower"' not in body() and 'up to 50 ft' in pg.inner_text('body'))
    pg.fill('[data-ops-ex-top]', '75'); pg.wait_for_timeout(800)
    R.check('up to 75 ft (22.9 m): the path passes just over it, inside the buffer → a warning', 'above exclusion "Tower"' in body() and 'enters exclusion zone' not in body())
    pg.fill('[data-ops-ex-top]', ''); pg.click('[data-ops-ex-unit="m"]'); pg.fill('[data-ops-ex-floor]', '30'); pg.wait_for_timeout(800)
    R.check('starting at 30 m: the path below it is clear (more than the buffer below)', 'enters exclusion zone' not in body() and 'below exclusion' not in body() and 'from 30 m' in pg.inner_text('body'))
    pg.fill('[data-ops-ex-floor]', '20'); pg.wait_for_timeout(800)
    R.check('starting at 20 m: the path 25 m up is inside it again', 'enters exclusion zone "Tower"' in body(), (pg.input_value('[data-ops-ex-floor]'), pg.input_value('[data-ops-ex-top]'), body()[-700:]))
    pg.fill('[data-ops-ex-top]', '40'); pg.wait_for_timeout(500)
    pg.click('[data-ops-view="3d"]'); pg.wait_for_timeout(5000)
    g = pg.evaluate("""()=>{const W=window.__WD_3D; if(!W) return null; const out={on:!!W.onTerrain, walls:[], b:null};
      W.group.children.forEach(o=>{ if(o.type==='Mesh'&&o.geometry&&o.geometry.attributes.position){ const a=o.geometry.attributes.position.array, ys=[]; for(let i=1;i<a.length;i+=3) ys.push(a[i]); out.walls.push({min:Math.min(...ys),max:Math.max(...ys)}); } });
      const m=(W.buildings&&W.buildings.children[0]); if(m){ const a=m.geometry.attributes.position.array, ys=[]; for(let i=1;i<a.length;i+=3) ys.push(a[i]); out.b={n:m.userData.buildings, min:Math.min(...ys), max:Math.max(...ys)}; }
      return out; }""")
    w = ((g or {}).get('walls') or [{}])[0]
    R.check('3D: the exclusion is drawn from 20 m to 40 m above its ground (ground 2–3 m)', g and g['on'] and 21.5 < w.get('min', 0) < 23.5 and 41.5 < w.get('max', 0) < 43.5, g)
    bb = (g or {}).get('b') or {}
    R.check('3D: both buildings are drawn, standing on the slope (about 5 m up)', bb.get('n') == 2 and 4.5 < bb.get('min', 0) < 6, bb)
    R.check('...with the recorded height (30 m) as the tallest', 34 < bb.get('max', 0) < 36, bb)
    R.check('a 3D buildings switch is offered in the 3D view', pg.locator('label:has-text("3D buildings") input').count() == 1)
    pg.locator('label:has-text("3D buildings") input').uncheck(); pg.wait_for_timeout(3500)
    n = pg.evaluate("()=>window.__WD_3D && window.__WD_3D.buildings ? window.__WD_3D.buildings.children.length : -1")
    R.check('...switching it off removes them', n == 0, n)
    R.check('no page errors', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
