# NNACT Pro offline-first architecture

> **Status:** Proposal v2, deferred. Not adopted; we come back to it when offline work is scheduled.
> **Date:** 2026-11-25
> **Supersedes in detail:** [offline-first-original-recommendations.md](offline-first-original-recommendations.md) (kept as the input paper).
> **Lens:** "If Google Cloud were building NNACT Pro": the Well-Architected pillars, SRE practice (SLOs, error budgets, disaster drills), edge "survivability mode", zero trust, supply-chain provenance. All of it is bound by NNACT Pro's own rules: AGPL, self-hostable, no phone-home.

---

## 0. The one-page version

NNACT Pro runs field-service businesses (HVAC, refrigeration, electrical, solar) in places where the internet and the power both fail, sometimes for days. Cameroon's October 2025 national blackout is one example, and Eneo power cuts take ISP links down with them. The design goal is not "works offline" in general. It is precise:

> **A branch can take a call, book a job, send a technician, record the work, take cash and close its day with no internet. Nothing that involves money leaving or entering a provider, or another branch, is ever claimed as final until a server accepts it.**

Google's version of NNACT Pro has five parts:

| # | Part | What it is | Exists today? |
|---|---|---|---|
| 1 | **Region** | The authoritative server: `apps/api` (Fastify) + PostgreSQL/PostGIS + Redis + `apps/worker` + `apps/agents`. It is either NNACT's hosted SaaS or a customer's own self-hosted install. Same code either way. | Yes |
| 2 | **Branch Node** | One Windows PC per branch, later a small LAN hub. It runs the web UI locally against SQLite and holds a durable outbox. This is the equivalent of Google Distributed Cloud's store server running in "survivability mode". | No |
| 3 | **Field devices** | `apps/mobile` (technicians) and a manager slice. Expo + SQLite mirror + outbox. | Partly (`apps/mobile/src/sync`) |
| 4 | **Sync fabric** | One versioned protocol shared by every client: push operations, pull changes by cursor, live wake-ups. | Push half (`POST /api/sync`, `apps/api/src/sync/executor.ts`) |
| 5 | **Trust & ops plane** | Device enrollment, offline leases, signed releases, SLOs, health, backups, drills. | Pieces (backup/restore scripts, health probes, Agent Office SSE) |

The rest of this document says exactly how each part behaves, and why.

---

## 1. Ground truth: what NNACT Pro already has

A design that ignores the codebase is a fantasy. This is what exists on `feat/agent-platform-hardening` as of this date:

| Area | Fact | Consequence for offline |
|---|---|---|
| Cloud API | **Fastify** (`apps/api`), not FastAPI. Zod-validated routes, staff JWT cookie `NNPsession`, agent JWTs with scopes, `verifiedClaims()` | The sync gateway is a Fastify route family, and it reuses `verifiedClaims` and the role tables. |
| Sync push | `POST /api/sync` accepts ≤500 ops `{opId, type, table, entityId, baseVersion, payload}` for jobs, line_items, invoices, appointments, customers, estimates, payments. It checks role per op (`roleCanSyncOperation`), uses optimistic `version` checks, and returns per-op `conflict {currentVersion}` / retryable classes. | Keep it. v2 extends the envelope; it does not replace it. |
| Mobile | `apps/mobile/src/sync/{mirror,service}.ts`: expo-sqlite mirror, media flush queue, 12 s request timeouts. | Field devices are already the first offline client. The Branch Node should be the second client of the *same* protocol. |
| Tenancy | Everything is `org_id`-scoped in application code. Postgres RLS is barely used (one migration). Branches arrived in `0060_branches.sql` (org → branch, `branch_memberships`, `users.branch_access`). | Branch becomes the **unit of offline ownership**. RLS should be completed before devices hold tenant data (defence in depth). |
| Live updates | The Agent Office uses an SSE cursor over `agent_office_events` with polling fallback. | The same pattern becomes the sync wake-up channel. It is proven in this codebase already. |
| Self-host | `infra/compose.prod.yml`: Caddy, web, api, worker, Postgres (PostGIS 16), Redis. `scripts/backup.sh` writes age-encrypted archives with manifest + checksums. | The Region is portable. Every Google-managed service below must have a self-host equivalent. |
| Product rules | AGPL core; **no license server, no telemetry, no phone-home**; offline entitlement keys verified locally (`docs/product/BUSINESS_PLAN_AND_VOICE.md`). | Device telemetry may only go to *the tenant's own Region*. Update checks must work against a self-hosted mirror. |
| Payments | Stripe webhooks plus mobile-money flows (`agent-payments`, finance routes, petty cash, advances). | Provider-settled money is **never** final offline. |
| AI agents | Intake, triage, quoting, dispatch, payments, price book and sourcing workers run against the API with tiered autonomy (T1–T3) and human approval desks. | Agents are Region-only. They never act on a branch's unsynced state, and their proposals travel the same sync pipeline. |

