# v7.18: comments on each section + suggested edits (accept / decline), live plan links (client / crew), comments in PDF views,
# short per-job observer signatures (link + login) shown under the RPIC and in the PDF.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
PLAN = {'overview': {'uid': 'uid-1', 'identifier': 'OP-2026-0301', 'operationName': 'Bridge Shoot', 'operationDate': '2026-11-20', 'rpaTypes': ['DJI Mini 4 Pro'], 'rpic': 'Test Pilot', 'location': 'Story Bridge'},
  'approval': {'rpName': 'Test Pilot', 'crpName': 'Michael Rubio'}, 'jsa': {'operationTypes': ['VLOS', 'EVLOS'], 'maxOperatingHeightAgl': '200', 'evlosObserver': 'Obs One'},
  'risks': [{'refNo': '001', 'hazard': 'Wind', 'riskDescription': 'Gusts', 'existingControls': 'Limits', 'additionalControls': '', 'initL': '3', 'initC': 'C', 'resL': '1', 'resC': 'D', 'riskOwner': 'RPIC'}]}
T0 = '2026-11-05T01:00:00Z'
COMMENTS = [
  {'id': 'c1', 'job_id': 'jobs-1', 'link_id': 'L1', 'section': 'risks', 'body': 'Can you launch from the north side?', 'kind': 'comment', 'status': 'open', 'author_name': 'Sarah', 'author_role': 'client', 'created_at': T0},
  {'id': 'c2', 'job_id': 'jobs-1', 'section': 'jsa', 'body': 'Wind forecast is up', 'kind': 'suggestion', 'suggestion': {'path': 'jsa.maxOperatingHeightAgl', 'label': 'Max height (ft AGL)', 'to': '150'}, 'status': 'open', 'author_name': 'Test Pilot', 'author_role': 'pilot', 'created_at': T0},
  {'id': 'c3', 'job_id': 'jobs-1', 'section': 'risks', 'body': '', 'kind': 'suggestion', 'suggestion': {'kind': 'new_risk', 'risk': {'hazard': 'Bird strike', 'riskDescription': 'Magpies', 'controls': 'Watch and land'}}, 'status': 'open', 'author_name': 'Joel', 'author_role': 'crew-link', 'created_at': T0},
  {'id': 'c4', 'job_id': 'jobs-1', 'section': 'risks', 'body': 'More controls', 'kind': 'suggestion', 'suggestion': {'path': 'risks:001.additionalControls', 'label': 'Risk 001 · Additional controls', 'to': 'Wind meter on site'}, 'status': 'open', 'author_name': 'Joel', 'author_role': 'crew-link', 'created_at': T0},
  {'id': 'c5', 'job_id': 'jobs-1', 'section': 'overview', 'body': 'Start earlier', 'kind': 'suggestion', 'suggestion': {'path': 'overview.startTime', 'label': 'Start time', 'to': '07:00'}, 'status': 'open', 'author_name': 'Joel', 'author_role': 'crew-link', 'created_at': T0},
]
SIGS = [{'id': 's1', 'job_id': 'jobs-1', 'name': 'Obs One', 'kind': 'brief', 'declaration': 'I have been briefed for this job', 'signature': {'typed': 'Obs One'}, 'via': 'link', 'signed_at': T0},
        {'id': 's2', 'job_id': 'jobs-1', 'name': 'Obs One', 'kind': 'post_flight', 'declaration': 'Conducted as briefed', 'note': 'All good', 'signature': {'typed': 'Obs One'}, 'via': 'link', 'signed_at': T0}]
