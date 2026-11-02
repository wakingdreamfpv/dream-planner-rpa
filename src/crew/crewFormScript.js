// Crew phone form script (runs inside the generated crew log page). Exported as text by crewFormScript.txt.js.

const { jobData, battOpts } = PAYLOAD;
const CHECKS = PAYLOAD.checks || [];
// v7.1: keep what's typed if the phone reloads the page
const SAVE_KEY = 'wdcrew:' + (jobData.identifier || 'job') + ':' + (jobData.uid || '');
let SAVED = null; try { SAVED = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) {}
const state = {
  weatherMeetsLimitations: false, weatherDetails: '',
  onsiteValidationInitials: '', planningErrors: '',
  conductedIAW: false, conductedChanges: '',
  serviceableAtEnd: false, defects: '',
  comments: '', crewRP: '', crewSecondRP: '', crewObserver: '',
  rpaLogs: {}, preflight: {},
};
if (SAVED) { Object.keys(state).forEach(k => { if (k !== 'rpaLogs' && SAVED[k] !== undefined) state[k] = SAVED[k]; }); }
function saveLocal() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {} }

document.getElementById('job-title').textContent = jobData.title || 'Unnamed Job';
document.getElementById('job-date').textContent = jobData.date || '—';
document.getElementById('job-location').textContent = jobData.location || '—';
document.getElementById('job-client').textContent = jobData.client || '—';
document.getElementById('job-rpas').textContent = (jobData.rpaTypes||[]).join(', ') || '—';
document.title = 'Crew Log — ' + (jobData.title || 'Job');

['weatherDetails','onsiteValidationInitials','planningErrors','conductedChanges','defects','comments','crewRP','crewSecondRP','crewObserver'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => { state[id] = el.value; updateStatus(); });
});

function toggleField(key, btnId) {
  state[key] = !state[key];
  const btn = document.getElementById(btnId);
  btn.className = 'toggle-btn ' + (state[key] ? 'on' : 'off');
  const cbox = document.getElementById('condbox-' + key);
  if (cbox) cbox.style.display = state[key] ? 'none' : 'block';
  updateStatus();
}

const DEFAULT_SEGS = () => [
  { id: 1, name: 'Take-Off',                 maxFt: '', minFt: '', useRange: false },
  { id: 2, name: 'Movement to Ops Area',     maxFt: '', minFt: '', useRange: false },
  { id: 3, name: 'Flight Operation',         maxFt: '', minFt: '', useRange: false },
  { id: 4, name: 'Movement to Landing Area', maxFt: '', minFt: '', useRange: false },
  { id: 5, name: 'Landing',                  maxFt: '', minFt: '', useRange: false },
];

