// v7.15 (Chunk 9): bring the old Google Forms registers into the planner. The CRP picks the CSV downloads
// (Form Responses 1 and 2 of the Pilot Register and the Observer Register F15), checks each record, then imports.
import React, { useState } from 'react';
import { getSupabase } from '../cloud/client.js';
import { buildRecords, toImportRows, kindLabel } from './formsImport.js';
import { compLabel } from './currency.js';

const fmtD = (d) => { if (!d) return '—'; const x = new Date(d.length === 10 ? d + 'T00:00:00' : d); return isNaN(x) ? String(d) : x.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); };
const addMonths = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setMonth(x.getMonth() + n); return x.toISOString().slice(0, 10); };

export default function RegisterImport({ fleetTypes = [], onDone, onClose }) {
  const [st, setSt] = useState(null); // { records, files, unknown }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const pick = async (e) => {
    const list = [...(e.target.files || [])]; e.target.value = '';
    if (!list.length) return;
    const files = await Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() })));
    setMsg(''); setSt(buildRecords(files, fleetTypes));
  };
  const upd = (id, patch) => setSt((s) => ({ ...s, records: s.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const updType = (id, i, patch) => setSt((s) => ({ ...s, records: s.records.map((r) => (r.id === id ? { ...r, types: r.types.map((t, j) => (j === i ? { ...t, ...patch } : t)) } : r)) }));
  const today = new Date().toISOString().slice(0, 10);
  const go = async () => {
    const rows = toImportRows(st.records);
    if (!rows.length) { setMsg('Tick at least one record to import.'); return; }
    if (rows.some((r) => r.certified && !r.certs.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.check_date)))) { setMsg('Each certified record needs a check date.'); return; }
    setBusy(true); setMsg('');
    try {
      const sb = getSupabase();
      const { data, error } = await sb.rpc('import_register', { p_rows: rows });
      if (error) throw error;
      const d = data || {};
      setMsg(`Imported: ${d.signoffs || 0} sign-off${d.signoffs === 1 ? '' : 's'}, ${d.certifications || 0} certification${d.certifications === 1 ? '' : 's'}, ${d.people || 0} new ${d.people === 1 ? 'person' : 'people'}${d.skipped ? ` · ${d.skipped} already imported (left as they were)` : ''}.`);
      window.dispatchEvent(new Event('wd-currency-refresh')); window.dispatchEvent(new Event('wd-crew'));
      onDone && onDone();
    } catch (e) { setMsg('Not imported: ' + ((e && e.message) || e) + (/function|does not exist/i.test(String(e && e.message)) ? ' (run the Supabase migration 0009)' : '')); }
    setBusy(false);
  };
  const sel = 'px-2 py-1 border border-slate-300 rounded-md text-xs bg-white';
  const n = st ? st.records.filter((r) => r.include && !r.orphan).length : 0;

  return (
    <div className="border border-violet-200 bg-violet-50/60 rounded-xl p-3 space-y-3" data-gf-import="1">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm text-violet-900"><i className="fa-brands fa-google mr-1"></i>Import the Google Forms registers</b>
        <button type="button" onClick={onClose} className="ml-auto text-xs underline">Close</button>
      </div>
      <p className="text-xs text-slate-600">In each Google Sheet, File › Download › CSV, for both tabs (Form Responses 1 = the pilot / observer part, Form Responses 2 = your CRP part). Pick all the files at once. Parts 1 and 2 are matched by name. Nothing is saved until you press Import.</p>
      <label className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-md bg-white border border-violet-300 cursor-pointer">
        <i className="fa-solid fa-file-csv"></i>Choose CSV files<input type="file" accept=".csv,text/csv" multiple className="hidden" data-gf-file="1" onChange={pick} />
      </label>
      {st && <div className="text-[11px] text-slate-600" data-gf-files="1">{st.files.map((f) => <div key={f.name}>✓ {kindLabel[f.kind]}: {f.rows} row{f.rows === 1 ? '' : 's'} <span className="text-slate-400">({f.name})</span></div>)}
        {st.unknown.map((u) => <div key={u} className="text-amber-800">? Not recognised as a register: {u}</div>)}</div>}
      {st && st.records.map((r) => {
        const due = r.checkDate ? addMonths(r.checkDate, 12) : '';
        const expired = due && due < today;
        return (
          <div key={r.id} className={`bg-white border rounded-lg p-3 space-y-2 ${r.include ? 'border-slate-200' : 'border-slate-200 opacity-60'}`} data-gf-rec={r.kind} data-gf-name={r.name}>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm font-bold"><input type="checkbox" checked={r.include} disabled={r.orphan} data-gf-include="1" onChange={(e) => upd(r.id, { include: e.target.checked })} />{r.name}</label>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{r.kind === 'pilot' ? 'Pilot induction' : 'EVLOS observer'}</span>
              {r.orphan ? <span className="text-[11px] text-amber-800" data-gf-orphan="1">Only the CRP part was found — download Form Responses 1 too.</span>
                : r.certified ? <span className="text-[11px] font-semibold text-emerald-800" data-gf-certified="1">Signed by {r.crpTyped || 'the CRP'} {fmtD(r.crpSignedAt)}</span>
                  : <span className="text-[11px] font-semibold text-amber-800" data-gf-awaiting="1">No CRP part yet — it will wait for you to certify</span>}
            </div>
            {!r.orphan && <>
              <div className="grid sm:grid-cols-3 gap-2 text-xs">
                <label className="font-semibold text-slate-600">{r.kind === 'pilot' ? 'Check date' : 'Trained / assessed on'}
                  <input type="date" value={r.checkDate} max={today} data-gf-date="1" onChange={(e) => upd(r.id, { checkDate: e.target.value })} className={sel + ' w-full mt-1'} />
                  {r.certified && due && <span className={`block mt-0.5 text-[11px] ${expired ? 'text-red-700 font-semibold' : 'text-slate-500'}`} data-gf-due="1">Due {fmtD(due)}{expired ? ' — already expired' : ''}</span>}
                </label>
                <div className="sm:col-span-2 text-[11px] text-slate-600 space-y-0.5">
                  <div>Signed by {r.personTyped || r.name} {fmtD(r.signedAt)}{r.job ? ` · ${r.job}` : ''}</div>
                  {r.person.email && <div>{r.person.email} · {r.person.phone} {r.person.arn ? `· ARN ${r.person.arn}` : ''}</div>}
                  {r.notes && <div className="text-slate-800" data-gf-notes="1"><b>CRP notes:</b> {r.notes}</div>}
                </div>
              </div>
              {r.certified && <div className="flex flex-wrap gap-1">{r.comps.map((c) => <span key={c} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-900">{compLabel(c)}</span>)}</div>}
              {r.kind === 'pilot' && r.types.length > 0 && <table className="w-full text-xs" data-gf-types="1">
                <thead className="text-[10px] uppercase text-slate-500"><tr><th className="text-left py-1">On the form</th><th className="text-left">Hours</th><th className="text-left">Assessed</th><th className="text-left">Planner aircraft type</th></tr></thead>
                <tbody>{r.types.map((t, i) => <tr key={i} className="border-t border-slate-100">
                  <td className="py-1 pr-2">{t.form}{t.hoursText && t.hoursText.split(' ').slice(0, -1).join(' ') !== t.form ? <span className="text-slate-400"> (“{t.hoursText}”)</span> : null}</td>
                  <td className="pr-2"><input type="number" min="0" step="0.1" value={t.hours == null ? '' : t.hours} onChange={(e) => updType(r.id, i, { hours: e.target.value === '' ? null : Number(e.target.value) })} className={sel + ' w-16'} /></td>
                  <td className="pr-2"><input type="checkbox" checked={!!t.assessed} disabled={!r.certified} onChange={(e) => updType(r.id, i, { assessed: e.target.checked })} /></td>
                  <td><select value={t.map} data-gf-map={i} onChange={(e) => updType(r.id, i, { map: e.target.value })} className={sel + ' max-w-[16rem]'}>
                    {[...new Set([...fleetTypes, t.form, t.map])].filter((x) => x && x !== '__skip').map((f) => <option key={f} value={f}>{fleetTypes.includes(f) ? f : f + ' (as written)'}</option>)}
                    <option value="__skip">Leave out</option></select></td>
                </tr>)}</tbody>
              </table>}
            </>}
          </div>);
      })}
      {st && st.records.length === 0 && <p className="text-xs text-amber-800">No register rows found in those files.</p>}
      {st && n > 0 && <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={go} data-gf-go="1" className="text-xs font-bold px-3 py-2 rounded-md bg-violet-700 text-white disabled:opacity-50"><i className="fa-solid fa-file-import mr-1"></i>{busy ? 'Importing…' : `Import ${n} record${n === 1 ? '' : 's'}`}</button>
        <span className="text-[11px] text-slate-500">Each becomes a locked sign-off with the typed signatures and original dates, marked “Imported from Google Forms”. Existing people are matched by email or name and keep their details. Importing the same rows again does nothing.</span>
      </div>}
      {msg && <p className={`text-xs ${/^Not|Tick|needs/.test(msg) ? 'text-red-700' : 'text-emerald-800'}`} data-gf-msg="1">{msg}</p>}
    </div>
  );
}
