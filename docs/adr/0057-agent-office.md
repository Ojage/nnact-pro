# ADR: Agent Office

Date: 2026-11-24
Status: Accepted
Sequence: 0057

## Context

The owner needs to watch every NNACT agent live: whether each one is running, what it is doing, what it costs, and what is waiting for a person. The owner also needs to pause one. Agents run in `apps/agents`, a separate process from the API.

## Decision

- **Telemetry**
  - Agents write heartbeats, run steps and log lines through new agent-token endpoints under `/api/agent/platform`.
  - Each write needs the `agent-runs:write` scope. An agent may only report on its own runs, in its own organization.
  - The API redacts every summary and log line before storing it: phone numbers, emails, credentials, quoted message text, and structured fields named like personal data.
  - Raw run content stays in `agent_runs` and is shown only through an owner-only reveal, which is written to `agent_audit_log` before the content is returned.
- **Status**
  - Status is derived, not stored. A paused agent is `paused`. An agent with no heartbeat in 90 s is `offline`. Otherwise the agent's own report counts: working, idle, waiting or error.
  - Agents not yet built appear as vacant offices, driven by a `stage` on each registry entry.
- **Live transport: cursor-polling, not LISTEN/NOTIFY**
  - Every write appends to `agent_office_events`. One poller per API process reads new rows by id each second and streams them over SSE.
  - The row id is the SSE event id, so a client that reconnects with `Last-Event-ID` resumes with nothing missed.
  - It needs no dedicated database connection, works behind transaction-mode poolers, and loses nothing across API restarts.
  - Changes to an agent's office are sent as "agent changed" and rebuilt per viewer organization, so a stream never carries another organization's runs.
- **Stream auth and limits**
  - EventSource cannot send headers, so the page connects with `withCredentials` and the httpOnly session cookie authenticates it. No token goes in a URL.
  - Limits: 3 streams per user and 200 per process. The server sends a keep-alive comment every 15 s, and the client falls back to polling after repeated errors.
- **Access**
  - Owner only. Dispatchers, secretaries, technicians and agent tokens are refused.
  - The page and nav item are available by default. The Agents page has an on/off switch for the local dashboard view; individual agent controls remain server-side and owner-only.
- **Controls**
  - Pause and resume flip `agent_controls.enabled` and require a reason. The audit row is written in the same transaction.
  - Retry re-queues the lease behind a failed run, and only for tasks that only write drafts, proposals or suggestions (`RETRYABLE_TASKS`). Customer-facing sends are never retried.
- **Retention**
  - Steps and log lines are kept 14 days (`AGENT_OFFICE_RETENTION_DAYS`), the change feed 24 hours, and dead heartbeats 7 days.
  - The purge runs hourly under a Postgres advisory lock.

## Rollback

Turn the Agents switch off on the Agents page to hide the office view locally. API routes remain owner-only; telemetry writes keep working and are purged on schedule.

The tables in migration `0058_agent_office.sql` are additive. They can be dropped in a later migration without touching any existing flow.
