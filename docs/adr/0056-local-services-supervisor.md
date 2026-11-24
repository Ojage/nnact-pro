# ADR: Local services supervisor and Claude Code panel

Date: 2026-11-24
Status: Accepted
Sequence: 0056

## Context

Running NNACT Pro locally means juggling the API, two Next.js apps, the worker and the compose infrastructure across terminals. Developers work inside Claude Code and want to see and control these services without leaving it, in every session opened in this repository. Several sessions may be open at once.

## Decision

- A supervisor in `tools/services` (Node 24, TypeScript run directly, no dependencies, not a workspace package) manages the services listed in the committed `tools/services/services.json`. That file is the allowlist. Commands run by argument vector, never through a shell.
- Each service runs under a small runner process started detached as the leader of its own process group. The runner writes the service's output, redacted, to a size-capped rotating log. Because the runner owns the service, services and their logs survive the supervisor or Claude Code exiting. Quitting Claude leaves services running by design.
- The supervisor is controlled over a unix socket in `.services/run/` (folder 0700, socket 0600). There is no TCP listener. One supervisor per repository is guaranteed by an exclusive lock file holding the holder's PID and kernel start time. A stale lock is replaced.
- Records carry the kernel start time of every PID, so a reused PID is never signalled. Stop signals the whole process group, escalating to SIGKILL after a timeout, and only for groups the supervisor started. Ports are never used to find processes to kill. A busy port blocks a start and names its holder.
- The Claude Code side is a mod (a plugin with a hooks module) in `.claude/skills/nnact-services`. It provides a `/services` command, a pane with one row per service, and a status-line entry. It only calls the services CLI. It never hooks tool calls.

## Consequences

- If the runner is killed with SIGKILL, its record is detected as stale and cleared. Leftover processes in its group are still recognised as the supervisor's and are stopped.
- Linux only. The process-group and `/proc` logic would need a separate implementation on Windows.
- Log redaction is pattern-based. It masks every value of the configured env file and common secret, phone and email shapes. It cannot guarantee that no customer data reaches the log.
