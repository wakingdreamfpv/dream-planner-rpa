// v7.15 (Chunk 9): printable records for CASA audits — one person's audit pack (details, certifications and currency,
// every signed sign-off with its signatures, flights counted, hours, manual reads and jobs) and the registers table.
// Printed through a hidden frame, so "Save as PDF" in the print dialog gives the PDF.
import { compLabel, STATUS_LABEL } from './currency.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtD = (d) => { if (!d) return '—'; const x = new Date(String(d).length === 10 ? d + 'T00:00:00' : d); return isNaN(x) ? esc(d) : x.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); };
const fmtDT = (d) => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? esc(d) : x.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const fmtHM = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}h ${String(m).padStart(2, '0')}m`; };
const ROLE = { crp: 'CRP', pilot: 'Pilot', observer: 'Observer' };
const SO_TYPE = { pilot_induction: 'Pilot induction', evlos_observer: 'EVLOS observer sign-off' };
const SO_STATUS = { draft: 'Draft', awaiting_crp: 'Waiting for the CRP', certified: 'Certified', not_yet_competent: 'Not yet competent' };
const HIDE = new Set(['importRef', 'importedAt', 'typeMap']);
const label = (k) => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const CSS = `@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:11px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:0}
h1{font-size:20px;margin:0}h2{font-size:13px;margin:18px 0 6px;padding-bottom:3px;border-bottom:2px solid #2d0a5e;color:#2d0a5e;text-transform:uppercase;letter-spacing:.06em}
h3{font-size:12px;margin:10px 0 4px}.band{background:#2d0a5e;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:10px}.band small{display:block;opacity:.75;text-transform:uppercase;letter-spacing:.12em;font-size:9px}
table{width:100%;border-collapse:collapse;margin:4px 0}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}th{font-size:9px;text-transform:uppercase;color:#64748b;background:#f8fafc}
.kv{display:grid;grid-template-columns:150px 1fr;gap:2px 10px}.kv div:nth-child(odd){color:#64748b}.pill{display:inline-block;padding:1px 6px;border-radius:9px;font-size:9px;font-weight:700}
.current{background:#d1fae5;color:#065f46}.due_soon{background:#fef3c7;color:#92400e}.expired{background:#fee2e2;color:#991b1b}.so{border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;margin:8px 0;page-break-inside:avoid}
.sig{display:flex;gap:16px;margin-top:6px}.sig>div{flex:1;border-top:1px solid #94a3b8;padding-top:3px}.sig img{max-height:48px;max-width:220px;display:block}.typed{font:italic 16px Georgia,serif}
.muted{color:#64748b}.foot{margin-top:18px;font-size:9px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:6px}`;

export function printHtml(title, body, testId = 'audit') {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
  document.querySelectorAll('iframe[data-print-frame]').forEach((f) => f.remove());
  const f = document.createElement('iframe');
  f.setAttribute('data-print-frame', testId); f.setAttribute('title', title);
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  f.srcdoc = html;
  f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* the print dialog isn't available here */ } };
  document.body.appendChild(f);
  return html;
}

const sigCell = (sig, who, at) => `<div>${sig && sig.image ? `<img src="${esc(sig.image)}" alt="signature">` : sig && sig.typed ? `<span class="typed">${esc(sig.typed)}</span>` : '<span class="muted">Not signed</span>'}
  <div>${esc(who)} · ${fmtDT(at)}${sig && sig.typed && !sig.image ? ' <span class="muted">(typed)</span>' : ''}</div></div>`;
function answersHtml(a) {
  const rows = Object.entries(a || {}).filter(([k, v]) => !HIDE.has(k) && v != null && v !== '' && !(Array.isArray(v) && !v.length));
  if (!rows.length) return '';
  const val = (v) => Array.isArray(v) ? esc(v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(', '))
    : typeof v === 'object' ? Object.entries(v).filter(([, x]) => x != null && x !== '' && !(Array.isArray(x) && !x.length)).map(([k, x]) => `<div><b>${esc(label(k))}:</b> ${val(x)}</div>`).join('')
      : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : esc(v).replace(/\n/g, '<br>');
  return `<div class="kv" style="margin-top:4px">${rows.map(([k, v]) => `<div>${esc(label(k))}</div><div>${val(v)}</div>`).join('')}</div>`;
}

export async function loadAuditData(sb, personId) {
  const one = async (q) => { try { const { data } = await q; return data || []; } catch (e) { return []; } };
  const { data: person, error } = await sb.from('people').select('*').eq('id', personId).maybeSingle();
  if (error) throw error; if (!person) throw new Error('Person not found');
  let cur = []; try { const { data } = await sb.rpc('crew_currency'); cur = (data || []).filter((r) => r.person_id === personId); } catch (e) { /* older database */ }
  const [certs, signoffs, flights, exp, hours, jobs, reads] = await Promise.all([
    one(sb.from('certifications').select('*').eq('person_id', personId).order('check_date', { ascending: false })),
    one(sb.from('signoff_records').select('*').eq('person_id', personId).order('created_at', { ascending: true })),
    one(sb.from('flight_counts').select('competency, flight_date, flight_ref').eq('person_id', personId).order('flight_date', { ascending: false })),
    one(sb.from('experience').select('rpa_type, hours').eq('person_id', personId)),
    one(sb.from('pilot_hours').select('rpa_type, flights, seconds, last_flown').eq('person_id', personId)),
    one(sb.from('job_crew').select('job_role, jobs:job_id (title, op_id, status, start_date)').eq('person_id', personId)),
    person.user_id ? one(sb.from('document_access_log').select('document, doc_version, page, opened_at, duration_s').eq('user_id', person.user_id).order('opened_at', { ascending: false }).limit(200)) : Promise.resolve([]),
  ]);
  return { person, cur, certs, signoffs, flights, exp, hours, jobs: jobs.filter((j) => j.jobs).map((j) => ({ ...j.jobs, role: j.job_role })), reads };
}

export function auditPackHtml(d, company = '') {
  const p = d.person, now = new Date();
  const kv = (rows) => `<div class="kv">${rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => `<div>${esc(k)}</div><div>${v}</div>`).join('')}</div>`;
  const yrs = p.date_last_engaged ? (now - new Date(p.date_last_engaged)) / (365.25 * 864e5) : null;
  let h = `<div class="band"><small>${esc(company || 'Dream Planner RPA')} · Crew audit pack</small><h1>${esc(p.full_name)}</h1><div>${esc(ROLE[p.role] || p.role)}${p.active === false ? ' · inactive' : ''} · printed ${fmtDT(now)}</div></div>`;
  h += `<h2>Details</h2>` + kv([['Email', esc(p.email)], ['Phone', esc(p.phone)], ['Address', esc(p.address)], ['ARN', esc(p.arn)], ['RePL', esc(p.repl_no)],
    ['Next of kin', esc([p.nok_name, p.nok_relationship, p.nok_phone].filter(Boolean).join(' · '))], ['Hours declared', p.total_hours != null ? esc(p.total_hours) + ' h' : ''],
    ['Medical expiry', p.medical_expiry ? fmtD(p.medical_expiry) : ''], ['Date last engaged', p.date_last_engaged ? fmtD(p.date_last_engaged) + (yrs > 7 ? ' — over 7 years ago (records may be archived)' : '') : '—'], ['Notes', esc(p.notes)]]);
  h += `<h2>Currency</h2>` + (d.cur.length ? `<table><tr><th>Competency</th><th>Checked</th><th>Assessor</th><th>Due</th><th>Status</th><th>Flights yr 1 / last 12 mo</th></tr>${d.cur.map((r) => `<tr><td>${esc(compLabel(r.competency))}</td><td>${fmtD(r.check_date)}</td><td>${esc(r.assessor)}</td><td>${r.due ? fmtD(r.due) : 'No expiry'}${r.extended ? ' <span class="muted">(extended by flights)</span>' : ''}</td><td><span class="pill ${esc(r.status)}">${esc(STATUS_LABEL[r.status] || r.status)}</span></td><td>${r.flights_first != null ? `${r.flights_first} / ${r.flights_recent}` : '—'}</td></tr>`).join('')}</table>` : '<p class="muted">No certifications.</p>');
  if (d.certs.length) h += `<h3>Every check on record</h3><table><tr><th>Competency</th><th>Checked</th><th>Next due</th><th>Assessor</th></tr>${d.certs.map((c) => `<tr><td>${esc(compLabel(c.competency))}</td><td>${fmtD(c.check_date)}</td><td>${fmtD(c.next_due)}</td><td>${esc(c.assessor)}</td></tr>`).join('')}</table>`;
  h += `<h2>Sign-offs (${d.signoffs.length})</h2>` + (d.signoffs.length ? d.signoffs.map((s) => `<div class="so"><b>${esc(SO_TYPE[s.type] || s.type)}</b> · ${esc(SO_STATUS[s.status] || s.status)}${s.locked ? ' · locked' : ''}${s.manual_version ? ' · manual ' + esc(s.manual_version) : ''}${(s.answers || {}).source ? ` · <i>${esc(s.answers.source)}</i>` : ''}
    ${answersHtml(s.answers)}<div class="sig">${sigCell(s.person_signature, (s.person_signature && s.person_signature.name) || p.full_name, s.person_signed_at)}${sigCell(s.crp_signature, 'CRP', s.crp_signed_at)}</div></div>`).join('') : '<p class="muted">None.</p>');
  const tot = d.hours.reduce((t, x) => t + (x.seconds || 0), 0);
  h += `<h2>Experience and logged time</h2>`;
  if (d.exp.length) h += `<h3>Hours on type (declared or verified)</h3><table><tr><th>Aircraft</th><th>Hours</th></tr>${d.exp.map((x) => `<tr><td>${esc(x.rpa_type)}</td><td>${esc(x.hours)}</td></tr>`).join('')}</table>`;
  h += d.hours.length ? `<h3>Logged with the company: ${fmtHM(tot)}</h3><table><tr><th>Aircraft</th><th>Flights</th><th>Time</th><th>Last flown</th></tr>${d.hours.map((x) => `<tr><td>${esc(x.rpa_type)}</td><td>${esc(x.flights)}</td><td>${fmtHM(x.seconds)}</td><td>${fmtD(x.last_flown)}</td></tr>`).join('')}</table>` : '<p class="muted">No flights logged with the company yet.</p>';
  if (d.flights.length) h += `<h3>Flights counted for currency (${d.flights.length})</h3><table><tr><th>Date</th><th>Counts towards</th><th>Flight</th></tr>${d.flights.map((f) => `<tr><td>${fmtD(f.flight_date)}</td><td>${esc(compLabel(f.competency))}</td><td>${esc(f.flight_ref)}</td></tr>`).join('')}</table>`;
  h += `<h2>Operations Manual reads</h2>` + (d.reads.length ? `<table><tr><th>Opened</th><th>Document</th><th>Version</th><th>Time spent</th></tr>${d.reads.map((r) => `<tr><td>${fmtDT(r.opened_at)}</td><td>${esc(r.document)}</td><td>${esc(r.doc_version)}</td><td>${r.duration_s != null ? Math.round(r.duration_s / 60) + ' min' : ''}</td></tr>`).join('')}</table>` : '<p class="muted">No reads recorded (only crew with a login are logged).</p>');
  h += `<h2>Jobs (${d.jobs.length})</h2>` + (d.jobs.length ? `<table><tr><th>Date</th><th>Job</th><th>Role</th><th>Status</th></tr>${d.jobs.sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || ''))).map((j) => `<tr><td>${fmtD(j.start_date)}</td><td>${esc(j.title || j.op_id)}</td><td>${esc(j.role)}</td><td>${esc(j.status)}</td></tr>`).join('')}</table>` : '<p class="muted">None.</p>');
  h += `<div class="foot">Records are kept for at least 7 years after the person was last engaged and are never deleted automatically.</div>`;
  return h;
}

export async function printAuditPack(sb, personId, company) {
  const d = await loadAuditData(sb, personId);
  return printHtml('Audit pack – ' + d.person.full_name, auditPackHtml(d, company), 'audit-pack');
}

export function printRegisters(rows, { title = 'Crew registers', company = '', filter = '' } = {}) {
  const body = `<div class="band"><small>${esc(company || 'Dream Planner RPA')}</small><h1>${esc(title)}</h1><div>${filter ? esc(filter) + ' · ' : ''}printed ${fmtDT(new Date())}</div></div>
  <table><tr><th>Person</th><th>Role</th><th>Competency</th><th>Checked</th><th>Assessor</th><th>Due</th><th>Status</th><th>Flights yr 1 / last 12 mo</th></tr>
  ${rows.map((r) => `<tr><td><b>${esc(r.full_name)}</b></td><td>${esc(ROLE[r.role] || r.role)}</td><td>${esc(compLabel(r.competency))}</td><td>${fmtD(r.check_date)}</td><td>${esc(r.assessor)}</td><td>${r.due ? fmtD(r.due) : 'No expiry'}</td><td><span class="pill ${esc(r.status)}">${esc(STATUS_LABEL[r.status] || r.status)}</span></td><td>${r.flights_first != null && !['induction', 'evlos_observer'].includes(r.competency) ? `${r.flights_first} / ${r.flights_recent}` : '—'}</td></tr>`).join('')}</table>
  <div class="foot">Currency: 12 months from the check, or up to 24 months while 3 flights of that kind are flown in each 12-month period.</div>`;
  return printHtml(title, body, 'registers');
}
