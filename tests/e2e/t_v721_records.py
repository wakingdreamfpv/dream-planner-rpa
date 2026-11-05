# v7.21 (Chunk 5): locked copies with SHA-256 fingerprints. Approving a job and saving it to the cloud keeps a copy of
# the plan and its full PDF (re-approval after an amendment = version 2 with the reason). Verify re-checks the
# fingerprints and catches a changed copy. A locked induction is corrected as a new version with a reason.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
RPC = r"""window.__sha = async (t) => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t == null ? '' : t))); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
window.__RPC = {
  snapshot_job: async (a, T) => { T.record_versions = T.record_versions || []; const j = T.jobs.find(x => x.id === a.p_job_id) || {};
    const v = { id: 'rv-j' + (T.record_versions.length + 1), kind: 'job', job_id: a.p_job_id, record_id: a.p_job_id, chain_id: a.p_job_id, version: T.record_versions.filter(x => x.kind === 'job' && x.job_id === a.p_job_id).length + 1,
      data: { plan: JSON.parse(JSON.stringify(j.plan || {})) }, data_hash: await window.__sha(JSON.stringify(j.plan || {})), copy_html: a.p_copy, copy_hash: a.p_copy ? await window.__sha(a.p_copy) : null, reason: a.p_reason, created_at: new Date().toISOString() };
    T.record_versions.push(v); return { data: { id: v.id, version: v.version }, error: null }; },
  attach_record_copy: async (a, T) => { const v = T.record_versions.find(x => x.id === a.p_id); v.copy_html = a.p_html; v.copy_hash = await window.__sha(a.p_html); return { data: v.copy_hash, error: null }; },
  verify_record_version: async (a, T) => { const v = T.record_versions.find(x => x.id === a.p_id); return { data: { data_ok: !v.tampered, copy_ok: v.copy_html == null ? null : (await window.__sha(v.copy_html)) === v.copy_hash, data_hash: v.data_hash, copy_hash: v.copy_hash }, error: null }; },
  correct_signoff: (a, T) => { const r = T.signoff_records.find(x => x.id === a.p_id); if (!a.p_reason) return { data: null, error: { message: 'Give a reason for the correction' } };
    const nid = 'so-' + (T.signoff_records.length + 1); const n = { ...JSON.parse(JSON.stringify(r)), id: nid, answers: a.p_answers, version: (r.version || 1) + 1, supersedes: r.id, superseded_by: null, correction_reason: a.p_reason, created_at: new Date().toISOString() };
    r.superseded_by = nid; T.signoff_records.push(n);
    T.record_versions.push({ id: 'rv-s' + T.record_versions.length, kind: 'signoff', record_id: nid, chain_id: r.chain_id, person_id: r.person_id, version: n.version, data: JSON.parse(JSON.stringify(n)), data_hash: 'b'.repeat(64), copy_hash: null, reason: a.p_reason, created_at: new Date().toISOString() });
    return { data: nid, error: null }; } };"""
PLAN = {'overview': {'uid': 'uid-1', 'identifier': 'OP-2026-0501', 'operationName': 'Bridge Run', 'operationDate': '2026-11-20', 'rpaTypes': ['DJI Avata 2'], 'rpic': 'Test Pilot', 'location': 'Story Bridge'},
  'approval': {'crpName': 'Michael Rubio', 'rpName': 'Test Pilot', 'crpSigned': True, 'rpSigned': True, 'flightAuthApproved': True, 'approvedAt': '2026-11-05T01:00:00.000Z'}}
