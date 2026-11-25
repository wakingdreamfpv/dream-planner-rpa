# v7.58: flight paths are the points you click (Click points is the default), each with its own height (e.g. 0 m at
# take-off, 10 m along the way, then up to 120 m). Smooth line bends the line through them; the fine flown line is
# worked out underneath, so there are no hundreds of dots. Points move by dragging, + adds one, Set all sets heights.
# Drawing freehand keeps only a handful of points.
import sys, os, json, math; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
LAT, LNG = -27.4635, 153.0170
KX = 111320 * math.cos(math.radians(LAT))
TERR = r"""window.__WD_SAT = false; window.__WD_BUILDINGS = () => [];
window.__WD_TERRAIN = async (lls) => { const kx = %f; return { src: 'test terrain', elev: lls.map(([la, ln]) => 30 + 0.05 * (ln - %f) * kx) }; };""" % (KX, LNG)
OPS = {'v': 1, 'mode': 'geo', 'settings': {'oonpColour': 'green'}, 'overlay': None, 'views': [], 'zones': [],
  'points': [{'id': 't1', 'kind': 'tlz', 'lat': LAT, 'lng': LNG, 'title': 'TLZ', 'size': 5}], 'paths': []}
PLAN = {'overview': {'uid': 'uid-757', 'identifier': 'OP-2026-0757', 'operationName': 'Points'}, 'opsMap': OPS}
OPSDOC = "()=>{const x=window.__WD_OPSDOC; return x? JSON.parse(JSON.stringify(x)) : null}"
with sync_playwright() as p:
    b = p.chromium.launch(); pg, errs, dl = ctx_for(b, 'crp', extra=TERR); pg.set_viewport_size({'width': 1500, 'height': 950})
    pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, PLAN); pg.reload(); pg.wait_for_timeout(5000); open_draft(pg); pg.wait_for_timeout(800)
    pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
    box = pg.locator('[data-ops-map]').bounding_box(); cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    pg.click('[data-ops-tool="path"]'); pg.wait_for_timeout(400)
    R.check('Click points is the default way to make a path', 'border-violet-600' in pg.get_attribute('[data-ops-pathmode="click"]', 'class'))
    for i, (dx, dy) in enumerate([(-220, 60), (-80, -40), (60, 30), (200, -50)]):
        pg.mouse.click(cx + dx, cy + dy); pg.wait_for_timeout(350)
    pg.click('[data-ops-finish]'); pg.wait_for_timeout(1500)
    rows = lambda: pg.locator('[data-ops-pt]').count()
    R.check('4 clicks make a path with exactly 4 points', rows() == 4, rows())
    R.check('the map shows 4 numbered handles (not a dot every few metres)', pg.locator('[data-ops-handle]').count() == 4, pg.locator('[data-ops-handle]').count())
    R.check('and a + between each pair to add a point', pg.locator('[data-ops-addpt]').count() == 3)
    hs = lambda: [float(pg.input_value('[data-ops-pth="%d"]' % i)) for i in range(rows())]
    R.check('heights start at 0 at take-off, then the default height', hs()[0] == 0 and hs()[1] > 0, hs())
    for i, h in enumerate([0, 10, 10, 120]): pg.fill('[data-ops-pth="%d"]' % i, str(h)); pg.wait_for_timeout(150)
    pg.wait_for_timeout(1500)
    R.check('each point takes its own height: 0, 10, 10 then up to 120 m', hs() == [0, 10, 10, 120], hs())
    R.check('heights are above the ground by default (follows the terrain)', pg.get_attribute('[data-ops-height-mode]', 'data-ops-height-mode') == 'follow' and 'above the ground' in pg.inner_text('[data-ops-points]'))
    prof = pg.locator('[data-profile-pt]').count()
    R.check('the side-on profile has one handle per point', prof == 4, prof)
    lbl = pg.inner_text('[data-ops-map]')
    R.check('the map shows each point\'s height (e.g. 120 m AGL)', '120 m AGL' in lbl and '10 m AGL' in lbl)
    # profile drag changes that point's own height
    bx = pg.locator('[data-profile-pt="2"] circle').bounding_box(); x, y = bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 2
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x, y - 25, steps=5); pg.mouse.up(); pg.wait_for_timeout(500)
    h2 = hs()[2]
    R.check('dragging point 3 up in the profile raises just that point', h2 > 10 and hs()[0] == 0 and hs()[3] == 120, hs())
    # Smooth line
    n0 = rows(); pg.click('[data-ops-smoothpath]'); pg.wait_for_timeout(1200)
    R.check('Smooth line switches on and keeps the same 4 points', pg.get_attribute('[data-ops-smoothpath]', 'aria-pressed') == 'true' and rows() == n0)
    # + adds a point, x deletes one
    pg.click('[data-ops-addpt="0"]'); pg.wait_for_timeout(800)
    R.check('clicking a + adds a point between two others', rows() == 5 and hs()[1] == 5, hs())
    pg.click('[data-ops-pt="1"] button[aria-label="Delete point 2"]'); pg.wait_for_timeout(800)
    R.check('the × on a row deletes that point', rows() == 4, rows())
    # drag a handle on the map
    hb = pg.locator('[data-ops-handle="2"]').bounding_box(); hx, hy = hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2
    pg.mouse.move(hx, hy); pg.mouse.down(); pg.mouse.move(hx + 40, hy + 60, steps=8); pg.mouse.up(); pg.wait_for_timeout(1200)
    hb2 = pg.locator('[data-ops-handle="2"]').bounding_box()
    R.check('a point can be dragged to a new place on the map (still 4 points)', rows() == 4 and abs(hb2['y'] - hb['y']) > 30, (hb['y'], hb2['y']))
    # Set all
    pg.fill('[data-ops-setall] input', '15'); pg.click('[data-ops-setall] button'); pg.wait_for_timeout(800)
    R.check('Set all sets points 2 onwards (take-off stays at 0)', hs() == [0, 15, 15, 15], hs())
    # measured from the take-off instead
    pg.click('[data-ops-manual]'); pg.wait_for_timeout(800)
    hm = hs()
    R.check('switching to "The take-off" keeps the flown heights (adds the ground: it rises to the east here)', hm[3] > hm[1] > hm[0] and hm[3] != 15 and 'above take-off' in pg.inner_text('[data-ops-points]'), hm)
    pg.click('[data-ops-follow]'); pg.wait_for_timeout(1500)
    # what is saved: the points, the curve and the fine flown line
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("()=>{const b=[...document.querySelectorAll('button')].find(x=>/Done|Close|Back to the plan/.test(x.innerText)&&x.offsetParent); b&&b.click()}"); pg.wait_for_timeout(600)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(1000)
    ops = (get_db(pg).get('draftPlans') or [{}])[0].get('opsMap') or {}
    pa = (ops.get('paths') or [{}])[0]
    R.check('saved: 4 points of its own, smooth line on', len(pa.get('ctrl') or []) == 4 and pa.get('curve') is True, (len(pa.get('ctrl') or []), pa.get('curve')))
    R.check('saved: the flown line is worked out finely underneath (follows the ground)', len(pa.get('pts') or []) > 20 and all(len(q) >= 4 for q in pa['pts']), len(pa.get('pts') or []))
    # freehand drawing keeps only a handful of points
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
    pg.click('[data-ops-tool="path"]'); pg.wait_for_timeout(300); pg.click('[data-ops-pathmode="draw"]'); pg.wait_for_timeout(300)
    pg.mouse.move(cx - 250, cy + 120); pg.mouse.down()
    for i in range(80): pg.mouse.move(cx - 250 + i * 6, cy + 120 + 40 * math.sin(i / 8))
    pg.mouse.up(); pg.wait_for_timeout(1500)
    pg.click('[data-ops-donedraw]'); pg.wait_for_timeout(600)
    n = rows()
    R.check('a drawn wavy line keeps a handful of points (not hundreds), smoothed', 3 <= n <= 20 and pg.get_attribute('[data-ops-smoothpath]', 'aria-pressed') == 'true', n)
    R.check('no page errors', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