RPC = r"""window.__RPC = {
  create_plan_link: (a, T) => { (T.plan_links = T.plan_links || []).push({ id: 'L' + (T.plan_links.length + 2), job_id: a.p_job_id, audience: a.p_audience, label: a.p_label, email: a.p_email, view_id: a.p_view_id, view_name: a.p_view_name, snapshot: a.p_snapshot, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5 * 30).toISOString(), revoked: false });
    return { data: { id: 'Lnew', token: 'a'.repeat(64) }, error: null }; },
  plan_link_open: (a) => ({ data: window.__LINK || { error: 'nope' }, error: null }),
  plan_link_comment: (a) => { const L = window.__LINK; const c = { id: 'n' + Date.now(), section: a.p_section, body: a.p_body, kind: a.p_suggestion ? 'suggestion' : 'comment', suggestion: a.p_suggestion, status: 'open', author_name: a.p_name, author_role: L.audience === 'crew' ? 'crew-link' : 'client', created_at: new Date().toISOString(), parent_id: a.p_parent };
    L.comments = [...L.comments, c]; return { data: { id: c.id, comments: L.comments }, error: null }; },
  get_observer_form: () => ({ data: { job: { title: 'Bridge Shoot', start_date: '2026-11-20' }, company: 'Waking Dream FPV', overview: { location: 'Story Bridge', rpic: 'Test Pilot' }, jsa: {}, risks: [] }, error: null }),
  observer_link_status: (a) => ({ data: /0432/.test(a.p_phone) ? { current: true, due: '2027-09-01', signed: [] } : { current: false }, error: null }),
  sign_job_brief_link: () => ({ data: 'sig1', error: null }),
  my_observer_status: () => ({ data: { current: true, due: '2027-09-01' }, error: null }),
  sign_job_brief: (a, T) => { T.job_signatures.push({ id: 'sx', job_id: a.p_job_id, name: 'Obs One', kind: a.p_kind, signature: a.p_signature, signed_at: new Date().toISOString() }); return { data: 'sx', error: null }; },
};"""
with sync_playwright() as p:
    b = p.chromium.launch()
    # ── 1. CRP: comments panel, accept / decline, reply to the client ──
    seed = {'jobs': [{'id': 'jobs-1', 'plan_uid': 'uid-1', 'title': 'Bridge Shoot', 'status': 'draft', 'start_date': '2026-11-20'}], 'plan_comments': COMMENTS, 'job_signatures': SIGS,
            'plan_links': [{'id': 'L1', 'job_id': 'jobs-1', 'audience': 'client', 'label': 'Sarah', 'view_id': 'client', 'view_name': 'Client view', 'created_at': T0, 'expires_at': '2027-01-01T00:00:00Z', 'revoked': False}]}
    pg, errs, dl = ctx_for(b, 'crp', seed, extra=RPC)
    pg.goto(URL); pg.wait_for_timeout(4000)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(800)
    put_plan(pg, PLAN); pg.reload(); pg.wait_for_timeout(5000); open_draft(pg)
    n = pg.locator('[data-job-comments-n]')
    R.check('job bar: Comments with the open count, and Share', n.count() == 1 and n.get_attribute('data-job-comments-n') == '5' and pg.locator('[data-job-share]').count() == 1, n.count())
    pg.evaluate(JS_INC, 'Home'); pg.wait_for_timeout(800)
    aw = pg.inner_text('[data-widget=awaiting]') if pg.locator('[data-widget=awaiting]').count() else ''
    R.check('Awaiting action: comments and suggested edits on the job', '1 comment and 4 suggested edits on Bridge Shoot' in aw, aw[:300])
    pg.evaluate(JS_INC, 'JSA & Risk'); pg.wait_for_timeout(500)
    R.check('section chips with counts (risk register: 3)', pg.locator('[data-comment-chip=risks]').count() == 1 and '3' in pg.inner_text('[data-comment-chip=risks]'))
    pg.click('[data-comment-chip=risks]'); pg.wait_for_timeout(1000)
    R.check('panel opens on that section', pg.locator('[data-testid=comments-panel]').count() == 1 and pg.locator('[data-thread]').count() == 3)
    R.check('client thread marked private', 'private with the client' in pg.inner_text('[data-thread=c1]'))
    pg.click('[data-reply-open=c1]'); pg.fill('[data-reply-text=c1]', 'Yes, north side works.'); pg.click('[data-reply-send=c1]'); pg.wait_for_timeout(600)
    ins = [c for c in pg.evaluate('window.__calls') if c.get('t') == 'plan_comments' and c.get('op') == 'insert']
    R.check('CRP reply goes into the client thread', ins and ins[-1]['payload']['parent_id'] == 'c1' and ins[-1]['payload']['link_id'] == 'L1', ins[-1:])
    pg.click('[data-accept=c3]'); pg.wait_for_timeout(500)
    pg.click('[data-accept=c4]'); pg.wait_for_timeout(500)
    sg = pg.evaluate('window.__wdSignable()')
    R.check('accepting a new-risk suggestion adds the risk', any(r.get('hazard') == 'Bird strike' and r.get('existingControls') == 'Watch and land' for r in sg['risks']), [r.get('hazard') for r in sg['risks']])
    R.check('accepting a risk-field suggestion changes that risk', any(r.get('refNo') == '001' and r.get('additionalControls') == 'Wind meter on site' for r in sg['risks']))
    up = [c for c in pg.evaluate('window.__calls') if c.get('t') == 'plan_comments' and c.get('op') == 'update']
    R.check('accepted suggestions marked accepted by the CRP', len(up) >= 2 and up[-1]['payload']['status'] == 'accepted' and up[-1]['payload']['decided_by'] == 'Michael Rubio')
    pg.click('[data-filter=all]') if pg.locator('[data-filter=all]').count() else pg.evaluate(JS_INC, 'All')
    pg.wait_for_timeout(300)
    pg.evaluate(JS_INC, 'All'); pg.wait_for_timeout(300)
    R.check('suggestion shows the current value', 'Now: 200' in pg.inner_text('[data-thread=c2]'), pg.inner_text('[data-thread=c2]'))
    pg.click('[data-accept=c2]'); pg.wait_for_timeout(500)
    R.check('accepting a JSA field suggestion changes it', pg.evaluate('window.__wdSignable().jsa.maxOperatingHeightAgl') == '150')
    pg.click('[data-decline=c5]'); pg.wait_for_timeout(500)
    R.check('declined suggestion leaves the plan alone', pg.evaluate('window.__wdSignable().overview.startTime') != '07:00')
    R.check('told to save after applying', any('Save the job to keep it' in m for m in dl))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # ── 2. Share a live link ──
    pg.click('[data-job-share]'); pg.wait_for_timeout(800)
    R.check('share panel lists the existing link', pg.locator('[data-share-link=L1]').count() == 1)
    pg.fill('[data-share-label]', 'Dave (client)'); pg.fill('[data-share-email]', 'dave@client.com'); pg.click('[data-share-make]'); pg.wait_for_timeout(2500)
    calls = pg.evaluate('window.__calls')
    cr = [c for c in calls if c.get('rpc') == 'create_plan_link']
    snap = cr[-1]['args']['p_snapshot'] if cr else ''
    R.check('link made with the client view (live data, JSA left out)', cr and cr[-1]['args']['p_view_id'] == 'client' and '"risks"' in snap and '"jsa"' not in snap, cr and cr[-1]['args']['p_view_id'])
    snap = '<html><head></head><body><a data-wd-sec="overview"></a><h1>Plan</h1><a data-wd-sec="risks"></a><p>Risks</p><a data-wd-sec="jsa"></a><p>JSA</p><a data-wd-sec="map"></a><p>Map</p></body></html>'  # links made before v7.19 (a PDF copy)
    R.check('link shown with copy and QR', '#plan=' + 'a' * 64 in pg.input_value('[data-share-url]') and pg.locator('[data-share-made] svg').count() == 1)
    em = [c for c in calls if c.get('invoke') == 'notify' and (c.get('body') or {}).get('event') == 'plan_link']
    R.check('emailed to them', em and em[-1]['body']['email'] == 'dave@client.com' and em[-1]['body']['link'].endswith('a' * 64))
    pg.click('[data-testid=share-panel] button[aria-label=Close]'); pg.wait_for_timeout(300)
    # ── 3. PDF: comments in a view, not in the standard PDF; observer signatures ──
    pg.evaluate(CAPTURE_PDF); pg.evaluate(JS_INC, 'Export PDF'); pg.wait_for_timeout(2500)
    std = pg.evaluate('window.__pdfs')[-1]
    R.check('standard PDF: no comments section (unchanged)', 'Comments &amp; suggested edits' not in std and 'Comments & suggested edits' not in std)
    R.check('observer signatures under the RPIC and after the flight in the PDF', 'data-pdf-obs-sigs="brief"' in std and 'data-pdf-obs-sigs="post_flight"' in std and 'Obs One' in std)
    pg.click('[data-pdf-views-open]'); pg.wait_for_timeout(300); pg.click('[data-pdf-view=whs]'); pg.wait_for_timeout(2500)
    wh = pg.evaluate('window.__pdfs')[-1]
    R.check('WHS view prints the comments and suggestions', 'Comments &amp; suggested edits' in wh and 'Bird strike' in wh and 'north side' in wh, len(wh))
    pg.evaluate(JS_INC, 'Authorisation'); pg.wait_for_timeout(600)
    R.check('observer brief signatures shown under the RPIC', pg.locator('[data-obs-sigs=brief] [data-obs-sig="Obs One"]').count() == 1)
    R.check('no page errors (CRP)', not errs, errs[:3])
    pg.context.close()
    # ── 4. The live link page (no login) ──
    link = {'title': 'Bridge Shoot', 'company': 'Waking Dream FPV', 'audience': 'crew', 'view_name': 'WHS inspector', 'snapshot_at': T0, 'can_suggest': True,
            'snapshot': snap, 'comments': [{'id': 'k1', 'section': 'risks', 'body': 'Looks good', 'kind': 'comment', 'status': 'open', 'author_name': 'Michael Rubio', 'author_role': 'crp', 'created_at': T0}]}
    pg, errs, dl = ctx_for(b, 'anon', {}, extra=RPC + 'window.__LINK=' + json.dumps(link) + ';')
    pg.goto(URL + '#plan=' + 'a' * 64); pg.wait_for_timeout(4000)
    R.check('older links (a PDF copy) still open: the plan in a frame, title and view', pg.locator('[data-plan-link-app]').count() == 1 and pg.locator('[data-plan-frame]').count() == 1 and 'Bridge Shoot' in pg.inner_text('[data-plan-link-app]') and 'WHS INSPECTOR' in pg.inner_text('[data-plan-link-app]').upper())
    fr = pg.frame_locator('[data-plan-frame]')
    pg.wait_for_timeout(1500)
    nb = fr.locator('button[data-wd-btn]').count()
    R.check('comment buttons on each section inside the plan', nb >= 4, nb)
    fr.locator('button[data-wd-btn=risks]').click(); pg.wait_for_timeout(500)
    R.check('clicking one opens the comments on that section', pg.locator('[data-plan-comments]').count() == 1 and pg.input_value('[data-plan-section]') == 'risks' and 'Looks good' in pg.inner_text('[data-plan-comments]'))
    pg.fill('[data-plan-name]', 'Joel'); pg.fill('[data-composer-body]', 'Add birds please')
    pg.click('[data-suggest-open]'); pg.wait_for_timeout(200)
    R.check('crew link can suggest: add a risk', pg.locator('[data-suggest-kind=new_risk]').count() == 1)
    pg.click('[data-suggest-kind=new_risk]'); pg.fill('[data-suggest-hazard]', 'Birds'); pg.click('[data-composer-send]'); pg.wait_for_timeout(600)
    pc = [c for c in pg.evaluate('window.__calls') if c.get('rpc') == 'plan_link_comment']
    R.check('comment + suggestion sent with their name', pc and pc[-1]['args']['p_name'] == 'Joel' and pc[-1]['args']['p_section'] == 'risks' and pc[-1]['args']['p_suggestion']['risk']['hazard'] == 'Birds', pc[-1:])
    R.check('it appears in the thread', 'Add birds please' in pg.inner_text('[data-plan-comments]'))
    R.check('no page errors (link)', not errs, errs[:3])
    pg.context.close()
    link2 = dict(link, audience='client', can_suggest=False)
    pg, errs, dl = ctx_for(b, 'anon', {}, extra=RPC + 'window.__LINK=' + json.dumps(link2) + ';')
    pg.goto(URL + '#plan=' + 'b' * 64); pg.wait_for_timeout(3500)
    pg.click('[data-plan-comments-open]'); pg.wait_for_timeout(300)
    R.check("client link: comments but no suggested edits", pg.locator('[data-composer-body]').count() == 1 and pg.locator('[data-suggest-open]').count() == 0)
    pg.context.close()
    # ── 5. Observer link: trained observer signs the short job brief ──
    pg, errs, dl = ctx_for(b, 'anon', {}, extra=RPC)
    pg.goto(URL + '#observer=' + 'c' * 64); pg.wait_for_timeout(3500)
    R.check('observer link asks who they are first', pg.locator('[data-obs-who]').count() == 1)
    pg.fill('[data-obs-who-name]', 'Obs One'); pg.fill('[data-obs-who-phone]', '0432 785 806'); pg.click('[data-obs-who-go]'); pg.wait_for_timeout(800)
    R.check('trained observer gets the one-tick job brief (not the full sign-off)', pg.locator('[data-brief-part=brief]').count() == 1 and pg.locator('[data-obs-declaration]').count() == 0 and pg.locator('[data-testid=obs-declaration]').count() == 0)
    pg.check('[data-testid=brief-ok]'); pg.click('[data-testid=brief-sig] button:has-text("Type my name")') if pg.locator('[data-testid=brief-sig] button:has-text("Type my name")').count() else None
    pg.fill('[data-sig-typed]', 'Obs One'); pg.click('[data-brief-submit]'); pg.wait_for_timeout(800)
    sj = [c for c in pg.evaluate('window.__calls') if c.get('rpc') == 'sign_job_brief_link']
    R.check('brief signed on the link', sj and sj[-1]['args']['p_kind'] == 'brief' and pg.locator('[data-brief-done=brief]').count() == 1, sj[-1:])
    pg.context.close()
    pg, errs, dl = ctx_for(b, 'anon', {}, extra=RPC)
    pg.goto(URL + '#observer=' + 'd' * 64); pg.wait_for_timeout(3500)
    pg.fill('[data-obs-who-name]', 'New Person'); pg.fill('[data-obs-who-phone]', '0400 000 000'); pg.click('[data-obs-who-go]'); pg.wait_for_timeout(800)
    R.check('not trained yet: the full EVLOS observer sign-off, name filled in', pg.locator('[data-obs-part=link]').count() == 1 and pg.input_value('[data-obs-f=name]') == 'New Person')
    pg.context.close()
    # ── 6. Logged-in observer on the job ──
    job = {'id': 'jobs-1', 'plan_uid': 'uid-1', 'title': 'Bridge Shoot', 'status': 'draft', 'start_date': '2026-11-20', 'plan': PLAN}
    pg, errs, dl = ctx_for(b, 'observer', {'jobs': [job], 'job_crew': [{'job_id': 'jobs-1', 'person_id': 'pp-o1', 'job_role': 'observer'}], 'job_signatures': []}, 'home', extra=RPC)
    pg.goto(URL); pg.wait_for_timeout(5000)
    pg.click('[data-crew-open=jobs-1]'); pg.wait_for_timeout(2500)
    bar = pg.locator('[data-obs-crew-bar]')
    R.check('logged-in trained observer: "Sign for this job" (one tick)', bar.count() >= 1 and pg.locator('[data-brief-open=brief]').count() >= 1, bar.first.get_attribute('data-obs-crew-bar') if bar.count() else 'none')
    if pg.locator('[data-brief-open=brief]:visible').count():
        pg.locator('[data-brief-open=brief]:visible').first.click(); pg.wait_for_timeout(300)
        pg.check('[data-testid=brief-ok]'); pg.fill('[data-sig-typed]', 'Obs One') if pg.locator('[data-sig-typed]').count() else (pg.click('[data-testid=brief-sig] button:has-text("Type my name")'), pg.fill('[data-sig-typed]', 'Obs One'))
        pg.click('[data-brief-submit]'); pg.wait_for_timeout(1200)
        R.check('signed: then offered the post-flight sign', pg.locator('[data-brief-open=post_flight]').count() >= 1)
    pg.click('[data-job-comments]'); pg.wait_for_timeout(800)
    pg.fill('[data-composer-body]', 'Can I stand on the left?'); pg.click('[data-composer-send]'); pg.wait_for_timeout(600)
    ins = [c for c in pg.evaluate('window.__calls') if c.get('t') == 'plan_comments' and c.get('op') == 'insert']
    R.check('crew comment from the planner', ins and ins[-1]['payload']['body'] == 'Can I stand on the left?' and ins[-1]['payload']['job_id'] == 'jobs-1')
    R.check('no page errors (observer)', not errs, errs[:3])
    b.close()
R.done()