with sync_playwright() as p:
    b = p.chromium.launch()
    # ── job plan copies ──
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [{'id': 'jobs-1', 'plan_uid': 'uid-1', 'title': 'Bridge Run', 'status': 'approved', 'start_date': '2026-11-20'}], 'record_versions': []}, extra=RPC)
    pg.goto(URL); pg.wait_for_timeout(4000); pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, PLAN); pg.reload(); pg.wait_for_timeout(5000); open_draft(pg); pg.wait_for_timeout(1500)
    R.check('nothing kept before the approved plan is saved', len(pg.evaluate("window.__T.record_versions")) == 0)
    pg.evaluate(JS_INC, 'Authorisation'); pg.wait_for_timeout(600); pg.evaluate(JS_INC, 'Save Approved Plan'); pg.wait_for_timeout(5000)
    vs = pg.evaluate("(window.__T.record_versions || []).filter(v => v.kind === 'job')")
    R.check('approved job saved to the cloud keeps locked copy version 1', len(vs) == 1 and vs[0]['version'] == 1 and vs[0]['reason'] is None, [(v['version'], v['reason']) for v in vs])
    R.check('the copy is the full standard PDF of the plan', vs and 'Bridge Run' in (vs[0]['copy_html'] or '') and '<!--S:approval-->' in (vs[0]['copy_html'] or '') and len(vs[0]['copy_hash'] or '') == 64)
    R.check('the kept data is the plan as approved', vs and vs[0]['data']['plan'].get('approval', {}).get('approvedAt') == '2026-11-05T01:00:00.000Z')
    R.check('Authorisation shows the locked copies panel', pg.locator('[data-job-versions] [data-version="1"]').count() == 1)
    pg.locator('[data-version-verify="1"]').click(); pg.wait_for_timeout(800)
    R.check('Verify: unchanged', pg.get_attribute('[data-version-result]', 'data-version-result') == 'ok', pg.inner_text('[data-job-versions]')[:300])
    pg.evaluate(CAPTURE_PDF); pg.locator('[data-version-view="1"]').click(); pg.wait_for_timeout(500)
    R.check('Signed copy opens the kept PDF', len(pg.evaluate('window.__pdfs')) == 1 and 'Bridge Run' in pg.evaluate('window.__pdfs[0]'))
    # a copy altered behind the database's back is caught
    pg.evaluate("window.__T.record_versions[0].copy_html += '<!-- edited -->'")
    pg.locator('[data-version-verify="1"]').click(); pg.wait_for_timeout(800)
    R.check('Verify catches an altered copy', pg.get_attribute('[data-version-result]', 'data-version-result') == 'bad' and 'altered' in pg.inner_text('[data-version-result]'))
    pg.evaluate("window.__T.record_versions[0].copy_html = window.__T.record_versions[0].copy_html.replace('<!-- edited -->', '')")
    R.check('no page errors (job)', not errs, errs[:3])
    v1 = pg.evaluate("window.__T.record_versions[0]")
    pg.context.close()
    # the same job reopened: saving again without re-approving keeps no new copy; re-approval after an amendment is version 2
    SAVE = "(p) => window.dispatchEvent(new CustomEvent('wd-job-saved', { detail: { uid: 'uid-1', title: 'Bridge Run', status: 'approved', plan: p, crew: [] } }))"
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [{'id': 'jobs-1', 'plan_uid': 'uid-1', 'title': 'Bridge Run', 'status': 'approved', 'start_date': '2026-11-20'}], 'record_versions': [v1]}, extra=RPC)
    pg.goto(URL); pg.wait_for_timeout(4000); pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, PLAN); pg.reload(); pg.wait_for_timeout(5000); open_draft(pg); pg.wait_for_timeout(1500)
    pg.evaluate(SAVE, PLAN); pg.wait_for_timeout(2500)
    R.check('saving again without re-approval adds no copy', len(pg.evaluate("window.__T.record_versions.filter(v => v.kind === 'job')")) == 1)
    AM = json.loads(json.dumps(PLAN)); AM['approval'].update({'approvedAt': '2026-11-06T02:00:00.000Z', 'amendLog': [{'at': '2026-11-06T01:00:00.000Z', 'reason': 'Launch site moved west', 'approvedAt': '2026-11-05T01:00:00.000Z'}]})
    put_plan(pg, AM); pg.reload(); pg.wait_for_timeout(5000); open_draft(pg); pg.wait_for_timeout(1500)
    pg.evaluate(SAVE, AM); pg.wait_for_timeout(3000)
    vs = pg.evaluate("window.__T.record_versions.filter(v => v.kind === 'job')")
    R.check('re-approval after an amendment keeps version 2 with the reason', len(vs) == 2 and vs[1]['version'] == 2 and 'Launch site moved west' in (vs[1]['reason'] or ''), [(v['version'], v['reason']) for v in vs])
    pg.evaluate(JS_INC, 'Authorisation'); pg.wait_for_timeout(1000)
    R.check('both versions listed, the reason shown', pg.locator('[data-job-versions] [data-version]').count() == 2 and 'Launch site moved west' in pg.inner_text('[data-version-reason="2"]'))
    R.check('no page errors (re-approval)', not errs, errs[:3])
    pg.context.close()
    # ── a locked induction: copy made, then corrected as version 2 ──
    so = {'id': 'so-1', 'chain_id': 'so-1', 'version': 1, 'person_id': 'pp-p1', 'type': 'pilot_induction', 'status': 'certified', 'locked': True, 'created_at': '2026-10-30T01:00:00Z',
      'person_signed_at': '2026-10-29T01:00:00Z', 'crp_signed_at': '2026-10-30T01:00:00Z', 'person_signature': {'typed': 'Test Pilot', 'name': 'Test Pilot'}, 'crp_signature': {'typed': 'Michael Rubio'},
      'answers': {'types': ['DJI Avata 2'], 'declaration': True, 'confidentiality': True, 'licenceNotes': 'RePL 1234', 'crp': {'checkDate': '2026-10-30', 'competencies': ['induction'], 'notes': ''}},
      'people': {'user_id': 'u-p1', 'email': 'pilot@test.com', 'full_name': 'Test Pilot'}}
    rv = {'id': 'rv-s0', 'kind': 'signoff', 'record_id': 'so-1', 'chain_id': 'so-1', 'person_id': 'pp-p1', 'version': 1, 'data': {k: v for k, v in so.items() if k != 'people'}, 'data_hash': 'a' * 64, 'copy_hash': None, 'reason': None, 'created_at': '2026-10-30T01:00:00Z'}
    pg, errs, dl = ctx_for(b, 'crp', {'signoff_records': [so], 'record_versions': [rv]}, start='database', extra=RPC)
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.locator('[data-crew-review="pilot@test.com"]').first.scroll_into_view_if_needed(); pg.locator('[data-crew-review="pilot@test.com"]').first.click(); pg.wait_for_timeout(1500)
    R.check('the review shows the locked copies', pg.locator('[data-testid=ind-review] [data-versions=signoff] [data-version="1"]').count() == 1)
    v0 = pg.evaluate("window.__T.record_versions[0]")
    R.check("the CRP's planner makes the missing signed copy from the kept data", v0['copy_hash'] and 'RePL 1234' in v0['copy_html'] and 'Signed copy' in v0['copy_html'] and 'Test Pilot' in v0['copy_html'], (v0.get('copy_hash') or '')[:10])
    pg.click('[data-version-correct]'); pg.wait_for_timeout(400)
    R.check('correct dialog lists the fields', pg.locator('[data-correct-field="licenceNotes"]').count() == 1 and pg.locator('[data-correct-field="crp.checkDate"]').count() == 1)
    pg.fill('[data-correct-field="licenceNotes"]', 'RePL 12345'); pg.click('[data-correct-save]'); pg.wait_for_timeout(300)
    R.check('a reason is required', pg.locator('[data-correct-err]').count() == 1 and 'why' in pg.inner_text('[data-correct-err]').lower())
    pg.fill('[data-correct-reason]', 'RePL number typed wrong'); pg.click('[data-correct-save]'); pg.wait_for_timeout(2000)
    call = [c for c in pg.evaluate('window.__calls') if c.get('rpc') == 'correct_signoff']
    R.check('correction sent with only that field changed and the reason', call and call[-1]['args']['p_answers']['licenceNotes'] == 'RePL 12345' and call[-1]['args']['p_answers']['crp']['checkDate'] == '2026-10-30' and call[-1]['args']['p_reason'] == 'RePL number typed wrong')
    R.check('the review now shows version 2 with its reason', 'RePL number typed wrong' in pg.inner_text('[data-testid=ind-correction]') and pg.locator('[data-testid=ind-review] [data-version]').count() == 2)
    orig = pg.evaluate("window.__T.signoff_records.find(x => x.id === 'so-1')")
    R.check('the original is kept as it was', orig['answers']['licenceNotes'] == 'RePL 1234' and orig['superseded_by'])
    R.check('no page errors (induction)', not errs, errs[:3])
    pg.context.close(); b.close()
R.done()
