# v7.20: tabs like the planner's side menu, risk register as the planner's table, KE in Client view, pick sections when sharing.
# v7.19: the live link shows the plan in the planner's look (no PDF): section cards, 2D map, 3D ops map, KE tool, risks,
# signatures; only the chosen view's sections are in the shared data.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
ZONE = {'id': 'z1', 'name': 'Crowd area', 'kind': 'over', 'shape': 'poly', 'pts': [[-27.4630, 153.0350], [-27.4630, 153.0370], [-27.4648, 153.0370]], 'limit': {'h': 8, 'v': 5}}
PLAN = {'overview': {'uid': 'uid-1', 'identifier': 'OP-2026-0401', 'operationName': 'Stadium Show', 'operationDate': '2026-11-20', 'rpaTypes': ['DJI Avata 2'], 'rpic': 'Test Pilot', 'location': 'Suncorp Stadium', 'clientName': 'Big Events Pty', 'taskOverview': 'Halftime FPV'},
  'mapData': {'launches': [{'id': 1, 'x': 40, 'y': 50, 'label': 'Launch 1', 'lat': -27.4637, 'lng': 153.0359}], 'recoveries': [], 'signage': [], 'areaPolygon': [{'x': 1, 'y': 1, 'lat': -27.4630, 'lng': 153.0350}, {'x': 2, 'y': 1, 'lat': -27.4630, 'lng': 153.0370}, {'x': 2, 'y': 2, 'lat': -27.4648, 'lng': 153.0370}], 'crowdZones': [], 'exclusionZones': []},
  'opsMap': {'mode': 'outdoor', 'zones': [ZONE], 'paths': [], 'points': [], 'settings': {}},
  'approval': {'rpName': 'Test Pilot', 'crpName': 'Michael Rubio', 'notams': 'Nil', 'officialAuth': 'CASA.OONP.0079'}, 'jsa': {'operationTypes': ['VLOS', 'OONP'], 'maxOperatingHeightAgl': '100', 'airspaceClass': 'Class G', 'groundHazards': 'Crowd and stage'},
  'oonpMode': True, 'keData': {'enabled': True, 'rpa': 'DJI Avata 2', 'weight': 0.377, 'useAero': False, 'rho': 1.225, 'cd': 1.2, 'area': 0.05}, 'ballistic': {'enabled': True, 'height': 10, 'speed': 5},
  'risks': [{'refNo': '001', 'hazard': 'Crowd surge', 'riskDescription': 'People move under the drone', 'existingControls': 'Barriers', 'additionalControls': 'Marshals', 'initL': '4', 'initC': 'B', 'resL': '2', 'resC': 'C', 'riskOwner': 'RPIC'}]}
RPC = r"""window.__RPC = { create_plan_link: (a, T) => { (T.plan_links = T.plan_links || []).push({ id: 'L9', job_id: a.p_job_id, snapshot: a.p_snapshot, view_id: a.p_view_id, view_name: a.p_view_name, audience: a.p_audience, expires_at: '2027-01-01T00:00:00Z', revoked: false, created_at: new Date().toISOString() }); return { data: { id: 'L9', token: 'e'.repeat(64) }, error: null }; },
  plan_link_open: () => ({ data: window.__LINK, error: null }),
  plan_link_comment: (a) => { const L = window.__LINK; L.comments = [...L.comments, { id: 'n' + L.comments.length, section: a.p_section, body: a.p_body, kind: 'comment', status: 'open', author_name: a.p_name, author_role: 'client', created_at: new Date().toISOString() }]; return { data: { id: 'n', comments: L.comments }, error: null }; } };"""
