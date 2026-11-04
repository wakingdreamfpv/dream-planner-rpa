// Protected Operations Manual (Chunk 6 core, v7.8): read-only viewer with a watermark, no download or print buttons,
// and a page-by-page read log. Signed-in crew read it through a short-lived signed link (storage rules);
// people with an observer link read it through the manual-link function.
import React, { useEffect, useRef, useState } from 'react';
import { getSupabase } from './client.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

let pdfjsP = null;
export const loadPdfJs = () => pdfjsP || (pdfjsP = new Promise((res, rej) => {
  if (window.pdfjsLib) return res(window.pdfjsLib);
  const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  sc.onload = () => { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); } catch (e) { rej(e); } };
  sc.onerror = () => { pdfjsP = null; rej(new Error('The manual viewer needs an internet connection.')); }; document.head.appendChild(sc);
}));

export const DEFAULT_OBSERVER_EXTRACT = `EVLOS observer duties (Operations Manual D6.4, MOS 5.04)
• Your only job while the aircraft flies is to watch it and the airspace around it. No phone, no filming, no other tasks.
• Stand beside the remote pilot (within voice range) unless the briefing says otherwise.
• Keep the aircraft in sight. If you lose sight of it, say "Visual lost" at once.
• Call hazards early and clearly: other aircraft, birds, people entering the area, vehicles, weather, obstacles.
• Say "Area clear" only after you have checked, before every take-off and landing.
• Say "Land now" if anything is unsafe. The pilot lands straight away; you don't need to explain first.
• You never operate the radio or the controls.

Fitness for duty (s1.7): no alcohol in the 8 hours before, not fatigued, not on medication that affects your eyesight or judgement.

Standard calls (D6.8): "Area clear" · "Hold" · "Land now" · "Visual lost" · "Aircraft, [direction], [distance]" · "Birds, [direction]".`;

// a signed link to the current manual: signed-in crew directly, link viewers through the function
export async function manualUrl({ token }) {
  const sb = getSupabase();
  if (!token) {
    const { data: s } = await sb.from('app_settings').select('key,value').in('key', ['manual_file', 'manual_version']);
    const m = {}; (s || []).forEach(r => { m[r.key] = r.value; });
    const path = m.manual_file && m.manual_file.path; if (!path) throw new Error('The CRP hasn\'t uploaded the Operations Manual yet.');
    const { data, error } = await sb.storage.from('ops-manual').createSignedUrl(path, 300);
    if (error || !data) throw new Error((error && error.message) || 'Couldn\'t open the manual');
    return { url: data.signedUrl, version: m.manual_version || '' };
  }
  const r = await fetch(SUPABASE_URL + '/functions/v1/manual-link', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }, body: JSON.stringify({ token }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || 'Couldn\'t open the manual');
  return { url: d.url, version: d.version || '' };
}

