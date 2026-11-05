# v7.22: a new crew member's first visit. One welcome card (company, who invited them, optional password, next step),
# observers see their EVLOS sign-off status, the welcome is remembered on their account, and the CRP / a returning
# person still gets the plain "Set your password" form. Also: the mandatory-items box sits at the bottom of each section.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
META = {'company': 'Waking Dream FPV', 'invited_by': 'Michael Rubio', 'role_label': 'observer'}
UNWELCOME = "['pilot@test.com','obs@test.com'].forEach(e=>localStorage.removeItem('wd_role_welcomed:'+e));localStorage.removeItem('wd_welcomed');"
def ctx(b, role, meta, obs=None, hash_=''):
    extra = UNWELCOME + 'window.__META=' + json.dumps(meta) + ';window.__RPC={my_observer_status:()=>({data:' + json.dumps(obs or {'current': False}) + ',error:null})};'
    pg, errs, dl = ctx_for(b, role, start='home', extra=extra)
    pg.goto(URL + hash_); pg.wait_for_timeout(5000); return pg, errs
upd = lambda pg: [c['args'] for c in pg.evaluate('window.__calls') if c.get('auth') == 'updateUser']
with sync_playwright() as p:
    b = p.chromium.launch()
    # ── an observer arriving from the invite email ──
    pg, errs = ctx(b, 'observer', META, hash_='#access_token=x&type=invite')
    R.check('one welcome card, no separate password pop-up', pg.locator('[data-testid=role-welcome]').count() == 1 and pg.locator('[data-testid=setpw-form]').count() == 0)
    R.check('names the company and who invited them', 'waking dream fpv' in pg.inner_text('[data-welcome-co]').lower() and 'Michael Rubio has invited you to fly with Waking Dream FPV as an observer' in pg.inner_text('[data-welcome-by]'))
    R.check('optional password in the same card', pg.locator('[data-welcome-pw]').count() == 1 and 'optional' in pg.inner_text('[data-welcome-pw]'))
    R.check('observer: EVLOS sign-off not done yet, what happens next', pg.get_attribute('[data-welcome-evlos]', 'data-welcome-evlos') == 'needed' and 'about 5 minutes' in pg.inner_text('[data-welcome-evlos]') and 'Michael' in pg.inner_text('[data-welcome-evlos]'))
    pg.fill('[data-welcome-pw-a]', 'short'); pg.fill('[data-welcome-pw-b]', 'short'); pg.click('[data-welcome-pw-save]'); pg.wait_for_timeout(300)
    R.check('password: too short is refused', pg.locator('[data-welcome-pw-err]').count() == 1 and not any('password' in u for u in upd(pg)))
    pg.fill('[data-welcome-pw-a]', 'longenough123'); pg.fill('[data-welcome-pw-b]', 'longenough123'); pg.click('[data-welcome-pw-save]'); pg.wait_for_timeout(500)
    R.check('password saved', pg.locator('[data-welcome-pw-saved]').count() == 1 and any(u.get('password') == 'longenough123' for u in upd(pg)))
    pg.click('[data-role-later]'); pg.wait_for_timeout(800)
    R.check('Go to the planner: card closes, remembered on the account', pg.locator('[data-testid=role-welcome]').count() == 0 and any((u.get('data') or {}).get('welcomed_at') for u in upd(pg)))
    R.check('no password pop-up afterwards', pg.locator('[data-testid=setpw-form]').count() == 0)
    R.check('no page errors (observer)', not errs, errs[:3])
    pg.context.close()
    # ── same observer on a new phone: no welcome again ──
    pg, errs = ctx(b, 'observer', {**META, 'welcomed_at': '2026-11-06T00:00:00Z'})
    R.check('new device: no welcome again (remembered on the account)', pg.locator('[data-testid=role-welcome]').count() == 0)
    pg.context.close()
    # ── an observer who is already current ──
    pg, errs = ctx(b, 'observer', META, obs={'current': True, 'due': '2027-10-30'})
    R.check('observer already signed off: shows current until the due date', pg.get_attribute('[data-welcome-evlos]', 'data-welcome-evlos') == 'current' and '30 Oct 2027' in pg.inner_text('[data-welcome-evlos]'))
    R.check('no password box without an invite link', pg.locator('[data-welcome-pw]').count() == 0)
    pg.context.close()
    # ── a pilot from the invite ──
    pg, errs = ctx(b, 'pilot', {**META, 'role_label': 'pilot'}, hash_='#access_token=x&type=invite')
    R.check('pilot: welcome with password and Start my induction', pg.locator('[data-welcome-pw]').count() == 1 and pg.locator('[data-role-induction]').count() == 1 and 'as a pilot' in pg.inner_text('[data-welcome-by]'))
    R.check('no page errors (pilot)', not errs, errs[:3])
    pg.context.close()
    # ── the invite link opened again after the welcome was seen: plain password form ──
    pg, errs = ctx(b, 'observer', {**META, 'welcomed_at': '2026-11-06T00:00:00Z'}, hash_='#access_token=x&type=invite')
    R.check('welcome already seen + invite link: the password form opens instead', pg.locator('[data-testid=setpw-form]').count() == 1 and pg.locator('[data-testid=role-welcome]').count() == 0)
    pg.context.close()
    # ── a CRP invite: plain password form as before ──
    pg, errs = ctx(b, 'crp', {}, hash_='#access_token=x&type=invite')
    R.check('CRP from an invite: the password form', pg.locator('[data-testid=setpw-form]').count() == 1 and pg.locator('[data-testid=role-welcome]').count() == 0)
    pg.context.close()
    # ── the mandatory-items box: bottom of each section, above Back / Next ──
    pg, errs, dl = ctx_for(b, None); pg.goto(URL); pg.wait_for_timeout(5000)
    for tab, label in [('preliminary', None), ('jsa', 'JSA & Risk'), ('approval', 'Authorisation'), ('log', 'Flight Log')]:
        if label: pg.evaluate(JS_INC, label); pg.wait_for_timeout(700)
        info = pg.evaluate("""(t)=>{const s=document.querySelector('[data-req-strip='+t+']'); if(!s||!s.offsetParent) return null;
          let card=s.parentElement; while(card && !card.querySelector('h2')) card=card.parentElement;
          const nav=[...card.querySelectorAll('button')].find(b=>/Next:|Back:/.test(b.innerText)&&b.offsetParent);
          const fields=[...card.querySelectorAll('input,textarea,select')].filter(e=>e.offsetParent && !s.contains(e) && !(nav && nav.parentElement.contains(e)));
          const last=fields[fields.length-1];
          return {fields: fields.length, afterAll: last ? !!(last.compareDocumentPosition(s) & 4) : null, beforeNav: nav ? !!(s.compareDocumentPosition(nav) & 4) : null}}""", tab)
        R.check(tab + ': mandatory box after every field, above Back / Next', info and info['fields'] > 0 and info['afterAll'] and info['beforeNav'], info)
    R.check('no page errors (sections)', not errs, errs[:3])

    # ── v7.22 fixes from the first real invites ──
    # the planner's reload after a first sign-in keeps the password step (the link's details are kept for this tab)
    pg, errs = ctx(b, 'observer', META, hash_='#access_token=x&type=invite')
    pg.goto(URL); pg.wait_for_timeout(5000)  # reload without the link's details in the address
    R.check('after the reload: welcome still offers the password', pg.locator('[data-testid=role-welcome] [data-welcome-pw]').count() == 1)
    pg.click('[data-role-later]'); pg.wait_for_timeout(500); pg.goto(URL); pg.wait_for_timeout(4000)
    R.check('once done, later visits ask for no password', pg.locator('[data-testid=setpw-form]').count() == 0 and pg.locator('[data-welcome-pw]').count() == 0)
    pg.context.close()
    # an expired / already-used link lands on the sign-in screen with an explanation and a fresh-link form
    pg, errs, dl = ctx_for(b, 'anon'); pg.goto(URL + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'); pg.wait_for_timeout(4500)
    R.check('expired link: plain explanation on the sign-in screen', pg.locator('[data-gate-link-error=otp_expired]').count() == 1 and 'expired or was already used' in pg.inner_text('[data-gate-link-error]'))
    pg.fill('[data-gate-link-email]', 'Joel@Example.com'); pg.click('[data-gate-link-send]'); pg.wait_for_timeout(600)
    otp = [c for c in pg.evaluate('window.__calls') if c.get('auth') == 'otp']
    R.check('fresh sign-in link sent (existing logins only)', otp and otp[-1]['args']['email'] == 'joel@example.com' and otp[-1]['args']['options']['shouldCreateUser'] is False and pg.locator('[data-gate-link-sent]').count() == 1)
    R.check('address bar cleaned', '#error' not in pg.url)
    pg.goto(URL); pg.wait_for_timeout(4000)
    R.check('normal sign-in screen: small "link not working" option', pg.locator('[data-gate-link-error]').count() == 0 and pg.locator('[data-gate-link-open]').count() == 1)
    pg.context.close()
    # the CRP sends a password reset / sign-in link to anyone with a login
    pg, errs, dl = ctx_for(b, 'crp', start='database'); pg.goto(URL); pg.wait_for_timeout(5000)
    if pg.locator('[data-testid=crew-admin-toggle]').count(): pg.locator('[data-testid=crew-admin-toggle]').first.click(); pg.wait_for_timeout(800)
    pg.locator('[data-crew-reset="pilot@test.com"]').first.click(); pg.wait_for_timeout(600)
    rs = [c for c in pg.evaluate('window.__calls') if c.get('auth') == 'reset']
    R.check('CRP: Reset password emails that person', rs and rs[-1]['email'] == 'pilot@test.com' and 'reset email sent to pilot@test.com' in pg.inner_text('[data-testid=invite-msg]').lower())
    pg.locator('[data-crew-link="obs@test.com"]').first.click(); pg.wait_for_timeout(600)
    ot = [c for c in pg.evaluate('window.__calls') if c.get('auth') == 'otp']
    R.check('CRP: Sign-in link emails that person', ot and ot[-1]['args']['email'] == 'obs@test.com')
    R.check('no reset buttons on your own row', pg.locator('[data-crew-reset="mike@wakingdreamfpv.com"]').count() == 0)
    pg.context.close()
    # ── an observer edits a company plan and saves: suggestions for the CRP, not a silent local change ──
    PLANC = {'overview': {'uid': 'uid-vg', 'identifier': 'OP-2026-0601', 'operationName': 'Veteran Games', 'location': 'Gold Coast Sports Centre', 'operationDate': '2026-11-21', 'taskOverview': 'Indoor FPV coverage'},
      'risks': [{'refNo': '001', 'hazard': 'Collision with athlete', 'riskDescription': 'Injury', 'existingControls': 'Prop guards', 'initL': '3', 'initC': 'B', 'resL': '2', 'resC': 'C', 'riskOwner': 'RPIC'}]}
    JOB = {'id': 'jobs-vg', 'plan_uid': 'uid-vg', 'title': 'Veteran Games', 'status': 'draft', 'start_date': '2026-11-21', 'plan': PLANC}
    pg, errs, dl = ctx_for(b, 'observer', {'jobs': [JOB], 'plan_comments': []}, start='preliminary', extra="window.__META={invited_by:'Michael Rubio',welcomed_at:'x'};")
    pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate("(p)=>window.dispatchEvent(new CustomEvent('wd-load-cloud-job',{detail:{job:{id:'jobs-vg',uid:'uid-vg',title:'Veteran Games',status:'draft'},plan:p}}))", PLANC); pg.wait_for_timeout(2000)
    pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(600)
    pg.fill('input[name=location]', 'Gold Coast Sports & Leisure Centre, Carrara'); pg.wait_for_timeout(200)
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(2500)
    cm = pg.evaluate("window.__T.plan_comments")
    R.check('observer save: the change becomes a suggestion for the CRP', len(cm) == 1 and cm[0]['kind'] == 'suggestion' and cm[0]['suggestion']['path'] == 'overview.location'
      and cm[0]['suggestion']['to'] == 'Gold Coast Sports & Leisure Centre, Carrara' and cm[0]['suggestion']['from'] == 'Gold Coast Sports Centre' and cm[0]['section'] == 'overview', cm)
    R.check('the CRP is emailed', any(c.get('invoke') == 'notify' and (c.get('body') or {}).get('event') == 'plan_suggestions' and c['body']['job_id'] == 'jobs-vg' for c in pg.evaluate('window.__calls')))
    R.check('the observer is told, and asked first', any('suggested change' in d for d in dl) and any('Only the Chief Remote Pilot can change a company plan' in d for d in dl), dl[-2:])
    R.check("the observer's copy goes back to the CRP's version", pg.input_value('input[name=location]') == 'Gold Coast Sports Centre')
    pg.evaluate(JS_INC, 'Save Draft'); pg.wait_for_timeout(1500)
    R.check('saving again with no plan changes sends nothing more', len(pg.evaluate("window.__T.plan_comments")) == 1)
    R.check('no page errors (observer suggestions)', not errs, errs[:3])
    pg.context.close()
    # ── the CRP opens the email link: the job opens with Comments, accepts the change ──
    sugg = {'id': 'pc-1', 'job_id': 'jobs-vg', 'section': 'overview', 'kind': 'suggestion', 'status': 'open', 'author_name': 'Obs One', 'author_role': 'observer', 'created_at': '2026-11-06T00:00:00Z',
      'body': 'Suggested change to Location', 'suggestion': {'path': 'overview.location', 'label': 'Location', 'from': 'Gold Coast Sports Centre', 'to': 'Carrara Sports Centre'}}
    pg, errs, dl = ctx_for(b, 'crp', {'jobs': [JOB], 'plan_comments': [sugg]}, start='home')
    pg.goto(URL + '#job-comments=jobs-vg'); pg.wait_for_timeout(7000)
    R.check('email link opens the job with its Comments', pg.locator('[data-testid=comments-panel]').count() == 1 and pg.locator('[data-accept="pc-1"]').count() == 1)
    pg.click('[data-accept="pc-1"]'); pg.wait_for_timeout(1000)
    R.check('accepting puts the change in the plan', pg.evaluate("window.__T.plan_comments[0].status") == 'accepted')
    pg.locator('[data-testid=comments-panel] button[aria-label=Close]').first.click(); pg.wait_for_timeout(500)
    pg.evaluate(JS_INC, 'Preliminary'); pg.wait_for_timeout(500)
    R.check('…and the plan shows it', pg.input_value('input[name=location]') == 'Carrara Sports Centre')
    R.check('no page errors (CRP review)', not errs, errs[:3])
    pg.context.close()
    b.close()
R.done()
