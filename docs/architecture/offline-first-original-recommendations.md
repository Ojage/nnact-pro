> **Status:** Original input paper (2026-11-24), kept as the source. Superseded in detail by [offline-first-architecture.md](offline-first-architecture.md). It names FastAPI; the real cloud API is Fastify (`apps/api`).

Offline-First SaaS Architecture

Recommended target design and implementation roadmap | 24 November 2026

Decision paper for a multi-tenant, multi-branch operations platform serving small businesses with unreliable connectivity.

# Executive recommendation

Build a cloud-coordinated, offline-first platform. For the initial deployment, each branch uses one Windows desktop with a local database and durable synchronization engine. The cloud remains independently available for customer websites, messaging, mobile field operations, cross-branch coordination, and central validation. Later, introduce a branch hub for multi-computer offices without redesigning the synchronization protocol.

Do not package the entire production backend onto customer computers. Reuse the existing Next.js experience, introduce a carefully scoped local runtime for offline-capable functions, and retain FastAPI as the cloud API and authoritative synchronization gateway. The precise local runtime must be selected after auditing Next.js server-side dependencies and FastAPI responsibilities.

# 1. Confirmed product decisions

| Area                | Decision                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Starting footprint  | One Windows computer per branch initially; design for several computers and multiple branches later.                      |
| Connectivity        | Local branch operations continue during outages; background sync resumes automatically when internet is available.        |
| Coordination        | Customer website requests, mobile job dispatch, field updates and messages are cloud-mediated.                            |
| Mobile scope        | Managers receive selected on-the-go functions, not a full copy of the desktop experience.                                 |
| Close of day        | Permit offline EOD and next-day reopening with warnings after successful local validation and mandatory backup.           |
| Expansion           | Future branch hub can coordinate several computers on a local LAN; clients may pause if hub fails in initial hub version. |
| Technology baseline | Monorepo; Next.js UI and substantial application logic; FastAPI called for data; React Native mobile apps.                |

# 2. Target system topology

Customer website / online manager view / React Native field and manager apps → cloud APIs, coordination, PostgreSQL, notifications and sync gateway ↔ encrypted internet transport ↔ Windows branch desktop \[Electron shell + local app runtime + SQLite + durable outbox/inbox + sync worker + backup agent\].

The desktop is a local operational authority for explicitly permitted branch workflows. The cloud is the coordination and acceptance authority for shared, cross-branch, and high-risk actions. "Cloud authoritative" does not mean the cloud may silently rewrite locally committed financial records: disagreements require explicit rejection, correction or reconciliation workflows.

# 3. Recommended implementation boundaries

| Component                  | Responsibility / recommendation                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron shell             | Windows packaging, secure IPC, lifecycle, OS key storage integration, signed updates; never expose unrestricted Node access to web content.                                                                      |
| Next.js interface          | Reuse screens and presentation logic. Audit Server Actions, API routes, SSR, Node dependencies and authentication before choosing local rendering/hosting.                                                       |
| Local application runtime  | Expose a narrow local API for approved offline workflows. Option A: packaged Node/Next runtime for maximal reuse; Option B: extracted TypeScript domain packages plus lightweight local service. Prototype both. |
| SQLite                     | Local branch data, operation log, outbox, inbox, sync checkpoints, business dates and backup metadata; one writer / transaction-safe concurrency.                                                                |
| Cloud FastAPI + PostgreSQL | Tenant/device registration, sync validation, central event acceptance, website requests, cross-branch coordination, finance controls and durable messages.                                                       |
| React Native               | Field job cache, offline status updates, queued messages; manager-only approvals, dispatch, alerts and monitoring according to RBAC.                                                                             |
| Sync worker                | Continuous push/pull when online, bounded retries, backoff, cursor checkpoints, conflict queues and telemetry.                                                                                                   |

# 4. Synchronization contract

- Write locally first for approved offline operations. Commit the business change and outbox record atomically in the same local database transaction.
- Assign globally unique operation IDs, tenant ID, branch ID, device ID, actor ID, business date, schema version, causal/dependency metadata and idempotency key.
- Send batches over authenticated TLS; cloud verifies identity, permissions, invariants, dependencies and duplicate IDs before acknowledging individual operations.
- Pull changes using durable per-scope cursors, apply transactionally, and resume after crashes. Use WebSockets or push only as a wake-up signal; polling/reconciliation remains the reliability mechanism.
- Do not rely on device clocks or last-write-wins for money, stock, approvals or job ownership. Define domain-specific conflicts and explicit resolution workflows.
- Track last successful push, last successful pull, oldest pending item, pending count, rejected items and server reconciliation state separately.

# 5. Domain-specific offline policy

| Domain               | Offline behavior                                    | Cloud / conflict rule                                                                                         |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Jobs and scheduling  | Create draft assignments, update locally known work | Remote worker cannot receive new office-only assignment until upload; detect reassignment/version conflicts.  |
| Messaging            | Compose and queue messages; view cached history     | Durable cloud mailbox, push/WebSocket for immediacy, server acknowledgement and delivery states.              |
| Inventory            | Record branch-local stock movements                 | Use movement ledger and reservations; cross-branch transfers require central confirmation or staged approval. |
| Cash and finance     | Record explicitly allowed cash operations           | Append-only journal/events, balanced entries, reversals, offline limits and post-sync exception handling.     |
| Card/mobile money    | Do not declare externally settled while offline     | Await provider confirmation; distinguish pending, failed and confirmed.                                       |
| Marketing/cold email | Prepare campaigns and drafts                        | Sending, unsubscribe enforcement, provider status and compliance checks require online services.              |
| Website requests     | Not available to offline desktop until reconnect    | Cloud receives and stores requests immediately; online manager mobile can dispatch.                           |

