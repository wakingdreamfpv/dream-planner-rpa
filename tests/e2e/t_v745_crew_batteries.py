# v7.45: one Crew list (pilots, observers and assessors as roles on one row per person, with login and sign-off
# status), one Batteries section (packs grouped by aircraft, add / move / remove, type per pack), and aircraft prior
# time entered as hours and minutes.
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
R = Run(); ensure_server()
SET_LOCAL = """(d)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{const x=g.result?JSON.parse(g.result):{};Object.assign(x,d);st.put(JSON.stringify(x),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})"""
LOCAL = {'pilots': [{'name': 'Test Pilot', 'arn': '111', 'email': 'pilot@test.com'}, {'name': 'Ben Local', 'arn': '222'}],
         'observers': ['Ben Local'], 'assessors': ['Michael Rubio'],
         'fleet': {'Pavo 20 Pro': {'weight': '.15', 'cells': '3', 'priorMinutes': '90'}, 'Cinelog 30': {'weight': '.3', 'cells': '4'}},
         'rpaBatteries': {'Pavo 20 Pro': ['3S-01']}, 'batteries': ['3S-01', '6S LiPo']}
db = lambda pg: get_db(pg) or {}
def open_fold(pg, fid):
    if pg.get_attribute(f'[data-dbfold="{fid}"]', 'data-open') != '1': pg.click(f'[data-fold-toggle="{fid}"]')
    pg.wait_for_timeout(500)