snaps = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [{'id': 'jobs-1', 'plan_uid': 'uid-1', 'title': 'Stadium Show', 'status': 'draft', 'start_date': '2026-11-20'}]}, extra=RPC)
    pg.goto(URL); pg.wait_for_timeout(4000); pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, PLAN); pg.reload(); pg.wait_for_timeout(5000); open_draft(pg)
    for aud, view in [('client', 'client'), ('crew', 'whs')]:
        pg.click('[data-job-share]'); pg.wait_for_timeout(800)
        pg.click('[data-share-aud=' + aud + ']'); pg.select_option('[data-share-view]', view); pg.fill('[data-share-label]', aud); pg.click('[data-share-make]'); pg.wait_for_timeout(1500)
        cr = [c for c in pg.evaluate('window.__calls') if c.get('rpc') == 'create_plan_link']
        snaps[aud] = json.loads(cr[-1]['args']['p_snapshot']); R.check(aud + ': default view kept (not edited)', cr[-1]['args']['p_view_id'] == view, cr[-1]['args']['p_view_id'])
        pg.click('[data-testid=share-panel] button[aria-label=Close]'); pg.wait_for_timeout(300)
    # pick what they see: start from Client view, untick KE, tick the preliminary checklist
    pg.click('[data-job-share]'); pg.wait_for_timeout(800); pg.click('[data-share-aud=client]'); pg.click('[data-share-pick-open]'); pg.wait_for_timeout(200)
    R.check('picker starts ticked as the Client view', pg.is_checked('[data-share-sec=ke]') and pg.is_checked('[data-share-sec=risks]') and not pg.is_checked('[data-share-sec=prelim]') and not pg.is_checked('[data-share-sec=jsa]'))
    pg.uncheck('[data-share-sec=ke]'); pg.check('[data-share-sec=prelim]'); pg.fill('[data-share-label]', 'picked'); pg.click('[data-share-make]'); pg.wait_for_timeout(1500)
    a = [c for c in pg.evaluate('window.__calls') if c.get('rpc') == 'create_plan_link'][-1]['args']; pk = [s['key'] for s in json.loads(a['p_snapshot'])['sections']]
    R.check('picked sections shared (prelim in, KE out) and remembered on the link', 'prelim' in pk and 'ke' not in pk and 'risks' in pk and a['p_view_id'].startswith('pick:client:') and 'edited' in a['p_view_name'], (pk, a['p_view_id']))
    pg.click('[data-testid=share-panel] button[aria-label=Close]'); pg.wait_for_timeout(300)
    cl = snaps['client']; keys = [s['key'] for s in cl['sections']]
    R.check('shared as the live view data, not a PDF', cl.get('v') == 2 and 'Stadium Show' in cl['title'], cl.get('v'))
    R.check('client view: plan, map, 3D, risks and approval', all(k in keys for k in ['overview', 'map', 'advmap', 'risks', 'approval']), keys)
    R.check('client view leaves out what the client PDF leaves out', not any(k in keys for k in ['prelim', 'jsa', 'oonp', 'postflight', 'flightlog']), keys)
    R.check('client view has the energy transfer (KE) tool', 'ke' in keys, keys)
    raw = json.dumps(cl)
    R.check("client data has no JSA text", 'Crowd and stage' not in raw)
    wk = [s['key'] for s in snaps['crew']['sections']]
    R.check('WHS view: JSA, emergency, OONP, energy transfer (KE) tool, risks', all(k in wk for k in ['jsa', 'emergency', 'oonp', 'ke', 'risks']), wk)
    ke = next(s for s in snaps['crew']['sections'] if s['key'] == 'ke')
    d = ke['blocks'][0]['drones'][0]
    R.check('KE limits match the planner physics (0.377 kg: 15 J hover ceiling ~4.05 m)', d['rpa'] == 'DJI Avata 2' and abs(d['h15'] - 4.05) < 0.02 and d['rows'], (d['h15'], d['s15']))
    R.check('ballistic splash included', any(bl.get('t') == 'kv' and any('Throw' in r[0] for r in bl['rows']) for bl in ke['blocks']))
    R.check('no page errors (CRP)', not errs, errs[:3])
    pg.context.close()
    # ── the live page ──
    for aud in ['client', 'crew']:
        link = {'title': 'Stadium Show', 'company': 'Waking Dream FPV', 'audience': aud, 'view_name': 'x', 'snapshot_at': '2026-11-05T01:00:00Z', 'can_suggest': aud == 'crew', 'snapshot': json.dumps(snaps[aud]), 'comments': []}
        pg, errs, dl = ctx_for(b, 'anon', {}, extra=RPC + 'window.__LINK=' + json.dumps(link) + ';')
        pg.set_viewport_size({'width': 390, 'height': 844}) if aud == 'client' else None
        pg.goto(URL + '#plan=' + 'e' * 64); pg.wait_for_timeout(4000)
        R.check(aud + ': rendered in the app look (no PDF frame)', pg.locator('[data-plan-viewer]').count() == 1 and pg.locator('[data-plan-frame]').count() == 0)
        tab = lambda g: (pg.locator('[data-pv-tab="%s"]:visible' % g).click(), pg.wait_for_timeout(300))
        groups = sorted(set(s['group'] for s in snaps[aud]['sections'])); seen = 0
        R.check(aud + ': a menu tab per section group, like the planner', pg.locator('[data-pv-tab]:visible').count() == len(groups), groups)
        R.check(aud + ': 2D map is live (Leaflet)', pg.locator('[data-pv-map2d] .leaflet-container').count() == 1)
        R.check(aud + ': Section 1 card header as in the planner', 'Section 1: Operations Overview' in pg.inner_text('[data-pv-group="1"]'))
        if aud == 'client':
            pg.locator('[data-pv-3d-open]').scroll_into_view_if_needed(); pg.click('[data-pv-3d-open]'); pg.wait_for_timeout(3000)
            R.check('3D ops map opens (the 3D engine loads from the internet; offline in tests)', pg.locator('[data-pv-3d-on] [data-ops-3d]').count() == 1)
        for g in groups: tab(g); seen += pg.locator('[data-pv-section]').count()
        R.check(aud + ': every shared section is under a tab', seen == len(snaps[aud]['sections']), (seen, len(snaps[aud]['sections'])))
        tab('2')
        R.check(aud + ': risk register as the planner table (L/C, ratings)', pg.locator('[data-pv-risk="001"]').count() == 1 and '4B' in pg.inner_text('[data-pv-risk="001"]') and '2C' in pg.inner_text('[data-pv-risk="001"]') and 'Hazardous' in pg.inner_text('[data-pv-risk="001"]') and 'initial risk' in pg.inner_text('[data-pv-risks]').lower())
        R.check(aud + ': KE tool shows', pg.locator('[data-pv-ke="DJI Avata 2"]').count() == 1)
        if aud == 'client':
            pg.click('[data-pv-comment=risks]'); pg.wait_for_timeout(300)
            R.check('comment button on a section opens comments for it', pg.locator('[data-plan-comments]').count() == 1 and pg.input_value('[data-plan-section]') == 'risks')
            pg.fill('[data-plan-name]', 'Sarah'); pg.fill('[data-composer-body]', 'Where do marshals stand?'); pg.click('[data-composer-send]'); pg.wait_for_timeout(500)
            pg.click('[data-plan-comments] button[aria-label="Close comments"]'); pg.wait_for_timeout(300)
            R.check('section shows its comment count', '1' in pg.inner_text('[data-pv-comment=risks]'))
        else:
            e0 = pg.get_attribute('[data-pv-ke-e]', 'data-pv-ke-e')
            pg.locator('[data-pv-ke-h]').evaluate("(el)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(el,'12');el.dispatchEvent(new Event('input',{bubbles:true}));}"); pg.wait_for_timeout(200)
            e1 = pg.get_attribute('[data-pv-ke-e]', 'data-pv-ke-e')
            R.check('KE tool: moving the height changes the energy (and goes over 34 J)', e0 != e1 and float(e1) > 34 and 'not permitted over people' in pg.inner_text('[data-pv-ke="DJI Avata 2"]'), (e0, e1))
        R.check(aud + ': no page errors', not errs, errs[:3])
        pg.context.close()
    b.close()
R.done()
