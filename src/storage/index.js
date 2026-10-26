// ── Storage modes (Chunk 0 groundwork) ─────────────────────────────────────────────────────────────
// The planner currently stores everything in this browser's IndexedDB (wdStore in legacy/planner.jsx).
// Mike's requirement: choose per device between
//   'local' — everything stays on this device (no account needed)          ← the only mode in Chunk 0
//   'sync'  — local-first: works offline, syncs jobs to the cloud when online (Chunk 1+)
//   'cloud' — cloud is the source of truth; every save goes straight to the server (Chunk 1+)
// The mode is a per-device setting. Later chunks add a Supabase adapter behind the same interface:
//   load() / save(db) / saveSafety / loadSafety / saveWorking / listRecovery ... (see wdStore)
const KEY = 'wd_storage_mode';
const MODES = ['local', 'sync', 'cloud'];
export const storageMode = {
  get() { try { const m = localStorage.getItem(KEY); return MODES.includes(m) ? m : 'local'; } catch (e) { return 'local'; } },
  set(m) { if (!MODES.includes(m)) throw new Error('Unknown storage mode ' + m); try { localStorage.setItem(KEY, m); } catch (e) {} },
  available: ['local'], // 'sync' and 'cloud' become available once the backend exists
};
window.wdStorageMode = storageMode;
