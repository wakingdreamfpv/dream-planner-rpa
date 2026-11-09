# v7.30: "Get it for your company": the free planner's form (checks, sends through submit_enquiry, email fallback when
# offline), opened from the free bar, the free welcome and the dashboard; the CRP's Enquiries list in Settings (mark, CSV)
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
with sync_playwright() as p:
    b = p.chromium.launch()
    # A visitor (not signed in), welcome already seen
    pg, errs, dl = ctx_for(b, 'anon', None, 'home', "localStorage.setItem('wd_free_intro','1');")
    pg.goto(URL); pg.wait_for_timeout(5000)
    R.check('free bar has "Get it for your company"', pg.locator('[data-free-bar-enquiry]').count() == 1)
    R.check('free dashboard links to it too', pg.locator('[data-dash-enquiry]').count() == 1)
    pg.click('[data-free-bar-enquiry]'); pg.wait_for_timeout(400)
    R.check('the form opens', pg.locator('[data-enquiry-form]').count() == 1)
    pg.click('[data-enquiry-send]'); pg.wait_for_timeout(200)
    R.check('a name is needed', 'name' in pg.inner_text('[data-enquiry-err]'))
    pg.fill('[data-enquiry=name]', 'Sam Pilot'); pg.fill('[data-enquiry=email]', 'sam@'); pg.click('[data-enquiry-send]'); pg.wait_for_timeout(200)
    R.check('a proper email is needed', 'email' in pg.inner_text('[data-enquiry-err]'))
    pg.fill('[data-enquiry=email]', 'sam@example.com'); pg.click('[data-enquiry-send]'); pg.wait_for_timeout(200)
    R.check('the OK-to-contact tick is needed', 'tick' in pg.inner_text('[data-enquiry-err]'))
    tx = pg.inner_text('[data-testid=enquiry]')
    R.check('v7.33: in line with the plans (launch 10 January, free beta offered)', '10 January 2027' in tx and 'source licence' in tx and pg.locator('[data-enquiry-beta]').count() == 1)
    R.check('nothing sent yet', not [c for c in pg.evaluate('window.__calls') if c.get('rpc') == 'submit_enquiry'])
    pg.fill('[data-enquiry=company]', 'Sky Co'); pg.fill('[data-enquiry=phone]', '0400 000 000'); pg.check('[data-enquiry-interest=annual]')
    pg.fill('[data-enquiry=message]', 'Met you at the expo'); pg.check('[data-enquiry=consent]')
    # first try: no signal → offer email instead
    pg.evaluate("window.__RPC = { submit_enquiry: () => ({ data: null, error: { message: 'TypeError: Failed to fetch' } }) }")
    pg.click('[data-enquiry-send]'); pg.wait_for_timeout(500)
    href = pg.get_attribute('[data-enquiry-mailto]', 'href') if pg.locator('[data-enquiry-mailto]').count() else ''
    R.check('no signal: offers to email the details instead', href.startswith('mailto:mike@wakingdreamfpv.com') and 'Sam%20Pilot' in href and 'Sky%20Co' in href, href[:120])
    # then it works
    pg.evaluate("window.__RPC = { submit_enquiry: () => ({ data: 'enq-1', error: null }) }")
    pg.click('[data-enquiry-send]'); pg.wait_for_timeout(500)
    calls = [c for c in pg.evaluate('window.__calls') if c.get('rpc') == 'submit_enquiry']
    a = calls[-1]['args'] if calls else {}
    R.check('sends name, email, company, phone, interest, message, where from and consent', a.get('p_name') == 'Sam Pilot' and a.get('p_email') == 'sam@example.com' and a.get('p_company') == 'Sky Co'
            and a.get('p_phone') == '0400 000 000' and a.get('p_interest') == 'annual' and a.get('p_message') == 'Met you at the expo' and a.get('p_source') == 'free-banner' and a.get('p_consent') is True, a)
    inv = [c for c in pg.evaluate('window.__calls') if c.get('invoke') == 'enquiry-alert']
    R.check('v7.32: emails Mike about it (enquiry-alert, with the new id)', len(inv) == 1 and (inv[0].get('body') or {}).get('id') == 'enq-1', inv)
    R.check('thanks screen', pg.locator('[data-enquiry-done]').count() == 1 and 'Thanks, Sam' in pg.inner_text('[data-enquiry-done]'))
    pg.click('[data-enquiry-close]'); pg.wait_for_timeout(300)
    R.check('closes back to the planner', pg.locator('[data-testid=enquiry]').count() == 0)
    pg.click('[data-dash-enquiry]'); pg.wait_for_timeout(300)
    R.check('opens again empty from the dashboard', pg.locator('[data-enquiry-form]').count() == 1 and pg.input_value('[data-enquiry=name]') == '')
    R.check('visitor: no page errors', not errs, errs[:2])
    pg.context.close()
    # From the free welcome
    pg, errs, dl = ctx_for(b, 'anon')
    pg.goto(URL); pg.wait_for_timeout(5000)
    R.check('free welcome offers it', pg.locator('[data-free-enquiry]').count() == 1)
    pg.click('[data-free-enquiry]'); pg.wait_for_timeout(400)
    R.check('...and opens the form from there', pg.locator('[data-enquiry-form]').count() == 1 and pg.locator('[data-free-intro-close]').count() == 0)
    pg.context.close()
    # The CRP's list
    seed = {'crp_store': [{'key': 'settings', 'data': {'companyProfile': {'name': 'Test Co'}}, 'hash': 'h0'}],
            'enquiries': [{'id': 'e1', 'created_at': '2026-11-10T01:00:00Z', 'name': 'Sam Pilot', 'email': 'sam@example.com', 'company': 'Sky Co', 'phone': '0400 000 000', 'interest': 'founder', 'message': 'Met you at the expo, "keen"', 'source': 'free-banner', 'status': 'new'},
                          {'id': 'e2', 'created_at': '2026-11-10T02:00:00Z', 'name': 'Old Lead', 'email': 'old@example.com', 'interest': 'updates', 'source': 'free-welcome', 'status': 'closed'}]}
    pg, errs, dl = ctx_for(b, 'crp', seed, 'database')
    pg.goto(URL); pg.wait_for_timeout(5000)
    if not pg.locator('[data-enquiries]').count(): pg.evaluate(JS_INC, 'Settings'); pg.wait_for_timeout(1500)
    R.check('CRP: Settings has Enquiries', pg.locator('[data-enquiries]').count() == 1)
    R.check('CRP: shows open ones, hides closed', pg.locator('[data-enquiry-row=e1]').count() == 1 and pg.locator('[data-enquiry-row=e2]').count() == 0 and '2 in total' in pg.inner_text('[data-enquiries]'))
    pg.select_option('[data-enquiries-show]', 'all'); pg.wait_for_timeout(200)
    R.check('CRP: "All" shows closed ones too', pg.locator('[data-enquiry-row=e2]').count() == 1)
    pg.click('[data-enquiry-row=e1] [data-enquiry-mark=contacted]'); pg.wait_for_timeout(400)
    upd = [c for c in pg.evaluate('window.__calls') if c.get('t') == 'enquiries' and c.get('op') == 'update']
    R.check('CRP: mark contacted only changes the status', upd and upd[-1]['payload'] == {'status': 'contacted'} and 'contacted' in pg.inner_text('[data-enquiry-row=e1]').lower(), upd[-1:] )
    with pg.expect_download() as d: pg.click('[data-enquiries-csv]')
    csv = open(d.value.path(), encoding='utf-8-sig').read()
    R.check('CRP: CSV download', csv.startswith('Received,Name,Email') and 'Sam Pilot' in csv and '"Met you at the expo, ""keen"""' in csv and 'Founding member' in csv, csv[:200])
    R.check('CRP: no page errors', not errs, errs[:2])
    pg.context.close()
    # Crew don't get the Enquiries section
    pg, errs, dl = ctx_for(b, 'pilot', None, 'database')
    pg.goto(URL); pg.wait_for_timeout(5000)
    R.check('crew: no Enquiries section', pg.locator('[data-enquiries]').count() == 0 and pg.locator('[data-free-bar-enquiry]').count() == 0)
    pg.context.close()
    b.close()
R.done()
