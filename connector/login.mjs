// Sign the Dream Planner connector in to your planner account (run it yourself in Terminal):
//   node connector/login.mjs           sign in
//   node connector/login.mjs --out     sign out (forget the login on this Mac)
// Uses your planner email and password (set one in the planner: Account → Set or change password).
// The password is typed here only, hidden, and is never stored; only the login session is kept, readable only by you.
import readline from 'node:readline';
import { client, signOut, DIR } from './session.mjs';
if (process.argv.includes('--out')) { signOut(); console.log('Signed out. The connector can no longer reach your account until you sign in again.'); process.exit(0); }
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const ask = (q, hide) => new Promise(res => { if (hide) { rl.stdoutMuted = true; process.stdout.write(q); } rl.question(hide ? '' : q, (a) => { rl.stdoutMuted = false; if (hide) process.stdout.write('\n'); res(a); }); });
rl._writeToOutput = function (s) { if (!rl.stdoutMuted) rl.output.write(s); };
const email = (await ask('Planner email: ')).trim();
const password = await ask('Planner password (hidden): ', true);
rl.close();
const sb = client();
const { data, error } = await sb.auth.signInWithPassword({ email, password });
if (error) { console.log('Sign-in failed: ' + error.message + '\nNo password yet? In the planner: Account → Set or change password.'); process.exit(1); }
const { data: crp } = await sb.rpc('is_crp');
console.log('Signed in as ' + data.user.email + (crp === true ? ' (CRP).' : crp === false ? ' — note: this login is not the CRP, so it will only see the jobs it is on and cannot change them.' : '.'));
console.log('Login kept in ' + DIR + ' (only you can read it). Sign out any time: node connector/login.mjs --out');
process.exit(0);