---

## 2. Principles (the Google lens, made specific)

1. **Local is the source of truth for reads; the Region is the source of truth for acceptance.** This is Android's offline-first rule: the UI reads only the local database, and the network only ever updates that database. Accepting something into the shared, cross-branch record is a server decision.
2. **Every write is an operation, not a row.** Each write has an ID, an author, a device and a business date, and it is idempotent. This is already true (`opId`), so we make it universal.
3. **Ownership before conflict resolution.** Most conflicts disappear when each record has exactly one *home* (a branch, the org, or the Region only). We design ownership first and write merge code last.
4. **No last-write-wins for money, stock, approvals or job ownership.** Firestore-style LWW is fine for a technician's notes and wrong for a cash drawer.
5. **Degrade by capability, not by app.** Offline, a branch loses specific capabilities (card payment confirmation, cross-branch transfers, agent automation, website requests). The UI says which ones, in words.
6. **SLOs on what users feel.** "Sync freshness" and "time to acceptance" are first-class service-level indicators, with error budgets, exactly like latency.
7. **Version skew is a feature.** Offline devices run old builds for weeks. The Region supports at least N-2 client protocol versions, and migrations follow *expand → migrate → contract*.
8. **Portable by construction.** Postgres, SQLite, HTTP/SSE and open signing formats only, so the self-hosted Region equals the SaaS Region.

---

## 3. Topology

```
                         ┌──────────────────────────── REGION (authoritative) ───────────────────────────┐
 Customers / website ──▶ │ Caddy ─▶ apps/web (Next.js)   apps/api (Fastify)  ── Sync Gateway v2          │
 Mobile money / Stripe ─▶│          customer portal      ├─ /api/sync/push    ├─ op validator & router  │
 WhatsApp / SMS / email ▶│                               ├─ /api/sync/pull    ├─ ledger posting         │
                         │                               └─ /api/sync/events (SSE wake-up)              │
                         │ PostgreSQL+PostGIS (RLS)  Redis  apps/worker  apps/agents (AI, Region-only)   │
                         │ Object storage (uploads, content-addressed)  Backups (age-encrypted)          │
                         └────────────▲──────────────────────────▲──────────────────────────▲───────────┘
                                      │ TLS, device-signed batches │                          │
                    ┌─────────────────┴───────────┐   ┌───────────┴──────────┐   ┌───────────┴──────────┐
                    │ BRANCH NODE (Windows PC)    │   │ Technician app       │   │ Manager app          │
                    │ Electron shell (sandboxed)  │   │ Expo + SQLite mirror │   │ Region-first, small  │
                    │ Local runtime + SQLite(WAL) │   │ outbox, media queue  │   │ offline cache        │
                    │ outbox/inbox, sync worker   │   └──────────────────────┘   └──────────────────────┘
                    │ backup agent, health beacon │
                    │ ── LAN (phase 5) ──▶ other PCs in the branch
                    └─────────────────────────────┘
```

**Rules of the road**