# 6. Security and trust model

A customer controls their Windows machine; local code and data can be inspected or modified by a sufficiently privileged attacker. Packaging, obfuscation, encryption and code signing reduce risk but do not make a local installation trustworthy.

- Never distribute production database credentials, tenant-wide secrets, signing keys or SaaS administrative credentials in the installer.
- Use tenant-scoped device enrollment, short-lived access tokens where possible, protected refresh credentials, server-side RBAC and revocation rules that account for offline windows.
- Encrypt local data and backups using a managed key strategy; Windows DPAPI can protect keys but cannot defend against every compromise of a logged-in host.
- Harden Electron: context isolation, sandboxing, restrictive IPC, no remote code execution, content security policy, signed releases and controlled updates.
- Validate every incoming operation on the cloud; reject or quarantine inconsistent data, and retain audit evidence. Hash chains can reveal some tampering only when anchored to a trusted external checkpoint; they do not make an offline PC tamper-proof.
- Define what happens when roles change or a device is revoked while offline: cached permissions have bounded validity and high-risk operations need online approval.

# 7. End-of-day, backups and disaster recovery

Required EOD states: OPEN → LOCALLY CLOSED / PENDING SYNC → CLOUD ACCEPTED → RECONCILED. A verified backup is a prerequisite for local closure, not proof of accounting reconciliation.

- During the day: use periodic consistent database snapshots or SQLite backup API, plus protected operation logs; do not rely on an end-of-day-only backup.
- At EOD: validate cash and stock controls, preserve transaction and business-date boundaries, create encrypted backup, verify integrity and record its manifest/hash.
- If offline: permit EOD and next-day opening after mandatory successful local backup; show persistent sync warning and escalate by configurable age/risk thresholds.
- Keep at least one recoverable copy off the PC (encrypted external media or separate local storage) during prolonged outages; upload remote backups when connectivity returns.
- Restore safely: isolate recovered device, reconcile operation IDs and cloud acknowledgements, prevent replay/duplicate postings, and obtain approval for sensitive restore paths. Test recovery regularly.

Important trade-off: if the only computer and its only backup are lost before synchronization, those records cannot be recovered. The product must explicitly disclose this residual risk and provide a workable off-device backup procedure.

# 8. Availability, monitoring and user experience

- Show Connected / Offline / Syncing / Attention Required with last successful sync, pending operations and actionable error details.
- Use separate alerts for internet outage, sync failures, unresolved conflicts, missing backup, and cloud rejection. An internet connection does not imply healthy synchronization.
- Configure escalation thresholds (illustratively 1 hour, 24 hours, 48 hours), severity by business domain, and branch/HQ notification recipients.
- Keep cloud-based manager mobile functions independently available even if the office PC is offline. Local desktop drafts cannot appear on a remote phone until a network path exists.

# 9. Future multi-computer branch model

When needed, promote the local runtime into a branch hub on a designated machine. Other PCs access it over local LAN; the hub owns the branch database, serialization and cloud sync. The initial hub design may pause other clients when the hub is down, with clear status and tested recovery. Do not implement peer-to-peer multi-master replication in V1.

# 10. Delivery roadmap and acceptance gates

| Phase                          | Deliverables / exit criterion                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 — Architecture audit         | Map Next.js Server Actions/API routes, FastAPI responsibilities, current data ownership, auth and payments; select local runtime through a proof of concept. |
| 1 — Offline vertical slice     | Windows installer; one branch; SQLite; create job and inventory movement offline; restart without data loss; sync safely with idempotent acknowledgements.   |
| 2 — Coordination               | Website request ingestion, manager mobile dispatch, field updates, durable messages, background pull/push, conflict review.                                  |
| 3 — Financial controls and EOD | Cash operation rules, online payment confirmation, local business-date control, verified EOD backup, offline close/reopen and safe restore drills.           |
| 4 — SaaS hardening             | Tenant isolation tests, device enrollment/revocation, signing/update pipeline, monitoring, load/chaos tests, support diagnostics.                            |
| 5 — Multi-PC branch            | Optional hub mode, LAN clients, operational failover/recovery plan and migration from single-PC branch.                                                      |

# 11. Decisions still requiring discovery

- Does FastAPI enforce domain rules and write PostgreSQL, or is it primarily a CRUD/data layer? Map each critical write path rather than assuming.
- Which Next.js features require server-side runtime, and can they be packaged locally without exposing privileged cloud functions?
- Which operations are legally and commercially acceptable offline, with what limits, authorization expiry and reconciliation process?
- What are the recovery point and recovery time objectives, external backup medium, retention schedule and restore approvers?
- What is the tenant/branch data ownership model, including customers shared between branches and centrally managed stock?

# Recommended next step

Before committing to a specific Electron/Next.js/FastAPI packaging approach, build a small proof of concept: create a job offline, restart Windows, synchronize to FastAPI, receive a mobile update, close the day offline, restore from backup, and verify that replay cannot duplicate the transaction. This tests the hardest assumptions before large-scale refactoring.