function rpaKey(rpa){return rpa.replace(/[^a-z0-9]/gi,'_');}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function ra(rpa){return rpa.replace(/'/g,"\\'");}

function renderFlights(rpa){
  const key=rpaKey(rpa),container=document.getElementById('flights-'+key);
  if(!container)return;
  const flights=state.rpaLogs[rpa].flights,dlId='batts-'+key;
  const keepY=window.scrollY;
  container.innerHTML=flights.map((fl,idx)=>{
    const segs=(fl.segments&&fl.segments.length)?fl.segments:DEFAULT_SEGS();
    const peakFt=Math.max(0,...segs.map(s=>parseFloat(s.maxFt)||0));
    const over400=peakFt>400,showH=fl.showHeights;
    const segsHtml=segs.map(seg=>{
      const maxV=parseFloat(seg.maxFt)||0,hasMax=seg.maxFt!=='',over=hasMax&&maxV>400;
      const badgeId='bd-'+key+'-'+fl.id+'-'+seg.id;
      const badge=hasMax?(over?'<span class="badge-over">&#9888; &gt;400ft</span>':'<span class="badge-ok">&#10003; &#8804;400ft</span>'):'<span style="color:#cbd5e1">&#8212;</span>';
      const minCell=seg.useRange?'<input type="number" class="seg-ht-input" value="'+esc(seg.minFt)+'" placeholder="&#8212;" min="0" step="10" oninput="updateSeg(\''+ra(rpa)+'\','+fl.id+','+seg.id+',\'minFt\',this.value)" style="background:#eff6ff;border-color:#93c5fd;color:#1d4ed8">'
        :'<span style="color:#cbd5e1;display:block;text-align:center">&#8212;</span>';
      const removeBtn=segs.length>1?'<button class="remove-seg-btn" onclick="removeSeg(\''+ra(rpa)+'\','+fl.id+','+seg.id+')">&#215;</button>':'';
      return '<tr><td><input class="seg-name-input" type="text" value="'+esc(seg.name)+'" oninput="updateSeg(\''+ra(rpa)+'\','+fl.id+','+seg.id+',\'name\',this.value)"></td>'
        +'<td style="text-align:center"><input type="number" id="mx-'+key+'-'+fl.id+'-'+seg.id+'" class="seg-ht-input'+(over?' over':'')+'" value="'+esc(seg.maxFt)+'" placeholder="&#8212;" min="0" step="10" oninput="updateSeg(\''+ra(rpa)+'\','+fl.id+','+seg.id+',\'maxFt\',this.value)"></td>'
        +'<td style="text-align:center"><button class="seg-range-btn '+(seg.useRange?'on':'off')+'" onclick="updateSeg(\''+ra(rpa)+'\','+fl.id+','+seg.id+',\'useRange\','+((!seg.useRange))+')"><div class="seg-range-knob"></div></button></td>'
        +'<td style="text-align:center">'+minCell+'</td><td style="text-align:center" id="'+badgeId+'">'+badge+'</td><td>'+removeBtn+'</td></tr>';
    }).join('');
    const peakBar='<div id="pk-'+key+'-'+fl.id+'">'+peakBarHtml(peakFt)+'</div>';
    const _unusedPeak=peakFt>0?'<div class="peak-bar '+(over400?'over':'ok')+'">'+(over400?'&#9888;':'&#10003;')+' Peak: '+peakFt+'ft AGL ('+(peakFt/3.281).toFixed(0)+'m) &#8212; '+(over400?'Exceeds 400ft AGL':'Within 400ft AGL')+'</div>':'';
    const heightsPanel=showH?'<div class="heights-panel"><table class="heights-table"><thead><tr><th style="text-align:left">Segment</th><th>Max (ft)</th><th>Range</th><th>Min (ft)</th><th>&#8804;400ft</th><th></th></tr></thead><tbody>'+segsHtml+'</tbody></table><div style="margin-top:8px;display:flex;gap:12px"><button class="add-seg-btn" onclick="addSeg(\''+ra(rpa)+'\','+fl.id+')">+ Add segment</button><button class="add-seg-btn" style="color:#94a3b8" onclick="resetSegs(\''+ra(rpa)+'\','+fl.id+')">Reset defaults</button></div>'+peakBar+'</div>':'';
    const heightLabel=showH?'&#9660; Height Profile'+(peakFt>0?' &middot; Peak '+peakFt+'ft':''):'&#9654; Height Profile'+(peakFt>0?' &middot; Peak '+peakFt+'ft'+(over400?' &#9888;':' &#10003;'):' &#8212; tap to enter');
    const removeFlightBtn=flights.length>1?'<button onclick="removeFlight(\''+ra(rpa)+'\','+fl.id+')" style="color:#94a3b8;background:none;border:none;cursor:pointer;font-size:16px;line-height:1">&#215;</button>':'';
    return '<div class="flight-row">'
      +'<div class="flight-row-header"><span style="color:#94a3b8;font-weight:800">Flight '+(idx+1)+'</span>'
      +'<input type="text" value="'+esc(fl.label)+'" placeholder="Label (optional)" oninput="updateFlight(\''+ra(rpa)+'\','+fl.id+',\'label\',this.value)" style="flex:1;margin:0 8px;border:none;border-bottom:1px solid #e2e8f0;border-radius:0;padding:2px 4px;font-size:12px;background:transparent">'
      +removeFlightBtn+'</div>'
      +'<div class="flight-row-body"><div><label>Duration (mins)</label><input type="number" value="'+esc(fl.duration)+'" min="0" placeholder="0" oninput="updateFlight(\''+ra(rpa)+'\','+fl.id+',\'duration\',this.value)" style="font-family:monospace;font-weight:700"></div>'
      +'<div><label>Batteries Used</label><input type="text" list="'+dlId+'" value="'+esc(fl.batteries)+'" placeholder="Battery ID(s)&#8230;" oninput="updateFlight(\''+ra(rpa)+'\','+fl.id+',\'batteries\',this.value)"></div></div>'
      +'<button class="heights-toggle" id="ht-'+key+'-'+fl.id+'" onclick="toggleHeights(\''+ra(rpa)+'\','+fl.id+')">&#128208; '+heightLabel+'</button>'
      +heightsPanel+'</div>';
  }).join('');
  if(Math.abs(window.scrollY-keepY)>1)window.scrollTo(0,keepY);
  updateStatus();
}

function peakBarHtml(peakFt){
  const over400=peakFt>400;
  return peakFt>0?'<div class="peak-bar '+(over400?'over':'ok')+'">'+(over400?'&#9888;':'&#10003;')+' Peak: '+peakFt+'ft AGL ('+(peakFt/3.281).toFixed(0)+'m) &#8212; '+(over400?'Exceeds 400ft AGL':'Within 400ft AGL')+'</div>':'';
}
// Typing only updates the bits that depend on the value — the inputs themselves are never rebuilt,
// so focus and scroll position stay put.
function refreshFlightMeta(rpa,f){
  const key=rpaKey(rpa),segs=(f.segments&&f.segments.length)?f.segments:DEFAULT_SEGS();
  const peakFt=Math.max(0,...segs.map(s=>parseFloat(s.maxFt)||0)),over400=peakFt>400;
  segs.forEach(seg=>{
    const maxV=parseFloat(seg.maxFt)||0,hasMax=seg.maxFt!=='',over=hasMax&&maxV>400;
    const bd=document.getElementById('bd-'+key+'-'+f.id+'-'+seg.id);
    if(bd)bd.innerHTML=hasMax?(over?'<span class="badge-over">&#9888; &gt;400ft</span>':'<span class="badge-ok">&#10003; &#8804;400ft</span>'):'<span style="color:#cbd5e1">&#8212;</span>';
    const mx=document.getElementById('mx-'+key+'-'+f.id+'-'+seg.id);
    if(mx)mx.classList.toggle('over',over);
  });
  const pk=document.getElementById('pk-'+key+'-'+f.id);if(pk)pk.innerHTML=peakBarHtml(peakFt);
  const ht=document.getElementById('ht-'+key+'-'+f.id);
  if(ht)ht.innerHTML='&#128208; '+(f.showHeights?'&#9660; Height Profile'+(peakFt>0?' &middot; Peak '+peakFt+'ft':''):'&#9654; Height Profile'+(peakFt>0?' &middot; Peak '+peakFt+'ft'+(over400?' &#9888;':' &#10003;'):' &#8212; tap to enter'));
  updateStatus();
}

function toggleHeights(rpa,id){const f=state.rpaLogs[rpa].flights.find(x=>x.id===id);if(f){f.showHeights=!f.showHeights;renderFlights(rpa);}}
function addFlight(rpa){state.rpaLogs[rpa].flights.push({id:Date.now(),label:'',duration:'',batteries:'',showHeights:false,segments:DEFAULT_SEGS()});renderFlights(rpa);}
function removeFlight(rpa,id){if(state.rpaLogs[rpa].flights.length<=1)return;state.rpaLogs[rpa].flights=state.rpaLogs[rpa].flights.filter(f=>f.id!==id);renderFlights(rpa);}
function updateFlight(rpa,id,field,val){const f=state.rpaLogs[rpa].flights.find(x=>x.id===id);if(f){f[field]=val;updateStatus();}}
function updateSeg(rpa,flightId,segId,field,val){
  const f=state.rpaLogs[rpa].flights.find(x=>x.id===flightId);if(!f)return;
  if(!f.segments||!f.segments.length)f.segments=DEFAULT_SEGS();
  const seg=f.segments.find(s=>s.id===segId);
  if(seg)seg[field]=(field==='useRange')?(val===true||val==='true'):val;
  if(field==='useRange')renderFlights(rpa); else refreshFlightMeta(rpa,f);
}
function addSeg(rpa,flightId){const f=state.rpaLogs[rpa].flights.find(x=>x.id===flightId);if(f){if(!f.segments)f.segments=DEFAULT_SEGS();f.segments.push({id:Date.now(),name:'New Segment',maxFt:'',minFt:'',useRange:false});renderFlights(rpa);}}
function removeSeg(rpa,flightId,segId){const f=state.rpaLogs[rpa].flights.find(x=>x.id===flightId);if(f&&f.segments&&f.segments.length>1){f.segments=f.segments.filter(s=>s.id!==segId);renderFlights(rpa);}}
function resetSegs(rpa,flightId){const f=state.rpaLogs[rpa].flights.find(x=>x.id===flightId);if(f){f.segments=DEFAULT_SEGS();renderFlights(rpa);}}

// Build per-RPA flight sections
const rpaContainer = document.getElementById('rpa-sections');
(jobData.rpaTypes || []).forEach(rpa => {
  state.rpaLogs[rpa] = (SAVED && SAVED.rpaLogs && SAVED.rpaLogs[rpa]) || { flights: [{ id: 1, label: '', duration: '', batteries: '', showHeights: false, segments: DEFAULT_SEGS() }] };
  const batts = (battOpts[rpa] || []);
  const datalistId = 'batts-' + rpaKey(rpa);

  const dl = document.createElement('datalist');
  dl.id = datalistId;
  batts.forEach(b => { const o = document.createElement('option'); o.value = b; dl.appendChild(o); });
  document.body.appendChild(dl);

  const sec = document.createElement('div');
  sec.className = 'section';
  sec.innerHTML = '<div class="section-header" style="background:#1e293b;color:white;letter-spacing:0.3px;font-size:12px">' + rpa + ' &#8212; Flight Log</div>'
    + '<div class="section-body"><div id="flights-' + rpaKey(rpa) + '"></div>'
    + '<button class="add-flight-btn" onclick="addFlight(\'' + ra(rpa) + '\')">+ Add Flight</button></div>';
  rpaContainer.appendChild(sec);
  renderFlights(rpa);
});

function updateStatus() {
  saveLocal();
  const hasTime = Object.values(state.rpaLogs).some(r => r.flights.some(f => parseInt(f.duration) > 0));
  const hasInitials = !!state.onsiteValidationInitials.trim();
  const hasRP = !!state.crewRP.trim();
  const parts = [];
  if (!hasInitials) parts.push('onsite initials');
  if (!hasRP) parts.push('primary RP name');
  if (!hasTime) parts.push('at least one flight duration');
  const el = document.getElementById('submit-status');
  if (parts.length === 0) { el.textContent = '✅ Ready to download'; el.style.color = '#16a34a'; }
  else { el.textContent = 'Still needed: ' + parts.join(', '); el.style.color = '#64748b'; }
}

function downloadLog() {
  ['weatherDetails','onsiteValidationInitials','planningErrors','conductedChanges','defects','comments','crewRP','crewSecondRP','crewObserver'].forEach(id => {
    const el = document.getElementById(id);
    if (el) state[id] = el.value;
  });
  const output = {
    _type: 'wdfpv_crew_log', _version: 1,
    jobIdentifier: jobData.identifier, jobTitle: jobData.title,
    exportedAt: new Date().toISOString(),
    log: {
      weatherMeetsLimitations: state.weatherMeetsLimitations,
      weatherDetails: state.weatherDetails,
      onsiteValidationInitials: state.onsiteValidationInitials,
      planningErrors: state.planningErrors,
      conductedIAW: state.conductedIAW,
      conductedChanges: state.conductedChanges,
      serviceableAtEnd: state.serviceableAtEnd,
      defects: state.defects,
      comments: state.comments,
      crewRP: state.crewRP,
      crewSecondRP: state.crewSecondRP,
      crewObserver: state.crewObserver,
      rpaLogs: state.rpaLogs,
      preflightChecks: Object.keys(state.preflight || {}).length ? { enabled: true, items: state.preflight } : undefined,
    }
  };
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const fname = 'crew-log-' + (jobData.identifier || 'job') + '.json';
  // v7.1: on a phone, send it straight back (Messages, WhatsApp, email, AirDrop); otherwise download
  try {
    const file = new File([blob], fname, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Crew log ' + (jobData.identifier || ''), text: 'Completed crew log for ' + (jobData.title || 'the job') + '. Import it in the planner: Flight Log › Crew › Import log.' })
        .then(() => { document.getElementById('success-banner').textContent = '✅ Sent. Your ops manager imports it in the planner.'; document.getElementById('success-banner').style.display = 'block'; window.scrollTo({ top: 0, behavior: 'smooth' }); })
        .catch(() => {});
      return;
    }
  } catch (e) {}
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'crew-log-' + (jobData.identifier || 'job') + '.json';
  a.click();
  document.getElementById('success-banner').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

updateStatus();


// ── v7.1: restore typed fields and toggles after a reload ──
(function restore() {
  if (!SAVED) return;
  ['weatherDetails','onsiteValidationInitials','planningErrors','conductedChanges','defects','comments','crewRP','crewSecondRP','crewObserver'].forEach(id => { const el = document.getElementById(id); if (el && state[id]) el.value = state[id]; });
  [['weatherMeetsLimitations','toggle-weatherMeetsLimitations'],['conductedIAW','toggle-conductedIAW'],['serviceableAtEnd','toggle-serviceableAtEnd']].forEach(([k, id]) => {
    const btn = document.getElementById(id); if (!btn) return; btn.className = 'toggle-btn ' + (state[k] ? 'on' : 'off');
    const cbox = document.getElementById('condbox-' + k); if (cbox) cbox.style.display = state[k] ? 'none' : 'block';
  });
  updateStatus();
})();

// ── v7.1: pre-flight checklist on the phone ──
(function preflight() {
  if (!CHECKS.length) return;
  const css = document.createElement('style');
  css.textContent = '.pfc-item{display:flex;gap:10px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff}'
    + '.pfc-item.done{background:#ecfdf5;border-color:#a7f3d0}.pfc-item.na{background:#f8fafc;opacity:.75}'
    + '.pfc-t{font-weight:600;font-size:14px;color:#1e293b}.pfc-d{font-size:12px;color:#64748b;margin-top:2px}'
    + '.pfc-b{display:flex;gap:6px;flex-shrink:0}.pfc-b button{font:inherit;font-size:13px;font-weight:700;padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#334155}'
    + '.pfc-b button.on-done{background:#059669;border-color:#059669;color:#fff}.pfc-b button.on-na{background:#64748b;border-color:#64748b;color:#fff}'
    + '.pfc-g{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin:14px 0 6px}'
    + '.pfc-all{font:inherit;font-weight:800;font-size:14px;padding:10px 14px;border-radius:10px;border:0;background:#059669;color:#fff}'
    + '.pfc-clear{font:inherit;font-size:13px;padding:10px 12px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#475569}';
  document.head.appendChild(css);
  const sec = document.createElement('div'); sec.className = 'section'; sec.id = 'pfc-section';
  const all = []; CHECKS.forEach(g => g.items.forEach(it => all.push({ k: g.id + '.' + it.id, rel: g.rel })));
  function render() {
    const p = state.preflight || {}, n = all.filter(x => p[x.k]).length;
    let h = '<div class="section-header">Pre-Flight Checklist</div><div class="section-body">'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><button type="button" class="pfc-all" onclick="pfcAll()">✓ Check all</button><button type="button" class="pfc-clear" onclick="pfcClear()">Clear</button><span style="font-size:12px;color:#64748b">' + n + ' of ' + all.length + ' recorded</span></div>';
    CHECKS.forEach(g => {
      h += '<div class="pfc-g">' + esc(g.title) + (g.ops ? (g.rel ? ' · applies to this job' : ' · N/A for this job') : '') + '</div>';
      g.items.forEach(it => {
        const k = g.id + '.' + it.id, st = p[k] || '';
        h += '<div class="pfc-item ' + st + '"><div style="flex:1"><div class="pfc-t">' + esc(it.title) + '</div>' + (it.text ? '<div class="pfc-d">' + esc(it.text) + '</div>' : '') + '</div>'
          + '<div class="pfc-b"><button type="button" class="' + (st === 'done' ? 'on-done' : '') + '" onclick="pfcSet(\'' + k + '\',\'done\')">Done</button><button type="button" class="' + (st === 'na' ? 'on-na' : '') + '" onclick="pfcSet(\'' + k + '\',\'na\')">N/A</button></div></div>';
      });
    });
    sec.innerHTML = h + '</div>';
  }
  window.pfcSet = (k, v) => { state.preflight = { ...(state.preflight || {}) }; if (state.preflight[k] === v) delete state.preflight[k]; else state.preflight[k] = v; render(); updateStatus(); };
  window.pfcAll = () => { const p = { ...(state.preflight || {}) }; all.forEach(x => { if (!p[x.k]) p[x.k] = x.rel ? 'done' : 'na'; }); state.preflight = p; render(); updateStatus(); };
  window.pfcClear = () => { state.preflight = {}; render(); updateStatus(); };
  render();
  const partA = [...document.querySelectorAll('.section-header')].find(h => /Part A/.test(h.textContent));
  const anchor = partA ? partA.closest('.section') : null;
  if (anchor) anchor.insertAdjacentElement('afterend', sec); else document.querySelector('#rpa-sections').insertAdjacentElement('beforebegin', sec);
})();

// ── v7.1: send-back wording ──
(function () {
  const b = document.querySelector('.submit-bar .btn-success');
  if (b && navigator.canShare) b.textContent = '📤 Send completed log back';
})();
