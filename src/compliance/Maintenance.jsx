// v7.44: maintenance log (Technical Log). Each entry: date, what kind, which aircraft and other equipment, what was
// done, the result and who did it. Kept with the company setup, so it syncs to every CRP device. Entries are only
// added; a correction is a new entry that says what it corrects.
import React, { useState } from 'react';

export const MAINT_KINDS = { maintenance: 'Scheduled maintenance', firmware: 'Firmware update', repair: 'Repair', inspection: 'Inspection', test: 'Test flight', other: 'Other' };
export const MAINT_RESULTS = { pass: 'Passed / serviceable', fail: 'Not serviceable', note: 'For the record' };
const fmtD = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : iso; };
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// the newest entry that mentions each aircraft
export const lastMaintenance = (log) => { const out = {}; (log || []).forEach(e => (e.aircraft || []).forEach(a => { if (!out[a] || String(e.date) > String(out[a].date)) out[a] = e; })); return out; };

export default function Maintenance({ log = [], fleet = [], by = '', onAdd }) {
  const blank = () => ({ date: todayIso(), kind: 'maintenance', aircraft: [], equipment: '', work: '', result: 'pass', by, corrects: '' });
  const [f, setF] = useState(null);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const rows = [...log].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .filter(e => !filter || (e.aircraft || []).includes(filter));
  const sel = 'px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white';
  const save = () => {
    setMsg('');
    if (!f.date || !f.work.trim() || (!f.aircraft.length && !f.equipment.trim())) { setMsg('Add the date, what was done, and at least one aircraft or piece of equipment.'); return; }
    if (f.date > todayIso()) { setMsg('The date can\'t be in the future.'); return; }
    const e = { id: 'mnt-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: f.date, kind: f.kind, aircraft: f.aircraft,
      equipment: f.equipment.split(',').map(s => s.trim()).filter(Boolean), work: f.work.trim(), result: f.result, by: f.by.trim(), createdAt: new Date().toISOString(), ...(f.corrects ? { corrects: f.corrects } : {}) };
    onAdd && onAdd(e); setF(null); setMsg('Entry added.');
  };
  const toggle = (a) => setF({ ...f, aircraft: f.aircraft.includes(a) ? f.aircraft.filter(x => x !== a) : [...f.aircraft, a] });
  return (
    <div className="space-y-3" data-maint="1">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-maint-new="1" onClick={() => { setF(blank()); setMsg(''); }} className="text-xs font-semibold px-3 py-1.5 rounded-md bg-violet-700 text-white"><i className="fa-solid fa-plus mr-1"></i>Add entry</button>
        <select aria-label="Show aircraft" className={sel + ' text-xs'} value={filter} onChange={(e) => setFilter(e.target.value)} data-maint-filter="1">
          <option value="">All aircraft and equipment</option>{fleet.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-xs text-slate-500 ml-auto">{log.length} entr{log.length === 1 ? 'y' : 'ies'}</span>
      </div>
      {msg && <p className="text-xs text-emerald-800" data-maint-msg="1">{msg}</p>}
      {f && <div className="border border-violet-200 bg-violet-50 rounded-xl p-3 space-y-2" data-maint-form="1">
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="text-xs font-semibold text-slate-600">Date<input type="date" max={todayIso()} className={sel + ' w-full mt-1'} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-maint-date="1" /></label>
          <label className="text-xs font-semibold text-slate-600">Kind<select className={sel + ' w-full mt-1'} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(MAINT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Result<select className={sel + ' w-full mt-1'} value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })} data-maint-result="1">{Object.entries(MAINT_RESULTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        <div className="text-xs font-semibold text-slate-600">Aircraft
          <div className="flex flex-wrap gap-1.5 mt-1">{fleet.map(a => <button type="button" key={a} data-maint-ac={a} onClick={() => toggle(a)}
            className={`text-xs px-2 py-1 rounded-full border ${f.aircraft.includes(a) ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>{a}</button>)}</div>
        </div>
        <label className="block text-xs font-semibold text-slate-600">Other equipment (comma separated: goggles, radio, batteries, control system…)<input className={sel + ' w-full mt-1'} value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })} data-maint-equip="1" /></label>
        <label className="block text-xs font-semibold text-slate-600">What was done<textarea rows={2} className={sel + ' w-full mt-1'} value={f.work} onChange={(e) => setF({ ...f, work: e.target.value })} data-maint-work="1" /></label>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-slate-600">Done by<input className={sel + ' w-full mt-1'} value={f.by} onChange={(e) => setF({ ...f, by: e.target.value })} /></label>
          <label className="text-xs font-semibold text-slate-600">Corrects an earlier entry (optional)<select className={sel + ' w-full mt-1'} value={f.corrects} onChange={(e) => setF({ ...f, corrects: e.target.value })}>
            <option value="">No</option>{rows.slice(0, 30).map(e => <option key={e.id} value={e.id}>{fmtD(e.date)} · {(e.aircraft || []).concat(e.equipment || []).join(', ')}</option>)}</select></label>
        </div>
        <div className="flex gap-2"><button type="button" data-maint-save="1" onClick={save} className="text-xs font-bold px-3 py-2 rounded-md bg-violet-700 text-white">Add to the log</button><button type="button" onClick={() => setF(null)} className="text-xs underline">Cancel</button></div>
      </div>}
      {rows.length === 0 ? <p className="text-sm text-slate-500">No maintenance recorded yet.</p> :
        <div className="overflow-x-auto border border-slate-200 rounded-xl"><table className="w-full text-sm" data-maint-table="1">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr>{['Date', 'Aircraft / equipment', 'What was done', 'Result', 'By'].map(h => <th key={h} className="text-left px-3 py-2">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map(e => (
            <tr key={e.id} data-maint-row={e.id}>
              <td className="px-3 py-2 whitespace-nowrap">{fmtD(e.date)}<div className="text-[11px] text-slate-500">{MAINT_KINDS[e.kind] || e.kind}</div></td>
              <td className="px-3 py-2">{(e.aircraft || []).join(', ')}{(e.equipment || []).length ? <div className="text-[11px] text-slate-500">{e.equipment.join(', ')}</div> : null}</td>
              <td className="px-3 py-2">{e.work}{e.corrects && <div className="text-[11px] text-amber-800">Corrects the entry of {fmtD((log.find(x => x.id === e.corrects) || {}).date)}</div>}</td>
              <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.result === 'pass' ? 'bg-emerald-100 text-emerald-800' : e.result === 'fail' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>{MAINT_RESULTS[e.result] || e.result}</span></td>
              <td className="px-3 py-2 text-xs">{e.by}</td>
            </tr>))}</tbody>
        </table></div>}
      <p className="text-[11px] text-slate-500">Your Technical Log (ops manual 3.1 / 3.5). Entries can't be edited or removed: to fix one, add a new entry that corrects it.</p>
    </div>
  );
}
