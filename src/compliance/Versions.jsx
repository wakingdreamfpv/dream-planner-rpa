// v7.21 (Chunk 5): locked copies. Every locked sign-off and every approved job plan has a copy kept by the database
// with a SHA-256 fingerprint. This panel lists the versions, opens the signed copy, verifies the fingerprints, and lets
// the CRP correct a sign-off (a new version with a reason; the original is kept).
import React, { useCallback, useEffect, useState } from 'react';
import { signoffCopyHtml } from './auditPack.js';

export async function sha256Hex(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t == null ? '' : t)));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const fmtDT = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const short = (h) => h ? h.slice(0, 8) + '…' + h.slice(-4) : '';

// the CRP makes the printable copy for any locked sign-off version that doesn't have one yet (from the kept data)
export async function ensureSignoffCopies(sb, company = '', only) {
  try {
    let q = sb.from('record_versions').select('id, version, data, data_hash, copy_hash, person_id, chain_id').eq('kind', 'signoff');
    if (only) q = q.eq('chain_id', only);
    const { data } = await q; const todo = (data || []).filter((v) => !v.copy_hash);
    if (!todo.length) return 0;
    const ids = [...new Set(todo.map((v) => v.person_id).filter(Boolean))];
    const { data: ppl } = ids.length ? await sb.from('people').select('id, full_name').in('id', ids) : { data: [] };
    let n = 0;
    for (const v of todo) {
      const name = ((ppl || []).find((p) => p.id === v.person_id) || {}).full_name || '';
      const { error } = await sb.rpc('attach_record_copy', { p_id: v.id, p_html: signoffCopyHtml(v.data || {}, name, company, v) });
      if (!error) n++;
    }
    return n;
  } catch (e) { return 0; }
}

export function openCopy(html) {
  const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to open the signed copy.'); return; }
  w.document.open(); w.document.write(html); w.document.close(); try { w.focus(); } catch (e) { /* ok */ }
}

