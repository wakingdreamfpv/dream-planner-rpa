// Dream Planner RPA — Home dashboard (v7.0). Configurable widgets; layout and widget settings are kept on this device.
// The planner passes in everything it knows (jobs, hours, compliance, setup) plus actions; weather, daylight and Kp are fetched here.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { daylight } from './sun.js';

const LS_KEY = 'wd_dash_v1';
export const WIDGETS = {
  actions:    { title: 'Quick actions',            icon: 'fa-bolt',                size: 'l', free: true },
  nextjob:    { title: 'Next job',                 icon: 'fa-plane-departure',     size: 'm', free: true },
  weather:    { title: 'Local weather',            icon: 'fa-cloud-sun',           size: 'm', free: true },
  gonogo:     { title: 'Go / no-go',               icon: 'fa-traffic-light',       size: 's', free: true },
  daylight:   { title: 'Daylight & twilight',      icon: 'fa-sun',                 size: 's', free: true },
  sunpath:    { title: 'Sun direction & golden hour', icon: 'fa-compass',          size: 's', free: true },
  kp:         { title: 'Kp index (GPS)',           icon: 'fa-satellite',           size: 's', free: true },
  awaiting:   { title: 'Awaiting action',          icon: 'fa-bell',                size: 'm' },
  drafts:     { title: 'Saved drafts & plans',     icon: 'fa-pen-to-square',       size: 'm' },
  completed:  { title: 'Recently completed jobs',  icon: 'fa-circle-check',        size: 'm' },
  pilots:     { title: 'Pilot flight hours',       icon: 'fa-user-astronaut',      size: 'm' },
  fleet:      { title: 'RPA fleet hours',          icon: 'fa-helicopter',          size: 'm' },
  compliance: { title: 'Upcoming compliance',      icon: 'fa-calendar-check',      size: 'm' },
  setup:      { title: 'Setup completion',         icon: 'fa-list-check',          size: 's' },
  links:      { title: 'Quick links',              icon: 'fa-link',                size: 's', free: true },
  battery:    { title: 'Battery health',           icon: 'fa-car-battery',         size: 'm', off: true },
  monthly:    { title: 'Monthly activity',         icon: 'fa-chart-column',        size: 'm', off: true },
  notes:      { title: 'Notes',                    icon: 'fa-note-sticky',         size: 's', off: true, free: true },
};
const ORDER = ['actions', 'nextjob', 'weather', 'gonogo', 'daylight', 'sunpath', 'kp', 'awaiting', 'drafts', 'completed', 'compliance', 'pilots', 'fleet', 'setup', 'links', 'battery', 'monthly', 'notes'];
const DEFAULT_LINKS = [
  { label: 'OK2FLY', url: 'https://www.ok2fly.com.au/' },
  { label: 'NAIPS', url: 'https://www.airservicesaustralia.com/naips/' },
  { label: 'BoM radar', url: 'http://www.bom.gov.au/australia/radar/' },
  { label: 'myCASA', url: 'https://my.casa.gov.au/' },
  { label: 'CASA drone rules', url: 'https://www.casa.gov.au/drones' },
];
const DEFAULTS = {
  order: ORDER, hidden: Object.fromEntries(Object.entries(WIDGETS).filter(([, w]) => w.off).map(([k]) => [k, true])), size: {},
  loc: { mode: 'job', lat: null, lng: null, label: '' },
  limits: { wind: 30, gust: 38, rain: 40, vis: 5000, height: '120' },
  draftsN: 5, completedN: 5, compDays: 60, links: DEFAULT_LINKS, notes: '',
};
const load = () => { try { const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (!s) return DEFAULTS;
  const order = [...(s.order || []).filter(k => WIDGETS[k]), ...ORDER.filter(k => !(s.order || []).includes(k))];
  return { ...DEFAULTS, ...s, order, limits: { ...DEFAULTS.limits, ...(s.limits || {}) }, loc: { ...DEFAULTS.loc, ...(s.loc || {}) } }; } catch (e) { return DEFAULTS; } };

const fmtHM = (sec) => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
const fmtD = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d && m && y ? `${d}/${m}/${y}` : iso; };
const fmtT = (d) => d ? d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : '—';
const ago = (ms) => { if (!ms) return ''; const d = Math.floor((Date.now() - ms) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`; };
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const dirName = (deg) => deg == null ? '' : COMPASS[Math.round(deg / 22.5) % 16];
const Empty = ({ children }) => <div className="text-sm text-slate-400 py-3">{children}</div>;
const Btn = ({ children, onClick, kind = 'ghost', ...p }) => (
  <button type="button" onClick={onClick} {...p} className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg ${kind === 'primary' ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'text-violet-700 hover:bg-violet-50'}`}>{children}</button>
);

// ── Weather (Open-Meteo, free, no key) ──────────────────────────────────────
function useWeather(lat, lng) {
  const [st, setSt] = useState({ loading: false, data: null, err: '' });
  useEffect(() => {
    if (lat == null || lng == null) { setSt({ loading: false, data: null, err: '' }); return; }
    const key = `wd_wx:${lat.toFixed(3)},${lng.toFixed(3)}`;
    try { const c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c && Date.now() - c.at < 15 * 60000) { setSt({ loading: false, data: c.data, err: '' }); return; } } catch (e) {}
    let dead = false; setSt(s => ({ ...s, loading: true, err: '' }));
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng
      + '&current=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
      + '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m,wind_speed_80m,wind_speed_120m,visibility,cloud_cover'
      + '&daily=sunrise,sunset,precipitation_probability_max,wind_gusts_10m_max&timezone=auto&forecast_days=3&wind_speed_unit=kmh';
    fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))).then(data => {
      if (dead) return; try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch (e) {}
      setSt({ loading: false, data, err: '' });
    }).catch(e => { if (!dead) setSt({ loading: false, data: null, err: e.message || 'offline' }); });
    return () => { dead = true; };
  }, [lat, lng]);
  return st;
}
// next N hours from the hourly series, starting at the current hour
const nextHours = (wx, n) => {
  if (!wx || !wx.hourly) return [];
  const h = wx.hourly, now = (wx.current && wx.current.time) ? wx.current.time.slice(0, 13) : new Date().toISOString().slice(0, 13);
  let i = h.time.findIndex(t => t.slice(0, 13) >= now); if (i < 0) i = 0;
  return h.time.slice(i, i + n).map((t, k) => ({ t, temp: h.temperature_2m[i + k], rain: h.precipitation_probability[i + k], wind: h.wind_speed_10m[i + k], gust: h.wind_gusts_10m[i + k],
    dir: h.wind_direction_10m[i + k], w80: h.wind_speed_80m[i + k], w120: h.wind_speed_120m[i + k], vis: h.visibility[i + k], cloud: h.cloud_cover[i + k] }));
};

