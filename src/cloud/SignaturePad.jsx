// Signature: draw with a finger / mouse, or type your name. Value: { image } or { typed }, plus { name }.
import React, { useEffect, useRef, useState } from 'react';

export default function SignaturePad({ name, value, onChange, testid = 'sig' }) {
  const [mode, setMode] = useState(value && value.typed ? 'type' : 'draw');
  const cv = useRef(null), drawing = useRef(false), dirty = useRef(false);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr); g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1e1b4b';
    if (value && value.image) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0, r.width, r.height); im.src = value.image; dirty.current = true; }
  }, [mode]); // eslint-disable-line
  const pt = (e) => { const r = cv.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { e.preventDefault(); cv.current.setPointerCapture && cv.current.setPointerCapture(e.pointerId); drawing.current = true; const g = cv.current.getContext('2d'); const [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 0.1); g.stroke(); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const g = cv.current.getContext('2d'); const [x, y] = pt(e); g.lineTo(x, y); g.stroke(); dirty.current = true; };
  const up = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange({ image: cv.current.toDataURL('image/png'), name }); };
  const clear = () => { const c = cv.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null); };
  return (
    <div data-testid={testid}>
      <div className="flex gap-1 text-xs mb-2">
        {[['draw', 'Draw'], ['type', 'Type my name']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setMode(k); onChange(null); }} className={`px-2.5 py-1 rounded-full border ${mode === k ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-300 text-slate-600'}`}>{l}</button>
        ))}
      </div>
      {mode === 'draw' ? (
        <div>
          <canvas ref={cv} data-sig-canvas="1" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            className="w-full h-32 border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none cursor-crosshair" />
          <div className="flex justify-between text-[11px] text-slate-500 mt-1"><span>Sign above with your finger or mouse</span><button type="button" onClick={clear} className="underline">Clear</button></div>
        </div>
      ) : (
        <div>
          <input data-sig-typed="1" value={(value && value.typed) || ''} onChange={e => onChange(e.target.value.trim() ? { typed: e.target.value, name } : null)} placeholder="Type your full name"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-2xl" style={{ fontFamily: '"Brush Script MT","Segoe Script","Snell Roundhand",cursive' }} />
          <div className="text-[11px] text-slate-500 mt-1">Typing your name here counts as your signature.</div>
        </div>
      )}
    </div>
  );
}

export function SignatureView({ sig, at }) {
  if (!sig) return <span className="text-slate-400 text-sm">Not signed</span>;
  return (
    <div className="inline-block">
      {sig.image ? <img src={sig.image} alt="Signature" className="h-16 bg-white border border-slate-200 rounded" />
        : <div className="text-2xl text-indigo-950" style={{ fontFamily: '"Brush Script MT","Segoe Script","Snell Roundhand",cursive' }}>{sig.typed}</div>}
      {at && <div className="text-[11px] text-slate-500">Signed {new Date(at).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>}
    </div>
  );
}