- Field devices talk to the **Region**, never directly to the Branch Node, in v1. A technician's update reaches the office PC through the Region. That is slower during an outage, but it avoids peer-to-peer multi-master replication, which Google would not ship to small businesses either.
- The Branch Node is an **edge cell with survivability**: it serves the branch without the Region and catches up afterwards, like GDC connected's store servers.
- The Region may be NNACT-hosted or self-hosted. A self-hosted Region *on the same LAN* as the branch is a supported, simpler topology: in that case the Branch Node is optional.

### 3.1 Region: Google-managed vs self-host equivalents

| Concern | On Google Cloud (NNACT SaaS) | Self-host equivalent (must exist) |
|---|---|---|
| API / web | Cloud Run (min instances ≥1, regional) | `compose.prod.yml` containers behind Caddy |
| Database | Cloud SQL for PostgreSQL (HA, PITR) | Postgres 16 + PostGIS, WAL archiving, `scripts/backup.sh` |
| Queue / fan-out | Pub/Sub with ordering keys (key = org:branch), idempotent consumers | Postgres outbox table + `FOR UPDATE SKIP LOCKED` relay; Redis for wake-ups |
| Objects | Cloud Storage, signed URLs | Filesystem volume, optional S3-compatible replica |
| Secrets / keys | Secret Manager, Cloud KMS | `.env` + age keys (`docs/security/KEY_MANAGEMENT.md`) |
| Observability | Cloud Monitoring SLOs, burn-rate alerts | `/health` probes + Prometheus-format metrics + Agent Office-style status page |
| Release integrity | Artifact Registry, SLSA provenance, Binary Authorization | Sigstore/cosign-verified images; TUF-style signed update metadata on a mirror |

Even on GCP, **the Postgres outbox stays the source of events**. Pub/Sub only carries them onward. This avoids the dual-write problem and keeps one code path for both deployments. Pub/Sub exactly-once delivery does not cover downstream side effects, so consumers must be idempotent anyway.

---

## 4. Data ownership: the heart of the design

Every table gets an **ownership class**. The class decides where the record can be written, how it syncs and how conflicts are handled.

| Class | Written where | Sync direction | Conflict model | NNACT tables (examples) |
|---|---|---|---|---|
| **B: Branch-owned** | Branch Node (and Region on behalf of that branch) | push + pull | Optimistic `version`. Field-level merge for notes and fields where loss is harmless. Explicit review for status and assignment. | jobs (of that branch), appointments, line_items, estimates (draft), service visits, local customers, equipment at sites, voice notes, photos |
| **L: Ledger (append-only)** | Wherever allowed by policy | push only; Region posts | **No updates, ever.** Corrections are reversal entries. Balanced entries checked on post. | cash receipts, petty cash movements, expense records, advances, stock movements, EOD records |
| **O: Org-owned reference** | Region only | pull only | Region wins. Branch caches carry a version and an expiry. | price book, catalog, service plans, tax rules, users/roles/branch memberships, templates, org settings |
| **R: Region-only** | Region only | pull summaries if needed | n/a | provider payment intents & confirmations, website requests (until assigned), growth campaigns & sending, AI agent runs, cross-branch transfers, audit log |
| **D: Device-private** | That device | never | n/a | UI preferences, drafts not yet submitted, caches |

**Why this matters, concretely**

- *Two dispatchers in two branches edit the same customer.* Customers are branch-owned, with an org-level "shared customer" link. The other branch's edit becomes a **suggestion** on the owning branch, not an overwrite.
- *The office reassigns a job while the technician, offline, completes it.* Job status is a **state machine**. Allowed transitions are validated on the Region against the op's `baseVersion` *and* the state it was made from. "Completed by tech" against "reassigned by office" becomes a review item in a **Sync conflicts** inbox with both stories side by side. It is never silently resolved.
- *Stock.* Never a quantity column that devices overwrite. Stock is a sum of movements (L class). Reservations for cross-branch transfers are R-class and need the Region.
- *Invoices.* A draft invoice is branch-owned (B). **Issuing** an invoice assigns a legal number. Offline, the branch issues from a **pre-allocated number block** leased from the Region (e.g. `NHARM-MAIN-2026-00451…00500`), so numbering stays gapless and unique without a round trip.

---

## 5. Sync protocol v2 (an evolution of today's `/api/sync`)

