# v7.27: advanced ops map. Paths follow the ground at a set height (no typing a height per point), ride over bridges
# instead of dipping to the creek, no point numbers on the map unless asked for, and the PDF shows a start flag.
import sys, os, json, math; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
LAT, LNG = -27.4635, 153.0170
KX = 111320 * math.cos(math.radians(LAT))
E = lambda m: LNG + m / KX  # metres east of the start
TERR = r"""window.__WD_SAT = false;
window.__WD_TERRAIN = async (lls) => { if (window.__TERR_DOWN) throw new Error('offline');
  const kx = %f; return { src: 'test terrain', elev: lls.map(([la, ln]) => { const x = (ln - %f) * kx; return 30 + 0.05 * x - (x > 104 && x < 146 ? 6 : 0); }) }; };""" % (KX, LNG)
BRIDGE = {'id': 'br1', 'kind': 'surface', 'shape': 'poly', 'name': 'Lake bridge', 'deck': 'ends', 'raise': 0,
  'pts': [[LAT - 0.0002, E(100)], [LAT - 0.0002, E(150)], [LAT + 0.0002, E(150)], [LAT + 0.0002, E(100)]]}
OPS = {'v': 1, 'mode': 'geo', 'settings': {'oonpColour': 'green'}, 'overlay': None, 'views': [],
  'zones': [BRIDGE], 'points': [{'id': 't1', 'kind': 'tlz', 'lat': LAT, 'lng': LNG, 'title': 'TLZ', 'size': 5}],
  'paths': [{'id': 'pa', 'name': 'Path A', 'drone': 'DJI Avata 2', 'speed': 5, 'follow': True, 'agl': 3, 'aglMin': 1, 'aglMax': 5,
             'pts': [[LAT, E(0), 0], [LAT, E(50), 5], [LAT, E(100), 5], [LAT, E(150), 5], [LAT, E(200), 5]]},
            {'id': 'pb', 'name': 'Path B', 'drone': 'DJI Avata 2', 'speed': 5, 'pts': [[LAT + 0.0005, E(0), 0], [LAT + 0.0005, E(60), 4], [LAT + 0.0005, E(120), 4]]}]}
PLAN = {'overview': {'uid': 'uid-t', 'identifier': 'OP-2026-0801', 'operationName': 'Garden Lights', 'location': 'Roma Street Parkland'}, 'opsMap': OPS}
def setup(b, extra=''):
    pg, errs, dl = ctx_for(b, 'crp', extra=TERR + extra); pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, PLAN); pg.reload(); pg.wait_for_timeout(5000); open_draft(pg); pg.wait_for_timeout(800)
    pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
    return pg, errs, dl
def saved_ops(pg):
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("()=>{const b=[...document.querySelectorAll('button')].find(x=>/Done|Close|Back to the plan/.test(x.innerText)&&x.offsetParent); b&&b.click()}"); pg.wait_for_timeout(600)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(1000)
    return (get_db(pg).get('draftPlans') or [{}])[0].get('opsMap')
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = setup(b)
    nums = pg.evaluate("()=>[...document.querySelectorAll('.leaflet-marker-icon')].filter(m=>/^\\d+$/.test(m.innerText.trim().split('\\n')[0])).length")
    R.check('no point numbers on the map by default', nums == 0, nums)
    R.check('each path has one start flag with its name (and height when following the ground)', pg.locator('[data-ops-path-tag]').count() == 2 and 'Path A · 3 m above ground' in pg.inner_text('body'))
    pg.locator('label:has-text("Path point numbers") input').check(); pg.wait_for_timeout(600)
    nums2 = pg.evaluate("()=>[...document.querySelectorAll('.leaflet-marker-icon')].filter(m=>/^\\d+$/.test(m.innerText.trim().split('\\n')[0])).length")
    R.check('"Path point numbers" turns them back on', nums2 > 5, nums2)
    ops = saved_ops(pg)
    pa = [x for x in ops['paths'] if x['id'] == 'pa'][0]; pb = [x for x in ops['paths'] if x['id'] == 'pb'][0]
    pts = pa['pts']
    R.check('following path filled with points every ~5 m (no typing heights)', len(pts) >= 35, len(pts))
    R.check('every point is 3 m above the ground under it', all(abs((q[2] - q[3]) - 3) < 0.05 for q in pts), [(q[2], q[3]) for q in pts[:5]])
    xs = [((q[1] - LNG) * KX, q[3]) for q in pts]
    end = [g for x, g in xs if x > 195]
    R.check('heights follow the slope (ground rises ~10 m over 200 m)', end and 8.5 < end[-1] < 10.5, end[-1:])
    bridge = [(x, g) for x, g in xs if 106 < x < 144]
    R.check('over the bridge the path stays level with the deck, not the creek 6 m below', bridge and all(g > 0.05 * x - 1.2 for x, g in bridge), bridge[:4])
    R.check('take-off reference and data source recorded', ops.get('terrain', {}).get('refElev') == 30 and pa.get('terrainSrc') == 'test terrain', ops.get('terrain'))
    R.check('a path set point by point is left alone', [q[2] for q in pb['pts']] == [0, 4, 4] and len(pb['pts']) == 3)
    R.check('no page errors', not errs, errs[:3])
    pg.context.close()
    # terrain unavailable: level at the set height, and it says so
    pg, errs, dl = setup(b, 'window.__TERR_DOWN = true;')
    ops = saved_ops(pg); pa = [x for x in ops['paths'] if x['id'] == 'pa'][0]
    R.check('no terrain data: path flies level at 3 m and explains why', all(q[2] == 3 for q in pa['pts']) and 'could not be loaded' in (pa.get('followErr') or ''), (pa['pts'][:2], pa.get('followErr')))
    pg.context.close()
    # the PDF: start flag, no numbered points
    pg, errs, dl = setup(b)
    saved_ops(pg); pg.evaluate(CAPTURE_PDF); pg.evaluate(JS_INC, 'Export PDF'); pg.wait_for_timeout(2500)
    html = (pg.evaluate('window.__pdfs') or [''])[-1] if pg.evaluate('window.__pdfs') else ''
    R.check('PDF draws a start flag with the path name, not a number per point', 'Path A · 3 m above ground' in html and "'+(i + 1)+'" not in html and '+ (i + 1) +' not in html, len(html))
    pg.context.close()
    # 3D: satellite imagery draped on the terrain (three.js, imagery and terrain are stood in for offline)
    VEN = os.path.join(os.path.dirname(__file__), 'vendor')
    pg, errs, dl = setup(b, 'window.__WD_SAT = undefined;')
    seen = []
    pg.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/**', lambda r: r.fulfill(path=os.path.join(VEN, 'three.min.js'), headers={'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*'}))
    pg.route('https://server.arcgisonline.com/**', lambda r: (seen.append(r.request.url), r.fulfill(path=os.path.join(VEN, 'sat.png'), headers={'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*'})))
    pg.click('[data-ops-view="3d"]'); pg.wait_for_timeout(5000)
    note = pg.inner_text('[data-ops-3d-ground]') if pg.locator('[data-ops-3d-ground]').count() else ''
    R.check('3D ground: satellite imagery on the terrain', 'Satellite imagery on the terrain' in note and len(seen) > 0, (note, len(seen)))
    pg.screenshot(path='/tmp/claude-0/v727_3d.png')
    R.check('no page errors (3D)', not errs, errs[:3])
    pg.context.close()
    b.close()
R.done()
