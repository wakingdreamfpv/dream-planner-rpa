# Dream Planner connector for Claude (just for Mike's Mac)

Lets Claude read and fill in your planner jobs from a Claude chat: list jobs, read a job, read the company setup,
read a stack of EdgeTX flight-log CSVs from this Mac, add the flights to the right job, fill in batteries / OONP /
crew log, and create or edit **draft** jobs. Approved plans are never re-planned from here (only their flight log is
filled in), and approval can't be set from here.

## One-time setup
1. In the planner, make sure your login has a password: Account → Set or change password.
2. In Terminal, sign the connector in (your password is typed there, hidden, and never stored):

   ```
   ~/.local/node/bin/node "/Users/michaelrubio/Desktop/RPAS App/Projects/dream-planner-rpa/connector/login.mjs"
   ```
3. Quit Claude (Cmd+Q), then in Terminal run `~/.local/node/bin/node "/Users/michaelrubio/Desktop/RPAS App/Projects/dream-planner-rpa/connector/install.mjs"`, then open Claude again. "dream-planner" is listed under connectors (it is added to
   `~/Library/Application Support/Claude/claude_desktop_config.json`; the old file is kept next to it as
   `claude_desktop_config.json.backup-before-dream-planner`).

Sign out any time: run `login.mjs --out` the same way. The login is kept in `~/.dream-planner/session.json`, readable
only by you.

## Things to know
- Changes are saved to your account; each device picks them up the next time it opens the job list. A device that has
  unsaved changes to that same job keeps its own version, so save or close the job on your devices first.
- Flights added through the connector carry the height/speed chart readings (from v7.65). Adding a log again fills in
  the readings on flights that were added before without them; nothing else on those flights changes.
- Radio clock: logs are read as UTC (the planner's default). If your radio clock is set to local time, change
  `WD_TLM_CLOCK` to `local` in the Claude config.
