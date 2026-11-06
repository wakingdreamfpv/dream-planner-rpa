# v7.23: the airspace check (OpenAIP) says what actually went wrong: a refused Client ID vs OpenAIP unreachable,
# instead of "Failed to fetch" for both.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
CORS = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
def run(b, mode):
    pg, errs, dl = ctx_for(b, 'crp', extra="localStorage.setItem('openAipKey','test-key-123');")
    def h(route):
        u = route.request.url; hdr = route.request.headers
        if mode == 'down': return route.abort()
        if mode == 'badkey':
            if 'apiKey=' in u: return route.fulfill(status=401, headers=CORS, body='{"message":"Unauthorized"}')
            return route.abort()  # the header retries are blocked by the browser's permission check
        return route.fulfill(status=200, headers=CORS, body='{"items":[]}')
    pg.route('https://api.core.openaip.net/**', h)
    pg.goto(URL); pg.wait_for_timeout(4500)
    pg.evaluate(JS_INC, 'JSA & Risk'); pg.wait_for_timeout(700)
    pg.evaluate("""()=>{const l=document.querySelector('[data-req-anchor=airspace]'); const b=l && l.parentElement.querySelector('button'); if(b) b.click(); return !!b}""")
    pg.wait_for_timeout(2500)
    out = list(dl); pg.context.close(); return out, errs
with sync_playwright() as p:
    b = p.chromium.launch()
    dl, errs = run(b, 'badkey')
    R.check('wrong key: says the Client ID was refused (not "Failed to fetch")', any('refused the Client ID (401)' in d for d in dl) and not any('Failed to fetch' in d for d in dl), dl)
    dl, errs = run(b, 'down')
    R.check('OpenAIP unreachable: says it couldn\'t connect, and what to try', any("couldn't connect to api.core.openaip.net" in d and 'private window' in d for d in dl), dl)
    dl, errs = run(b, 'ok')
    R.check('working key: no error', not any('Airspace check' in d for d in dl), dl)
    R.check('no page errors', not errs, errs[:3])
    b.close()
R.done()
