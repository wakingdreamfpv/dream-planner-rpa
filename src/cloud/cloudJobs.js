// Chunk 2b — cloud jobs. Runs inside the account panel (it has the signed-in client) and talks to the planner with
// window events, so the planner stays usable offline and in the single-file build.
//
// CRP:   'wd-job-saved'      → upsert the job + who is on it (job_crew)
//        'wd-cloud-publish'  → company / fleet / batteries / records snapshots + each person's logged hours
//        publishes window.wdCrewFlights (flights crew logged in the cloud) and window.wdAccessRequests
//        'wd-decide-access'  → grant / decline / revoke a request
// Crew:  publishes window.wdCrew = { company, jobs, hours, grants, shared, personId }
//        'wd-open-cloud-job' → fetches the job and sends 'wd-load-cloud-job' back to the planner
//        'wd-push-flights'   → saves the crew member's flights to the job ('wd-push-result' answers)
//        'wd-request-access' → asks the CRP for an area
import { useEffect, useRef } from 'react';

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
const publish = (key, value, ev) => { window[key] = value; window.dispatchEvent(new Event(ev)); };
const low = (s) => String(s || '').trim().toLowerCase();

// strip the bulky parts of a plan before it goes to the cloud (telemetry traces stay on the CRP's device)
export const slimPlan = (plan) => {
  try {
    const p = JSON.parse(JSON.stringify(plan || {}));
    Object.values((p.log && p.log.rpaLogs) || {}).forEach(rl => ((rl && rl.flights) || []).forEach(f => {
      if (f && f.telemetry) { delete f.telemetry.trace; delete f.telemetry.altRaw; delete f.telemetry.spdRaw; }
    }));
    delete p.siteAttachments; delete p.heatStrokes;
    return p;
  } catch (e) { return {}; }
};

