# v7.56: drone camera (previs) in the 3D view: place a virtual drone at a point or path waypoint, set height above
# ground (capped at the job's max height), heading, gimbal tilt and lens (built-in presets matched to the drone, or
# your own lens saved on the fleet card), move it with keys / buttons, capture shots with their settings, and print
# them in the PDF under "Planned perspectives". Google itself is mocked (no network, no billing).
import sys, os, json, math; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
LAT, LNG = -27.4635, 153.0170
TERR = "window.__WD_SAT = false; window.__WD_TERRAIN = async (lls) => ({ src: 'test terrain', elev: lls.map(() => 30) }); window.__WD_BUILDINGS = () => [];"
# Google mock: flat ground plus a 10 m tall block (a "building") at the take-off point
GOOG = """window.__WD_GOOGLE3D = async (THREE, key, rp) => {
  const group = new THREE.Group(); const gr = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); gr.rotation.x = -Math.PI / 2; group.add(gr);
  const m = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x888888 })); m.position.y = 5; group.add(m);
  const g = { tiles: { group, update(){}, deleteCamera(){}, getAttributions(a){ a.push({ type: 'string', value: 'Map data ©2026 Google' }); } }, ready: false, onChange: null,
    place(x, z){ group.position.set(x, 0, z); }, note: () => 'Google 3D city · Map data ©2026 Google · heights from the take-off.' }; return g; };"""
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
OPS = {'v': 1, 'mode': 'geo', 'settings': {}, 'overlay': None, 'views': [], 'zones': [],
       'points': [{'id': 'tl', 'kind': 'tlz', 'lat': LAT, 'lng': LNG, 'title': 'TLZ', 'size': 5}, {'id': 'po', 'kind': 'poi', 'lat': LAT + 0.0008, 'lng': LNG + 0.0004, 'title': 'Stage'}],
       'paths': [{'id': 'pa', 'name': 'Path A', 'drone': 'DJI Mavic 4 Pro', 'pts': [[LAT, LNG + 0.0003, 20], [LAT + 0.0005, LNG + 0.0003, 20]]}]}