row = lambda name: f'[data-crew-person="{name}"]'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg, errs, dl = ctx_for(b, 'crp')
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate(SET_LOCAL, LOCAL); pg.reload(); pg.wait_for_timeout(8000)
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(1000)
    folds = pg.evaluate("()=>[...document.querySelectorAll('[data-dbfold]')].map(e=>e.dataset.dbfold)")
    R.check('the separate Assessors, Battery register and battery CSV sections are gone', not any(f in folds for f in ['dbsec-assessors', 'dbsec-battery-register', 'dbsec-battery-csv']) and 'dbsec-batteries' in folds, folds)
    open_fold(pg, 'dbsec-crew-users'); pg.wait_for_timeout(1500)
    names = pg.evaluate("()=>[...document.querySelectorAll('[data-crew-person]')].map(e=>e.dataset.crewPerson)")
    R.check('one row per person: a local pilot who is also an observer shows once', names.count('Ben Local') == 1 and names.count('Test Pilot') == 1, names)
    R.check('people with only an account record show too (Obs One)', 'Obs One' in names, names)
    on = lambda n: pg.evaluate("(n)=>[...document.querySelectorAll(`[data-crew-person=\"${n}\"] [data-crew-role]`)].filter(e=>e.dataset.on==='1').map(e=>e.dataset.crewRole)", n)
    R.check('roles are shown on the row (Ben: pilot and observer)', on('Ben Local') == ['pilot', 'observer'], on('Ben Local'))
    R.check('Michael Rubio is marked CRP and assessor', on('Michael Rubio') == ['assessor'] and 'CRP' in pg.inner_text(row('Michael Rubio')))
    R.check('login status per person: Test Pilot has a login, Ben has none', pg.get_attribute(row('Test Pilot') + ' [data-login]', 'data-login') == 'active'
            and pg.get_attribute(row('Ben Local') + ' [data-login]', 'data-login') == 'none')
    pg.click(row('Ben Local') + ' [data-crew-role="assessor"]'); pg.wait_for_timeout(700)
    R.check('ticking Assessor adds them to the job\'s assessor picker list', 'Ben Local' in db(pg).get('assessors', []), db(pg).get('assessors'))
    pg.click(row('Obs One') + ' [data-crew-role="pilot"]'); pg.wait_for_timeout(700)
    op = [x for x in db(pg).get('pilots', []) if x.get('name') == 'Obs One']
    R.check('ticking Pilot on an account-only person adds them to the pilot list with their email', len(op) == 1 and op[0].get('email') == 'obs@test.com', op)
    pg.click('[data-crew-add]'); pg.fill('[data-crew-f-name]', 'New Spotter'); pg.click('[data-crew-f-role="pilot"]'); pg.click('[data-crew-f-role="observer"]')
    pg.click('[data-crew-save]'); pg.wait_for_timeout(700)
    R.check('Add person (observer only) goes to the observer list, not pilots', 'New Spotter' in db(pg).get('observers', []) and not any(x.get('name') == 'New Spotter' for x in db(pg).get('pilots', [])))
    pg.click('[data-crew-add]'); pg.fill('[data-crew-f-name]', 'ben local'); pg.click('[data-crew-save]'); pg.wait_for_timeout(300)
    R.check('...a name already in the list is refused', 'already in the list' in pg.inner_text('[data-crew-msg]'))
    pg.click('[data-crew-edit="Ben Local"]'); pg.fill('[data-crew-f-arn]', '999'); pg.click('[data-crew-save]'); pg.wait_for_timeout(700)
    bl = [x for x in db(pg).get('pilots', []) if x.get('name') == 'Ben Local']
    R.check('Edit saves the ARN on the pilot record', len(bl) == 1 and bl[0].get('arn') == '999', bl)
    pg.click('[data-crew-remove="Ben Local"]'); pg.wait_for_timeout(700)
    d = db(pg)
    R.check('Remove takes them off all three lists', not any(x.get('name') == 'Ben Local' for x in d.get('pilots', [])) and 'Ben Local' not in d.get('observers', []) and 'Ben Local' not in d.get('assessors', []))

    # batteries
    open_fold(pg, 'dbsec-batteries'); pg.wait_for_timeout(500)
    R.check('a list item that is not on any aircraft is pointed out (6S LiPo)', '6S LiPo' in pg.inner_text('[data-batt-loose]'))
    pg.click('[data-batt-add]'); pg.select_option('[data-batt-f-rpa]', 'Cinelog 30'); pg.fill('[data-batt-f-names]', '6S-2200-17..20'); pg.fill('[data-batt-f-type]', '6S LiPo 2200')
    R.check('a range shows how many packs it makes', '4 packs' in pg.inner_text('[data-batt-preview]'))
    pg.click('[data-batt-save]'); pg.wait_for_timeout(700); d = db(pg)
    R.check('Add packs puts them on the aircraft with their type', d.get('rpaBatteries', {}).get('Cinelog 30') == ['6S-2200-17', '6S-2200-18', '6S-2200-19', '6S-2200-20']
            and d.get('batteryInfo', {}).get('6S-2200-18', {}).get('type') == '6S LiPo 2200', d.get('rpaBatteries'))
    groups = pg.evaluate("()=>[...document.querySelectorAll('[data-batt-group]')].map(e=>e.dataset.battGroup)")
    R.check('packs are grouped by aircraft, in fleet order, spares last', groups == ['Pavo 20 Pro', 'Cinelog 30', 'none'], groups)
    pg.select_option('[data-batt-rpa="3S-01"]', 'Cinelog 30'); pg.wait_for_timeout(600); d = db(pg)
    R.check('a pack can be moved to another aircraft', 'Pavo 20 Pro' not in d.get('rpaBatteries', {}) and '3S-01' in d['rpaBatteries']['Cinelog 30'], d.get('rpaBatteries'))
    pg.click('[data-batt-remove="6S LiPo"]'); pg.wait_for_timeout(600)
    R.check('an unused list item can be removed', '6S LiPo' not in db(pg).get('batteries', []))

    # prior time in hours and minutes
    open_fold(pg, 'dbsec-fleet'); pg.wait_for_timeout(500)
    R.check('prior time shows as 1 h 30 m (stored 90 minutes)', pg.input_value('[data-fleet-prior-h="Pavo 20 Pro"]') == '1' and pg.input_value('[data-fleet-prior-m="Pavo 20 Pro"]') == '30')
    pg.fill('[data-fleet-prior-h="Pavo 20 Pro"]', '766'); pg.wait_for_timeout(600)
    R.check('...typing hours keeps the minutes (766 h 30 m = 45990 min)', db(pg)['fleet']['Pavo 20 Pro'].get('priorMinutes') == '45990', db(pg)['fleet']['Pavo 20 Pro'].get('priorMinutes'))
    R.check('the fleet card links to its packs', 'battery pack' in pg.inner_text('[data-fleet-packs="Cinelog 30"]'))
    R.check('no page errors', not [e for e in errs if 'Warning' not in e], errs[:3])
    pg.context.close()
    b.close()
R.done()
