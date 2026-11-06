# v7.28: the CRP's company setup follows the account (a new device loads it; a blank device never overwrites what crew
# see; two different setups ask which to keep), set / change password while signed in, and 3D zones sit on the terrain.
import sys, os, json, math; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()

SAVED = {'companyProfile': {'name': 'Waking Dream FPV', 'reocNumber': 'CASA.ReOC.9037', 'email': 'mike@wakingdreamfpv.com'},
         'fleet': {'DJI Avata 2': {'registrationNo': 'PF123', 'registrationExpiry': '2027-01-01'}}, 'pilots': [{'name': 'Mike Rubio'}]}
ROW = lambda data, h='cloud-hash-1': {'key': 'settings', 'data': data, 'hash': h, 'device': 'Mac · Chrome', 'updated_at': '2026-11-01T10:00:00Z'}
SET_LOCAL = """(cp)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const d=g.result?JSON.parse(g.result):{};d.companyProfile=cp;st.put(JSON.stringify(d),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
calls = lambda pg, t: [c for c in (pg.evaluate('window.__calls') or []) if c.get('t') == t]
company_pubs = lambda pg: [c for c in calls(pg, 'shared_data') if any((x or {}).get('area') == 'company' for x in (c['payload'] if isinstance(c['payload'], list) else [c['payload']]))]
def pub_names(pg):
    out = []
    for c in company_pubs(pg):
        for x in (c['payload'] if isinstance(c['payload'], list) else [c['payload']]):
            if (x or {}).get('area') == 'company': out.append(((x.get('data') or {}).get('name')))
    return out

with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. a new device (the iPhone): blank here, setup saved to the account → it loads, and crew never see a blank company
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW(SAVED)]}); pg.goto(URL); pg.wait_for_timeout(7000)
    d = get_db(pg) or {}
    R.check('new device loads the company setup from the account', (d.get('companyProfile') or {}).get('name') == 'Waking Dream FPV' and 'DJI Avata 2' in (d.get('fleet') or {}), d.get('companyProfile'))
    R.check('it says where it came from', pg.locator('[data-setup-note]').count() == 1 and 'Mac' in pg.inner_text('[data-setup-note]'))
    R.check('what crew see is the real company, never blank', pub_names(pg) and all(n == 'Waking Dream FPV' for n in pub_names(pg)), pub_names(pg))
    R.check('the loaded setup is not uploaded straight back as a change from this device', not [c for c in calls(pg, 'crp_store') if ((c['payload'] or {}).get('data') or {}).get('companyProfile', {}).get('name') != 'Waking Dream FPV'])
    R.check('no page errors (new device)', not errs, errs[:3])
    pg.context.close()

    # 2. a blank device with nothing saved yet: nothing is published or uploaded
    pg, errs, dl = ctx_for(b, 'crp'); pg.goto(URL); pg.wait_for_timeout(7000)
    R.check('blank device + nothing saved: no blank company published for crew', not company_pubs(pg), pub_names(pg))
    R.check('blank device: nothing uploaded to the account', not [c for c in calls(pg, 'crp_store') if c['op'] == 'upsert'])
    # set the company up here: it's saved to the account (without the jobs) and published
    pg.evaluate(SET_LOCAL, {'name': 'Waking Dream FPV', 'reocNumber': 'CASA.ReOC.9037'}); pg.reload(); pg.wait_for_timeout(8000)
    up = [c for c in calls(pg, 'crp_store') if c['op'] == 'upsert']
    R.check('main device saves its setup to the account', up and up[-1]['payload']['data']['companyProfile']['name'] == 'Waking Dream FPV' and up[-1]['payload']['device'], up[-1:] and up[-1]['payload'].get('device'))
    R.check('jobs are not in it (they sync separately)', up and not any(k in up[-1]['payload']['data'] for k in ('draftPlans', 'savedPlans', 'completedFlights')))
    R.check('and the company is published for crew', 'Waking Dream FPV' in pub_names(pg), pub_names(pg))
    pg.context.close()

    # 3. both changed: choose which to keep; nothing is shared until you choose
    def both(choice):
        pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW({**SAVED, 'companyProfile': {'name': 'Cloud Co'}}, 'cloud-hash-2')]},
                               extra="localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'older-hash'}));")
        pg.goto(URL); pg.wait_for_timeout(3000); pg.evaluate(SET_LOCAL, {'name': 'Local Co'}); pg.reload(); pg.wait_for_timeout(6000)
        return pg, errs
    pg, errs = both('saved')
    R.check('two different setups: it asks which to keep', pg.locator('[data-setup-choice]').count() == 1 and 'Mac' in pg.inner_text('[data-setup-choice]'))
    R.check('nothing published or uploaded while it asks', not company_pubs(pg) and not [c for c in calls(pg, 'crp_store') if c['op'] == 'upsert'])
    pg.click('[data-setup-use-saved]'); pg.wait_for_timeout(5000)
    R.check('"Use the one saved to my account" loads it', (get_db(pg).get('companyProfile') or {}).get('name') == 'Cloud Co')
    R.check('then the saved company is published', pub_names(pg) and pub_names(pg)[-1] == 'Cloud Co', pub_names(pg))
    R.check('no page errors (choose)', not errs, errs[:3])
    pg.context.close()
    pg, errs = both('local')
    pg.click('[data-setup-keep-local]'); pg.wait_for_timeout(5000)
    up = [c for c in calls(pg, 'crp_store') if c['op'] == 'upsert']
    R.check('"Keep this device\'s setup" saves it to the account', up and up[-1]['payload']['data']['companyProfile']['name'] == 'Local Co' and (get_db(pg).get('companyProfile') or {}).get('name') == 'Local Co')
    pg.context.close()

    # 4. this device changed, the account copy didn't: no question, it just uploads
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW(SAVED, 'cloud-hash-3')]}, extra="localStorage.setItem('wd_setup_synced', JSON.stringify({hash:'cloud-hash-3'}));")
    pg.goto(URL); pg.wait_for_timeout(3000); pg.evaluate(SET_LOCAL, {'name': 'Waking Dream FPV Pty'}); pg.reload(); pg.wait_for_timeout(7000)
    up = [c for c in calls(pg, 'crp_store') if c['op'] == 'upsert']
    R.check('only this device changed: no question, its setup is uploaded', pg.locator('[data-setup-choice]').count() == 0 and up and up[-1]['payload']['data']['companyProfile']['name'] == 'Waking Dream FPV Pty')
    pg.context.close()

    # 5. crew never touch the CRP's setup
    pg, errs, dl = ctx_for(b, 'pilot', seed={'crp_store': [ROW(SAVED)]}); pg.goto(URL); pg.wait_for_timeout(6000)
    R.check('crew: the CRP setup is not read or written', not calls(pg, 'crp_store') and pg.locator('[data-setup-note],[data-setup-choice]').count() == 0)
    # 6. password while signed in (crew)
    pg.click('[data-testid=account-chip]'); pg.wait_for_timeout(800)
    R.check('crew: "Set or change password" in the account panel', pg.locator('[data-testid=account-modal] [data-testid=pw-change]').count() == 1)
    pg.click('[data-testid=account-modal] [data-testid=pw-change]'); pg.wait_for_timeout(300)
    f = pg.locator('[data-testid=account-modal] [data-testid=setpw-form] input[type=password]')
    f.nth(0).fill('short'); f.nth(1).fill('short'); pg.click('[data-testid=account-modal] [data-testid=setpw-form] button[type=submit]'); pg.wait_for_timeout(300)
    R.check('too short is refused', 'at least 10' in pg.inner_text('[data-testid=account-modal] [data-testid=setpw-form]'))
    f.nth(0).fill('a-good-password-1'); f.nth(1).fill('a-good-password-1'); pg.click('[data-testid=account-modal] [data-testid=setpw-form] button[type=submit]'); pg.wait_for_timeout(600)
    upd = [c for c in pg.evaluate('window.__calls') if c.get('auth') == 'updateUser' and (c.get('args') or {}).get('password')]
    R.check('password saved to the login', upd and upd[-1]['args']['password'] == 'a-good-password-1' and pg.locator('[data-testid=account-modal] [data-testid=pw-saved]').count() == 1)
    pg.context.close()
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW(SAVED)]}); pg.goto(URL); pg.wait_for_timeout(5000)
    pg.click('[data-testid=account-chip]'); pg.wait_for_timeout(800)
    pg.click('[data-testid=account-modal] [data-testid=pw-change]'); pg.wait_for_timeout(300)
    R.check('CRP: same password box, with Cancel', pg.locator('[data-testid=account-modal] [data-testid=setpw-form]').count() == 1 and 'Cancel' in pg.inner_text('[data-testid=account-modal] [data-testid=setpw-form]'))
    pg.context.close()

    # 7. 3D: zones and markers sit on the terrain (ground rises 5 m per 100 m east)
    LAT, LNG = -27.4635, 153.0170
    KX = 111320 * math.cos(math.radians(LAT)); E = lambda m: LNG + m / KX
    TERR = "window.__WD_SAT = false; window.__WD_TERRAIN = async (lls) => ({ src: 'test terrain', elev: lls.map(([la, ln]) => 30 + 0.05 * (ln - %f) * %f) });" % (LNG, KX)
    ZONE = {'id': 'z1', 'kind': 'oonp', 'shape': 'poly', 'name': 'Crowd', 'h': 10, 'ground': 0,
            'pts': [[LAT - 0.0003, E(200)], [LAT - 0.0003, E(260)], [LAT + 0.0003, E(260)], [LAT + 0.0003, E(200)]]}
    OPS = {'v': 1, 'mode': 'geo', 'settings': {}, 'overlay': None, 'views': [], 'zones': [ZONE],
           'points': [{'id': 't1', 'kind': 'tlz', 'lat': LAT, 'lng': LNG, 'title': 'TLZ', 'size': 5}, {'id': 'e1', 'kind': 'elz', 'lat': LAT, 'lng': E(100), 'title': 'E-LZ', 'size': 4}],
           'paths': [{'id': 'pa', 'name': 'Path A', 'pts': [[LAT, E(0), 3], [LAT, E(240), 15]]}]}
    VEN = os.path.join(os.path.dirname(__file__), 'vendor')
    pg, errs, dl = ctx_for(b, 'crp', seed={'crp_store': [ROW(SAVED)]}, extra=TERR); pg.goto(URL); pg.wait_for_timeout(4500)
    pg.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/**', lambda r: r.fulfill(path=os.path.join(VEN, 'three.min.js'), headers={'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*'}))
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, {'overview': {'uid': 'uid-3d', 'identifier': 'OP-2026-0802', 'operationName': 'Slope test'}, 'opsMap': OPS}); pg.reload(); pg.wait_for_timeout(5000)
    open_draft(pg); pg.wait_for_timeout(800); pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
    pg.click('[data-ops-view="3d"]'); pg.wait_for_timeout(5000)
    g = pg.evaluate("""()=>{const W=window.__WD_3D; if(!W) return null; const out={on:!!W.onTerrain, walls:[], marks:{}};
      W.group.children.forEach(o=>{ if(o.userData&&o.userData.marker){ out.marks[o.userData.marker]=o.position.y; return; }
        if(o.type==='Mesh'&&o.geometry&&o.geometry.attributes.position){ const a=o.geometry.attributes.position.array, ys=[]; for(let i=1;i<a.length;i+=3) ys.push(a[i]); out.walls.push({min:Math.min(...ys),max:Math.max(...ys)}); } });
      return out; }""")
    R.check('3D: zones are rebuilt on the terrain', g and g['on'], g)
    w = (g or {}).get('walls') or [{}]
    R.check('the zone stands on its own ground (10–13 m up the slope), not at take-off height', w and 9.5 < w[0].get('min', 0) < 10.5, w)
    R.check('its top is its 10 m limit above that ground', w and 22.5 < w[0].get('max', 0) < 23.5, w)
    m = (g or {}).get('marks') or {}
    R.check('E-LZ sits on the ground 100 m east (about 5 m up)', 4.8 < m.get('elz', 0) < 5.4 and m.get('tlz', 9) < 0.5, m)
    pg.screenshot(path='/tmp/claude-0/v728_3d.png')
    R.check('no page errors (3D)', not errs, errs[:3])
    pg.context.close()
    b.close()
R.done()