function useKp() {
  const [st, setSt] = useState({ data: null, err: '' });
  useEffect(() => {
    try { const c = JSON.parse(sessionStorage.getItem('wd_kp') || 'null'); if (c && Date.now() - c.at < 60 * 60000) { setSt({ data: c.data, err: '' }); return; } } catch (e) {}
    let dead = false;
    fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json').then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))).then(rows => {
      const data = (rows || []).slice(1).map(r => ({ t: new Date(String(r[0]).replace(' ', 'T') + 'Z'), kp: parseFloat(r[1]), kind: r[2] })).filter(r => !isNaN(r.kp));
      if (dead) return; try { sessionStorage.setItem('wd_kp', JSON.stringify({ at: Date.now(), data })); } catch (e) {}
      setSt({ data, err: '' });
    }).catch(e => { if (!dead) setSt({ data: null, err: e.message || 'offline' }); });
    return () => { dead = true; };
  }, []);
  const data = st.data && st.data.map(r => ({ ...r, t: new Date(r.t) }));
  return { ...st, data };
}

// ── Widgets ─────────────────────────────────────────────────────────────────
function Actions({ d, a }) {
  const big = 'flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold';
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" data-dash-new="1" onClick={a.newJob} className={big + ' bg-violet-600 hover:bg-violet-700 text-white'}><i className="fa-solid fa-plus"></i>New operation</button>
      {d.current && d.current.started && <button type="button" data-dash-continue="1" onClick={a.continueJob} className={big + ' bg-slate-900 hover:bg-slate-800 text-white'}><i className="fa-solid fa-arrow-right"></i>Continue {d.current.name ? `“${d.current.name}”` : 'current job'}</button>}
      {!d.free && <button type="button" onClick={() => a.goTab('log')} className={big + ' border border-slate-200 hover:bg-slate-50 text-slate-700'}><i className="fa-solid fa-file-import text-violet-600"></i>Log flights</button>}
      {d.free ? <button type="button" onClick={a.openPlanFile} className={big + ' border border-slate-200 hover:bg-slate-50 text-slate-700'}><i className="fa-solid fa-folder-open text-violet-600"></i>Open a plan file</button>
        : <button type="button" onClick={a.exportBackup} className={big + ' border border-slate-200 hover:bg-slate-50 text-slate-700'}><i className="fa-solid fa-download text-violet-600"></i>Export backup</button>}
      <button type="button" onClick={() => a.goTab('preliminary')} className={big + ' border border-slate-200 hover:bg-slate-50 text-slate-700'}><i className="fa-solid fa-map-location-dot text-violet-600"></i>Plan & map</button>
    </div>
  );
}

