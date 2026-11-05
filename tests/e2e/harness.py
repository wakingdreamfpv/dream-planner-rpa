# Shared browser-test harness (kept in the repo from v7.17). Runs against `npx vite preview --port 4173 --outDir dist`
# with a mocked Supabase client (window.__WD_SUPABASE_MOCK__), so no network or real accounts are needed.
import json, os, re, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright

URL = 'http://localhost:4173/'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
JS_INC = "t=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim().includes(t)&&b.offsetParent);if(b)b.click();return !!b}"

MOCK = r"""
(() => {
  window.__WD_START_TAB = window.__WD_START_TAB === undefined ? 'preliminary' : window.__WD_START_TAB;
  try { if (!localStorage.getItem('wd_db_open')) localStorage.setItem('wd_db_open', '{"*":true}'); } catch (e) {}
  const role = localStorage.getItem('mock_role');
  const users = [
    {id:'u-crp',email:'mike@wakingdreamfpv.com',full_name:'Michael Rubio',role:'crp',active:true},
    {id:'u-p1',email:'pilot@test.com',full_name:'Test Pilot',role:'pilot',active:true},
    {id:'u-o1',email:'obs@test.com',full_name:'Obs One',role:'observer',active:true}];
  const me = role ? users.find(p=>p.role===role) : null;
  const session = me ? { user: { id: me.id, email: me.email, user_metadata: window.__META || {} } } : null;
  if (me) { try { localStorage.setItem('wd_auth_email', me.email); localStorage.setItem('wd_role:' + me.email, me.role); } catch (e) {} }
  const seed = window.__SEED || {};
  const T = { profiles: role==='crp' ? users : users.filter(u=>me&&u.id===me.id), invites: [],
    people: role==='crp' ? [{id:'pp-crp',user_id:'u-crp',full_name:'Michael Rubio',email:'mike@wakingdreamfpv.com',role:'crp',active:true},{id:'pp-p1',user_id:'u-p1',full_name:'Test Pilot',email:'pilot@test.com',role:'pilot',active:true},{id:'pp-o1',user_id:'u-o1',full_name:'Obs One',email:'obs@test.com',role:'observer',active:true}]
      : me ? [{id:'pp-'+me.id.slice(2),user_id:me.id,full_name:me.full_name,total_hours:42}] : [],
    jobs: [], job_crew: [], job_flights: [], access_grants: [], shared_data: [], pilot_hours: [], signoff_records: [], ...seed };
  window.__T = T; window.__calls = [];
  let n = 0;
  const q = (t) => { let filt = [], op = 'select', payload = null, conflict = null, one = 0;
    const exec = () => {
      T[t] = T[t] || [];
      const match = (r) => filt.every(([k, v]) => (v && v.in) ? v.in.includes(r[k]) : r[k] === v);
      if (op === 'select') { const out = T[t].filter(match); if (one) return { data: out[0] || null, error: (one===2 && !out[0]) ? {message:'not found'} : null }; return { data: out, error: null }; }
      window.__calls.push({ t, op, payload: JSON.parse(JSON.stringify(payload||null)), filt, conflict });
      if (op === 'delete') { T[t] = T[t].filter(r => !match(r)); return { data: null, error: null }; }
      if (op === 'update') { const rows = T[t].filter(match); rows.forEach(r => Object.assign(r, payload)); return { data: one ? rows[0] || null : rows, error: null }; }
      const list = Array.isArray(payload) ? payload : [payload]; const outRows = [];
      list.forEach(r => { const keys = conflict ? conflict.split(',') : null; const ex = keys ? T[t].find(x => keys.every(k => x[k] === r[k])) : null;
        if (ex) { Object.assign(ex, r); outRows.push(ex); } else { const nr = { id: r.id || (t + '-' + (++n)), created_at: new Date().toISOString(), ...r }; T[t].push(nr); outRows.push(nr); } });
      return { data: one ? outRows[0] : outRows, error: null };
    };
    const api = {
      select(){ return api }, order(){ return api }, limit(){ return api }, range(){ return api }, in(k, v){ filt.push([k, { in: v }]); return api },
      eq(k, v){ filt.push([k, v]); return api }, neq(){ return api }, is(){ return api }, gte(){ return api }, lte(){ return api },
      upsert(p, o){ op = 'upsert'; payload = p; conflict = o && o.onConflict; return api },
      insert(p){ op = 'insert'; payload = p; return api },
      delete(){ op = 'delete'; return api },
      update(p){ op = 'update'; payload = p; return api },
      maybeSingle(){ one = 1; return Promise.resolve(exec()) },
      single(){ one = 2; return Promise.resolve(exec()) },
      then(res, rej){ return Promise.resolve(exec()).then(res, rej) } };
    return api; };
  window.__WD_SUPABASE_MOCK__ = {
    auth: { getSession: async () => ({ data: { session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      signOut: async () => ({ error: null }),
      updateUser: async (u) => { window.__calls.push({ auth: 'updateUser', args: u }); if (session && u && u.data) session.user.user_metadata = { ...session.user.user_metadata, ...u.data }; return { data: { user: session && session.user }, error: null }; },
      resetPasswordForEmail: async (email, o) => { window.__calls.push({ auth: 'reset', email, o }); return { error: null }; },
      signInWithOtp: async (a) => { window.__calls.push({ auth: 'otp', args: a }); return { error: null }; }, signInWithPassword: async () => ({ error: null }) },
    from: q,
    rpc: async (fn, args) => { window.__calls.push({ rpc: fn, args });
      if (window.__RPC && window.__RPC[fn]) return window.__RPC[fn](args, T);
      return { data: null, error: null }; },
    functions: { invoke: async (name, o) => { window.__calls.push({ invoke: name, body: o && o.body });
      if (window.__INVOKE) { const r = window.__INVOKE(name, o && o.body, T); if (r) return r; }
      return { data: { ok: true, sent: 1 }, error: null }; } },
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'about:blank' } }), list: async () => ({ data: [] }) }) },
  };
})();
"""