### 5.1 Operation envelope

Today's fields are kept. New fields are marked ★.

```ts
type SyncOpV2 = {
  opId: string;            // existing; ULID recommended (sortable, unique)
  type: "create" | "update" | "delete" | "command"; // ★ command = domain action, e.g. job.complete
  table: string;           // existing
  entityId: string;        // existing (uuid)
  baseVersion?: number;    // existing optimistic concurrency
  payload: Record<string, unknown>;
  // ★ provenance
  orgId: string; branchId: string; deviceId: string; actorId: string;
  businessDate: string;    // branch business day, not wall clock
  hlc: string;             // hybrid logical clock: ordering hint, never trusted for authority
  dependsOn?: string[];    // opIds that must be accepted first (e.g. invoice → its line items)
  schema: number;          // client protocol/schema version (version-skew policy)
  leaseId?: string;        // offline lease the op was authorized under (§7.2)
};
```

Batches are signed with the **device key** (Ed25519) over a canonical encoding. The Region verifies the signature, the device's enrollment and the lease *before* looking at a single op.

### 5.2 Push results

Each op gets exactly one result, and the client acts on it:

| Result | Meaning | Client action |
|---|---|---|
| `accepted` | Applied, with new `version` and any server-assigned fields | Mark synced, update the local row |
| `duplicate` | `opId` already applied (idempotency hit) | Same as accepted |
| `conflict` | `baseVersion` stale or state transition invalid; includes the current row | Rebase if the merge is safe for that field class; otherwise create a review item |
| `rejected` | Fails validation or permissions; reason code given | Keep the record, mark it **Needs attention**, never drop it silently |
| `deferred` | Valid but depends on an unaccepted op, or the Region is degraded | Retry with backoff |
| `quarantined` | Suspicious (bad lease, tampered sequence, impossible amounts) | Freeze the related records locally and alert the owner |

### 5.3 Pull: buckets and cursors

Instead of "everything since `synced_at`", the Region computes **buckets**: server-side rules that decide what each device holds. PowerSync's sync rules and streams are the model to copy, whether or not we use the product.

- `org:{orgId}:reference` (price book, roles, templates)
- `branch:{branchId}:ops` (branch-owned data)
- `tech:{userId}:route` (assigned jobs for the next N days, with their customers, sites and equipment)
- `branch:{branchId}:ledger:{businessDate}`

Every bucket has a monotonic cursor stored in Postgres (`sync_checkpoints`). Pull is `GET /api/sync/pull?bucket=…&after=…&limit=…`. It is resumable after a crash, and apply-then-commit-cursor runs in one local transaction.

**Wake-ups, not reliability.** `GET /api/sync/events` (SSE, the Agent Office cursor pattern) tells a client "bucket X moved". Polling remains the safety net. A dropped wake-up must never cause lost data.

### 5.4 Ordering and time

- Device clocks are never trusted for authority. The **HLC** gives stable ordering for display and merges of notes.
- **Business date** is a branch concept, opened and closed explicitly (§8), and it is what reports group by.
- `dependsOn` lets a client send an invoice and its line items in any order, and the Region applies them in causal order.

---

## 6. Domain policy, NNACT-specific

