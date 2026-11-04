// v7.11 (Chunk 7): registers for the CRP — induction, type, EVLOS, OONP, night and EVLOS observer — with currency
// worked out in the database (12 months, or 24 months with 3 flights in each 12-month period), and recurrent checks.
import React, { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../cloud/client.js';
import { compLabel, STATUS_LABEL } from './currency.js';

const TABS = [['all', 'All'], ['induction', 'Induction'], ['type', 'Type'], ['evlos', 'EVLOS'], ['oonp', 'OONP'], ['night', 'Night'], ['evlos_observer', 'EVLOS observers']];
const fmtD = (d) => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : x.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); };
const iso = (d) => (d ? String(d).slice(0, 10) : '');
const tone = (s) => s === 'current' ? 'bg-emerald-100 text-emerald-800' : s === 'due_soon' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800';
const RECENCY = (c) => ['evlos', 'oonp', 'night'].includes(c) || String(c).startsWith('type:');

export default function Registers({ fleetTypes = [], crpName = '' }) {
  const sb = getSupabase();
  const [st, setSt] = useState({ loading: true, rows: [], people: [], hours: [] });
  const [tab, setTab] = useState('all');
  const [issues, setIssues] = useState(false);
  const [q, setQ] = useState('');
  const [rec, setRec] = useState(null); // record-a-check form
  const [msg, setMsg] = useState('');
  const load = async () => {
    if (!sb) { setSt({ loading: false, rows: [], people: [], hours: [], error: 'Sign in to see the registers.' }); return; }
    try {
      const [{ data: rows, error }, { data: people }, { data: hours }] = await Promise.all([
        sb.rpc('crew_currency'), sb.from('people').select('id,full_name,email,role,active').order('full_name'), sb.from('pilot_hours').select('person_id,rpa_type,seconds')]);
      if (error) throw error;
      setSt({ loading: false, rows: rows || [], people: people || [], hours: hours || [] });
    } catch (e) { setSt({ loading: false, rows: [], people: [], hours: [], error: String((e && e.message) || e) }); }
  };
  useEffect(() => { load(); const h = () => load(); window.addEventListener('wd-currency', h); return () => window.removeEventListener('wd-currency', h); }, []); // eslint-disable-line

  const hrs = (pid) => st.hours.filter((h) => h.person_id === pid).reduce((t, h) => t + (Number(h.seconds) || 0), 0) / 3600;
  const rows = useMemo(() => st.rows.filter((r) => r.active !== false)
    .filter((r) => tab === 'all' || (tab === 'type' ? String(r.competency).startsWith('type:') : r.competency === tab))
    .filter((r) => !issues || r.status !== 'current')
    .filter((r) => !q.trim() || (r.full_name + ' ' + r.email + ' ' + compLabel(r.competency)).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)) || String(a.competency).localeCompare(String(b.competency))), [st.rows, tab, issues, q]);
  const counts = useMemo(() => { const c = { current: 0, due_soon: 0, expired: 0 }; st.rows.filter((r) => r.active !== false).forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; }); return c; }, [st.rows]);
  const noCerts = st.people.filter((p) => p.active !== false && p.role !== 'crp' && !st.rows.some((r) => r.person_id === p.id));

  const csv = () => {
    const head = ['Name', 'Email', 'Role', 'Competency', 'Checked', 'Assessor', 'Due', 'Status', 'Flights first 12 months', 'Flights last 12 months', 'Extended by flights', 'Logged hours'];
    const lines = [head, ...rows.map((r) => [r.full_name, r.email || '', r.role, compLabel(r.competency), iso(r.check_date), r.assessor || '', iso(r.due), STATUS_LABEL[r.status] || r.status,
      RECENCY(r.competency) ? r.flights_first : '', RECENCY(r.competency) ? r.flights_recent : '', r.extended ? 'yes' : '', hrs(r.person_id).toFixed(1)])];
    const text = lines.map((l) => l.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = 'Crew registers ' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };
  const comps = ['induction', 'evlos', 'oonp', 'night', 'evlos_observer', ...[...new Set([...fleetTypes, ...st.rows.map((r) => r.competency).filter((c) => String(c).startsWith('type:')).map((c) => c.slice(5))])].sort().map((t) => 'type:' + t)];
  const save = async () => {
    setMsg('');
    if (!rec.person || !rec.comp || !rec.date) { setMsg('Pick the person, what was checked and the date.'); return; }
    const { error } = await sb.rpc('record_check', { p_person: rec.person, p_competency: rec.comp, p_check_date: rec.date, p_assessor: rec.assessor || crpName || 'CRP', p_notes: rec.notes || null });
    if (error) { setMsg('Not saved: ' + error.message); return; }
    setRec(null); setMsg('Check recorded.'); window.dispatchEvent(new Event('wd-currency-refresh')); load();
  };
  const sel = 'px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white';

  return (
    <div className="space-y-3" data-registers="1">
      {st.error && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Couldn't load the registers: {st.error}{/function|does not exist/i.test(st.error) ? ' (run the Supabase migration 0008)' : ''}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800" data-reg-count="current">{counts.current || 0} current</span>
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900" data-reg-count="due_soon">{counts.due_soon || 0} due within 60 days</span>
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-800" data-reg-count="expired">{counts.expired || 0} expired</span>
        <div className="ml-auto flex gap-2">
          <button type="button" data-reg-record="1" onClick={() => setRec({ person: '', comp: 'evlos', date: new Date().toISOString().slice(0, 10), assessor: crpName })} className="text-xs font-semibold px-3 py-1.5 rounded-md bg-violet-700 text-white"><i className="fa-solid fa-plus mr-1"></i>Record a check</button>
          <button type="button" onClick={csv} className="text-xs font-semibold px-3 py-1.5 rounded-md border border-slate-300 bg-white"><i className="fa-solid fa-file-csv mr-1"></i>CSV</button>
        </div>
      </div>
      {msg && <p className="text-xs text-emerald-800" data-reg-msg="1">{msg}</p>}
      {rec && <div className="border border-violet-200 bg-violet-50 rounded-xl p-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end" data-reg-form="1">
        <label className="text-xs font-semibold text-slate-600">Person<select className={sel + ' w-full mt-1'} value={rec.person} onChange={(e) => setRec({ ...rec, person: e.target.value })}><option value="">Choose…</option>{st.people.filter((p) => p.active !== false).map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Checked<select className={sel + ' w-full mt-1'} value={rec.comp} onChange={(e) => setRec({ ...rec, comp: e.target.value })}>{comps.map((c) => <option key={c} value={c}>{c.startsWith('type:') ? 'Type: ' + c.slice(5) : compLabel(c)}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Date of the check<input type="date" className={sel + ' w-full mt-1'} value={rec.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setRec({ ...rec, date: e.target.value })} /></label>
        <label className="text-xs font-semibold text-slate-600">Assessor<input className={sel + ' w-full mt-1'} value={rec.assessor} onChange={(e) => setRec({ ...rec, assessor: e.target.value })} /></label>
        <div className="flex gap-2"><button type="button" data-reg-save="1" onClick={save} className="text-xs font-bold px-3 py-2 rounded-md bg-violet-700 text-white">Save</button><button type="button" onClick={() => setRec(null)} className="text-xs underline">Cancel</button></div>
        <p className="sm:col-span-2 lg:col-span-5 text-[11px] text-slate-500">Recorded checks are due again in 12 months, or up to 24 months while the person flies 3 flights of that kind in each 12-month period.</p>
      </div>}
      <div className="flex flex-wrap items-center gap-1">
        {TABS.map(([k, l]) => <button key={k} type="button" data-reg-tab={k} onClick={() => setTab(k)} className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${tab === k ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-slate-200 text-slate-600'}`}>{l}</button>)}
        <label className="ml-2 text-xs flex items-center gap-1"><input type="checkbox" checked={issues} onChange={(e) => setIssues(e.target.checked)} />Only due / expired</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search the registers" className="ml-auto px-2 py-1 border border-slate-300 rounded-md text-xs" />
      </div>
      {st.loading ? <p className="text-sm text-slate-500">Loading…</p> :
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm" data-reg-table="1">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr>{['Person', 'Competency', 'Checked', 'Due', 'Status', 'Flights (yr 1 / last 12 mo)', 'Hours logged'].map((h) => <th key={h} className="text-left px-3 py-2">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-slate-500 text-sm">Nothing here yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.cert_id} data-reg-row={r.status}>
                  <td className="px-3 py-2"><b>{r.full_name}</b><div className="text-[11px] text-slate-500">{r.role}</div></td>
                  <td className="px-3 py-2">{compLabel(r.competency)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtD(r.check_date)}<div className="text-[11px] text-slate-500">{r.assessor || ''}</div></td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.due ? fmtD(r.due) : 'No expiry'}{r.extended && r.status !== 'expired' ? <div className="text-[11px] text-emerald-700">extended by recent flights</div> : null}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tone(r.status)}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
                  <td className="px-3 py-2">{RECENCY(r.competency) ? <span className={r.flights_recent >= 3 ? '' : 'text-slate-500'}>{r.flights_first} / {r.flights_recent}</span> : '—'}</td>
                  <td className="px-3 py-2">{hrs(r.person_id).toFixed(1)} h</td>
                </tr>))}
            </tbody>
          </table>
        </div>}
      {noCerts.length > 0 && <p className="text-xs text-slate-600" data-reg-nocerts="1"><b>No certifications yet:</b> {noCerts.map((p) => p.full_name).join(', ')}. Ask pilots to complete their induction, train and assess observers in EVLOS observers, or record a check.</p>}
      <p className="text-[11px] text-slate-500">Flights count automatically from completed jobs (the pilot who flew, the aircraft type, and EVLOS / OONP / night from the JSA). OONP also needs 10+ hours on type, checked on each job.</p>
    </div>
  );
}