export function RecordVersions({ sb, kind, chainId, jobId, isCrp, company, canCorrect, onCorrect, title, reloadKey }) {
  const [list, setList] = useState(null), [chk, setChk] = useState({}), [err, setErr] = useState('');
  const load = useCallback(async () => {
    try {
      const mk = () => { const q = sb.from('record_versions').select('id, record_id, chain_id, version, data_hash, copy_hash, reason, created_at').eq('kind', kind);
        return (kind === 'job' ? q.eq('job_id', jobId) : q.eq('chain_id', chainId)).order('version', { ascending: true }); };
      let { data, error } = await mk(); if (error) throw error;
      if (isCrp && kind === 'signoff' && (data || []).some((v) => !v.copy_hash) && await ensureSignoffCopies(sb, company, chainId)) ({ data } = await mk());
      setList((data || []).slice().sort((a, b) => a.version - b.version)); setErr('');
    } catch (e) { setErr(/record_versions|does not exist|relation/i.test(String(e && e.message)) ? 'Run Supabase migration 0011 to keep locked copies.' : String((e && e.message) || e)); setList([]); }
  }, [sb, kind, chainId, jobId, isCrp, company]);
  useEffect(() => { if (chainId || jobId) load(); }, [load, reloadKey]); // eslint-disable-line
  const verify = async (v) => {
    setChk((c) => ({ ...c, [v.id]: { busy: true } }));
    try {
      const { data: r, error } = await sb.rpc('verify_record_version', { p_id: v.id }); if (error) throw error;
      let local = null;
      if (v.copy_hash) { const { data: row } = await sb.from('record_versions').select('copy_html').eq('id', v.id).maybeSingle(); local = row && row.copy_html != null ? (await sha256Hex(row.copy_html)) === v.copy_hash : null; }
      const ok = r && r.data_ok !== false && r.copy_ok !== false && local !== false;
      setChk((c) => ({ ...c, [v.id]: { ok, at: new Date().toISOString(), r, local } }));
    } catch (e) { setChk((c) => ({ ...c, [v.id]: { ok: false, err: String((e && e.message) || e) } })); }
  };
  const view = async (v) => {
    const { data: row } = await sb.from('record_versions').select('copy_html').eq('id', v.id).maybeSingle();
    if (row && row.copy_html) openCopy(row.copy_html); else alert('The signed copy for this version hasn\'t been made yet. The CRP\'s planner makes it the next time they open this record.');
  };
  if (!list) return <div className="text-xs text-slate-500">Loading locked copies…</div>;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2" data-versions={kind} data-versions-n={list.length}>
      <div className="flex items-center gap-2"><i className="fa-solid fa-lock text-slate-500"></i><div className="text-sm font-semibold text-slate-800 flex-1">{title || 'Locked copies'}</div>
        {canCorrect && isCrp && onCorrect && <button type="button" data-allow-locked="1" onClick={onCorrect} data-version-correct="1" className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50"><i className="fa-solid fa-pen mr-1"></i>Correct…</button>}</div>
      {err && <p className="text-xs text-amber-800">{err}</p>}
      {!err && !list.length && <p className="text-xs text-slate-500">{kind === 'job' ? 'A copy is kept each time you approve the plan (with the job saved to the cloud).' : 'A copy is kept when this record locks.'}</p>}
      {list.map((v) => { const c = chk[v.id]; const latest = v === list[list.length - 1]; return (
        <div key={v.id} className="bg-white rounded-lg border border-slate-200 px-3 py-2 text-sm" data-version={v.version}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="text-slate-800">Version {v.version}</b>{latest && list.length > 1 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Latest</span>}
            <span className="text-xs text-slate-500">kept {fmtDT(v.created_at)}</span>
            <span className="ml-auto flex gap-1.5">
              <button type="button" data-allow-locked="1" onClick={() => view(v)} data-version-view={v.version} className="text-xs px-2 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"><i className="fa-regular fa-file-lines mr-1"></i>Signed copy</button>
              <button type="button" data-allow-locked="1" onClick={() => verify(v)} data-version-verify={v.version} className="text-xs px-2 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"><i className="fa-solid fa-shield-halved mr-1"></i>{c && c.busy ? 'Checking…' : 'Verify'}</button>
            </span>
          </div>
          {v.reason && <div className="text-xs text-slate-700 mt-0.5" data-version-reason={v.version}><b>Why:</b> {v.reason}</div>}
          <div className="text-[11px] text-slate-500 font-mono mt-0.5" title={'Data ' + v.data_hash + (v.copy_hash ? '\nSigned copy ' + v.copy_hash : '')}>fingerprint {short(v.data_hash)}{v.copy_hash ? ' · copy ' + short(v.copy_hash) : ' · signed copy not made yet'}</div>
          {c && !c.busy && <div className={`text-xs mt-1 font-semibold ${c.ok ? 'text-emerald-700' : 'text-rose-700'}`} data-version-result={c.ok ? 'ok' : 'bad'}>
            {c.err ? 'Couldn\'t check: ' + c.err : c.ok ? <><i className="fa-solid fa-circle-check mr-1"></i>Verified: unchanged since it was kept{c.r && c.r.copy_ok == null ? ' (signed copy not made yet)' : ''} · checked {fmtDT(c.at)}</>
              : <><i className="fa-solid fa-triangle-exclamation mr-1"></i>Doesn't match its fingerprint: this copy has been altered{c.r && c.r.data_ok === false ? ' (record data)' : ' (signed copy)'}. Keep the earlier printed copy and tell the CRP.</>}</div>}
        </div>); })}
    </div>
  );
}

// the fields of a sign-off that can be corrected: plain values up to one level down (not signatures, files or long text blobs)
const SKIP = new Set(['importRef', 'importedAt', 'typeMap', 'docs', 'declarationText', 'certifyText']);
const pretty = (k) => k === 'crp' ? 'CRP' : String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
function leaves(a) {
  const out = [];
  Object.entries(a || {}).forEach(([k, v]) => {
    if (SKIP.has(k)) return;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.entries(v).forEach(([k2, v2]) => { if (!SKIP.has(k2) && ['string', 'number', 'boolean'].includes(typeof v2) && !(typeof v2 === 'string' && (v2.length > 600 || v2.startsWith('data:')))) out.push([[k, k2], v2]); });
    else if (['string', 'number', 'boolean'].includes(typeof v) && !(typeof v === 'string' && (v.length > 600 || v.startsWith('data:')))) out.push([[k], v]);
  });
  return out;
}
export function CorrectSignoff({ sb, rec, onClose, onDone }) {
  const fields = leaves(rec.answers);
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map(([p, v]) => [p.join('.'), v])));
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const changed = fields.filter(([p, v]) => vals[p.join('.')] !== v && !(typeof v === 'number' && String(v) === String(vals[p.join('.')])));
  const save = async () => {
    setErr('');
    if (!changed.length) { setErr('Change at least one field.'); return; }
    if (!reason.trim()) { setErr('Say why it needs correcting.'); return; }
    const next = JSON.parse(JSON.stringify(rec.answers || {}));
    changed.forEach(([p, v]) => { let x = vals[p.join('.')]; if (typeof v === 'number') x = Number(x); if (p.length === 2) next[p[0]][p[1]] = x; else next[p[0]] = x; });
    setBusy(true);
    const { data, error } = await sb.rpc('correct_signoff', { p_id: rec.id, p_reason: reason.trim(), p_answers: next });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone && onDone(data);
  };
  const inp = 'w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white';
  return (
    <div className="fixed inset-0 z-[6000] bg-slate-900/50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" data-testid="correct-signoff" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-2 overflow-hidden">
        <div className="px-5 py-3 text-white flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 60%,#4c1d95 100%)' }}>
          <h3 className="text-lg font-bold flex-1"><i className="fa-solid fa-pen mr-2"></i>Correct a locked record</h3>
          <button type="button" data-allow-locked="1" onClick={onClose} aria-label="Close" className="text-white/80 hover:text-white text-2xl px-2"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500">This makes version {(rec.version || 1) + 1}. Version {rec.version || 1} stays exactly as it was signed, with its copy and fingerprint, and both are in the audit log. Signatures carry over; a changed CRP check date moves the certification's due date. Change a person's contact details in their crew record instead.</p>
          <div className="grid sm:grid-cols-2 gap-2 max-h-[45vh] overflow-y-auto pr-1">
            {fields.map(([p, v]) => { const k = p.join('.'); const lab = p.map(pretty).join(' › ');
              return typeof v === 'boolean'
                ? <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-violet-600" checked={!!vals[k]} data-correct-field={k} onChange={(e) => setVals({ ...vals, [k]: e.target.checked })} />{lab}</label>
                : <label key={k} className={`text-xs font-semibold text-slate-600 ${String(v).length > 60 ? 'sm:col-span-2' : ''}`}>{lab}
                  {String(v).length > 60 ? <textarea rows={3} className={inp + ' mt-1'} value={vals[k]} data-correct-field={k} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
                    : <input className={inp + ' mt-1'} value={vals[k]} data-correct-field={k} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />}</label>; })}
            {!fields.length && <p className="text-sm text-slate-500">This record has no fields that can be corrected here.</p>}
          </div>
          <label className="block text-xs font-semibold text-slate-600">Why it needs correcting (kept with the new version)<textarea rows={2} className={inp + ' mt-1'} value={reason} onChange={(e) => setReason(e.target.value)} data-correct-reason="1" placeholder="e.g. RePL number typed wrong; check was done on the 31st" /></label>
          {changed.length > 0 && <div className="text-xs text-slate-600" data-correct-changes={changed.length}><b>Changes:</b> {changed.map(([p, v]) => `${p.map(pretty).join(' › ')}: "${v}" → "${vals[p.join('.')]}"`).join('; ')}</div>}
          {err && <p className="text-xs text-rose-700" data-correct-err="1">{err}</p>}
          <div className="flex gap-2 justify-end"><button type="button" data-allow-locked="1" onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Cancel</button>
            <button type="button" disabled={busy} onClick={save} data-correct-save="1" className="px-4 py-2 rounded-lg bg-violet-700 text-white text-sm font-bold disabled:opacity-50">{busy ? 'Saving…' : `Save as version ${(rec.version || 1) + 1}`}</button></div>
        </div>
      </div>
    </div>
  );
}