| Domain | Offline at the branch | Offline in the field | Needs the Region | Conflict / safety rule |
|---|---|---|---|---|
| Intake (calls, walk-ins) | Create customer, site, job draft | — | WhatsApp/SMS/website inbound; Intake agent | Website requests land in the Region immediately. Online managers can dispatch them from the manager app while the branch is offline. |
| Scheduling & dispatch | Book, reschedule, assign to *locally known* technicians | See own route | Dispatch agent suggestions; cross-branch technicians | A technician sees a new assignment only after the branch's push reaches the Region. The UI says "Not yet sent to Joseph". |
| Work execution | — | Status changes, checklists, readings, photos, voice notes, parts used | Repair Brain AI answers (cached catalog works offline) | Job state machine; photos are content-addressed (sha256) and resumable. |
| Estimates & quotes | Draft, edit, print | Draft on site | Quoting agent; customer e-signature link | The customer-visible version is frozen at send; sending needs a network path. |
| Invoices | Issue from a leased number block, print | Draft | Final tax/e-invoicing submission if required | Never renumber. Corrections are credit notes. |
| Cash & petty cash | Record receipts and payouts under limits | Record cash collected, with a receipt photo | Above-limit payouts need online approval | Append-only ledger, balanced at EOD; per-user offline cash limit carried in the lease. |
| Mobile money & cards | Show **"Payment pending"** | Same | MTN MoMo / Orange Money / Stripe | **Never confirmed offline.** PENDING → SUCCESSFUL/FAILED only from the provider callback or a status poll. A timeout is not a failure. Idempotency key per payment request. |
| Inventory & parts | Stock movements, counts | Parts used on the job | Transfers between branches; purchase orders to suppliers (Sourcing agent) | Movements only, no overwrites; reservations are Region-owned. |
| Price book | Read the cached version (with its "as of" date) | Same | Edits; Price Book agent | Region wins. Quotes record the price book version they used. |
| Growth / marketing | Draft campaigns | — | All sending, unsubscribes, deliverability | Compliance checks are Region-only, by law and by design. |
| AI agents | Show cached proposals, approve/reject **queued** | — | All agent runs | Approvals made offline are ops: the Region re-checks that the proposal is still valid at acceptance (it may have expired). |

---

## 7. Security and trust model

A customer controls their PC, and anything on it can be read or changed by a privileged local attacker. Google's answer is zero trust: verify every request, trust no network or host by default, and make blast radius small.

### 7.1 Device identity

- **Enrollment:** an owner approves a device in the web app (a new "Devices" page under Settings, listing per-branch devices). The device generates an Ed25519 key pair; the private key is wrapped with Windows **DPAPI**/TPM on the Branch Node and the Keystore/Keychain on phones. The Region stores the public key, device ID, branch and approver.
- **No shared secrets ship in installers.** No database credentials, no org-wide keys, no signing keys.
- **Revocation** is immediate on the Region. Offline devices learn about it on the next contact, and their ops from after the revocation time (per Region receipt) are quarantined.

### 7.2 Offline leases (bounded trust)

Short-lived access tokens do not work offline, so a device holds a signed **lease** from the Region:

```
lease = sign_region({ deviceId, branchId, userIds[], roles, capabilities[],
                      cashLimit, invoiceNumberBlock, priceBookVersion,
                      notBefore, expiresAt })   // e.g. 72 h for a branch, 24 h for a phone
```

- The local runtime enforces the lease (who can do what, within which limits). The Region **re-checks everything** on acceptance, so a tampered lease only creates quarantined ops.
- Each lease renews on every successful contact. When it expires, the device drops to **read-only plus cash receipts**, so the business can still take money, and the UI explains why.
- Authorization semantics follow Zanzibar's relationship model (org → branch → team → job assignment). Tools like SpiceDB or OpenFGA implement it, but v1 keeps relationships in Postgres. A lease is a snapshot of those relationships for one device.

### 7.3 Tamper evidence

- Each device keeps a **hash chain** over its own op stream (`prevHash` in every batch). The Region stores the latest accepted head, which gives a trusted external checkpoint. A gap or fork means quarantine.
- This detects tampering after the fact. It does not prevent it, and the paper should never claim otherwise.

### 7.4 Branch Node hardening (Electron)

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on every window. A preload exposes only narrow, typed functions; there is no generic IPC.
- The database and sync engine run in a separate utility process. The renderer never opens SQLite directly.
- SQLite is encrypted at rest (SQLCipher-class), with the key wrapped by DPAPI.
- Strict CSP; no remote code; no `eval`.
- **Releases:** reproducible builds with SLSA provenance, Sigstore/cosign signatures and Windows Authenticode. The updater reads TUF-style signed metadata, so a compromised mirror cannot push a rollback or a malicious build. Self-hosters can mirror updates with no phone-home to NNACT.

### 7.5 Region hardening before devices hold data

