// v7.16: signing the plan as RPIC or CRP — click to sign (a digital signature tied to your login), type your name as a
// printed signature, or draw it. The RPIC also confirms the declaration after reviewing the plan, and can leave comments.
import React, { useEffect, useState } from 'react';
import SignaturePad from './SignaturePad.jsx';

const METHODS = [['click', 'Click to sign', 'fa-fingerprint'], ['typed', 'Type my name', 'fa-keyboard'], ['drawn', 'Draw', 'fa-signature']];
const LS = 'wd_sig_method';

export default function SignDialog({ role, name, arn, by, declaration, summary = [], review = [], onReview, onSign, onClose }) {
  const isRp = role === 'rp';
  const [method, setMethod] = useState(() => { try { return localStorage.getItem(LS) || 'click'; } catch (e) { return 'click'; } });
  const [val, setVal] = useState(null);
  const [agree, setAgree] = useState(false);
  const [comments, setComments] = useState('');
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const pick = (m) => { setMethod(m); setVal(null); try { localStorage.setItem(LS, m); } catch (e) {} };
  const sigOk = method === 'click' || (method === 'typed' ? !!(val && String(val.typed || '').trim()) : !!(val && val.image));
  const ok = sigOk && (!isRp || agree);
  const go = () => {
    if (!ok) return;
    onSign({ method, typed: method === 'typed' ? String(val.typed).trim() : undefined, image: method === 'drawn' ? val.image : undefined,
      declaration: isRp ? declaration : undefined, comments: isRp && comments.trim() ? comments.trim() : undefined, at: new Date().toISOString() });
  };
  return (
    <div className="fixed inset-0 z-[5200] bg-slate-900/60 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto print:hidden" data-testid="sign-dialog" data-sig-role={role}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-2 overflow-hidden">
        <div className="px-5 py-4 text-white flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 60%,#4c1d95 100%)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest opacity-75">{isRp ? 'Remote Pilot in Command' : 'Chief Remote Pilot'}</div>
            <h3 className="text-lg font-bold truncate">Sign as {name || 'you'}{arn ? <span className="font-normal opacity-80"> · ARN {arn}</span> : null}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/80 hover:text-white text-2xl px-2"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="p-5 space-y-4">
          {isRp && summary.length > 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" data-sig-summary="1">
            {summary.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-3 py-0.5"><span className="w-28 shrink-0 text-slate-500 text-xs pt-0.5">{k}</span><span className="text-slate-800 min-w-0 break-words">{v}</span></div>)}
          </div>}
          {isRp && review.length > 0 && <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Review before you sign</div>
            <div className="flex flex-wrap gap-1.5">{review.map(([tab, label, icon]) => <button key={tab} type="button" data-sig-review={tab} onClick={() => onReview(tab)} className="text-xs px-2.5 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 font-semibold hover:bg-violet-100"><i className={`fa-solid ${icon} mr-1`}></i>{label}</button>)}</div>
          </div>}
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1.5">How do you want to sign?</div>
            <div className="grid grid-cols-3 gap-1.5">{METHODS.map(([k, l, ic]) => <button key={k} type="button" data-sig-method={k} onClick={() => pick(k)}
              className={`px-2 py-2 rounded-lg border text-xs font-semibold ${method === k ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}><i className={`fa-solid ${ic} block text-base mb-0.5`}></i>{l}</button>)}</div>
          </div>
          {method === 'click' && <p className="text-xs text-slate-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2" data-sig-click="1"><i className="fa-solid fa-user-check text-emerald-600 mr-1"></i>
            A digital signature: recorded against {by && by.email ? <>your login (<b>{by.email}</b>)</> : 'this device'} with the date and time.</p>}
          {method !== 'click' && <SignaturePad key={method} name={name} value={val} onChange={setVal} fixedMode={method === 'typed' ? 'type' : 'draw'} testid="sig-pad" />}
          {isRp && <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-slate-200 px-3 py-2"><input type="checkbox" className="mt-1" data-sig-agree="1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="text-slate-700 text-xs leading-relaxed">{declaration}</span></label>}
          {isRp && <label className="block text-xs font-semibold text-slate-600">Comments for the CRP (optional)
            <textarea data-sig-comments="1" value={comments} onChange={(e) => setComments(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-normal" placeholder="Anything you'd like changed or noted" /></label>}
          <div className="flex items-center gap-2">
            <button type="button" data-sig-ok="1" disabled={!ok} onClick={go} className="flex-1 px-4 py-2.5 rounded-lg bg-violet-700 text-white font-bold text-sm disabled:opacity-40"><i className="fa-solid fa-pen-nib mr-1.5"></i>Sign{isRp ? ' as RPIC' : ' as CRP'}</button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm">Cancel</button>
          </div>
          {!ok && <p className="text-[11px] text-slate-500 -mt-2">{!sigOk ? (method === 'typed' ? 'Type your name to sign.' : 'Draw your signature to sign.') : 'Tick the declaration to sign.'}</p>}
        </div>
      </div>
    </div>
  );
}

// how a signature shows on screen / in the PDF: { method, typed, image }
export function sigMark(sig, name) {
  if (!sig) return null;
  if (sig.method === 'drawn' && sig.image) return { image: sig.image };
  if (sig.method === 'typed' && sig.typed) return { typed: sig.typed };
  return { click: true, name };
}
