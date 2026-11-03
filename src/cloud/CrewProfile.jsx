// v7.5.7: the CRP's view of one crew member — details, induction, certifications, logged time, access and the jobs they're on
import React, { useEffect, useState, useCallback } from 'react';
import { StatusPill } from './Induction.jsx';

const ROLE = { crp: 'CRP', pilot: 'Pilot', observer: 'Observer' };
const JOB_ROLE = { rpic: 'RPIC', pilot: 'Pilot', observer: 'Observer' };
const AREA = { fleet: 'Fleet management', batteries: 'Battery management', records: 'Job records', planning: 'Flight planning' };
const COMP = { induction: 'Induction', evlos: 'EVLOS', oonp: 'OONP', night: 'Night', evlos_observer: 'EVLOS observer' };
const fmtD = (d) => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? d : x.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); };
const fmtHM = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };

export default function CrewProfile({ sb, profile, onClose, onReview }) {
  const [st, setSt] = useState({ loading: true });
  const load = useCallback(async () => {
    try {
      const q = sb.from('people').select('*');
      const { data: person } = await (profile.id ? q.eq('user_id', profile.id) : q.eq('email', String(profile.email || '').toLowerCase())).maybeSingle();
      if (!person) { setSt({ loading: false, person: null }); return; }
      const [jc, hrs, gr, certs, ind] = await Promise.all([
        sb.from('job_crew').select('job_role, jobs:job_id (id, plan_uid, op_id, title, status, start_date)').eq('person_id', person.id),
        sb.from('pilot_hours').select('rpa_type, flights, seconds, last_flown').eq('person_id', person.id),
        sb.from('access_grants').select('id, area, status, note, requested_at').eq('person_id', person.id),
        sb.from('certifications').select('competency, check_date, next_due').eq('person_id', person.id).order('next_due'),
        sb.from('signoff_records').select('id, status, created_at, person_signed_at, crp_signed_at').eq('person_id', person.id).eq('type', 'pilot_induction').order('created_at', { ascending: false }),
      ]);
      const jobs = (jc.data || []).filter(r => r.jobs).map(r => ({ ...r.jobs, role: r.job_role })).sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
      setSt({ loading: false, person, jobs, hours: hrs.data || [], grants: gr.data || [], certs: certs.data || [], ind: (ind.data || [])[0] || null });
    } catch (e) { setSt({ loading: false, error: String(e.message || e) }); }
  }, [sb, profile.id, profile.email]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const decide = async (id, status) => { try { await sb.rpc('decide_access', { p_id: id, p_status: status }); } catch (e) {} window.dispatchEvent(new Event('wd-cloud-refresh')); load(); };
  const openJob = (j) => { window.dispatchEvent(new CustomEvent('wd-open-company-job', { detail: { id: j.id, uid: j.plan_uid, title: j.title } })); onClose(); };
  const p = st.person || {};
  const tot = (st.hours || []).reduce((t, h) => t + (h.seconds || 0), 0), fl = (st.hours || []).reduce((t, h) => t + (h.flights || 0), 0);
  const row = (k, v) => v ? <div className="flex gap-3 py-1 text-sm"><span className="w-32 shrink-0 text-slate-500">{k}</span><span className="text-slate-800 font-medium min-w-0 break-words">{v}</span></div> : null;
  const head = 'text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5';
  return (
    <div className="fixed inset-0 z-[4900] bg-slate-900/60 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" data-testid="crew-profile" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-2 overflow-hidden">
        <div className="px-5 py-4 text-white flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 60%,#4c1d95 100%)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest opacity-75">{ROLE[profile.role] || profile.role}{profile.active === false ? ' · deactivated' : ''}</div>
            <h3 className="text-xl font-bold truncate" data-profile-name="1">{profile.full_name || p.full_name || profile.email}</h3>
            <div className="text-sm opacity-80 truncate">{profile.email}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/80 hover:text-white text-2xl px-2"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="p-5 space-y-5">
          {st.loading && <p className="text-sm text-slate-500">Loading…</p>}
          {st.error && <p className="text-sm text-red-700">Couldn't load: {st.error}</p>}
          {!st.loading && !st.person && !st.error && <p className="text-sm text-slate-500">No crew record yet. It's created when they first sign in.</p>}
          {st.person && <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6" data-profile-details="1">
              <div>{row('ARN', p.arn)}{row('RePL', p.repl_no)}{row('Phone', p.phone)}{row('Address', p.address)}</div>
              <div>{row('Hours declared', p.total_hours != null ? p.total_hours + ' h' : '')}{row('Next of kin', [p.nok_name, p.nok_relationship, p.nok_phone].filter(Boolean).join(' · '))}{row('Medical expiry', fmtD(p.medical_expiry))}{row('Last engaged', fmtD(p.date_last_engaged))}</div>
            </div>
            {profile.role !== 'observer' && <div>
              <div className={head}>Induction & certifications</div>
              <div className="flex items-center gap-2 flex-wrap text-sm" data-profile-induction={st.ind ? st.ind.status : 'none'}>
                {st.ind ? <><StatusPill s={st.ind.status} /><span className="text-slate-500">{st.ind.crp_signed_at ? 'certified ' + fmtD(st.ind.crp_signed_at) : st.ind.person_signed_at ? 'submitted ' + fmtD(st.ind.person_signed_at) : ''}</span>
                  {onReview && st.ind.status !== 'draft' && <button type="button" onClick={() => onReview(st.ind.id)} className="text-xs px-2 py-1 rounded border border-slate-300 font-semibold">{st.ind.status === 'awaiting_crp' ? 'Review' : 'View'}</button>}</>
                  : <span className="text-slate-500">Induction not started.</span>}
              </div>
              {st.certs.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{st.certs.map((c, i) => { const due = c.next_due && Date.parse(c.next_due) < Date.now();
                return <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full border ${due ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{c.competency.startsWith('type:') ? c.competency.slice(5) : (COMP[c.competency] || c.competency)}{c.next_due ? ' · due ' + fmtD(c.next_due) : ''}</span>; })}</div>}
            </div>}
            <div>
              <div className={head}>Logged time with you</div>
              {st.hours.length ? <div data-profile-hours="1"><div className="text-sm mb-1"><b className="text-lg">{fmtHM(tot)}</b> <span className="text-slate-500">· {fl} flights</span></div>
                <div className="divide-y divide-slate-100 text-sm">{st.hours.map(h => <div key={h.rpa_type} className="flex gap-3 py-1"><span className="flex-1">{h.rpa_type}</span><span className="text-slate-500">{h.flights} fl</span><span className="w-20 text-right font-semibold">{fmtHM(h.seconds)}</span></div>)}</div></div>
                : <p className="text-sm text-slate-500">No completed flights yet.</p>}
            </div>
            <div>
              <div className={head}>Jobs ({st.jobs.length})</div>
              {st.jobs.length ? <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden" data-profile-jobs="1">{st.jobs.map(j => (
                <div key={j.id} className="flex items-center gap-3 px-3 py-2 text-sm" data-profile-job={j.id}>
                  <div className="flex-1 min-w-0"><div className="font-medium text-slate-800 truncate">{j.title || j.op_id}</div><div className="text-xs text-slate-500">{[fmtD(j.start_date), j.op_id, JOB_ROLE[j.role] || j.role].filter(Boolean).join(' · ')}</div></div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${j.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : j.status === 'completed' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-900'}`}>{j.status === 'approved' ? 'Approved' : j.status === 'completed' ? 'Completed' : 'Draft'}</span>
                  <button type="button" data-profile-open={j.id} onClick={() => openJob(j)} className="text-xs font-semibold text-violet-700 hover:underline">Open</button>
                </div>))}</div>
                : <p className="text-sm text-slate-500">Not on any jobs. Name them as RPIC, pilot or observer on a plan and save it.</p>}
            </div>
            <div>
              <div className={head}>Access to company areas</div>
              <div className="divide-y divide-slate-100 text-sm" data-profile-access="1">{Object.keys(AREA).map(a => { const g = (st.grants || []).find(x => x.area === a), s = g && g.status;
                return <div key={a} className="flex items-center gap-2 py-1.5"><span className="flex-1">{AREA[a]}{g && g.note ? <span className="text-xs text-slate-500"> · “{g.note}”</span> : null}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s === 'granted' ? 'bg-emerald-100 text-emerald-800' : s === 'requested' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500'}`}>{s === 'granted' ? 'Granted' : s === 'requested' ? 'Asked' : s === 'declined' ? 'Declined' : s === 'revoked' ? 'Revoked' : 'No access'}</span>
                  {g && s === 'requested' && <><button type="button" onClick={() => decide(g.id, 'granted')} className="text-xs font-semibold text-emerald-700">Grant</button><button type="button" onClick={() => decide(g.id, 'declined')} className="text-xs text-slate-500">Decline</button></>}
                  {g && s === 'granted' && <button type="button" onClick={() => decide(g.id, 'revoked')} className="text-xs text-rose-600">Revoke</button>}
                </div>; })}</div>
              <p className="text-[11px] text-slate-400 mt-1">Crew ask for access from their Home; you can grant it here or in Awaiting action.</p>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
