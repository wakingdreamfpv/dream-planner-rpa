# v7.48: Google's photo-realistic 3D city in the 3D view, using the CRP's own Map Tiles API key (Database & Settings
# › API integrations). The switch only shows when a key is set; the Google city replaces our satellite ground and the
# OpenStreetMap buildings; the 3D engine is now bundled (no CDN). Google itself is mocked (no network, no billing).
import sys, os, json, math; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
LAT, LNG = -27.4635, 153.0170
TERR = "window.__WD_SAT = false; window.__WD_TERRAIN = async (lls) => ({ src: 'test terrain', elev: lls.map(() => 30) }); window.__WD_BUILDINGS = () => [];"
GOOG = """window.__G3D = []; window.__WD_GOOGLE3D = async (THREE, key, rp) => { window.__G3D.push({key, rp});
  const group = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial()); m.userData.google = 1; group.add(m);
  const g = { tiles: { group, update(){ window.__G3D_UPD = (window.__G3D_UPD||0)+1; }, deleteCamera(){} }, ready: false, onChange: null,
    place(x, z){ group.position.set(x, 0, z); }, note: () => 'Google 3D city · Map data ©2026 Google · heights from the take-off.' }; return g; };"""
OPS = {'v': 1, 'mode': 'geo', 'settings': {}, 'overlay': None, 'views': [], 'zones': [], 'points': [],
       'paths': [{'id': 'pa', 'name': 'Path A', 'pts': [[LAT, LNG, 20], [LAT + 0.0005, LNG, 20]]}]}
labels = lambda pg: pg.evaluate("()=>[...document.querySelectorAll('label:has(input[type=checkbox])')].map(l=>l.innerText.trim()).filter(t=>/3D (city|buildings)/.test(t))")
gmesh = lambda pg: pg.evaluate("()=>{let n=0; window.__WD_3D && window.__WD_3D.scene.traverse(o=>{ if(o.userData&&o.userData.google) n++; }); return n;}")
def open3d(pg):
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, {'overview': {'uid': 'uid-g3d', 'identifier': 'OP-2026-0902', 'operationName': 'Google test'}, 'opsMap': OPS}); pg.reload(); pg.wait_for_timeout(5000)
    open_draft(pg); pg.wait_for_timeout(800); pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
    pg.click('[data-ops-view="3d"]'); pg.wait_for_timeout(6000)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', extra=TERR + GOOG); pg.goto(URL); pg.wait_for_timeout(4500)
    cdn = []; pg.on('request', lambda r: 'cdnjs.cloudflare.com/ajax/libs/three' in r.url and cdn.append(r.url))
    open3d(pg)
    R.check('the 3D view works with the bundled 3D engine (nothing fetched from the CDN)', pg.evaluate("()=>!!window.__WD_3D") and not cdn, cdn)
    R.check('without a key there is no Google 3D city switch, only 3D buildings', labels(pg) == ['3D buildings'], labels(pg))
    R.check('...and Google is never contacted', pg.evaluate("()=>window.__G3D.length") == 0)
    # set the key in Database & Settings
    pg.keyboard.press('Escape'); pg.reload(); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(1000)
    if pg.get_attribute('[data-dbfold="dbsec-api"]', 'data-open') != '1': pg.click('[data-fold-toggle="dbsec-api"]')
    pg.wait_for_timeout(500)
    R.check('API integrations has a Google 3D city key field (hidden like a password)', pg.get_attribute('[data-google-key]', 'type') == 'password')
    pg.fill('[data-google-key]', '  AIzaTEST-key-123  '); pg.wait_for_timeout(800)
    R.check('...the key saves (trimmed)', (get_db(pg) or {}).get('googleTilesKey') == 'AIzaTEST-key-123', (get_db(pg) or {}).get('googleTilesKey'))
    open3d(pg)
    R.check('with a key: a Google 3D city switch, on by default, replaces the 3D buildings switch', labels(pg) == ['Google 3D city'] and pg.locator('label:has-text("Google 3D city") input').is_checked(), labels(pg))
    calls = pg.evaluate("()=>window.__G3D")
    R.check('Google is asked once, with the key and the take-off point', len(calls) == 1 and calls[0]['key'] == 'AIzaTEST-key-123' and abs(calls[0]['rp'][0] - LAT) < 0.01, calls)
    R.check('the Google city is in the scene and updated as the view draws', gmesh(pg) == 1 and pg.evaluate("()=>window.__WD_3D_UPD||window.__G3D_UPD||0") > 0)
    note = pg.inner_text('[data-ops-3d-ground]')
    R.check('the ground note credits Google (required by Google)', 'Google' in note and '©' in note, note)
    pg.locator('label:has-text("Google 3D city") input').uncheck(); pg.wait_for_timeout(4000)
    R.check('switching Google off brings back the satellite ground and the 3D buildings switch', gmesh(pg) == 0 and '3D buildings' in labels(pg), (gmesh(pg), labels(pg)))
    R.check('no page errors', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