function NextJob({ d, a }) {
  const j = d.nextJob;
  if (!j) return <Empty>No upcoming job. <button type="button" className="text-violet-700 font-semibold" onClick={a.newJob}>Plan one</button></Empty>;
  const days = j.date ? Math.round((new Date(j.date + 'T00:00') - new Date(new Date().toDateString())) / 86400000) : null;
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-14 text-center rounded-xl bg-violet-50 border border-violet-100 py-1.5">
        <div className="text-xl font-extrabold text-violet-800 leading-none">{days == null ? '—' : days <= 0 ? 'Today' : days}</div>
        <div className="text-[10px] uppercase tracking-wider text-violet-600 mt-0.5">{days == null ? 'no date' : days <= 0 ? '' : days === 1 ? 'day' : 'days'}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-800 truncate">{j.name}</div>
        <div className="text-xs text-slate-500">{[fmtD(j.date), j.client, j.id].filter(Boolean).join(' · ')}</div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${j.approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{j.approved ? 'Approved' : 'Draft'}</span>
          {j.missing > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{j.missing} mandatory item{j.missing === 1 ? '' : 's'} left</span>}
          {j.approved && !j.rpSigned && j.rpName && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">RPIC to sign</span>}
        </div>
      </div>
      <Btn kind="primary" onClick={() => a.openJob(j)}>Open</Btn>
    </div>
  );
}

function LocationPicker({ cfg, setCfg, d }) {
  const [q, setQ] = useState(''), [res, setRes] = useState([]), [msg, setMsg] = useState('');
  const gps = () => { if (!navigator.geolocation) { setMsg('Location is not available in this browser.'); return; } setMsg('Finding you…');
    navigator.geolocation.getCurrentPosition(p => { setMsg(''); setCfg({ loc: { mode: 'manual', lat: +p.coords.latitude.toFixed(4), lng: +p.coords.longitude.toFixed(4), label: 'My location' } }); },
      e => setMsg(e.code === 1 ? 'Location permission was declined. Search for a place instead.' : 'Couldn\'t get your location.'), { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }); };
  const search = async (e) => { e.preventDefault(); if (!q.trim()) return; setMsg('Searching…');
    try { const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=' + encodeURIComponent(q.trim())).then(r => r.json()); setRes(r.results || []); setMsg(r.results && r.results.length ? '' : 'No match.'); } catch (x) { setMsg('Search failed (offline?).'); } };
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-1.5">
        {d.jobLoc && <button type="button" onClick={() => setCfg({ loc: { mode: 'job', lat: null, lng: null, label: '' } })} className={`px-2.5 py-1 rounded-full border text-xs ${cfg.loc.mode === 'job' ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-300 text-slate-600'}`}>Current job site</button>}
        <button type="button" data-wx-gps="1" onClick={gps} className="px-2.5 py-1 rounded-full border border-slate-300 text-slate-600 text-xs"><i className="fa-solid fa-location-crosshairs mr-1"></i>Use my location</button>
      </div>
      <form onSubmit={search} className="flex gap-1.5"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a place, e.g. Burleigh Heads" className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm" /><button className="px-3 rounded-lg bg-slate-800 text-white text-xs font-semibold">Find</button></form>
      {res.map(r => <button type="button" key={r.id} onClick={() => { setRes([]); setQ(''); setCfg({ loc: { mode: 'manual', lat: r.latitude, lng: r.longitude, label: [r.name, r.admin1].filter(Boolean).join(', ') } }); }} className="block w-full text-left px-2 py-1 rounded hover:bg-slate-50 text-xs">{r.name}{r.admin1 ? ', ' + r.admin1 : ''}{r.country_code && r.country_code !== 'AU' ? ' (' + r.country_code + ')' : ''}</button>)}
      {msg && <div className="text-xs text-slate-500">{msg}</div>}
    </div>
  );
}

function Weather({ wx, loc, cfg, setCfg, d }) {
  if (!loc) return <div data-wx-setup="1"><p className="text-sm text-slate-600 mb-2">Where do you usually fly from? Weather, go/no-go, daylight and sun direction use this. A job's launch point is used automatically when it has one.</p><LocationPicker cfg={cfg} setCfg={setCfg} d={d} /></div>;
  if (wx.loading && !wx.data) return <Empty>Loading weather for {loc.label}…</Empty>;
  if (wx.err && !wx.data) return <Empty>Weather unavailable ({wx.err}). Check your connection.</Empty>;
  if (!wx.data) return null;
  const c = wx.data.current || {}, hrs = nextHours(wx.data, 12), rain3 = Math.max(0, ...hrs.slice(0, 3).map(h => h.rain || 0));
  const hk = cfg.limits.height === '80' ? 'w80' : cfg.limits.height === '10' ? 'wind' : 'w120';
  const hLabel = cfg.limits.height === '80' ? '80 m' : cfg.limits.height === '10' ? '10 m' : '120 m';
  return (
    <div>
      <div className="text-xs text-slate-500 mb-2"><i className="fa-solid fa-location-dot mr-1"></i>{loc.label}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl bg-sky-50 px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-sky-700 font-bold">Wind</div><div className="text-lg font-bold text-slate-800" data-wx-wind="1">{Math.round(c.wind_speed_10m)} <span className="text-xs font-semibold">km/h</span></div><div className="text-xs text-slate-500"><i className="fa-solid fa-location-arrow mr-1" style={{ transform: `rotate(${(c.wind_direction_10m || 0) + 135}deg)` }}></i>from {dirName(c.wind_direction_10m)}</div></div>
        <div className="rounded-xl bg-sky-50 px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-sky-700 font-bold">Gusts</div><div className="text-lg font-bold text-slate-800">{Math.round(c.wind_gusts_10m)} <span className="text-xs font-semibold">km/h</span></div><div className="text-xs text-slate-500">{hLabel}: {hrs[0] ? Math.round(hrs[0][hk]) : '—'} km/h</div></div>
        <div className="rounded-xl bg-sky-50 px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-sky-700 font-bold">Rain chance</div><div className="text-lg font-bold text-slate-800" data-wx-rain="1">{rain3}<span className="text-xs font-semibold">%</span></div><div className="text-xs text-slate-500">next 3 hours</div></div>
        <div className="rounded-xl bg-sky-50 px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-sky-700 font-bold">Temp · cloud</div><div className="text-lg font-bold text-slate-800">{Math.round(c.temperature_2m)}°</div><div className="text-xs text-slate-500">{c.cloud_cover}% cloud</div></div>
      </div>
      <div className="mt-3 overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 min-w-max">
          {hrs.map(h => (
            <div key={h.t} className="w-12 shrink-0 text-center rounded-lg bg-slate-50 py-1.5">
              <div className="text-[10px] text-slate-500">{new Date(h.t).toLocaleTimeString('en-AU', { hour: 'numeric' })}</div>
              <div className="text-xs font-bold text-slate-800">{Math.round(h.wind)}</div>
              <div className="text-[10px] text-slate-500">g{Math.round(h.gust)}</div>
              <div className="text-[10px] text-slate-400" title={`Wind at ${hLabel}`}>{Math.round(h[hk])}</div>
              <div className={`text-[10px] font-semibold ${h.rain >= 50 ? 'text-sky-700' : 'text-slate-400'}`}>{h.rain}%</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-slate-400 mt-1">Per hour: wind · gust · wind at {hLabel} (km/h) · rain chance. Forecast from Open-Meteo; check BoM and NAIPS before flying.</div>
      </div>
    </div>
  );
}

function GoNoGo({ wx, loc, cfg, d }) {
  if (!loc || !wx.data) return <Empty>Set a location in the Local weather card.</Empty>;
  const L = cfg.limits, hrs = nextHours(wx.data, 6);
  const hk = L.height === '80' ? 'w80' : L.height === '10' ? 'wind' : 'w120';
  const worst = (k) => Math.max(...hrs.map(h => h[k] || 0)), minVis = Math.min(...hrs.map(h => h.vis == null ? 99999 : h.vis));
  const grade = (v, lim, lower) => lower ? (v < lim ? 2 : v < lim * 1.6 ? 1 : 0) : (v > lim ? 2 : v > lim * 0.8 ? 1 : 0);
  const rows = [
    ['Wind at ' + (L.height === '10' ? '10 m' : L.height + ' m'), Math.round(worst(hk)) + ' km/h', grade(worst(hk), L.wind), 'limit ' + L.wind],
    ['Gusts', Math.round(worst('gust')) + ' km/h', grade(worst('gust'), L.gust), 'limit ' + L.gust],
    ['Rain chance', worst('rain') + '%', grade(worst('rain'), L.rain), 'limit ' + L.rain + '%'],
    ['Visibility', minVis >= 10000 ? '10 km+' : (minVis / 1000).toFixed(1) + ' km', grade(minVis, L.vis, true), 'min ' + (L.vis / 1000) + ' km'],
  ];
  const overall = Math.max(...rows.map(r => r[2]));
  const C = [['GO', 'bg-emerald-500', 'text-emerald-700'], ['MARGINAL', 'bg-amber-400', 'text-amber-700'], ['NO-GO', 'bg-rose-500', 'text-rose-700']];
  return (
    <div>
      <div className="flex items-center gap-3 mb-2"><span className={`w-4 h-4 rounded-full ${C[overall][1]}`}></span><span className={`text-xl font-extrabold ${C[overall][2]}`} data-gonogo={C[overall][0]}>{C[overall][0]}</span><span className="text-xs text-slate-500">next 6 hours</span></div>
      <div className="space-y-1">{rows.map(r => <div key={r[0]} className="flex items-center gap-2 text-xs"><span className={`w-2 h-2 rounded-full ${C[r[2]][1]}`}></span><span className="flex-1 text-slate-600">{r[0]}</span><span className="font-semibold text-slate-800">{r[1]}</span><span className="text-slate-400 w-16 text-right">{r[3]}</span></div>)}</div>
      <div className="text-[10px] text-slate-400 mt-2">Advisory only, against your limits in settings ({d.limitFor || 'all aircraft'}). The RPIC makes the call.</div>
    </div>
  );
}

function Daylight({ loc, d }) {
  if (!loc) return <Empty>Set a location in the Local weather card.</Empty>;
  const today = daylight(new Date(), loc.lat, loc.lng);
  const job = d.nextJob && d.nextJob.date && d.nextJob.date !== new Date().toISOString().slice(0, 10) ? { date: d.nextJob.date, ...daylight(new Date(d.nextJob.date + 'T12:00'), (d.nextJob.lat ?? loc.lat), (d.nextJob.lng ?? loc.lng)) } : null;
  const Row = ({ l, v, strong }) => <div className="flex justify-between text-xs"><span className="text-slate-500">{l}</span><span className={strong ? 'font-bold text-slate-800' : 'font-semibold text-slate-700'}>{v}</span></div>;
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Today</div>
      <Row l="Nautical dawn" v={fmtT(today.nauticalDawn)} /><Row l="First light (civil)" v={fmtT(today.firstLight)} strong /><Row l="Sunrise" v={fmtT(today.sunrise)} /><Row l="Sunset" v={fmtT(today.sunset)} /><Row l="Last light (civil)" v={fmtT(today.lastLight)} strong /><Row l="Nautical dusk" v={fmtT(today.nauticalDusk)} />
      {job && <><div className="text-[11px] font-bold uppercase tracking-wider text-violet-600 pt-1.5">Next job · {fmtD(job.date)}</div><Row l="First light / sunrise" v={fmtT(job.firstLight) + ' / ' + fmtT(job.sunrise)} /><Row l="Sunset / last light" v={fmtT(job.sunset) + ' / ' + fmtT(job.lastLight)} strong /><Row l="Nautical dusk" v={fmtT(job.nauticalDusk)} /></>}
      <div className="text-[10px] text-slate-400 pt-1">Night (for CASA purposes) runs from end of evening civil twilight to start of morning civil twilight.</div>
    </div>
  );
}

function SunPath({ loc, d }) {
  if (!loc) return <Empty>Set a location in the Local weather card.</Empty>;
  const t = daylight(new Date(), loc.lat, loc.lng);
  const job = d.nextJob && d.nextJob.date ? daylight(new Date(d.nextJob.date + 'T12:00'), (d.nextJob.lat ?? loc.lat), (d.nextJob.lng ?? loc.lng)) : null;
  const R = 46, cx = 56, cy = 56;
  const pt = (az, r = R) => [cx + r * Math.sin(az * Math.PI / 180), cy - r * Math.cos(az * Math.PI / 180)];
  const ray = (az, col) => { if (az == null) return null; const [x, y] = pt(az); return <g><line x1={cx} y1={cy} x2={x} y2={y} stroke={col} strokeWidth="3" strokeLinecap="round" /><circle cx={x} cy={y} r="5" fill={col} /></g>; };
  const brg = (az) => az == null ? '—' : Math.round(az) + '° ' + dirName(az);
  return (
    <div className="flex items-start gap-3">
      <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0" data-sunpath="1">
        <circle cx={cx} cy={cy} r={R} fill="#f8fafc" stroke="#cbd5e1" />
        {[0, 90, 180, 270].map(a => { const [x, y] = pt(a, R + 0.5); const [lx, ly] = pt(a, R - 9); return <g key={a}><line x1={x} y1={y} x2={pt(a, R - 4)[0]} y2={pt(a, R - 4)[1]} stroke="#94a3b8" /><text x={lx} y={ly + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#64748b">{['N', 'E', 'S', 'W'][a / 90]}</text></g>; })}
        {ray(t.riseAz, '#f59e0b')}{ray(t.setAz, '#ea580c')}
        <circle cx={cx} cy={cy} r="3" fill="#334155" />
      </svg>
      <div className="text-xs space-y-1 min-w-0">
        <div><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5"></span><b>Sunrise</b> {fmtT(t.sunrise)} · {brg(t.riseAz)}</div>
        <div><span className="inline-block w-2 h-2 rounded-full bg-orange-600 mr-1.5"></span><b>Sunset</b> {fmtT(t.sunset)} · {brg(t.setAz)}</div>
        <div className="pt-1 text-slate-600"><b className="text-amber-700">Golden hour</b><br />{fmtT(t.sunrise)}–{fmtT(t.goldenMorningEnd)} and {fmtT(t.goldenEveningStart)}–{fmtT(t.sunset)}</div>
        <div className="text-slate-600"><b className="text-indigo-700">Blue hour</b> {fmtT(t.firstLight)}–{fmtT(t.sunrise)} · {fmtT(t.sunset)}–{fmtT(t.lastLight)}</div>
        {job && d.nextJob.date !== new Date().toISOString().slice(0, 10) && <div className="pt-1 text-violet-700">Next job {fmtD(d.nextJob.date)}: rise {brg(job.riseAz)}, set {brg(job.setAz)}</div>}
      </div>
    </div>
  );
}

function Kp() {
  const kp = useKp();
  if (kp.err) return <Empty>Couldn't load the Kp forecast. <a className="text-violet-700 underline" href="https://www.swpc.noaa.gov/products/planetary-k-index" target="_blank" rel="noreferrer">NOAA Kp</a></Empty>;
  if (!kp.data) return <Empty>Loading…</Empty>;
  const now = Date.now();
  const cur = [...kp.data].reverse().find(r => r.t.getTime() <= now) || kp.data[0];
  const next = kp.data.filter(r => r.t.getTime() > now && r.t.getTime() < now + 24 * 3600e3);
  const max = Math.max(cur ? cur.kp : 0, ...next.map(r => r.kp));
  const col = (v) => v >= 5 ? 'text-rose-600' : v >= 4 ? 'text-amber-600' : 'text-emerald-600';
  return (
    <div>
      <div className="flex items-end gap-4">
        <div><div className={`text-3xl font-extrabold ${col(cur ? cur.kp : 0)}`} data-kp-now="1">{cur ? cur.kp.toFixed(1) : '—'}</div><div className="text-[10px] uppercase tracking-wider text-slate-500">now</div></div>
        <div><div className={`text-xl font-bold ${col(max)}`}>{max.toFixed(1)}</div><div className="text-[10px] uppercase tracking-wider text-slate-500">max next 24 h</div></div>
      </div>
      <div className="flex items-end gap-0.5 h-10 mt-2">{next.slice(0, 8).map(r => <div key={r.t.getTime()} title={r.t.toLocaleString('en-AU')} className={`flex-1 rounded-sm ${r.kp >= 5 ? 'bg-rose-400' : r.kp >= 4 ? 'bg-amber-300' : 'bg-emerald-300'}`} style={{ height: Math.max(8, r.kp / 9 * 100) + '%' }}></div>)}</div>
      <div className="text-[10px] text-slate-400 mt-1">Kp 5+ is a geomagnetic storm: GPS and compass can be unreliable. Source: NOAA SWPC.</div>
    </div>
  );
}

function Awaiting({ d, a }) {
  const items = d.awaiting || [];
  if (!items.length) return <Empty><i className="fa-solid fa-check text-emerald-500 mr-1"></i>Nothing waiting on you.</Empty>;
  return <div className="divide-y divide-slate-100">{items.map((it, i) => (
    <div key={i} className="flex items-center gap-3 py-2"><i className={`fa-solid ${it.icon || 'fa-circle-exclamation'} ${it.color || 'text-amber-500'}`}></i><div className="flex-1 min-w-0"><div className="text-sm text-slate-800 truncate">{it.label}</div>{it.sub && <div className="text-xs text-slate-500 truncate">{it.sub}</div>}</div>{it.act && <Btn onClick={it.act}>{it.cta || 'Open'}</Btn>}</div>
  ))}</div>;
}

function JobList({ list, n, a, kind }) {
  if (!list.length) return <Empty>{kind === 'completed' ? 'No completed jobs yet.' : 'No saved drafts or plans.'}</Empty>;
  return <div className="divide-y divide-slate-100">{list.slice(0, n).map(j => (
    <div key={j.key} className="flex items-center gap-3 py-2" data-dash-job={kind}>
      <div className="flex-1 min-w-0"><div className="text-sm font-medium text-slate-800 truncate">{j.name}</div>
        <div className="text-xs text-slate-500 truncate">{kind === 'completed' ? [fmtD(j.date), j.flights + ' flight' + (j.flights === 1 ? '' : 's'), fmtHM(j.sec)].filter(Boolean).join(' · ') : [fmtD(j.date), j.client, 'saved ' + ago(Date.parse(j.savedAt))].filter(Boolean).join(' · ')}</div></div>
      {kind !== 'completed' && <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${j.approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{j.approved ? 'Approved' : 'Draft'}</span>}
      <Btn onClick={() => a.openJob(j)}>Open</Btn>
    </div>
  ))}</div>;
}

function Hours({ rows, kind, a }) {
  if (!rows.length) return <Empty>{kind === 'fleet' ? 'Add aircraft in Database & Settings › Fleet.' : 'Pilot hours come from completed flight records.'}</Empty>;
  const max = Math.max(1, ...rows.map(r => r.sec));
  return <div className="space-y-2">{rows.map(r => (
    <div key={r.name}>
      <div className="flex items-baseline gap-2 text-sm"><span className="flex-1 min-w-0 truncate text-slate-800">{r.name}</span><span className="font-bold text-slate-800">{fmtHM(r.sec)}</span></div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${kind === 'fleet' ? 'bg-indigo-500' : 'bg-violet-500'}`} style={{ width: Math.max(2, r.sec / max * 100) + '%' }}></div></div>
      <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-500 mt-0.5">
        <span>{r.flights} flight{r.flights === 1 ? '' : 's'}</span>{r.last ? <span>last {ago(r.last)}</span> : null}
        {r.d90 != null && <span>90 days: {fmtHM(r.d90)}</span>}
        {kind === 'pilot' && r.last && Date.now() - r.last > 90 * 864e5 && <span className="text-amber-700 font-semibold">not flown in 90+ days</span>}
        {kind === 'fleet' && r.rego && <span>{r.rego}</span>}
        {kind === 'fleet' && r.regoDays != null && <span className={r.regoDays < 0 ? 'text-rose-700 font-semibold' : r.regoDays <= 30 ? 'text-amber-700 font-semibold' : ''}>rego {r.regoDays < 0 ? 'expired' : 'expires ' + fmtD(r.regoExp)}</span>}
      </div>
    </div>
  ))}</div>;
}

function Compliance({ d, cfg, a }) {
  const items = (d.compliance || []).filter(c => c.days <= cfg.compDays);
  if (!items.length) return <Empty><i className="fa-solid fa-check text-emerald-500 mr-1"></i>Nothing due in the next {cfg.compDays} days.</Empty>;
  return <div className="divide-y divide-slate-100">{items.slice(0, 8).map((c, i) => (
    <div key={i} className="flex items-center gap-3 py-1.5" data-dash-comp="1">
      <span className={`shrink-0 w-14 text-center text-[11px] font-bold rounded-full px-1.5 py-0.5 ${c.days < 0 ? 'bg-rose-100 text-rose-700' : c.days <= 7 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{c.days < 0 ? 'overdue' : c.days === 0 ? 'today' : c.days + ' d'}</span>
      <div className="flex-1 min-w-0"><div className="text-sm text-slate-800 truncate">{c.label}</div><div className="text-[11px] text-slate-500">{c.kind} · {fmtD(c.date)}</div></div>
    </div>
  ))}{items.length > 8 && <div className="pt-2"><Btn onClick={() => a.goTab('compliance')}>All {items.length} in the calendar</Btn></div>}</div>;
}

function Setup({ d }) {
  const s = d.setup; if (!s) return null;
  const pct = Math.round(100 * s.done / Math.max(1, s.total)), R = 26, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0"><circle cx="34" cy="34" r={R} fill="none" stroke="#ede9fe" strokeWidth="8" /><circle cx="34" cy="34" r={R} fill="none" stroke="#7c3aed" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 34 34)" /><text x="34" y="39" textAnchor="middle" fontSize="15" fontWeight="800" fill="#4c1d95">{pct}%</text></svg>
      <div className="space-y-1 min-w-0">{s.items.map(it => (
        <button type="button" key={it.id} onClick={it.done ? undefined : it.go} className={`flex items-center gap-1.5 text-xs text-left ${it.done ? 'text-slate-400 line-through cursor-default' : 'text-slate-700 hover:text-violet-700'}`}><i className={`fa-solid ${it.done ? 'fa-circle-check text-emerald-500' : 'fa-circle text-slate-200'}`}></i>{it.label}</button>
      ))}</div>
    </div>
  );
}

function Links({ cfg }) {
  return <div className="grid grid-cols-2 gap-1.5">{(cfg.links || []).map((l, i) => (
    <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm px-2.5 py-2 rounded-lg border border-slate-200 hover:bg-violet-50 hover:border-violet-200 text-slate-700 truncate"><i className="fa-solid fa-arrow-up-right-from-square text-[10px] text-violet-500"></i><span className="truncate">{l.label}</span></a>
  ))}</div>;
}

function Battery({ d }) {
  const b = d.batteries || [];
  if (!b.length) return <Empty>Battery use comes from completed flight records with packs logged.</Empty>;
  return <div className="divide-y divide-slate-100">{b.slice(0, 8).map(x => {
    const idle = x.last ? Math.floor((Date.now() - x.last) / 864e5) : null;
    return (<div key={x.name} className="flex items-center gap-3 py-1.5 text-sm"><span className="flex-1 min-w-0 truncate text-slate-800 font-mono text-xs">{x.name}</span><span className="text-xs text-slate-600">{x.flights} cycles</span>
      {x.minCell ? <span className={`text-[11px] ${x.minCell < 3.3 ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>min {x.minCell.toFixed(2)} V/cell</span> : null}
      {idle != null && idle > 30 && <span className="text-[11px] text-amber-700 font-semibold">idle {idle} d, check storage charge</span>}
      {x.flights >= 150 && <span className="text-[11px] text-rose-700 font-semibold">check IR / retire?</span>}</div>);
  })}</div>;
}

function Monthly({ d }) {
  const m = d.monthly || []; const max = Math.max(1, ...m.map(x => x.sec));
  if (!m.some(x => x.jobs)) return <Empty>Completed jobs per month will show here.</Empty>;
  return (
    <div>
      <div className="flex items-end gap-2 h-28">{m.map(x => (
        <div key={x.key} className="flex-1 flex flex-col items-center justify-end h-full">
          <div className="text-[10px] text-slate-500 mb-0.5">{x.sec ? fmtHM(x.sec) : ''}</div>
          <div className="w-full rounded-t-md bg-violet-500" style={{ height: Math.max(x.sec ? 4 : 0, x.sec / max * 80) + '%' }}></div>
        </div>
      ))}</div>
      <div className="flex gap-2 mt-1">{m.map(x => <div key={x.key} className="flex-1 text-center text-[10px] text-slate-500">{x.label}<div className="text-slate-400">{x.jobs} job{x.jobs === 1 ? '' : 's'} · {x.flights} fl</div></div>)}</div>
    </div>
  );
}

function Notes({ cfg, setCfg }) {
  return <textarea data-dash-notes="1" value={cfg.notes || ''} onChange={e => setCfg({ notes: e.target.value })} rows={5} placeholder="Gear to charge, client callbacks, things to check…" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-violet-200" />;
}

// ── Per-widget settings ─────────────────────────────────────────────────────
function Settings({ id, cfg, setCfg, d }) {
  const num = (k, label, step = 1) => <label className="flex items-center justify-between gap-2 text-xs"><span className="text-slate-600">{label}</span><input type="number" step={step} value={cfg.limits[k]} onChange={e => setCfg({ limits: { ...cfg.limits, [k]: Number(e.target.value) || 0 } })} className="w-20 px-2 py-1 border border-slate-300 rounded" /></label>;
  if (id === 'weather' || id === 'daylight' || id === 'sunpath') return <LocationPicker cfg={cfg} setCfg={setCfg} d={d} />;
  if (id === 'gonogo') return (
    <div className="space-y-1.5">
      {d.fleetLimits && d.fleetLimits.length > 0 && <div className="flex flex-wrap gap-1">{d.fleetLimits.map(f => <button type="button" key={f.name} onClick={() => setCfg({ limits: { ...cfg.limits, wind: f.wind, gust: f.gust }, limitFor: f.name })} className="px-2 py-0.5 rounded-full border border-slate-300 text-[11px] text-slate-600 hover:bg-violet-50">{f.name}</button>)}</div>}
      {num('wind', 'Max sustained wind (km/h)')}{num('gust', 'Max gust (km/h)')}{num('rain', 'Max rain chance (%)')}{num('vis', 'Min visibility (m)', 500)}
      <label className="flex items-center justify-between gap-2 text-xs"><span className="text-slate-600">Check wind at</span><select value={cfg.limits.height} onChange={e => setCfg({ limits: { ...cfg.limits, height: e.target.value } })} className="px-2 py-1 border border-slate-300 rounded"><option value="10">10 m (ground)</option><option value="80">80 m</option><option value="120">120 m (≈ 400 ft)</option></select></label>
    </div>
  );
  if (id === 'drafts' || id === 'completed') { const k = id === 'drafts' ? 'draftsN' : 'completedN'; return <label className="flex items-center justify-between text-xs"><span className="text-slate-600">How many to show</span><select value={cfg[k]} onChange={e => setCfg({ [k]: Number(e.target.value) })} className="px-2 py-1 border border-slate-300 rounded">{[3, 5, 8, 12].map(n => <option key={n}>{n}</option>)}</select></label>; }
  if (id === 'compliance') return <label className="flex items-center justify-between text-xs"><span className="text-slate-600">Look ahead</span><select value={cfg.compDays} onChange={e => setCfg({ compDays: Number(e.target.value) })} className="px-2 py-1 border border-slate-300 rounded">{[14, 30, 60, 90, 120].map(n => <option key={n} value={n}>{n} days</option>)}</select></label>;
  if (id === 'links') return <LinksEditor cfg={cfg} setCfg={setCfg} />;
  return <div className="text-xs text-slate-400">No settings for this widget.</div>;
}
function LinksEditor({ cfg, setCfg }) {
  const [l, setL] = useState(''), [u, setU] = useState('');
  const links = cfg.links || [];
  return (
    <div className="space-y-1.5 text-xs">
      {links.map((x, i) => <div key={i} className="flex items-center gap-2"><span className="flex-1 truncate">{x.label}</span><button type="button" onClick={() => setCfg({ links: links.filter((_, j) => j !== i) })} className="text-rose-600">Remove</button></div>)}
      <form onSubmit={e => { e.preventDefault(); if (!l.trim() || !/^https?:\/\//.test(u.trim())) return; setCfg({ links: [...links, { label: l.trim(), url: u.trim() }] }); setL(''); setU(''); }} className="flex gap-1">
        <input value={l} onChange={e => setL(e.target.value)} placeholder="Label" className="w-24 px-2 py-1 border border-slate-300 rounded" /><input value={u} onChange={e => setU(e.target.value)} placeholder="https://…" className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded" /><button className="px-2 rounded bg-slate-800 text-white">Add</button>
      </form>
      <button type="button" onClick={() => setCfg({ links: DEFAULT_LINKS })} className="text-slate-500 underline">Reset to defaults</button>
    </div>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────
export default function Dashboard({ d, a }) {
  const [cfg, setCfgState] = useState(load);
  const setCfg = (patch) => setCfgState(prev => { const next = { ...prev, ...patch }; try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch (e) {} return next; });
  const [edit, setEdit] = useState(false), [gear, setGear] = useState(null), [drag, setDrag] = useState(null);
  const allowed = (k) => !d.free || WIDGETS[k].free;
  const order = cfg.order.filter(allowed);
  const shown = order.filter(k => !cfg.hidden[k]);
  const hidden = order.filter(k => cfg.hidden[k]);
  const manual = cfg.loc.lat != null ? cfg.loc : null;
  const loc = cfg.loc.mode === 'job' ? (d.jobLoc || manual) : (manual || d.jobLoc);
  const wx = useWeather(loc ? +loc.lat : null, loc ? +loc.lng : null);
  const move = (k, dir) => { const o = [...cfg.order], i = o.indexOf(k), j = i + dir; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; setCfg({ order: o }); };
  const dropOn = (target) => { if (!drag || drag === target) return; const o = cfg.order.filter(k => k !== drag); o.splice(o.indexOf(target), 0, drag); setCfg({ order: o }); setDrag(null); };
  const span = (k) => { const s = cfg.size[k] || WIDGETS[k].size; return s === 'l' ? 'md:col-span-2 xl:col-span-12' : s === 'm' ? 'xl:col-span-6' : 'xl:col-span-4'; };
  const body = (k) => {
    switch (k) {
      case 'actions': return <Actions d={d} a={a} />;
      case 'nextjob': return <NextJob d={d} a={a} />;
      case 'weather': return <Weather wx={wx} loc={loc} cfg={cfg} setCfg={setCfg} d={d} />;
      case 'gonogo': return <GoNoGo wx={wx} loc={loc} cfg={cfg} d={{ ...d, limitFor: cfg.limitFor }} />;
      case 'daylight': return <Daylight loc={loc} d={d} />;
      case 'sunpath': return <SunPath loc={loc} d={d} />;
      case 'kp': return <Kp />;
      case 'awaiting': return <Awaiting d={d} a={a} />;
      case 'drafts': return <JobList list={d.drafts || []} n={cfg.draftsN} a={a} kind="drafts" />;
      case 'completed': return <JobList list={d.completed || []} n={cfg.completedN} a={a} kind="completed" />;
      case 'pilots': return <Hours rows={d.pilots || []} kind="pilot" a={a} />;
      case 'fleet': { const all = d.fleet || [], used = all.filter(f => f.sec > 0 || f.rego); const rows = used.slice(0, 8);
        return <>{rows.length ? <Hours rows={rows} kind="fleet" a={a} /> : <Empty>No logged flights or CASA registrations yet. Hours appear here from completed flight records.</Empty>}
          {used.length > 8 && <div className="text-xs text-slate-500 mt-2">+ {used.length - 8} more in Database &amp; Settings › Fleet</div>}</>; }
      case 'compliance': return <Compliance d={d} cfg={cfg} a={a} />;
      case 'setup': return <Setup d={d} />;
      case 'links': return <Links cfg={cfg} />;
      case 'battery': return <Battery d={d} />;
      case 'monthly': return <Monthly d={d} />;
      case 'notes': return <Notes cfg={cfg} setCfg={setCfg} />;
      default: return null;
    }
  };
  const hasSettings = (k) => ['weather', 'daylight', 'sunpath', 'gonogo', 'drafts', 'completed', 'compliance', 'links'].includes(k);
  return (
    <div data-dashboard="1" className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">{d.greeting}</h2>
          <p className="text-sm text-slate-500">{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{d.company ? ' · ' + d.company : ''}</p>
        </div>
        <button type="button" data-dash-edit="1" onClick={() => { setEdit(e => !e); setGear(null); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border ${edit ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-300 text-slate-700 hover:bg-white bg-white/60'}`}>
          <i className={`fa-solid ${edit ? 'fa-check' : 'fa-sliders'}`}></i>{edit ? 'Done' : 'Edit dashboard'}
        </button>
      </div>
      {edit && (
        <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/60 p-3 text-sm" data-dash-tray="1">
          <div className="text-violet-900 font-semibold mb-1.5">Customise</div>
          <p className="text-xs text-violet-800 mb-2">Drag cards (or use the arrows) to reorder, pick S / M / L for width, hide what you don't use. Saved on this device.</p>
          {hidden.length > 0 ? <div className="flex flex-wrap gap-1.5">{hidden.map(k => <button type="button" key={k} data-dash-add={k} onClick={() => setCfg({ hidden: { ...cfg.hidden, [k]: false } })} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-violet-200 text-xs text-violet-800 hover:bg-violet-100"><i className="fa-solid fa-plus"></i>{WIDGETS[k].title}</button>)}</div>
            : <div className="text-xs text-violet-700">All widgets are on the dashboard.</div>}
          <button type="button" onClick={() => { try { localStorage.removeItem(LS_KEY); } catch (e) {} setCfgState(DEFAULTS); }} className="mt-2 text-xs text-slate-500 underline">Reset layout</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 sm:gap-4" style={{ gridAutoFlow: 'row dense' }}>
        {shown.map((k, idx) => {
          const W = WIDGETS[k];
          return (
            <section key={k} data-widget={k} className={`${span(k)} bg-white rounded-xl border ${drag === k ? 'border-violet-400 opacity-60' : 'border-slate-200'} shadow-sm overflow-hidden flex flex-col`}
              draggable={edit} onDragStart={() => setDrag(k)} onDragEnd={() => setDrag(null)} onDragOver={e => { if (edit) e.preventDefault(); }} onDrop={() => dropOn(k)}>
              <header className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                {edit && <i className="fa-solid fa-grip-vertical text-slate-300 cursor-grab"></i>}
                <i className={`fa-solid ${W.icon} text-violet-600 text-sm`}></i>
                <h3 className="font-semibold text-slate-800 text-sm flex-1 min-w-0 truncate">{W.title}</h3>
                {!edit && hasSettings(k) && <button type="button" data-dash-gear={k} aria-label="Widget settings" onClick={() => setGear(gear === k ? null : k)} className={`w-7 h-7 rounded-full ${gear === k ? 'bg-violet-100 text-violet-700' : 'text-slate-400 hover:text-slate-700'}`}><i className="fa-solid fa-gear text-xs"></i></button>}
                {edit && <div className="flex items-center gap-0.5">
                  <button type="button" aria-label="Move up" disabled={idx === 0} onClick={() => move(k, -1)} className="w-7 h-7 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"><i className="fa-solid fa-arrow-up text-xs"></i></button>
                  <button type="button" aria-label="Move down" disabled={idx === shown.length - 1} onClick={() => move(k, 1)} className="w-7 h-7 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"><i className="fa-solid fa-arrow-down text-xs"></i></button>
                  {['s', 'm', 'l'].map(sz => <button type="button" key={sz} data-dash-size={k + ':' + sz} onClick={() => setCfg({ size: { ...cfg.size, [k]: sz } })} className={`w-6 h-6 rounded text-[10px] font-bold uppercase ${(cfg.size[k] || W.size) === sz ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{sz}</button>)}
                  <button type="button" data-dash-hide={k} aria-label="Hide" onClick={() => setCfg({ hidden: { ...cfg.hidden, [k]: true } })} className="w-7 h-7 rounded text-slate-500 hover:bg-rose-50 hover:text-rose-600"><i className="fa-solid fa-eye-slash text-xs"></i></button>
                </div>}
              </header>
              {gear === k && !edit && <div className="px-4 py-3 bg-slate-50 border-b border-slate-100" data-dash-settings={k}><Settings id={k} cfg={cfg} setCfg={setCfg} d={d} /></div>}
              <div className="px-4 py-3 flex-1">{body(k)}</div>
            </section>
          );
        })}
      </div>
      {d.free && <p className="text-xs text-slate-500 text-center">Saved drafts, flight records, pilot and fleet hours, compliance and setup widgets come with an account.</p>}
    </div>
  );
}
