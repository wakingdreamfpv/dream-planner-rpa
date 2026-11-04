// v7.11: each login's email settings — the weekly / fortnightly compliance digest, the 7-day expiry alert, and
// which other emails they get. Saved in the cloud (notification_prefs); the digest function reads them.
import React, { useEffect, useState } from 'react';
import { getSupabase } from '../cloud/client.js';

const DAYS = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday']];
const EVENTS = {
  crp: [['rpic_signed', 'A pilot signs a job as RPIC'], ['induction', 'A pilot submits their induction']],
  crew: [['log_request', 'The CRP asks you to fill in a flight log'], ['induction', 'Your induction is certified']],
};

export default function NotificationSettings({ userId, role }) {
  const sb = getSupabase();
  const isCrp = role === 'crp';
  const def = { digest: isCrp ? 'weekly' : 'fortnightly', digest_day: 1, expiry_alerts: true, events: {} };
  const [p, setP] = useState(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(''), [preview, setPreview] = useState(null);
  useEffect(() => { (async () => {
    if (!sb || !userId) { setP(def); return; }
    try { const { data } = await sb.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle(); setP({ ...def, ...(data || {}) }); } catch (e) { setP(def); }
  })(); }, [userId]); // eslint-disable-line
  const save = async (next) => {
    setP(next); setMsg('');
    try {
      const row = { user_id: userId, digest: next.digest, digest_day: next.digest_day, expiry_alerts: next.expiry_alerts, events: next.events || {}, updated_at: new Date().toISOString() };
      if (isCrp && next.backup_email) row.backup_email = next.backup_email;
      let { error } = await sb.from('notification_prefs').upsert(row, { onConflict: 'user_id' });
      if (error && row.backup_email && /backup_email/.test(error.message || '')) { delete row.backup_email; ({ error } = await sb.from('notification_prefs').upsert(row, { onConflict: 'user_id' })); if (!error) { setMsg('Saved, except the backup email (run the Supabase migration 0009).'); return; } }
      if (error) throw error; setMsg('Saved.');
    } catch (e) { setMsg('Not saved: ' + (e.message || e) + (/relation|does not exist/i.test(String(e.message)) ? ' (run the Supabase migration 0008)' : '')); }
  };
  const run = async (mode) => {
    setBusy(mode); setMsg('');
    try {
      const { data, error } = await sb.functions.invoke('digest', { body: { mode } });
      if (error || (data && data.error)) throw new Error((data && data.error) || error.message);
      if (mode === 'preview') setPreview(data); else { const s = (data.sent || [])[0]; setMsg(s ? (s.skipped ? 'Not sent: email isn\'t set up (RESEND_API_KEY).' : s.ok ? 'Sent to your inbox: “' + s.subject + '”' : 'The email service refused it.') : 'Nothing was sent.'); }
    } catch (e) { setMsg('Couldn\'t run the digest: ' + (e.message || e) + '. Deploy the digest function (Verify JWT off).'); }
    setBusy('');
  };
  const download = async () => {
    setBusy('backup'); setMsg('');
    try {
      const { data, error } = await sb.functions.invoke('backup', { body: { mode: 'download' } });
      if (error || !data || data.error) throw new Error((data && data.error) || (error && error.message) || 'no data');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      a.download = 'Dream Planner cloud backup ' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      const c = data.counts || {}; setMsg(`Downloaded: ${c.people || 0} people, ${c.certifications || 0} certifications, ${c.signoff_records || 0} sign-offs, ${c.jobs || 0} jobs.`);
    } catch (e) { setMsg('Couldn\'t download the backup: ' + (e.message || e) + '. Deploy the backup function (Verify JWT off).'); }
    setBusy('');
  };
  if (!p) return <p className="text-sm text-slate-500">Loading…</p>;
  const ev = (k) => !(p.events && p.events[k] === false);
  const btn = 'px-3 py-1.5 rounded-md text-xs font-semibold border';
  return (
    <div className="space-y-4 text-sm" data-notify-settings="1">
      <div>
        <div className="font-semibold text-slate-800">Compliance digest</div>
        <p className="text-xs text-slate-500 mb-2">{isCrp ? 'Crew certifications expired or due within 60 days, crew who aren’t current for upcoming jobs, sign-offs waiting for you, your compliance calendar, and setup still to do.' : 'Your certifications that are due or expired, and anything you need for your upcoming jobs.'} Only sent when there’s something to look at.</p>
        <div className="flex flex-wrap items-center gap-2">
          {[['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['off', 'Off']].map(([k, l]) => <button key={k} type="button" data-digest={k} onClick={() => save({ ...p, digest: k })} className={`${btn} ${p.digest === k ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-slate-300 bg-white text-slate-700'}`}>{l}</button>)}
          {p.digest !== 'off' && <label className="text-xs text-slate-600 flex items-center gap-1">on <select data-digest-day="1" value={p.digest_day} onChange={(e) => save({ ...p, digest_day: Number(e.target.value) })} className="px-2 py-1 border border-slate-300 rounded-md text-xs bg-white">{DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> morning</label>}
        </div>
      </div>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" data-expiry-alerts="1" checked={!!p.expiry_alerts} onChange={(e) => save({ ...p, expiry_alerts: e.target.checked })} />
        <span><b>Expiry alert</b><span className="block text-xs text-slate-500">An extra email 7 days before {isCrp ? 'anyone’s' : 'your'} certification expires.</span></span></label>
      <div>
        <div className="font-semibold text-slate-800 mb-1">Other emails</div>
        {(isCrp ? EVENTS.crp : EVENTS.crew).map(([k, l]) => <label key={k} className="flex items-center gap-2 py-0.5"><input type="checkbox" data-event={k} checked={ev(k)} onChange={(e) => save({ ...p, events: { ...(p.events || {}), [k]: e.target.checked } })} />{l}</label>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-digest-preview="1" disabled={!!busy} onClick={() => run('preview')} className={`${btn} border-slate-300 bg-white`}>{busy === 'preview' ? 'Working…' : 'Preview my digest'}</button>
        <button type="button" data-digest-test="1" disabled={!!busy} onClick={() => run('test')} className={`${btn} border-violet-700 bg-violet-700 text-white`}>{busy === 'test' ? 'Sending…' : 'Email it to me now'}</button>
      </div>
      {isCrp && <div className="border-t border-slate-200 pt-3" data-backup-settings="1">
        <div className="font-semibold text-slate-800">Cloud backups</div>
        <p className="text-xs text-slate-500 mb-2">Every night the people, registers, sign-offs, jobs, flights and settings are saved to a private backup in Supabase. You can also get a copy emailed to you, so one lives outside Supabase.</p>
        <div className="flex flex-wrap items-center gap-2">
          {[['daily', 'Email daily'], ['weekly', 'Email weekly (Mondays)'], ['off', 'Don’t email']].map(([k, l]) => <button key={k} type="button" data-backup-email={k} onClick={() => save({ ...p, backup_email: k })} className={`${btn} ${(p.backup_email || 'weekly') === k ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-slate-300 bg-white text-slate-700'}`}>{l}</button>)}
          <button type="button" data-backup-download="1" disabled={!!busy} onClick={download} className={`${btn} border-slate-300 bg-white ml-auto`}><i className="fa-solid fa-cloud-arrow-down mr-1"></i>{busy === 'backup' ? 'Working…' : 'Download a cloud backup now'}</button>
        </div>
      </div>}
      {msg && <p className="text-xs text-slate-700" data-notify-msg="1">{msg}</p>}
      {preview && <div className="border border-slate-200 rounded-xl overflow-hidden" data-digest-previewed="1">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-xs"><b className="flex-1 truncate">{preview.subject}</b><button type="button" onClick={() => setPreview(null)} className="underline">Close</button></div>
        <iframe title="Digest preview" sandbox="" srcDoc={preview.html} className="w-full h-[480px] bg-white" />
      </div>}
    </div>
  );
}
