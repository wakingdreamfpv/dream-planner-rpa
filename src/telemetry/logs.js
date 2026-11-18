// Flight log (telemetry CSV) reading, shared by the planner and the Claude connector (v7.41).
// Moved unchanged from planner.jsx.

export const TLM_DISARMED = /^(OK|WAIT|!ERR)$/i;
export const parseTelemetryCsv = (text, fileName, clock) => {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 3) return [];
  const split = (line) => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const hdr = split(lines[0]).map(h => h.trim());
  const col = (...names) => { for (const n of names) { const i = hdr.findIndex(h => h.toLowerCase() === n.toLowerCase()); if (i >= 0) return i; } for (const n of names) { const i = hdr.findIndex(h => h.toLowerCase().startsWith(n.toLowerCase().replace(/\(.*$/, '') + '(')); if (i >= 0) return i; } return -1; };
  const C = {
    date: col('Date'), time: col('Time'), fm: col('FM'), alt: col('Alt(m)', 'Alt(ft)'), gps: col('GPS'),
    spd: col('GSpd(kmh)', 'GSpd(kts)', 'GSpd(mph)', 'GSpd(m/s)'), rxbt: col('RxBt(V)'), curr: col('Curr(A)'),
    capa: col('Capa(mAh)'), batp: col('Bat%(%)'), rq: col('RQly(%)'), r1: col('1RSS(dB)'), r2: col('2RSS(dB)'),
    snr: col('RSNR(dB)'), tpwr: col('TPWR(mW)'), sats: col('Sats'), txbt: col('TxBat(V)'),
  };
  if (C.date < 0 || C.time < 0) return [];
  const altFt = C.alt >= 0 && /\(ft\)/i.test(hdr[C.alt]);
  const spdH = C.spd >= 0 ? hdr[C.spd].toLowerCase() : '';
  const spdK = spdH.includes('kts') ? 1.852 : spdH.includes('mph') ? 1.609344 : spdH.includes('m/s') ? 3.6 : 1;
  const num = (r, i) => { if (i < 0) return NaN; const v = parseFloat(r[i]); return isFinite(v) ? v : NaN; };
  const rows = [];
  for (let k = 1; k < lines.length; k++) {
    const r = split(lines[k]); if (r.length < 3) continue;
    const d = (r[C.date] || '').trim(), t = (r[C.time] || '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d), n = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(t);
    if (!m || !n) continue;
    const parts = [+m[1], +m[2] - 1, +m[3], +n[1], +n[2], +n[3], Math.round(parseFloat('0.' + (n[4] || '0')) * 1000)];
    const ms = clock === 'local' ? new Date(...parts).getTime() : Date.UTC(...parts);
    let lat = NaN, lng = NaN;
    if (C.gps >= 0) { const g = (r[C.gps] || '').trim().split(/\s+/); lat = parseFloat(g[0]); lng = parseFloat(g[1]); if (!isFinite(lat) || !isFinite(lng) || (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)) { lat = NaN; lng = NaN; } }
    const fm = C.fm >= 0 ? (r[C.fm] || '').trim() : '';
    const alt = num(r, C.alt);
    rows.push({ ms, fm, alt: altFt ? alt * 0.3048 : alt, spd: num(r, C.spd) * spdK, lat, lng,
      v: num(r, C.rxbt), a: num(r, C.curr), mah: num(r, C.capa), pct: num(r, C.batp), rq: num(r, C.rq),
      rss: Math.max(num(r, C.r1), isNaN(num(r, C.r2)) ? -999 : num(r, C.r2)), snr: num(r, C.snr), tp: num(r, C.tpwr), sats: num(r, C.sats) });
  }
  if (!rows.length) return [];
  // Armed state from the flight-mode field; with no FM column the whole log is one flight
  const hasFm = C.fm >= 0 && rows.some(r => r.fm);
  const armed = (r) => !hasFm ? true : (!!r.fm && !/\*$/.test(r.fm) && !(/!$/.test(r.fm) && !/^!FS!$/i.test(r.fm)) && !TLM_DISARMED.test(r.fm));
  const runs = []; let s = -1;
  rows.forEach((r, i) => { const a = armed(r); if (a && s < 0) s = i; if (!a && s >= 0) { runs.push([s, i - 1]); s = -1; } });
  if (s >= 0) runs.push([s, rows.length - 1]);
  // Merge runs split by short drop-outs (< 3 s), then drop bench arms (< 5 s that never left the ground)
  const merged = [];
  runs.forEach(rn => { const p = merged[merged.length - 1]; if (p && rows[rn[0]].ms - rows[p[1]].ms < 3000) p[1] = rn[1]; else merged.push([...rn]); });
  const hav = (a, b, c, d) => { const R = 6371000, toR = Math.PI / 180, dLa = (c - a) * toR, dLo = (d - b) * toR; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a * toR) * Math.cos(c * toR) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const r1 = (x, p = 1) => isFinite(x) ? Math.round(x * 10 ** p) / 10 ** p : null;
  const flights = [];
  merged.forEach(([a, b]) => {
    const seg = rows.slice(a, b + 1);
    const durS = (seg[seg.length - 1].ms - seg[0].ms) / 1000;
    // Height reference (v5.41): CRSF "Alt" is usually GPS altitude above sea level, which wanders by several metres,
    // especially just after arming. Measure from the lowest point of the flight (5-sample median smoothed), so
    // heights are never pushed below zero. This can only over-state height, never under-state it.
    const altRaw = seg.map(r => r.alt);
    // v6.4: at arming the receiver often repeats an old altitude for a few samples, then jumps to the real one
    // (e.g. 24 m → 0 m in 0.1 s). A jump faster than any drone can climb or fall, in the first 3 s, marks
    // everything before it as stale, and those samples are ignored.
    { let cut = -1;
      for (let i = 1; i < seg.length && seg[i].ms - seg[0].ms <= 3000; i++) {
        const a0 = altRaw[i - 1], a1 = altRaw[i], dt = Math.max(0.05, (seg[i].ms - seg[i - 1].ms) / 1000);
        if (isFinite(a0) && isFinite(a1) && Math.abs(a1 - a0) > Math.max(6, 25 * dt)) cut = i;
      }
      for (let i = 0; i < cut; i++) altRaw[i] = NaN; }
    const altSm = altRaw.map((v, i) => { if (!isFinite(v)) return NaN; const w = altRaw.slice(Math.max(0, i - 2), i + 3).filter(isFinite).sort((x, y) => x - y); return w[Math.floor(w.length / 2)]; });
    const altOk = altSm.filter(isFinite);
    // Zero = ground level at take-off (v5.42): the median smoothed altitude while the aircraft is armed but still on
    // the ground (before ground speed first passes 3 km/h, max 20 s, skipping the first 0.5 s which often holds a
    // stale value). If the log started in the air, use the landing (after speed last drops below 3 km/h).
    // Only if neither exists, fall back to the lowest point of the flight.
    const med = (a) => { const s = a.filter(isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
    const t0 = seg[0].ms, tN = seg[seg.length - 1].ms;
    const spd0 = seg.map(r => r.spd);
    let firstMove = seg.findIndex(r => isFinite(r.spd) && r.spd > 3 && r.ms - t0 > 300);
    if (firstMove < 0) firstMove = seg.length;
    const preIdx = []; for (let i = 0; i < firstMove; i++) { const dt = seg[i].ms - t0; if (dt >= 500 && dt <= 20000 && isFinite(altSm[i])) preIdx.push(i); }
    let altBase = NaN, altRef = 'takeoff';
    if (preIdx.length >= 3) altBase = med(preIdx.map(i => altSm[i]));
    if (!isFinite(altBase)) {
      let lastMove = -1; for (let i = seg.length - 1; i >= 0; i--) if (isFinite(spd0[i]) && spd0[i] > 3) { lastMove = i; break; }
      const post = []; for (let i = lastMove + 1; i < seg.length; i++) if (tN - seg[i].ms <= 20000 && isFinite(altSm[i])) post.push(altSm[i]);
      if (lastMove >= 0 && post.length >= 3) { altBase = med(post); altRef = 'landing'; }
    }
    if (!isFinite(altBase)) { altBase = altOk.length ? Math.min(...altOk) : 0; altRef = 'lowest'; }
    // Smoothed values for the heights too, so a single stale or spiking sample (common at arming) isn't the max
    const rel = altSm.map(v => isFinite(v) ? v - altBase : NaN);
    const minRel = Math.min(0, ...rel.filter(isFinite));
    const maxAlt = Math.max(0, ...rel.filter(isFinite));
    if (durS < 5 && maxAlt < 1) return;
    // Smooth ground speed with a 3-sample median so a single GPS spike isn't reported as the max
    const sp = seg.map(r => r.spd);
    const spS = sp.map((v, i) => { const w = [sp[i - 1], v, sp[i + 1]].filter(isFinite).sort((x, y) => x - y); return w.length ? w[Math.floor(w.length / 2)] : NaN; });
    // Home: last GPS fix before arming in this file, else first fix in the flight
    let home = null;
    for (let i = a; i >= Math.max(0, a - 600); i--) if (isFinite(rows[i].lat)) { home = [rows[i].lat, rows[i].lng]; break; }
    const fixes = seg.map((r, i) => [r.lat, r.lng, i]).filter(p => isFinite(p[0]));
    if (!home && fixes.length) home = [fixes[0][0], fixes[0][1]];
    let maxDist = 0, path = 0, last = null;
    fixes.forEach(p => { if (home) maxDist = Math.max(maxDist, hav(home[0], home[1], p[0], p[1])); if (last) { const d = hav(last[0], last[1], p[0], p[1]); if (d < 200) path += d; } last = p; });
    const fin = (k) => seg.map(r => r[k]).filter(isFinite);
    const vS = fin('v'), mahS = fin('mah'), aS = fin('a'), pS = fin('pct'), rqS = fin('rq'), rsS = seg.map(r => r.rss).filter(x => isFinite(x) && x > -999), tpS = fin('tp'), satS = fin('sats'), snrS = fin('snr');
    // Voltage sag: lowest 2 s rolling average, so a single dip doesn't read as the minimum
    let vMin = NaN; if (vS.length) { const w = Math.max(1, Math.round(vS.length / (durS || 1) * 2)); for (let i = 0; i + w <= vS.length; i++) { const m = vS.slice(i, i + w).reduce((x, y) => x + y, 0) / w; vMin = isNaN(vMin) ? m : Math.min(vMin, m); } }
    const cells = vS.length ? Math.max(1, Math.ceil(vS[0] / 4.25)) : null;
    // Failsafe and link events
    const events = []; let inFs = false, lowLink = false;
    seg.forEach(r => {
      const t = Math.round((r.ms - seg[0].ms) / 1000);
      if (/^!FS!$/i.test(r.fm) && !inFs) { events.push({ t, type: 'failsafe', text: 'Failsafe' }); inFs = true; } else if (!/^!FS!$/i.test(r.fm)) inFs = false;
      if (isFinite(r.rq) && r.rq < 50 && !lowLink) { events.push({ t, type: 'link', text: 'Link quality ' + r.rq + '%' }); lowLink = true; } else if (isFinite(r.rq) && r.rq >= 70) lowLink = false;
    });
    // Downsampled trace for the profile chart and map: [tSec, altM, kmh, lat, lng, volts(min), amps(max), RQ%(min), sats(min)]
    const N = 240, step = Math.max(1, Math.ceil(seg.length / N)), trace = [];
    for (let i = 0; i < seg.length; i += step) {
      const ch = seg.slice(i, i + step), ri = rel.slice(i, i + step).filter(isFinite), sj = spS.slice(i, i + step).filter(isFinite);
      const g = ch.find(r => isFinite(r.lat));
      const mn = (k) => { const v = ch.map(r => r[k]).filter(isFinite); return v.length ? Math.min(...v) : null; }, mx = (k) => { const v = ch.map(r => r[k]).filter(isFinite); return v.length ? Math.max(...v) : null; };
      trace.push([r1((ch[0].ms - seg[0].ms) / 1000), ri.length ? r1(Math.max(...ri)) : null, sj.length ? r1(Math.max(...sj)) : null, g ? r1(g.lat, 6) : null, g ? r1(g.lng, 6) : null,
        mn('v') != null ? r1(mn('v'), 2) : null, mx('a') != null ? r1(mx('a')) : null, mn('rq'), mn('sats')]);
    }
    const phaseMax = (from, to) => { const v = seg.map((r, i) => [(r.ms - seg[0].ms) / 1000, rel[i]]).filter(p => p[0] >= from && p[0] <= to && isFinite(p[1])).map(p => p[1]); return v.length ? Math.max(0, ...v) : 0; };
    // Peak per-sample kinetic energy inputs (speed and height together), used with the fleet weight
    const keInputs = seg.map((r, i) => [isFinite(spS[i]) ? spS[i] / 3.6 : 0, Math.max(0, isFinite(rel[i]) ? rel[i] : 0)]);
    let keV = 0, keH = 0, keScore = -1; keInputs.forEach(([v, h]) => { const sc = v * v + 2 * 9.81 * h; if (sc > keScore) { keScore = sc; keV = v; keH = h; } });
    const notes = [];
    if (hasFm && a === 0) notes.push('Log started with the aircraft already armed — the take-off may be missing from this log.');
    if (hasFm && b === rows.length - 1) notes.push('Log ended while the aircraft was still armed — the landing may be missing from this log.');
    if (!hasFm) notes.push('No flight-mode field in this log, so the whole file was treated as one flight.');
    if (minRel < -3) notes.push('Flew up to ' + Math.round(-minRel) + ' m below the take-off point (e.g. launched from a height, or GPS altitude drift).');
    if (altRef === 'landing') notes.push('Height measured from the landing point (the log started with the aircraft already moving).');
    if (altRef === 'lowest') notes.push('No time on the ground in this log, so height is measured from the lowest point of the flight.');
    flights.push({ notes,
      source: 'EdgeTX telemetry (CRSF/ELRS)', file: fileName || '', clock: clock === 'local' ? 'local' : 'utc',
      startMs: seg[0].ms, endMs: seg[seg.length - 1].ms, durationSec: Math.round(durS), samples: seg.length,
      maxAltM: r1(maxAlt), maxSpeedKmh: r1(Math.max(0, ...spS.filter(isFinite))), maxDistM: Math.round(maxDist), pathM: Math.round(path),
      home: home ? [r1(home[0], 6), r1(home[1], 6)] : null,
      cells, vStart: r1(vS[0], 2), vMin: r1(vMin, 2), vEnd: r1(vS[vS.length - 1], 2),
      mahUsed: mahS.length ? Math.max(0, Math.round(mahS[mahS.length - 1] - mahS[0])) : null, mahEnd: mahS.length ? Math.round(mahS[mahS.length - 1]) : null,
      pctStart: pS.length ? pS[0] : null, pctEnd: pS.length ? pS[pS.length - 1] : null,
      maxCurrA: aS.length ? r1(Math.max(...aS)) : null, avgCurrA: aS.length ? r1(aS.reduce((x, y) => x + y, 0) / aS.length) : null,
      minRq: rqS.length ? Math.min(...rqS) : null, minRss: rsS.length ? Math.min(...rsS) : null, minSnr: snrS.length ? Math.min(...snrS) : null,
      maxTpwr: tpS.length ? Math.max(...tpS) : null, minSats: satS.length ? Math.min(...satS) : null, maxSats: satS.length ? Math.max(...satS) : null,
      takeoffMaxM: r1(phaseMax(0, 15)), landingMaxM: r1(phaseMax(durS - 15, durS)),
      keAt: { v: r1(keV, 2), h: r1(keH, 1) },
      altRef, belowM: minRel < -3 ? r1(-minRel) : 0, events, trace,
    });
  });
  return flights;
};
export const fmtTlmTime = (ms) => new Date(ms).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtTlmDate = (ms) => new Date(ms).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtMmSs = (s) => Math.floor((s || 0) / 60) + 'm ' + String(Math.round((s || 0) % 60)).padStart(2, '0') + 's';
export const packCells = (id) => { const m = /^\s*(\d{1,2})\s*s(?![a-z])/i.exec(String(id || '')); return m ? parseInt(m[1], 10) : 0; };
export const dumpNorm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const edgeTxModel = (fileName) => String(fileName || '').replace(/\.csv$/i, '').replace(/-\d{4}-\d{2}-\d{2}-\d{6}$/, '').trim();
export const cellCandidates = (v) => { const out = []; if (!(v > 0)) return out; for (let n = 1; n <= 14; n++) { const c = v / n; if (c >= 3.3 && c <= 4.45) out.push(n); } return out; };
export const likelyCells = (v) => { const c = cellCandidates(v); const typ = c.filter(n => v / n >= 3.7 && v / n <= 4.4); return (typ.length ? typ : c)[0] || null; };
export const guessAircraft = (t, fileName, fleet, jobRpas) => {
  const fl = fleet || {}, all = Object.keys(fl), job = (jobRpas || []).filter(r => fl[r]);
  const model = edgeTxModel(fileName), mN = dumpNorm(model);
  const cand = cellCandidates(t && t.vStart);
  const cellsOf = (r) => parseInt((fl[r] || {}).cells) || 0;
  if (mN.length >= 3) {
    const byModel = all.filter(r => dumpNorm((fl[r] || {}).radioModel) === mN);
    const byName = byModel.length ? byModel : all.filter(r => dumpNorm(r) === mN);
    if (byName.length === 1) return { rpa: byName[0], why: byModel.length ? 'radio model' : 'aircraft name', cand, model };
  }
  const pick = (list) => {
    const m = list.filter(r => cand.includes(cellsOf(r)));
    if (m.length < 2) return m;
    const sizes = [...new Set(m.map(cellsOf))];
    if (sizes.length > 1) { const typ = sizes.filter(n => t.vStart / n >= 3.7 && t.vStart / n <= 4.4); if (typ.length) return m.filter(r => typ.includes(cellsOf(r))); }
    return m;
  };
  const j = pick(job);
  if (j.length === 1) return { rpa: j[0], why: cellsOf(j[0]) + 'S on this job', cand, model };
  if (j.length > 1) return { rpa: '', why: 'several ' + cellsOf(j[0]) + 'S aircraft on this job', options: j, cand, model };
  const f = pick(all);
  if (f.length === 1) return { rpa: f[0], why: cellsOf(f[0]) + 'S in the fleet (not on this job yet)', cand, model };
  if (f.length > 1) return { rpa: '', why: 'several matching aircraft in the fleet', options: f, cand, model };
  return { rpa: '', why: !(t && t.vStart > 0) ? 'no RxBt voltage in the log' : all.some(r => cellsOf(r)) ? 'no aircraft set to ' + (likelyCells(t.vStart) || '?') + 'S' : 'no battery cell counts set on the fleet yet', cand, model };
};
// Builds a planner flight entry from a telemetry summary
export const flightFromTelemetry = (t) => {
  const ft = (m) => String(Math.round((m || 0) * 3.28084));
  return {
    id: Date.now() + Math.random(), source: 'telemetry',
    label: fmtTlmDate(t.startMs) + ' ' + fmtTlmTime(t.startMs) + '–' + fmtTlmTime(t.endMs),
    duration: String(Math.max(1, Math.round(t.durationSec / 60))), batteries: '', showHeights: false,
    segments: [
      { id: Date.now() + Math.random(), name: 'Take-Off', maxFt: ft(t.takeoffMaxM), minFt: '', useRange: false },
      { id: Date.now() + Math.random(), name: 'Flight Operation', maxFt: ft(t.maxAltM), minFt: '', useRange: false },
      { id: Date.now() + Math.random(), name: 'Landing', maxFt: ft(t.landingMaxM), minFt: '', useRange: false },
    ],
    telemetry: t,
  };
};

// v7.42: the radio's clock was set wrong at import (UTC vs local). The log holds wall-clock times; reading them as UTC
// or as local time gives two instants that differ by the time-zone offset. Move a flight to the other reading.
export const retimeTelemetry = (t, to) => {
  if (!t || !t.startMs || (t.clock || 'utc') === to) return t;
  const off = (ms) => new Date(ms).getTimezoneOffset() * 60000; // Brisbane: -10 h
  const shift = to === 'local' ? off(t.startMs) : -off(t.startMs - off(t.startMs));
  return { ...t, clock: to, startMs: t.startMs + shift, endMs: (t.endMs || t.startMs) + shift };
};
export const retimeFlight = (f, to) => {
  if (!f || !f.telemetry) return f;
  const t2 = retimeTelemetry(f.telemetry, to); if (t2 === f.telemetry) return f;
  const auto = (t) => fmtTlmDate(t.startMs) + ' ' + fmtTlmTime(t.startMs) + '–' + fmtTlmTime(t.endMs);
  return { ...f, telemetry: t2, label: f.label === auto(f.telemetry) ? auto(t2) : f.label };
};
