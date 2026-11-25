# v7.59: waypoints are numbered on the map (2D and 3D); in the drone camera, ◀ Waypoint / Waypoint ▶ jump between them;
# "Hide path & zones" clears the flight paths and zones off the view (and brings them back).
import sys, os, math; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
LAT, LNG = -28.0, 153.43
KX = 111320 * math.cos(math.radians(LAT)); E = lambda m: LNG + m / KX; N = lambda m: LAT + m / 111320
TERR = "window.__WD_SAT = false; window.__WD_BUILDINGS = () => []; window.__WD_TERRAIN = async (lls) => ({ src: 'test terrain', elev: lls.map(() => 30) });"
Z = [{'id': 'c1', 'kind': 'clear', 'shape': 'poly', 'name': 'Clear 1', 'ground': 0, 'pts': [[N(-60), E(-80)], [N(-60), E(120)], [N(60), E(120)], [N(60), E(-80)]]}]
C = [[LAT, E(-50), 0], [N(20), E(0), 10], [N(-20), E(50), 10], [LAT, E(100), 40]]
P = [{'id': 'pa', 'name': 'Path A', 'speed': 5, 'drone': '', 'ctrl': C, 'pts': [list(q) for q in C], 'lineKey': None}]
OPS = {'v': 1, 'mode': 'geo', 'settings': {}, 'overlay': None, 'views': [], 'zones': Z, 'points': [{'id': 't1', 'kind': 'tlz', 'lat': LAT, 'lng': E(-50), 'title': 'TLZ', 'size': 5}], 'paths': P}
sprites = "()=>{let n=[]; window.__WD_3D.scene.traverse(o=>{ if(o.isSprite&&o.userData.wp&&o.visible) n.push(o.userData.wp); }); return n.sort();}"
with sync_playwright() as p:
    b = p.chromium.launch(); pg, errs, dl = ctx_for(b, 'crp', extra=TERR); pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, {'overview': {'uid': 'u-759', 'identifier': 'OP-2026-0759', 'operationName': 'Waypoints'}, 'opsMap': OPS}); pg.reload(); pg.wait_for_timeout(5000)
    open_draft(pg); pg.wait_for_timeout(800); pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
    nh = pg.locator('[data-ops-handle]').count()
    R.check('2D: all 4 waypoints are numbered on the map without selecting the path', nh == 4 and '40 m' in pg.inner_text('[data-ops-map]'), nh)
    pg.click('[data-ops-view="3d"]'); pg.wait_for_timeout(6000)
    s0 = pg.evaluate(sprites)
    R.check('3D: waypoints 2, 3 and 4 have number labels (1 is on the path name)', s0 == [2, 3, 4], s0)
    pg.click('[data-ops-dronecam]'); pg.wait_for_timeout(2500)
    R.check('drone camera: the waypoint bar is there', pg.locator('[data-ops-wpbar]').is_visible())
    at = lambda: pg.get_attribute('[data-ops-wp-at]', 'data-ops-wp-at')
    pg.click('[data-ops-wp="next"]'); pg.wait_for_timeout(1200)
    R.check('Waypoint ▶ jumps to waypoint 1 of Path A', at() == '1' and '1 of 4' in pg.inner_text('[data-ops-wpbar]'), (at(), pg.inner_text('[data-ops-wpbar]')))
    pg.click('[data-ops-wp="next"]'); pg.wait_for_timeout(1200)
    R.check('...and on to waypoint 2', at() == '2')
    pg.click('[data-ops-wp="next"]'); pg.click('[data-ops-wp="next"]'); pg.wait_for_timeout(1200)
    agl = pg.evaluate("()=>{const i=document.querySelector('[data-ops-dc-agl]'); return i? Number(i.value): null}")
    R.check('waypoint 4 puts the drone at its 40 m height', at() == '4' and agl == 40, (at(), agl))
    pg.click('[data-ops-wp="prev"]'); pg.wait_for_timeout(1000)
    R.check('◀ Waypoint goes back to 3', at() == '3')
    R.check('the zones and path show to start with', pg.evaluate("()=>window.__WD_3D.arShown") is True)
    pg.click('[data-ops-ar]'); pg.wait_for_timeout(800)
    R.check('Hide path & zones clears them (and their labels) off the view', pg.evaluate("()=>window.__WD_3D.arShown") is False and pg.evaluate(sprites) == [] and 'Show path & zones' in pg.inner_text('[data-ops-ar]'))
    pg.click('[data-ops-ar]'); pg.wait_for_timeout(800)
    R.check('Show path & zones brings them back', pg.evaluate("()=>window.__WD_3D.arShown") is True)
    R.check('no page errors', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