export function ManualViewer({ token, viewer, onClose }) {
  const sb = getSupabase();
  const [st, setSt] = useState({ loading: true }), [pages, setPages] = useState(0), [zoom, setZoom] = useState(1);
  const box = useRef(null), doc = useRef(null), seen = useRef({}), ver = useRef('');
  const stamp = `${viewer || 'Crew'} · ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · CONFIDENTIAL`;
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { url, version } = await manualUrl({ token }); ver.current = version;
        const lib = await loadPdfJs();
        const d = await lib.getDocument({ url }).promise; if (dead) return;
        doc.current = d; setPages(d.numPages); setSt({ loading: false, version });
      } catch (e) { if (!dead) setSt({ loading: false, error: String(e.message || e) }); }
    })();
    const k = (e) => { if (e.key === 'Escape') onClose(); if ((e.ctrlKey || e.metaKey) && ['p', 's'].includes(e.key.toLowerCase())) e.preventDefault(); };
    window.addEventListener('keydown', k);
    return () => { dead = true; window.removeEventListener('keydown', k); flush(); };
  }, []); // eslint-disable-line
  // page read time: the page in the middle of the screen is "being read"; logged when it changes and on close
  const cur = useRef({ page: 0, since: 0 });
  const logPage = (page, secs) => { if (page && secs >= 2) sb.rpc('log_manual_page', { p_token: token || null, p_page: page, p_seconds: secs, p_version: String(ver.current || '') }).then(() => {}, () => {}); };
  const flush = () => { const c = cur.current; if (c.page) logPage(c.page, Math.round((Date.now() - c.since) / 1000)); cur.current = { page: 0, since: 0 }; };
  const track = () => {
    const el = box.current; if (!el) return;
    const mid = el.getBoundingClientRect().top + el.clientHeight / 2; let page = 0;
    el.querySelectorAll('[data-manual-page]').forEach(p => { const r = p.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) page = +p.dataset.manualPage; });
    if (page !== cur.current.page) { flush(); cur.current = { page, since: Date.now() }; }
  };
  useEffect(() => { if (!pages) return; const el = box.current; track(); const iv = setInterval(track, 1000); el && el.addEventListener('scroll', track, { passive: true });
    return () => { clearInterval(iv); el && el.removeEventListener('scroll', track); }; }, [pages]); // eslint-disable-line
  return (
    <div className="fixed inset-0 z-[5600] bg-slate-900/90 flex flex-col print:hidden select-none" data-testid="manual-viewer" onContextMenu={e => e.preventDefault()} style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 text-white">
        <i className="fa-solid fa-book text-violet-300"></i>
        <div className="flex-1 min-w-0 text-sm font-semibold truncate">Operations Manual{st.version ? ' · version ' + st.version : ''} <span className="text-xs font-normal text-slate-400">· read-only · confidential</span></div>
        <button type="button" onClick={() => setZoom(z => Math.max(0.6, z - 0.2))} className="px-2 py-1 rounded bg-slate-800 text-sm" aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setZoom(z => Math.min(2.4, z + 0.2))} className="px-2 py-1 rounded bg-slate-800 text-sm" aria-label="Zoom in">+</button>
        <button type="button" onClick={onClose} data-manual-close="1" className="px-3 py-1 rounded bg-slate-800 text-sm font-semibold"><i className="fa-solid fa-xmark mr-1"></i>Close</button>
      </div>
      <div ref={box} className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3" data-manual-scroll="1">
        {st.loading && <p className="text-slate-300 text-sm text-center mt-10">Opening the manual…</p>}
        {st.error && <p className="text-amber-200 text-sm text-center mt-10" data-manual-error="1">{st.error}</p>}
        {Array.from({ length: pages }, (_, i) => <ManualPage key={i} doc={doc} n={i + 1} zoom={zoom} stamp={stamp} />)}
      </div>
    </div>
  );
}

function ManualPage({ doc, n, zoom, stamp }) {
  const cv = useRef(null), wrap = useRef(null), [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    let done = false;
    const io = new IntersectionObserver(async ([en]) => {
      if (!en.isIntersecting || done || !doc.current) return; done = true;
      const pg = await doc.current.getPage(n); const w = Math.min(980, el.parentElement.clientWidth - 8) * zoom;
      const vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: (w / vp0.width) * (window.devicePixelRatio || 1) });
      const c = cv.current; c.width = vp.width; c.height = vp.height; c.style.width = (vp.width / (window.devicePixelRatio || 1)) + 'px';
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; setDrawn(x => x + 1);
    }, { rootMargin: '600px' });
    io.observe(el); return () => io.disconnect();
  }, [zoom]); // eslint-disable-line
  return (
    <div ref={wrap} data-manual-page={n} className="relative mx-auto bg-white shadow min-h-[200px]" style={{ width: 'fit-content', maxWidth: '100%' }}>
      <canvas ref={cv} className="block max-w-full pointer-events-none" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {[0.2, 0.5, 0.8].map(t => <div key={t} className="absolute left-1/2 whitespace-nowrap text-slate-900/15 font-bold text-lg sm:text-2xl" style={{ top: (t * 100) + '%', transform: 'translate(-50%,-50%) rotate(-28deg)' }}>{stamp}</div>)}
      </div>
      <div className="absolute bottom-1 right-2 text-[10px] text-slate-400">{n}</div>
      {!drawn && <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs">Page {n}</div>}
    </div>
  );
}

