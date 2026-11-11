# v7.36: the CRP and the RPIC can sign in either order; the CRP then approves. (Before v7.35 the CRP signing after the
# RPIC filled in the CRP's name, which counted as a plan change and voided the RPIC's signature.)
import sys, os, json, tempfile; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SEED = {'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Test Co'}}, 'hash': 'h0'}]}
def setup(b):
    pg, errs, dl = ctx_for(b, 'crp', SEED, 'approval')
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.evaluate(JS_INC, 'Authorisation'); pg.wait_for_timeout(600)
    return pg, errs, dl
def reply(pg, fp):
    ov = pg.evaluate('window.__wdFpState().overview')
    d = {'_type': 'wdfpv_rpic_signoff', 'version': 1, 'operationId': ov.get('identifier'), 'planUid': ov.get('uid'), 'title': 'Test', 'fingerprint': fp,
         'name': 'Ben Walker', 'arn': '1018732', 'typedSignature': 'Ben Walker', 'signedAt': '2026-11-11T05:00:00.000Z', 'declaration': 'x'}
    f = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(d, f); f.close()
    pg.set_input_files('[data-rp-import]', f.name); pg.wait_for_timeout(1500)
def needs(pg):
    t = pg.inner_text('body')
    i = t.find('Before approving'); return t[i:i + 300] if i >= 0 else ''
def crp_sign(pg):
    pg.click('[data-sign-crp]'); sign_dialog(pg); pg.wait_for_timeout(800)
FP = 'async () => await window.__wdFp.planFingerprint(window.__wdFpState())'
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. RPIC first, then CRP
    pg, errs, dl = setup(b)
    reply(pg, pg.evaluate(FP))
    R.check('RPIC first: the signature is accepted', pg.evaluate('window.__wdFpState().approval.rpSigned') is True, dl[-2:])
    crp_sign(pg)
    ap = pg.evaluate('window.__wdFpState().approval')
    R.check('...then the CRP signs (name filled in)', ap.get('crpSigned') is True and ap.get('crpName'), ap.get('crpName'))
    pg.wait_for_timeout(1200)
    n = needs(pg)
    R.check('...and the RPIC signature still counts: nothing left before approving', 'RPIC signature' not in n and 're-sign' not in n and 'CRP signature' not in n, n)
    R.check('...no "plan has changed" warning', 'plan has changed since the RPIC signed' not in pg.inner_text('body'))
    R.check('RPIC first: no page errors', not errs, errs[:2])
    pg.context.close()
    # 2. CRP first, then RPIC (who signed the copy from before the CRP signed)
    pg, errs, dl = setup(b)
    fp_before = pg.evaluate(FP)
    crp_sign(pg)
    R.check('CRP first: signed', pg.evaluate('window.__wdFpState().approval.crpSigned') is True)
    reply(pg, fp_before)
    R.check('...then the RPIC\'s signature is accepted', pg.evaluate('window.__wdFpState().approval.rpSigned') is True, dl[-2:])
    pg.wait_for_timeout(1200)
    n = needs(pg)
    R.check('...and nothing about signatures is left before approving', 'RPIC signature' not in n and 're-sign' not in n and 'CRP signature' not in n, n)
    R.check('CRP first: no page errors', not errs, errs[:2])
    pg.context.close()
    # 3. a real change after the RPIC signed still needs them to sign again
    pg, errs, dl = setup(b)
    fp_before = pg.evaluate(FP)
    pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    pg.fill('input[name=operationName]', 'Changed after signing'); pg.wait_for_timeout(300)
    pg.evaluate(JS_INC, 'Authorisation'); pg.wait_for_timeout(800)
    reply(pg, fp_before)
    R.check('a real change: the old signature is refused', pg.evaluate('window.__wdFpState().approval.rpSigned') is not True and any('changed since' in m for m in dl), dl[-1:])
    pg.context.close()
    b.close()
R.done()
