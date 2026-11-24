# NNACT services

Start, stop and watch NNACT Pro's local services from the terminal or from inside Claude Code. Linux only.

## Inside Claude Code (nothing to install)

The repository ships a Claude Code plugin in `.claude/skills/nnact-services`. Claude Code loads plugins from a project's `.claude/skills/` folder by itself, so every session opened in this repository gets it once the folder is trusted:

- **Services pane** beside the chat: one row per service with a state lamp (`●` running, `◐` starting, `▲` unhealthy, `✕` crashed, `○` stopped) plus words, port and uptime, and Start/Stop, Restart and Logs buttons. Press ctrl+x tab to focus it, use the arrow keys and Enter, `1`–`9` to start or stop a row, `r` to refresh, `q` to close. Logs show the newest lines live; `b` goes back.
- **`/services`**: `status`, `start <name>`, `stop <name>`, `restart <name>`, `logs <name>`, `open`.
- **Status line**: an entry such as `svc pg✕ redis○ api● web◐ cust○ worker○`, refreshed every 5 seconds.

When a session starts, the plugin makes sure the supervisor is running. It does this in the background, so startup never waits. It never starts a service unless that service has `"autostart": true`. Outside this repository it does nothing.

Check that it is loaded: `claude plugin list` shows `nnact-services@skills-dir … Status: ✔ loaded`.

**Turn it off for yourself:** `claude plugin disable nnact-services@skills-dir --scope local`. This writes `"nnact-services@skills-dir": false` under `enabledPlugins` in `.claude/settings.local.json`, which is gitignored. `claude plugin enable …` turns it back on. To remove it for everyone, delete `.claude/skills/nnact-services`.

## From a shell

```bash
pnpm services status            # or tools/services/services.sh status
pnpm services start api         # starts dependencies first
pnpm services logs api -f       # follow the redacted log
pnpm services watch             # status every 2 s
pnpm services stop-all          # stop every service; the supervisor stays
pnpm services shutdown          # stop every service, then the supervisor
```

Services keep running when Claude Code or the shell exits. Stop them with `stop`, `stop-all` or `shutdown`.

## Configuration: `services.json`

`tools/services/services.json` is the only list of things the supervisor can run. Each entry has:

| field | meaning |
|---|---|
| `name` | lowercase id, used everywhere (`api`, `web`) |
| `cwd` | folder inside the repository |
| `command`, `args` | one executable and its arguments; run directly, never through a shell |
| `port` | the port it listens on; a busy port blocks the start and names its holder |
| `healthcheck` | `{ "type": "http", "url": "http://127.0.0.1:…" }`, `{ "type": "tcp", "port": … }` or `{ "type": "process" }` |
| `envFile` | a KEY=VALUE file passed to the service; its values are masked in logs |
| `env` | extra variables |
| `autostart` | start when the supervisor starts (default `false`) |
| `dependsOn` | services started (and waited for) first |
| `stopSignal`, `stopTimeoutMs` | `SIGTERM` (default) or `SIGINT`; after the timeout the group gets `SIGKILL` |

The supervisor rereads the file on every request.

## How it works

- **Supervisor:** one per checkout, listening on `.services/run/supervisor.sock`. The folder is mode 0700 and the socket 0600, and there is no TCP port. A lock file holding the PID and kernel start time keeps it to one supervisor, however many sessions start at once.
- **Runners:** each service runs under a detached runner that leads its own process group. The runner writes the service's output to `.services/logs/<name>.log`, redacted, rotated at 5 MB, keeping 3 old files.
- **Stopping:** a stop signals the whole process group, and only groups this supervisor started. Each record stores the kernel start time of its PID, so a reused PID is never touched. Processes are never killed by port.
- **Redaction:** logs mask every value of the env file (6+ characters), credentials in URLs, bearer and API tokens, `password=`-style values, email addresses and phone numbers. Logs stay in the gitignored `.services/` folder.

## Development

```bash
pnpm test:services                                  # supervisor tests
cd tools/services && pnpm typecheck                  # TypeScript check
claude plugin validate .claude/skills/nnact-services # the Claude Code plugin
claude plugin test .claude/skills/nnact-services
```

Design notes: `docs/adr/0056-local-services-supervisor.md`.