- Complete **Postgres RLS** on every tenant table (`org_id`, and `branch_id` where branch-owned) as a second wall behind app-level checks.
- Per-device rate limits and batch size caps (the current 500-op cap stays).
- An audit log entry for every quarantine, revocation, lease issue and restore.

---

## 8. End of day, backups and disaster recovery

### 8.1 Business-day states

```
OPEN ──close──▶ LOCALLY_CLOSED ──push ok──▶ REGION_ACCEPTED ──reconciled──▶ RECONCILED
  ▲                    │                                      │
  └──reopen (owner)────┘                       exceptions ──▶ NEEDS_REVIEW
```

- **Local close** requires a balanced cash ledger for the day, every job's status explained, and a **verified backup** (written, re-read and checksummed).
- The next day may open while the previous day is `LOCALLY_CLOSED`, with a persistent banner. The banner escalates at configurable ages: 24 h warning, 48 h owner alert, 72 h lease expiry.
- `RECONCILED` means the Region posted every ledger entry and every provider payment reached a terminal state.

### 8.2 Backups (a recovery point objective of minutes, not "tonight")

- SQLite **WAL mode** with the online backup API every 15 minutes to a second local disk path, plus at EOD.
- Each EOD snapshot is age-encrypted (same tooling as `scripts/backup.sh`) to removable media when present, and uploaded to the Region when online.
- **Residual risk, said plainly:** if the PC and every local copy are lost before sync, those records are gone. The product shows "Last off-device copy: …" on the Branch Node home screen at all times.

### 8.3 Power is part of the threat model

Cameroon's power cuts take down both the PC and the ISP's equipment. Requirements:

- SQLite with `synchronous=FULL` for ledger tables, so a commit survives a power cut.
- Startup integrity check (`PRAGMA quick_check`) and automatic restore from the last good snapshot with an owner-visible report.
- A recommended UPS for the Branch Node, listed in the install checklist, not left as an afterthought.

### 8.4 Restore

The restored device gets a **new device ID** and a fresh enrollment. It re-sends its outbox, and idempotency makes duplicates harmless; the hash chain shows exactly which ops the Region already holds. Restores need owner approval and are audited.

### 8.5 Drills (Google's DiRT, small-business size)

A scripted quarterly drill per release train: pull the network for 72 h on a staging branch, cut power mid-write, restore from removable media, revoke a device while offline. The release does not ship if a drill loses or duplicates a ledger entry.

---

## 9. Reliability: SLOs and error budgets

Google measures what users feel. Proposed SLIs and targets (30-day windows):

| SLI | Definition | SLO |
|---|---|---|
| Local write availability | Branch Node / app local writes that commit | 99.99% |
| Sync acceptance latency | Op created → `accepted`, **while connected** | 99% within 60 s |
| Sync freshness | Branches whose oldest pending op is under 15 min old, **while connected** | 99% |
| Pull freshness | Region change → visible on an online device | 95% within 30 s (SSE), 99% within 5 min |
| Zero-loss | Ops created that are never accepted, rejected or reviewed | **0** (any violation is an incident) |
| Payment truth | Provider payments in a terminal state within 24 h | 99.5% |

- **Burn-rate alerting** (SRE Workbook): fast burn pages the owner or operator, slow burn opens a ticket. Self-hosters get the same rules as plain Prometheus alerts.
- **Error budget policy:** when sync SLOs burn their budget, feature releases that touch sync pause until reliability work restores it.
- "Connected" never means "healthy". The UI separates **Offline**, **Syncing**, **Up to date**, **Attention required** (rejections, conflicts, quarantine) and **Backup overdue**.

### 9.1 Observability without phone-home

- Devices send a small **health beacon** (pending count, oldest pending age, last push/pull, last backup, app version, lease expiry) **to their own Region only**.
- The Region shows it on a **Branches & devices** status page. It reuses the Agent Office console design: table, status chips with words, alert banners.

---

## 10. AI agents and offline