export function useCloudJobs(sb, me) {
  const peopleRef = useRef([]);
  const lastPub = useRef('');
  const isCrp = !!(me && me.active && me.role === 'crp');
  const isCrew = !!(me && me.active && me.role && me.role !== 'crp');

  // ── CRP ──────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isCrp) { publish('wdCrewFlights', null, 'wd-crew-flights'); publish('wdAccessRequests', null, 'wd-access-requests'); return; }
    let dead = false;
    const loadPeople = async () => { const { data } = await sb.from('people').select('id,user_id,full_name,email,role,active'); peopleRef.current = data || []; return peopleRef.current; };
    const findPerson = (name, email) => {
      const ppl = peopleRef.current;
      return (email && ppl.find(p => low(p.email) === low(email))) || (name && ppl.find(p => low(p.full_name) === low(name))) || null;
    };
    const refreshInbox = async () => {
      try {
        const [{ data: fl }, { data: rq }] = await Promise.all([
          sb.from('job_flights').select('id,job_id,rpa,flight,created_at,person_id').order('created_at', { ascending: false }).limit(300),
          sb.from('access_grants').select('id,person_id,area,status,note,requested_at').order('requested_at', { ascending: false }),
        ]);
        if (dead) return;
        const ppl = peopleRef.current.length ? peopleRef.current : await loadPeople();
        const { data: jobs } = await sb.from('jobs').select('id,plan_uid,op_id,title,status,start_date,updated_at');
        publish('wdCloudJobs', jobs || [], 'wd-cloud-jobs');
        const jById = {}; (jobs || []).forEach(j => { jById[j.id] = j; });
        const name = (pid) => ((ppl.find(p => p.id === pid) || {}).full_name) || 'Crew member';
        publish('wdCrewFlights', (fl || []).map(f => ({ ...f, who: name(f.person_id), job: jById[f.job_id] || null })), 'wd-crew-flights');
        publish('wdAccessRequests', (rq || []).map(r => ({ ...r, who: name(r.person_id) })), 'wd-access-requests');
      } catch (e) { /* offline: try again later */ }
    };
    const onSaved = async (e) => {
      const d = e.detail || {}; if (!d.uid) return;
      try {
        await loadPeople();
        const row = { plan_uid: d.uid, op_id: d.opId || null, title: d.title || '', status: d.status || 'draft', start_date: d.startDate || null, end_date: d.endDate || d.startDate || null,
          plan: slimPlan(d.plan), updated_by: me.id, updated_at: new Date().toISOString() };
        const { data: job, error } = await sb.from('jobs').upsert(row, { onConflict: 'plan_uid' }).select('id').single();
        if (error || !job) throw error || new Error('no job');
        // who is on the job: the planner sends names (and emails when it knows them)
        const want = new Map();
        (d.crew || []).forEach(c => { const p = findPerson(c.name, c.email); if (!p) return; const cur = want.get(p.id); const rank = { rpic: 3, pilot: 2, observer: 1 };
          if (!cur || rank[c.role] > rank[cur]) want.set(p.id, c.role); });
        const { data: have } = await sb.from('job_crew').select('person_id,job_role').eq('job_id', job.id);
        const gone = (have || []).filter(h => !want.has(h.person_id));
        for (const g of gone) await sb.from('job_crew').delete().eq('job_id', job.id).eq('person_id', g.person_id);
        if (want.size) await sb.from('job_crew').upsert([...want].map(([person_id, job_role]) => ({ job_id: job.id, person_id, job_role })), { onConflict: 'job_id,person_id' });
        const unmatched = (d.crew || []).filter(c => !findPerson(c.name, c.email)).map(c => c.name);
        emit('wd-job-synced', { uid: d.uid, ok: true, jobId: job.id, crew: want.size, unmatched });
      } catch (err) { emit('wd-job-synced', { uid: d.uid, ok: false, error: String((err && err.message) || err) }); }
    };
    let pubTimer = null;
    const onPublish = (e) => {
      const d = e.detail || {}; clearTimeout(pubTimer);
      pubTimer = setTimeout(async () => {
        const sig = JSON.stringify(d); if (sig === lastPub.current) return; lastPub.current = sig;
        try {
          const now = new Date().toISOString();
          await sb.from('shared_data').upsert(['company', 'fleet', 'batteries', 'records'].filter(k => d[k] !== undefined).map(area => ({ area, data: d[area], updated_at: now })), { onConflict: 'area' });
          await loadPeople();
          const rows = [];
          (d.hours || []).forEach(h => { const p = findPerson(h.name, h.email); if (p) rows.push({ person_id: p.id, rpa_type: h.rpa || 'All', flights: h.flights || 0, seconds: Math.round(h.seconds || 0), last_flown: h.last ? new Date(h.last).toISOString() : null, updated_at: now }); });
          if (rows.length) await sb.from('pilot_hours').upsert(rows, { onConflict: 'person_id,rpa_type' });
        } catch (err) { lastPub.current = ''; }
      }, 2500);
    };
    // v7.5.6: open a job from the cloud on a device that doesn't have it saved
    const onFetch = async (e) => {
      const d = e.detail || {};
      try {
        const q = sb.from('jobs').select('id,plan_uid,op_id,title,status,plan');
        const { data, error } = await (d.id ? q.eq('id', d.id) : q.eq('plan_uid', d.uid)).single();
        if (error || !data) throw error || new Error('Job not found in the cloud');
        emit('wd-cloud-job-fetched', { req: d.req, job: { id: data.id, uid: data.plan_uid, opId: data.op_id, title: data.title, status: data.status }, plan: data.plan });
      } catch (err) { emit('wd-cloud-job-fetched', { req: d.req, error: String((err && err.message) || err) }); }
    };
    window.addEventListener('wd-fetch-cloud-job', onFetch);
    // v7.5.7: ask crew on a job to fill in the post-flight log (the notify function checks they're on the job and emails them)
    const onRequestLog = async (e) => {
      const d = e.detail || {};
      try {
        const { data: job, error } = await sb.from('jobs').select('id').eq('plan_uid', d.uid).single();
        if (error || !job) throw error || new Error('Job not in the cloud yet: save it first');
        const { data, error: fe } = await sb.functions.invoke('notify', { body: { event: 'log_request', job_id: job.id, emails: d.emails || [], note: d.note || '' } });
        if (fe || (data && data.error)) throw new Error((data && data.error) || fe.message);
        emit('wd-request-log-result', { ok: true, sent: (data && data.sent) || 0, skipped: (data && data.skipped) || [], message: data && data.message });
      } catch (err) { emit('wd-request-log-result', { ok: false, error: String((err && err.message) || err) }); }
    };
    window.addEventListener('wd-request-log', onRequestLog);
    const onDecide = async (e) => { const d = e.detail || {}; try { await sb.rpc('decide_access', { p_id: d.id, p_status: d.status }); } catch (err) {} refreshInbox(); };
    window.addEventListener('wd-job-saved', onSaved); window.addEventListener('wd-cloud-publish', onPublish); window.addEventListener('wd-decide-access', onDecide);
    window.addEventListener('wd-cloud-refresh', refreshInbox);
    loadPeople().then(refreshInbox); const iv = setInterval(refreshInbox, 60000);
    window.__wdCloudReady = true; window.dispatchEvent(new Event('wd-cloud-ready'));
    return () => { dead = true; clearInterval(iv); clearTimeout(pubTimer); window.removeEventListener('wd-job-saved', onSaved); window.removeEventListener('wd-cloud-publish', onPublish);
      window.removeEventListener('wd-decide-access', onDecide); window.removeEventListener('wd-fetch-cloud-job', onFetch); window.removeEventListener('wd-request-log', onRequestLog); window.removeEventListener('wd-cloud-refresh', refreshInbox); window.__wdCloudReady = false; };
  }, [sb, isCrp, me && me.id]); // eslint-disable-line

  // ── Crew ─────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isCrew) { publish('wdCrew', null, 'wd-crew'); return; }
    let dead = false, personId = null;
    const load = async () => {
      try {
        const { data: pe } = await sb.from('people').select('id,full_name,total_hours').eq('user_id', me.id).maybeSingle();
        personId = pe && pe.id;
        const [{ data: shared }, { data: jobs }, { data: roles }, { data: hours }, { data: grants }] = await Promise.all([
          sb.from('shared_data').select('area,data,updated_at'),
          sb.from('jobs').select('id,plan_uid,op_id,title,status,start_date,end_date,updated_at').order('start_date', { ascending: false }),
          sb.from('job_crew').select('job_id,job_role').eq('person_id', personId || '00000000-0000-0000-0000-000000000000'),
          sb.from('pilot_hours').select('rpa_type,flights,seconds,last_flown'),
          sb.from('access_grants').select('id,area,status,requested_at,decided_at'),
        ]);
        if (dead) return;
        const sh = {}; (shared || []).forEach(s => { sh[s.area] = s.data; });
        const role = {}; (roles || []).forEach(r => { role[r.job_id] = r.job_role; });
        publish('wdCrew', { personId, name: (pe && pe.full_name) || me.full_name || '', role: me.role, inductionHours: pe && pe.total_hours,
          company: sh.company || null, shared: sh, jobs: (jobs || []).map(j => ({ ...j, myRole: role[j.id] || null })), hours: hours || [], grants: grants || [] }, 'wd-crew');
      } catch (e) { /* offline */ }
    };
    const onOpen = async (e) => {
      const id = e.detail && e.detail.id; if (!id) return;
      const { data, error } = await sb.from('jobs').select('id,plan_uid,op_id,title,status,plan').eq('id', id).single();
      if (error || !data) { emit('wd-load-cloud-job', { error: (error && error.message) || 'Job not found' }); return; }
      emit('wd-load-cloud-job', { job: { id: data.id, uid: data.plan_uid, opId: data.op_id, title: data.title, status: data.status }, plan: data.plan });
    };
    const onPush = async (e) => {
      const d = e.detail || {};
      try {
        if (!personId) await load();
        const rows = (d.flights || []).map(f => ({ job_id: d.jobId, person_id: personId, rpa: f.rpa, flight: f.flight }));
        if (!rows.length) { emit('wd-push-result', { ok: true, sent: 0 }); return; }
        const { error } = await sb.from('job_flights').insert(rows);
        if (error) throw error;
        emit('wd-push-result', { ok: true, sent: rows.length, keys: (d.flights || []).map(f => f.key) });
      } catch (err) { emit('wd-push-result', { ok: false, error: String((err && err.message) || err) }); }
    };
    // v7.5.2: an RPIC signature on a company job goes to the CRP (stored with the job's crew entries) and emails them
    const onSign = async (e) => {
      const d = e.detail || {};
      try {
        if (!personId) await load();
        const { data, error } = await sb.from('job_flights').insert({ job_id: d.jobId, person_id: personId, rpa: null, flight: d.sig }).select('id').single();
        if (error) throw error;
        let emailed = false;
        try { const r = await sb.functions.invoke('notify', { body: { event: 'rpic_signed', flight_id: data.id } }); emailed = !!(r && r.data && r.data.sent); } catch (x) { /* the CRP still sees it in Awaiting action */ }
        emit('wd-signature-result', { ok: true, emailed });
      } catch (err) { emit('wd-signature-result', { ok: false, error: String((err && err.message) || err) }); }
    };
    window.addEventListener('wd-push-signature', onSign);
    const onRequest = async (e) => { const d = e.detail || {}; try { const { error } = await sb.rpc('request_access', { p_area: d.area, p_note: d.note || null }); if (error) throw error; } catch (err) { emit('wd-request-result', { ok: false, error: String(err.message || err) }); } load(); };
    window.addEventListener('wd-open-cloud-job', onOpen); window.addEventListener('wd-push-flights', onPush); window.addEventListener('wd-request-access', onRequest); window.addEventListener('wd-cloud-refresh', load);
    load(); const iv = setInterval(load, 90000);
    return () => { dead = true; clearInterval(iv); window.removeEventListener('wd-open-cloud-job', onOpen); window.removeEventListener('wd-push-flights', onPush);
      window.removeEventListener('wd-request-access', onRequest); window.removeEventListener('wd-cloud-refresh', load); window.removeEventListener('wd-push-signature', onSign); };
  }, [sb, isCrew, me && me.id]); // eslint-disable-line
}
