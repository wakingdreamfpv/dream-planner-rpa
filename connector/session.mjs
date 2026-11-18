// Sign-in for the connector: the CRP's own Supabase login, kept in ~/.dream-planner/session.json (only readable by you).
// The publishable key below is public by design; the database's row-level security decides what this login can do.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createClient } from '@supabase/supabase-js';
const cfg = fs.readFileSync(new URL('../src/cloud/config.js', import.meta.url), 'utf8');
export const SUPABASE_URL = (/SUPABASE_URL\s*=.*?'(https:[^']+)'/.exec(cfg) || [])[1];
export const SUPABASE_KEY = (/SUPABASE_KEY\s*=.*?'(sb_publishable_[^']+)'/.exec(cfg) || [])[1];
export const DIR = process.env.WD_CONNECTOR_DIR || path.join(os.homedir(), '.dream-planner');
const FILE = path.join(DIR, 'session.json');
const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; } };
const write = (o) => { fs.mkdirSync(DIR, { recursive: true, mode: 0o700 }); fs.writeFileSync(FILE, JSON.stringify(o), { mode: 0o600 }); try { fs.chmodSync(FILE, 0o600); } catch (e) {} };
const storage = { getItem: (k) => read()[k] ?? null, setItem: (k, v) => { const o = read(); o[k] = v; write(o); }, removeItem: (k) => { const o = read(); delete o[k]; write(o); } };
export const client = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
export const signOut = () => { try { fs.unlinkSync(FILE); } catch (e) {} };