- Agents run only in the Region, and they only see data the Region has **accepted**. Their decisions are labelled with the data freshness they used ("based on branch data up to 09:42").
- Agent proposals (draft jobs, quotes, dispatch suggestions) sync to branches as R-class items. Approving one offline produces a `command` op. The Region re-validates it (price book version, technician availability), and if the world changed, the approval becomes a conflict review item, not a silent action.
- During a branch outage, agents keep serving Region-side channels: website requests, WhatsApp intake, customer portal. This is a real advantage of the hybrid design.

---

## 11. Version skew and schema evolution

Offline devices may run an old build for weeks.

- **Protocol versions:** the Region supports the current version and the two before it (N-2) for at least 60 days. Older clients get `426 Upgrade Required` *after* their pending ops are accepted, never before.
- **Migrations:** expand → migrate → contract. A new column is nullable, or has a default, until every supported client writes it. Columns are never renamed in place.
- **Local SQLite migrations** ship with the client and run in one transaction at startup, with a pre-migration backup.
- **Feature flags** gate new sync behaviour per org, so it can roll out as a canary: one branch, then one org, then everyone.

---

## 12. The local runtime: decision and how to make it

Two options from the original paper, now specific to this codebase:

| | **A. Packaged Next.js + local Fastify** | **B. Extracted domain packages + slim local service** |
|---|---|---|
| Reuse | Highest: `apps/web` as-is, local API mimics `apps/api` routes | Medium: move validation and rules into `packages/domain`, shared by Region and Branch Node |
| Risk | Ships server-side code that assumes Postgres and secrets; big install | Requires refactoring route logic out of handlers |
| Correctness | Two implementations of the same rules drift | **One implementation of each rule**, run in both places |
| Google's pick | — | **B**, with the web UI talking to a local API that has the same shape as the Region's |

Google would choose **B** because it makes "the same rule runs locally and in the Region" true by construction, and that property is what makes offline acceptance predictable. `packages/shared` already holds DTOs and Zod schemas, so it is the natural seed.

**Phase 0 proof:** build both for one slice (create job, add line item, record cash), measure install size, cold start and rule drift, then decide in an ADR.

---

## 13. Roadmap with acceptance gates

| Phase | Scope | Exit gate (measured, not asserted) |
|---|---|---|
| **0. Audit & ADRs** | Map every write path in `apps/api/src/routes` to an ownership class; local runtime proof (A vs B); finish RLS; ADRs for ownership, protocol v2 and leases | Ownership table covers 100% of tenant tables; RLS tests pass for every one |
| **1. Protocol v2 + field devices** | Envelope ★ fields, results incl. `duplicate`/`quarantined`, bucket pull, SSE wake-up; move `apps/mobile` to v2 | Chaos test: 10k ops across flaky networks, **0 lost, 0 duplicated** |
| **2. Branch Node single-PC slice** | Electron shell, local runtime, SQLite (encrypted, WAL), outbox, enrollment, leases, backups | 72 h unplugged drill + power-cut drill pass on Windows 10/11 |
| **3. Money & EOD** | Ledger posting, number blocks, cash limits, EOD state machine, mobile-money pending/confirm/reconcile | Reconciliation suite: every payment reaches a terminal state, ledger balances to zero difference |
| **4. Ops & trust** | Devices page, health beacon, burn-rate alerts, signed updates (SLSA + Sigstore + TUF-style metadata), restore flow | SLO dashboards live; a revoked-device drill quarantines correctly |
| **5. Branch hub (LAN)** | One PC becomes the branch's hub; other PCs are thin clients | Hub failover runbook tested; migration from a single-PC branch preserves every op |

Each phase ships behind a per-org flag and starts with NHARM's Main Branch as the canary.

---

## 14. Decisions still open

1. **Fiscal rules:** do Cameroon's (or other target markets') invoicing rules require online registration of invoices? If so, offline invoices are "issued pending registration".
2. **Offline cash limits:** default per role, per day? Owners need to set these.
3. **Lease lengths:** 72 h branch / 24 h phone are starting points; confirm against real outage lengths. The 2025 blackout lasted days.
4. **Shared customers across branches:** a single org record with branch links, or per-branch copies with merge suggestions?
5. **Number blocks:** what block size, and what happens to unused numbers on device loss (void them and audit)?
6. **Build vs adopt a sync engine:** keep our own (fits the existing `/api/sync`, no new infra) or adopt PowerSync-style open components. Our own is the default because the write path must stay in `apps/api` either way.
7. **Hosting region** for the SaaS Region: latency to Central/West Africa against data-residency expectations.

