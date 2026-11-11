# v7.35: choosing the CRP's own name / ARN after the RPIC signed no longer voids the RPIC's signature (it used to, so the
# flight couldn't be approved). Signatures made under the old rules still match. Real plan changes still void it, and
# the CRP is told what changed.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
JS = """async () => {
  const F = window.__wdFp;
  const base = { overview: { identifier: 'OP-2026-0009', operationName: 'Bridge Shoot', endTime: '16:00' }, jsa: { maxOperatingHeightAgl: '120' }, risks: [{ id: 1, hazard: 'Wind' }], oonp: {}, oonpMode: false, mapData: {},
    approval: { crpName: '', crpArn: '', notams: 'Nil', crpSigned: false, rpSigned: false }, keData: {}, ballistic: {} };
  const crp = JSON.parse(JSON.stringify(base)); crp.approval.crpName = 'Michael Rubio'; crp.approval.crpArn = '1209476'; crp.approval.crpSigned = true; crp.approval.authAttach = { a: true };
  const oldSig = await F.planFingerprint(base, false, true);   // signed under v7.34 rules, before the CRP picked their name
  const oldSig2 = await F.planFingerprint(crp, false, true);   // signed under v7.34 rules, CRP name already chosen
  const newSig = await F.planFingerprint(base);                // signed under v7.35 rules
  const changed = JSON.parse(JSON.stringify(crp)); changed.approval.notams = 'Crane NOTAM'; changed.overview.endTime = '17:00';
  return { a: await F.fpMatches(oldSig, crp), b: await F.fpMatches(oldSig2, crp), c: await F.fpMatches(newSig, crp), d: (await F.planFingerprint(base)) === (await F.planFingerprint(crp)),
    e: await F.fpMatches(oldSig, changed), f: await F.fpMatches(newSig, changed), g: F.planChanges(base, changed) };
}"""
with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp', {'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Test Co'}}, 'hash': 'h0'}]}, 'approval')
    pg.goto(URL); pg.wait_for_timeout(5000)
    r = pg.evaluate(JS)
    R.check('old signature still counts after the CRP picks their name and ARN', r['a'], r)
    R.check('old signature made with the CRP name already chosen still counts', r['b'], r)
    R.check('new signature counts after the CRP picks their name and ARN', r['c'], r)
    R.check('the CRP name, ARN and PDF attachment ticks are not part of what the RPIC signs', r['d'], r)
    R.check('a real change still voids the signature (old and new)', not r['e'] and not r['f'], r)
    R.check('the CRP is told what changed', any('Authorisation details (notams)' in x for x in r['g']) and any('Operation details (end time)' in x for x in r['g']), r['g'])
    R.check('no page errors', not errs, errs[:2])
    pg.context.close(); b.close()
R.done()