// CRP: upload the manual, set its version and the observer extract, and see who has read it
export function ManualAdmin() {
  const sb = getSupabase();
  const [s, setS] = useState(null), [busy, setBusy] = useState(''), [msg, setMsg] = useState(''), [ver, setVer] = useState(''), [ext, setExt] = useState(''), [log, setLog] = useState(null), [view, setView] = useState(false);
  const load = async () => {
    const { data } = await sb.from('app_settings').select('key,value').in('key', ['manual_file', 'manual_version', 'observer_extract']);
    const m = {}; (data || []).forEach(r => { m[r.key] = r.value; }); setS(m); setVer(m.manual_version || ''); setExt(m.observer_extract || DEFAULT_OBSERVER_EXTRACT);
    const [{ data: lg }, { data: pr }] = await Promise.all([sb.from('document_access_log').select('user_id,viewer,page,duration_s,opened_at,doc_version').eq('document', 'ops-manual').order('opened_at', { ascending: false }).limit(2000),
      sb.from('profiles').select('id,full_name,email')]);
    const nm = {}; (pr || []).forEach(p => { nm[p.id] = p.full_name || p.email; });
    const by = {}; (lg || []).forEach(r => { const k = r.user_id ? nm[r.user_id] || 'Crew member' : (r.viewer || 'Observer link'); const o = by[k] = by[k] || { who: k, pages: new Set(), sec: 0, last: r.opened_at, ver: r.doc_version }; o.pages.add(r.page); o.sec += r.duration_s || 0; });
    setLog(Object.values(by));
  };
  useEffect(() => { load().catch(e => setS({ error: String(e.message || e) })); }, []); // eslint-disable-line
  const setKey = async (key, value) => { const { error } = await sb.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' }); if (error) throw error; };
  const upload = async (file) => {
    if (!file) return; if (file.type && file.type !== 'application/pdf') { setMsg('Choose a PDF.'); return; }
    setBusy('Uploading…'); setMsg('');
    try {
      const { error } = await sb.storage.from('ops-manual').upload('current.pdf', file, { upsert: true, contentType: 'application/pdf' });
      if (error) throw error;
      await setKey('manual_file', { path: 'current.pdf', name: file.name, size: file.size, at: new Date().toISOString() });
      setMsg('Manual uploaded. Set its version below.'); await load();
    } catch (e) { setMsg('Upload failed: ' + (e.message || e)); }
    setBusy('');
  };
  const saveText = async () => { setBusy('Saving…'); try { await setKey('manual_version', ver.trim()); await setKey('observer_extract', ext); setMsg('Saved.'); await load(); } catch (e) { setMsg('Couldn\'t save: ' + (e.message || e)); } setBusy(''); };
  const fmtS = (x) => { x = Math.round(x || 0); return x >= 60 ? Math.floor(x / 60) + 'm ' + (x % 60) + 's' : x + 's'; };
  if (!s) return <p className="text-sm text-slate-500">Loading…</p>;
  const f = s.manual_file || {};
  return (
    <div className="space-y-4 text-sm" data-manual-admin="1">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[12rem]">{f.path ? <><b>{f.name || 'current.pdf'}</b> <span className="text-slate-500">· uploaded {f.at ? new Date(f.at).toLocaleDateString('en-AU') : ''}{f.size ? ' · ' + (f.size / 1048576).toFixed(1) + ' MB' : ''}</span></> : <span className="text-slate-500">No manual uploaded yet.</span>}</div>
        <label className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-semibold cursor-pointer text-xs" data-manual-upload="1"><i className="fa-solid fa-upload mr-1"></i>{f.path ? 'Replace PDF' : 'Upload PDF'}<input type="file" accept="application/pdf" className="hidden" onChange={e => { upload(e.target.files[0]); e.target.value = ''; }} /></label>
        {f.path && <button type="button" onClick={() => setView(true)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold" data-manual-preview="1">View as crew see it</button>}
      </div>
      <p className="text-xs text-slate-500">Stored privately. Crew and observers read it in the planner only: watermarked with their name and the date, no download or print buttons, and every page they read is logged below. (No viewer can stop a determined screenshot; the watermark identifies it.)</p>
      <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-2 items-start">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500 pt-2">Version</label>
        <input value={ver} onChange={e => setVer(e.target.value)} placeholder="e.g. 3.2 (Oct 2026)" className="px-3 py-2 border border-slate-300 rounded-lg" data-manual-version="1" />
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500 pt-2">Observer extract</label>
        <div><textarea value={ext} onChange={e => setExt(e.target.value)} rows={8} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs" data-manual-extract="1" />
          <p className="text-[11px] text-slate-500">Shown to observers on their sign-off (link, device or login), above the full manual.</p></div>
      </div>
      <div className="flex items-center gap-2"><button type="button" onClick={saveText} disabled={!!busy} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold" data-manual-save="1">Save version and extract</button>{busy && <span className="text-xs text-slate-500">{busy}</span>}{msg && <span className="text-xs text-violet-800" data-manual-msg="1">{msg}</span>}</div>
      <div><div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Read report</div>
        {log && log.length ? <table className="w-full text-xs" data-manual-report="1"><thead><tr className="text-left text-slate-500"><th className="py-1">Who</th><th>Pages read</th><th>Time</th><th>Version</th><th>Last opened</th></tr></thead>
          <tbody>{log.map(r => <tr key={r.who} className="border-t border-slate-100"><td className="py-1 font-medium">{r.who}</td><td>{r.pages.size}</td><td>{fmtS(r.sec)}</td><td>{r.ver || '—'}</td><td>{new Date(r.last).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td></tr>)}</tbody></table>
          : <p className="text-xs text-slate-500">Nobody has opened it yet.</p>}</div>
      {view && <ManualViewer viewer="Preview (CRP)" onClose={() => setView(false)} />}
    </div>
  );
}
