# v7.53: the ops map checks list one line per path and problem (with the legs it applies to), not one per leg;
# a speed over a zone's limit has a "Set the path to …" button; acknowledgements made per leg before still count.
import sys, os, json, math; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
LAT, LNG = -28.0, 153.43
KX = 111320 * math.cos(math.radians(LAT)); E = lambda m: LNG + m / KX; N = lambda m: LAT + m / 111320
Z = [{'id': 'o1', 'kind': 'oonp', 'shape': 'poly', 'name': 'Over people (direct) 1', 'ground': 0, 'h': 10, 'v': 1.5, 'limitReviewed': {'by': 'T'},
      'pts': [[N(-100), E(-100)], [N(-100), E(100)], [N(100), E(100)], [N(100), E(-100)]]}]
PTS = [[N(-60 + 10 * i), E(0), 5] for i in range(13)]  # 12 legs, all inside the zone, 5 m up
OPS = {'v': 1, 'mode': 'geo', 'settings': {}, 'overlay': None, 'views': [], 'zones': Z, 'points': [],
       'paths': [{'id': 'pa', 'name': 'Path A', 'speed': 5, 'pts': PTS}], 'acks': {}}
issues = lambda pg: pg.evaluate("()=>[...document.querySelectorAll('[data-ops-issue]')].map(e=>e.dataset.opsIssue+'|'+e.innerText)")
def open_ops(pg, ops, uid):
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, {'overview': {'uid': uid, 'identifier': 'OP-2026-0753', 'operationName': 'Checks'}, 'opsMap': ops}); pg.reload(); pg.wait_for_timeout(5000)
    open_draft(pg); pg.wait_for_timeout(800); pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.locator('[data-open-opsmap]').first.click(); pg.wait_for_timeout(2500)
with sync_playwright() as p:
    b = p.chromium.launch(); pg, errs, dl = ctx_for(b, 'crp'); pg.goto(URL); pg.wait_for_timeout(4500)
    open_ops(pg, OPS, 'u-753')
    if pg.locator('[data-ops-back]').count(): pg.click('[data-ops-back]'); pg.wait_for_timeout(400)
    sp = [q for q in issues(pg) if 'speed' in q]
    R.check('a 12-leg path that is too fast gives ONE speed check, not 12', len(sp) == 1, sp)
    R.check('...saying where (the whole way) and both speeds', sp and 'the whole way' in sp[0] and '1.5 m/s' in sp[0] and 'Path A' in sp[0], sp)
    R.check('...with a "Set the path to 1.5 m/s" button', pg.locator('[data-ops-fixspeed]').count() == 1 and '1.5 m/s' in pg.inner_text('[data-ops-fixspeed]'))
    pg.click('[data-ops-fixspeed]'); pg.wait_for_timeout(700)
    R.check('pressing it fixes the path speed and the check goes away', not [q for q in issues(pg) if 'speed' in q], issues(pg))
    pg.keyboard.press('Escape'); pg.reload(); pg.wait_for_timeout(4000)
    # old per-leg acknowledgements still count
    ops2 = json.loads(json.dumps(OPS)); ops2['acks'] = {'pa:%d:vo1' % i: {'note': 'briefed crowd', 'by': 'Mike'} for i in range(12)}
    open_ops(pg, ops2, 'u-753b')
    if pg.locator('[data-ops-back]').count(): pg.click('[data-ops-back]'); pg.wait_for_timeout(400)
    sp = [q for q in issues(pg) if 'speed' in q]
    R.check('a check acknowledged leg by leg before v7.53 still shows as acknowledged', len(sp) == 1 and sp[0].startswith('ack|'), sp)
    R.check('no page errors', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
