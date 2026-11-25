# v7.57: HUD Studio 1.8. Beta badge and a feedback form (like the planner's) that sends to the Enquiries list and asks
# for Mike's email alert; Fighter has two photo cockpit views (Pilot seat / Over shoulder). Supabase is mocked by routing.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SB = 'jirvugtgclgdbysrfjsc.supabase.co'
with sync_playwright() as p:
    b = p.chromium.launch()
    calls = []; mode = {'v': 'ok'}
    def route(r):
        u = r.request.url
        if SB in u:
            calls.append((u, r.request.post_data, r.request.headers.get('apikey', '')))
            if mode['v'] == 'down': return r.abort()
            if 'submit_enquiry' in u:
                if mode['v'] == 'many': return r.fulfill(status=400, content_type='application/json', body='{"message":"enquiry: too many from this email"}')
                return r.fulfill(status=200, content_type='application/json', body='"11111111-2222-3333-4444-555555555555"')
            return r.fulfill(status=200, content_type='application/json', body='{"ok":true,"sent":1}')
        if u.startswith('http') and ('localhost:' + PORT) not in u: return r.abort()
        return r.continue_()
    ctx = b.new_context(viewport={'width': 1400, 'height': 950}); ctx.route('**/*', route)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + 'hud/'); pg.wait_for_timeout(1200)
    R.check('HUD Studio shows a BETA badge in the header', pg.evaluate("()=>{const t=document.getElementById('betaTag');return !!t && t.offsetParent!==null && t.textContent.trim()}") == 'BETA')
    R.check('the Feedback button sits next to the badge', pg.evaluate("()=>document.getElementById('betaTag').nextElementSibling.id") == 'betaFb')
    pg.click('#betaFb'); pg.wait_for_timeout(300)
    R.check('Feedback opens a form with bug / idea / general', pg.evaluate("()=>[...document.querySelectorAll('#fbDlg [data-fb-kind]')].map(b=>b.dataset.fbKind).join()") == 'bug,idea,general')
    pg.click('[data-fb-send]'); R.check('an empty message is caught', 'few words' in pg.inner_text('[data-fb-err]'))
    pg.fill('[data-fb=message]', 'The over-shoulder view is great'); pg.fill('[data-fb=name]', 'Test Pilot'); pg.fill('[data-fb=email]', 'nope'); pg.click('[data-fb-send]')
    R.check('a bad email is caught', 'email' in pg.inner_text('[data-fb-err]').lower()); R.check('nothing is sent before the form is valid', calls == [], calls)
    pg.click('[data-fb-kind=idea]'); pg.fill('[data-fb=email]', 'pilot@test.com'); pg.click('[data-fb-send]'); pg.wait_for_timeout(800)
    R.check('sending shows the thank-you', pg.locator('[data-fb-done]').count() == 1)
    rpc = [c for c in calls if 'rpc/submit_enquiry' in c[0]]; body = json.loads(rpc[0][1]) if rpc else {}
    R.check('it calls submit_enquiry with the publishable key', len(rpc) == 1 and rpc[0][2].startswith('sb_publishable_'), calls)
    R.check('source is feedback-idea and the message names HUD Studio, its version and the device',
            body.get('p_source') == 'feedback-idea' and body.get('p_message', '').startswith('[HUD Studio · Feature request]') and 'HUD Studio 1.8' in body.get('p_message', '') and body.get('p_consent') is True, body)
    R.check('it asks for Mike\'s email alert with the new id', any('functions/v1/enquiry-alert' in c[0] and '11111111-2222' in (c[1] or '') for c in calls), calls)
    pg.click('[data-fb-again]'); R.check('Send another keeps your name and email', pg.input_value('[data-fb=email]') == 'pilot@test.com' and pg.input_value('[data-fb=message]') == '')
    mode['v'] = 'down'; pg.fill('[data-fb=message]', 'second'); pg.click('[data-fb-send]'); pg.wait_for_timeout(800)
    R.check('with no signal it says so and offers an email to Mike instead', 'try again' in pg.inner_text('[data-fb-err]') and pg.locator('[data-fb-err] a[href^="mailto:mike@wakingdreamfpv.com"]').count() == 1)
    mode['v'] = 'many'; pg.click('[data-fb-send]'); pg.wait_for_timeout(800)
    R.check('the daily limit gets a friendly message', 'lot of reports' in pg.inner_text('[data-fb-err]'))
    pg.click('#fbDlg [data-fb-close]'); R.check('the form closes', pg.locator('#fbDlg').count() == 0)
    # Fighter: View switch with the cockpit on
    pg.evaluate("()=>{[...document.querySelectorAll('button')].find(x=>/sample flight/i.test(x.textContent)).click()}"); pg.wait_for_timeout(1500)
    pg.evaluate("()=>{document.querySelector('.sty[data-s=fighter]').click(); const c=document.getElementById('cockpit'); if(!c.checked) c.click();}"); pg.wait_for_timeout(400)
    R.check('Fighter + cockpit shows the View choice (Pilot seat / Over shoulder)', pg.evaluate("()=>getComputedStyle(document.getElementById('ckJetRow')).display") != 'none')
    pg.evaluate("()=>document.querySelector('#ckJetSeg button[data-v=shoulder]').click()"); pg.wait_for_timeout(600)
    R.check('Over shoulder is remembered', pg.evaluate("()=>JSON.parse(localStorage.getItem('wd_hud_opts')).ckJet") == 'shoulder')
    pg.evaluate("()=>document.querySelector('.sty[data-s=race]').click()"); pg.wait_for_timeout(300)
    R.check('other styles hide the View choice', pg.evaluate("()=>getComputedStyle(document.getElementById('ckJetRow')).display") == 'none')
    R.check('no page errors', errs == [], errs)
    ctx.close(); b.close()
R.done()