D = lambda pg: pg.evaluate("()=>window.__WD_3D && window.__WD_3D.drone")
val = lambda pg, sel: pg.input_value(sel)
fov = lambda pg: pg.get_attribute('[data-ops-dc-fov]', 'data-ops-dc-fov')

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    pg, errs, dl = ctx_for(b, 'crp', extra=TERR + GOOG); pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate(SET_LOCAL, {'googleTilesKey': 'AIzaTEST', 'fleet': {'DJI Mavic 4 Pro': {'weight': '1.06', 'cells': '4'}}}); pg.reload(); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, {'overview': {'uid': 'uid-dc', 'identifier': 'OP-2026-0956', 'operationName': 'Drone cam test', 'rpaTypes': ['DJI Mavic 4 Pro']},
                  'jsa': {'maxOperatingHeightAgl': '200'}, 'opsMap': OPS}); pg.reload(); pg.wait_for_timeout(5000)
    open_draft(pg); pg.wait_for_timeout(800); pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)

    # start from the header button: the drone sits at the take-off point, in 3D, with the drone camera panel
    pg.click('[data-ops-dronecam]'); pg.wait_for_timeout(6000)
    R.check('Drone camera opens the 3D view with its panel and on-screen readout', pg.locator('[data-ops-dronepanel]').count() == 1 and pg.locator('[data-ops-dronehud]').count() == 1 and pg.locator('[data-ops-3d-drone]').count() == 1)
    R.check('...starting at the take-off point', 'tlz' in pg.inner_text('[data-ops-dronepanel]').lower() and abs(float(val(pg, '#dc-lat')) - LAT) < 1e-6)
    R.check('...with the job\'s drone and its own lenses suggested first (Mavic 4 Pro 28 mm)', val(pg, '#dc-drone') == 'DJI Mavic 4 Pro' and val(pg, '#dc-lens') == 'm4-28', (val(pg, '#dc-drone'), val(pg, '#dc-lens')))
    R.check('28 mm equivalent on 16:9 gives a 68° field of view', fov(pg) == '68', fov(pg))
    d = D(pg)
    R.check('the picture is boxed to the lens shape (16:9)', d and abs(d['w'] / d['h'] - 16 / 9) < 0.02, d)
    R.check('the camera\'s field of view matches the lens (vertical from 68° across)', d and abs(d['fov'] - 2 * math.degrees(math.atan(math.tan(math.radians(67.9) / 2) / (16 / 9)))) < 0.5, d and d['fov'])
    R.check('quick buttons: the three Mavic 4 lenses plus typical ones', all(pg.locator('[data-ops-dc-lensbtn="%s"]' % k).count() == 1 for k in ['m4-28', 'm4-70', 'm4-168', 'eq-24']))
    pg.click('[data-ops-dc-lensbtn="m4-168"]'); pg.wait_for_timeout(500)
    R.check('switching to the 168 mm tele narrows the view to 13°', fov(pg) == '13', fov(pg))
    groups = pg.evaluate("()=>[...document.querySelectorAll('#dc-lens optgroup')].map(g=>g.label)")
    R.check('the lens list has O4, GoPro, Mavic 3, Mini, Inspire 3 and typical lenses', all(any(k in g for g in groups) for k in ['O4', 'GoPro', 'Mavic 3', 'Mini 4', 'Inspire 3', 'Typical']), groups)
    pg.select_option('#dc-lens', 'o4-wide'); pg.wait_for_timeout(400)
    R.check('O4 wide is shown as a 130° straight view with a fisheye note', fov(pg) == '130' and 'fisheye' in pg.inner_text('[data-ops-dronehud]'), fov(pg))
    pg.select_option('#dc-lens', 'i3-24'); pg.wait_for_timeout(400)
    R.check('Inspire 3 24 mm full frame (17:9) gives 74°', fov(pg) == '74' and val(pg, '#dc-aspect') == '17:9', (fov(pg), val(pg, '#dc-aspect')))
    pg.select_option('#dc-lens', 'm4-28'); pg.wait_for_timeout(400)

    # height cap from the JSA (200 ft = 61 m) and the ground / roof floor
    R.check('the height slider stops at the job\'s max height (200 ft = 61 m)', pg.get_attribute('[data-ops-dc-agl]', 'max') == '61', pg.get_attribute('[data-ops-dc-agl]', 'max'))
    pg.fill('input[aria-label="agl"]', '500'); pg.wait_for_timeout(600)
    R.check('...typing a higher number is held at 61 m', float(val(pg, '[data-ops-dc-agl]')) == 61 and abs(D(pg)['agl'] - 61) < 0.01, D(pg))
    R.check('the camera sits 61 m above the ground under it', abs(D(pg)['y'] - D(pg)['ground'] - 61) < 0.2, D(pg))
    pg.fill('input[aria-label="agl"]', '3'); pg.wait_for_timeout(1500)
    d = D(pg)
    R.check('over a 10 m building, a 3 m drone is lifted clear of the roof (not inside it)', d and d['raised'] > 6 and d['y'] > 10, d)
    R.check('...and the readout says so', 'Lifted' in pg.inner_text('[data-ops-dronehud]'))
    pg.fill('input[aria-label="agl"]', '40'); pg.wait_for_timeout(600)

    # keys and buttons move the drone, the sliders follow
    pg.click('[data-ops-dc="north"]'); pg.wait_for_timeout(300); pg.mouse.move(700, 400)
    pg.evaluate("()=>document.activeElement && document.activeElement.blur()")
    lat0 = float(val(pg, '#dc-lat'))
    pg.keyboard.press('ArrowUp'); pg.wait_for_timeout(300); pg.keyboard.press('q'); pg.wait_for_timeout(300); pg.keyboard.press('d'); pg.wait_for_timeout(500)
    R.check('arrow up flies north (heading 0), Q climbs, D turns right; sliders follow', float(val(pg, '#dc-lat')) > lat0 and float(val(pg, '[data-ops-dc-agl]')) > 40 and val(pg, 'input[aria-label="heading"]') == '3',
            (val(pg, '#dc-lat'), val(pg, '[data-ops-dc-agl]'), val(pg, 'input[aria-label="heading"]')))
    pg.click('[data-ops-dc="north"]'); pg.click('[data-ops-dc="nadir"]'); pg.wait_for_timeout(400)
    R.check('compass faces north, the down button points the gimbal straight down', val(pg, 'input[aria-label="heading"]') == '0' and val(pg, 'input[aria-label="tilt"]') == '-90')
    pg.select_option('[data-ops-dc-aim]', label='Caution !: Stage'); pg.wait_for_timeout(500)
    hd, tl = float(val(pg, 'input[aria-label="heading"]')), float(val(pg, 'input[aria-label="tilt"]'))
    R.check('"Point the camera at" the stage turns it north-east and tilts it down', 15 < hd < 40 and -60 < tl < -5, (hd, tl))

    # capture
    pg.click('[data-ops-dc-capture]'); pg.wait_for_timeout(5000)
    R.check('Capture adds a shot to the list with its settings', pg.locator('[data-ops-shotrow]').count() == 1 and 'Mavic 4 Pro · 28 mm' in pg.inner_text('[data-ops-shots]'))
    img = pg.evaluate("()=>new Promise(r=>{const i=document.querySelector('[data-ops-shotrow] img'); if(!i) return r(null); const go=()=>r({w:i.naturalWidth,h:i.naturalHeight,len:i.src.length,jpeg:i.src.startsWith('data:image/jpeg')}); i.complete?go():i.onload=go;})")
    R.check('the picture is a JPEG at most 1280 wide, in the lens shape, and light (< 400 kB)', img and img['jpeg'] and img['w'] <= 1280 and abs(img['w'] / img['h'] - 16 / 9) < 0.02 and img['len'] < 550000, img)
    pg.locator('[data-ops-shotrow] input[aria-label="Shot title"]').fill('Opening drone reveal'); pg.wait_for_timeout(400)
    pg.click('[data-ops-dronecam]'); pg.wait_for_timeout(1500)
    R.check('leaving the drone camera returns to the normal 3D view; the shot is in the views list', pg.locator('[data-ops-dronepanel]').count() == 0 and 'Drone camera' in pg.inner_text('[data-ops-views]'))
    # open from a path waypoint
    pg.locator('[data-ops-inspector] button:has-text("Path A")').first.click(); pg.wait_for_timeout(500)
    pg.click('[data-ops-dc-from="path"]'); pg.wait_for_timeout(3500)
    R.check('Drone camera at a path point: its height (20 m) and facing the next point (north)', val(pg, '[data-ops-dc-agl]') == '20' and val(pg, 'input[aria-label="heading"]') == '0' and 'path a point 1' in pg.inner_text('[data-ops-dronepanel]').lower(),
            (val(pg, '[data-ops-dc-agl]'), val(pg, 'input[aria-label="heading"]')))
    # your own lens, saved on the fleet card
    pg.click('[data-ops-ownlens] summary'); pg.click('[data-ops-addlens]')
    pg.fill('input[aria-label="Lens name"]', 'Mavic 4 custom'); pg.fill('input[aria-label="Sensor width mm"]', '13.2'); pg.fill('input[aria-label="Focal length mm"]', '8.8'); pg.wait_for_timeout(200)
    pg.click('[data-ops-savelens]'); pg.wait_for_timeout(1200)
    cams = ((get_db(pg) or {}).get('fleet') or {}).get('DJI Mavic 4 Pro', {}).get('cameras')
    R.check('your own lens saves on the drone\'s fleet card and is chosen (13.2 mm sensor, 8.8 mm lens = 74°)', cams and cams[0]['focal'] == 8.8 and fov(pg) == '74' and (get_db(pg)['fleet']['DJI Mavic 4 Pro'].get('weight') == '1.06'), (cams, fov(pg)))
    # Show re-opens a shot where it was taken
    pg.locator('[data-ops-shotrow] button:has-text("Show")').click(); pg.wait_for_timeout(1500)
    R.check('Show puts the drone back where the shot was taken', val(pg, '[data-ops-dc-agl]') != '20' and val(pg, '#dc-lens') == 'm4-28', (val(pg, '[data-ops-dc-agl]'), val(pg, '#dc-lens')))
    pg.click('[data-ops-close]'); pg.wait_for_timeout(1500)

    # PDF
    pg.evaluate(CAPTURE_PDF); pg.evaluate(JS_INC, 'Export PDF'); pg.wait_for_timeout(4000)
    h = (pg.evaluate('window.__pdfs') or [''])[-1]
    R.check('the PDF has a Planned perspectives section with the shot and the indicative-only note', 'Planned perspectives' in h and 'Opening drone reveal' in h and 'Indicative only' in h, len(h))
    R.check('...with its settings (height, heading, tilt, drone, lens, field of view) and Google credit', all(k in h for k in ['m above ground', 'Gimbal tilt', 'DJI Mavic 4 Pro', 'Mavic 4 Pro · 28 mm', '68° across', 'Map data ©2026 Google']))
    R.check('...and the picture itself', h.count('data:image/jpeg') >= 1)
    R.check('no page errors', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