---

## 15. What changed from the original paper

- FastAPI → **Fastify**. Builds on the existing `/api/sync` executor, version columns, mobile mirror, branches and Agent Office SSE, instead of starting from zero.
- Adds **ownership classes**, the **v2 op envelope**, explicit **push results**, **bucket pulls** and **offline leases**.
- Adds **SLOs, error budgets and drills** in Google's SRE style, with self-host equivalents for every managed service.
- Respects **AGPL / self-host / no phone-home**: telemetry goes only to the tenant's Region; updates are verifiable from a mirror.
- Adds the **AI agent** rules, **number blocks** for invoices, a **mobile-money** truth model and **power-loss** requirements.
- Picks a default local runtime (**B: shared domain packages**) with a measurable proof before committing.

---

## Sources

- Google Cloud, [Well-Architected Framework](https://docs.cloud.google.com/architecture/framework): pillars for operational excellence, security, reliability, cost, performance and sustainability.
- Google Cloud, [Google Distributed Cloud connected](https://cloud.google.com/distributed-cloud-connected) and the [retail edge use cases](https://cloud.google.com/blog/topics/hybrid-cloud/retail-use-cases-for-google-distributed-cloud-edge/): local business-critical apps that continue through lost connectivity.
- Android Developers, [Build an offline-first app](https://developer.android.com/topic/architecture/data-layer/offline-first): the local database as the single source of truth.
- Firebase, [Access data offline (Firestore)](https://firebase.google.com/docs/firestore/manage-data/enable-offline): pending writes and listeners while offline.
- Google SRE Workbook, [Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/), and Cloud Monitoring, [alerting on budget burn rate](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/alerting-on-budget-burn-rate).
- Google Cloud Pub/Sub, [exactly-once delivery](https://docs.cloud.google.com/pubsub/docs/exactly-once-delivery) and [ordering](https://docs.cloud.google.com/pubsub/docs/ordering); [outbox pattern in Postgres](https://www.freecodecamp.org/news/how-to-implement-the-outbox-pattern-in-go-and-postgresql/).
- [Google Zanzibar](https://en.wikipedia.org/wiki/Google_Zanzibar), [OpenFGA on Zanzibar](https://openfga.dev/docs/learn/zanzibar).
- PowerSync, [Postgres ↔ SQLite sync](https://powersync.com/sync-postgres) and [ElectricSQL vs PowerSync](https://www.powersync.com/blog/electricsql-vs-powersync) (vendor material; used for patterns only).
- Electron, [Security checklist](https://electronjs.org/docs/latest/tutorial/security).
- Supply chain: [GitHub on SLSA provenance and attestations](https://github.blog/security/supply-chain-security/where-does-your-software-really-come-from/), [Sigstore + TUF + SLSA pipeline example](https://builder.aws.com/content/3CEE0bcWsPBxnBBvV3nbjMf0Pwi/end-to-end-supply-chain-security-for-a-go-project-tuf-on-ci-cosign-and-slsa-l3).
- Mobile money: [MTN MoMo developer: callbacks and status polling](https://momodeveloper.mtn.com/content/html_widgets/0a5av.html), ["A timeout is not a failure"](https://dev.to/deval123/a-timeout-is-not-a-failure-4a9d).
- Connectivity context: [Bloomberg, Cameroon internet outage, Oct 2025](https://www.bloomberg.com/news/articles/2025-10-23/cameroon-blames-internet-outage-on-cable-cut-as-protests-erupt), [Africanews, blackout after disputed election](https://www.africanews.com/2025/10/24/internet-blackout-deepens-tensions-after-disputed-election-in-cameroon/), [CADE, renewed disruptions](https://cadeproject.org/updates/cameroon-faces-renewed-internet-disruptions/).
