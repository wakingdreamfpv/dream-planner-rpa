# v7.58: the ops map's checks are switched off for now (Mike: too many, the red ones couldn't be dismissed and blocked
# planning). A path straight through an exclusion zone and too high over people shows no Checks list, no red or amber
# on the map, nothing to acknowledge, and the plan summary doesn't say "to fix".
import sys, os, math; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
LAT, LNG = -28.0, 153.43
KX = 111320 * math.cos(math.radians(LAT)); E = lambda m: LNG + m / KX; N = lambda m: LAT + m / 111320
TERR = "window.__WD_OPS_CHECKS = false; window.__WD_SAT = false; window.__WD_BUILDINGS = () => []; window.__WD_TERRAIN = async (lls) => ({ src: 'test terrain', elev: lls.map(() => 30) });"
Z = [{'id': 'x1', 'kind': 'exclusion', 'shape': 'poly', 'name': 'Exclusion 1', 'ground': 0, 'buffer': 3, 'pts': [[N(-40), E(20)], [N(-40), E(60)], [N(40), E(60)], [N(40), E(20)]]},
     {'id': 'o1', 'kind': 'oonp', 'shape': 'poly', 'name': 'Over people 1', 'ground': 0, 'h': 3.5, 'v': 1.5, 'energy': 34, 'pts': [[N(-40), E(-60)], [N(-40), E(15)], [N(40), E(15)], [N(40), E(-60)]]}]
P = [{'id': 'pa', 'name': 'Path A', 'speed': 9, 'drone': '', 'ctrl': [[LAT, E(-50), 0], [LAT, E(0), 12], [LAT, E(80), 12]], 'pts': [[LAT, E(-50), 0], [LAT, E(0), 12], [LAT, E(80), 12]]}]
OPS = {'v': 1, 'mode': 'geo', 'settings': {}, 'overlay': None, 'views': [], 'zones': Z, 'points': [], 'paths': P}
with sync_playwright() as p:
    b = p.chromium.launch(); pg, errs, dl = ctx_for(b, 'crp', extra=TERR); pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, {'overview': {'uid': 'u-758c', 'identifier': 'OP-2026-0758', 'operationName': 'No checks'}, 'opsMap': OPS}); pg.reload(); pg.wait_for_timeout(5000)
    open_draft(pg); pg.wait_for_timeout(800); pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(800)
    R.check('the plan\'s ops map summary doesn\'t list anything "to fix"', 'to fix' not in pg.inner_text('body') and 'to check' not in pg.inner_text('body'))
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
    insp = pg.inner_text('[data-ops-inspector]')
    R.check('no Checks list in the ops map', 'CHECKS' not in insp.upper().split('ON THIS MAP')[0] and pg.locator('[data-ops-ackok], [data-ops-checks]').count() == 0, insp[:200])
    reds = pg.evaluate("()=>[...document.querySelectorAll('.leaflet-overlay-pane path')].filter(p=>['#dc2626','#d97706'].includes((p.getAttribute('stroke')||'').toLowerCase())).length")
    R.check('no red or amber warning lines on the map (the path goes through the exclusion zone)', reds == 0, reds)
    pg.locator('.leaflet-overlay-pane path.leaflet-interactive').last.click(force=True); pg.wait_for_timeout(600)
    R.check('selecting the path shows no warning dots on its points', pg.locator('[data-ops-pt] span[title^="Leg"]').count() == 0)
    R.check('no page errors', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