def ensure_server():
    try: urllib.request.urlopen(URL, timeout=2); return
    except Exception: pass
    subprocess.Popen('npx vite preview --port 4173 --outDir dist', shell=True, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        time.sleep(0.5)
        try: urllib.request.urlopen(URL, timeout=2); return
        except Exception: pass

class Run:
    def __init__(self):
        self.res = []
    def check(self, n, ok, info=''):
        self.res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n + ('' if ok else '  ' + str(info)[:500]))
    def done(self):
        print(f"{sum(self.res)} / {len(self.res)}  fails={len(self.res) - sum(self.res)}")

def ctx_for(b, role, seed=None, start='preliminary', extra=''):
    ctx = b.new_context(viewport={'width': 1400, 'height': 950}, accept_downloads=True)
    ctx.route('**/*', lambda r: r.abort() if (r.request.url.startswith('http') and 'localhost:4173' not in r.request.url) else r.continue_())
    ctx.add_init_script("if(window.top===window){try{localStorage.setItem('wd_welcomed','1');['mike@wakingdreamfpv.com','pilot@test.com','obs@test.com'].forEach(e=>localStorage.setItem('wd_role_welcomed:'+e,'1'));%s}catch(e){};window.__SEED=%s;window.__WD_START_TAB='%s';%s}"
                        % ("localStorage.setItem('mock_role','%s')" % role if role else "localStorage.removeItem('mock_role')", json.dumps(seed or {}), start, extra))
    if role: ctx.add_init_script('if (window.top === window) {' + MOCK + '}')
    pg = ctx.new_page(); errs = []; dl = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: (dl.append(d.message), d.accept()))
    return pg, errs, dl

def put_plan(pg, plan):
    """Replace the first draft in IndexedDB with `plan` (call after Save Draft), then reload."""
    pg.evaluate("""(plan)=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const st=q.result.transaction('kv','readwrite').objectStore('kv');const g=st.get('rpas_database');g.onsuccess=()=>{if(!g.result){r(0);return}const d=JSON.parse(g.result);const dr=(d.draftPlans||[])[0];if(!dr){r(0);return}
      Object.keys(plan).forEach(k=>{ dr[k] = (typeof plan[k]==='object' && !Array.isArray(plan[k]) && dr[k] && typeof dr[k]==='object') ? Object.assign(dr[k], plan[k]) : plan[k]; });
      dr.id = (plan.overview||{}).identifier || dr.id; dr.title = (plan.overview||{}).operationName || dr.title; dr.savedAt = new Date().toISOString();
      st.put(JSON.stringify(d),'rpas_database');st.transaction.oncomplete=()=>r(1)}}})""", plan)

def get_db(pg):
    return pg.evaluate("""()=>new Promise(r=>{const q=indexedDB.open('wakingdream_planner',1);q.onsuccess=()=>{const g=q.result.transaction('kv').objectStore('kv').get('rpas_database');g.onsuccess=()=>r(g.result?JSON.parse(g.result):null)}})""")

def open_draft(pg):
    pg.evaluate(JS_INC, 'Database & Settings'); pg.wait_for_timeout(400); pg.evaluate(JS_INC, 'Resume'); pg.wait_for_timeout(2000)

CAPTURE_PDF = """()=>{window.__pdfs=[];window.open=function(){let b='';return {document:{open(){},write(h){b+=h},close(){window.__pdfs.push(b)}},focus(){},print(){}}};return 1}"""

def sign_dialog(pg, agree=True):
    pg.wait_for_timeout(300)
    if agree and pg.locator('[data-sig-agree]').count(): pg.check('[data-sig-agree]')
    if pg.locator('[data-sig-ok]').count(): pg.click('[data-sig-ok]')
    pg.wait_for_timeout(300)
