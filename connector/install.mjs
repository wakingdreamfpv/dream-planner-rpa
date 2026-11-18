// Adds the Dream Planner connector to the Claude desktop app. QUIT CLAUDE FIRST (Claude menu → Quit, or Cmd+Q):
// the app saves its own copy of the settings when it closes and would remove this entry again.
//   node connector/install.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const F = path.join(os.homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
let running = false; try { running = /Claude\.app\/Contents\/MacOS\/Claude/.test(execSync('ps -axo command', { encoding: 'utf8' })); } catch (e) {}
if (running) { console.log('Claude is still open. Quit it first (Claude menu → Quit Claude, or Cmd+Q), then run this again.'); process.exit(1); }
let d = {}; try { d = JSON.parse(fs.readFileSync(F, 'utf8')); fs.copyFileSync(F, F + '.backup-before-dream-planner'); } catch (e) {}
d.mcpServers = d.mcpServers || {};
d.mcpServers['dream-planner'] = { command: process.execPath, args: [fileURLToPath(new URL('./server.mjs', import.meta.url))], env: { WD_TLM_CLOCK: 'utc' } };
fs.mkdirSync(path.dirname(F), { recursive: true }); fs.writeFileSync(F, JSON.stringify(d, null, 2));
console.log('Done. Open Claude again: "dream-planner" is in the connectors (the tools / + menu in a new chat).');
