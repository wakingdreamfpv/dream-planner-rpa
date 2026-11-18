// Dream Planner connector for Claude (MCP over stdio). Claude starts it; it uses your saved planner login.
// Sign in first: node connector/login.mjs
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { client } from './session.mjs';
import { makeTools } from './tools.mjs';
const VERSION = '7.42';
const sb = client();
let tools = null;
const ready = (async () => {
  const { data } = await sb.auth.getSession();
  const user = data && data.session && data.session.user;
  tools = makeTools(sb, { userId: user && user.id, clock: process.env.WD_TLM_CLOCK || 'utc' });
  return user;
})();
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  let m; try { m = JSON.parse(line); } catch (e) { return; }
  const { id, method, params } = m;
  try {
    if (method === 'initialize') return reply(id, { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} },
      serverInfo: { name: 'dream-planner', version: VERSION },
      instructions: 'Tools for the Dream Planner RPA account of the signed-in CRP: list and read jobs, read the company setup, read EdgeTX flight-log CSVs from this Mac (say which radio clock: Mike\'s radio is on local Brisbane time from November 2026, UTC before), add flights to a job\'s log, fill in batteries / OONP / crew log, and create or edit DRAFT jobs. Approved plans are never re-planned here. Before saving, tell the user what you will change.' });
    if (method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) return;
    if (method === 'ping') return reply(id, {});
    await ready;
    if (method === 'tools/list') return reply(id, { tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.schema })) });
    if (method === 'tools/call') {
      const user = await ready;
      if (!user) return reply(id, { isError: true, content: [{ type: 'text', text: 'Not signed in. In Terminal, run: node "' + fileURLToPath(new URL('./login.mjs', import.meta.url)) + '"' }] });
      const t = tools[params && params.name]; if (!t) return fail(id, -32602, 'Unknown tool ' + (params && params.name));
      try { const out = await t.run((params && params.arguments) || {}); return reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }] }); }
      catch (e) { return reply(id, { isError: true, content: [{ type: 'text', text: e.user ? e.message : 'Error: ' + (e && e.message || e) }] }); }
    }
    if (id !== undefined) fail(id, -32601, 'Method not found: ' + method);
  } catch (e) { if (id !== undefined) fail(id, -32603, String(e && e.message || e)); }
});
