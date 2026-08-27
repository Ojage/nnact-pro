# NNACT Pro

Open-source, self-hostable **field service management** for service businesses.

NNACT Pro provides CRM, customers and properties, equipment history, scheduling and dispatch, work orders, estimates, invoicing, payments, documents, service plans, reviews, reporting, integrations, and technician mobile workflows without mandatory per-user subscriptions.

Appliance-service organizations can attach equipment-specific technical records to work orders, but those tools remain optional workflow depth—not the product definition.

> **Status: release-candidate hardening.** The lead-to-payment operations spine runs across Postgres, Fastify, Next.js, and the Expo technician app. Production release still requires every gate in `docs/release/RELEASE_CHECKLIST.md`, including device testing, backup/restore evidence, deployment-specific secrets, and human review of browser screenshots.

## Product architecture

### Operations core

- Customers, properties, equipment, and service history
- Job intake, scheduling, dispatch, work execution, and return visits
- Closeout queues for start, completion, missing pricing, invoicing, and accounts-receivable handoff
- Price book, estimates, approvals, invoices, and payments
- Photos, documents, organization branding, reviews, and service plans
- Reporting, integrations, self-hosting, backup, and restore
- Technician mobile workflows with offline foundations

### Optional vertical workflows

- Equipment-linked technical notes and evidence
- Appliance model and serial records
- Complaint, observation, measurements, and completion summaries
- Return-visit continuity without replacing commercial job status

## Stack

| Layer | Technology |
|---|---|
| Backend | Fastify 5 + TypeScript + Drizzle ORM + Zod |
| Frontend | Next.js 15 (App Router, RSC) |
| Mobile | React Native (Expo) |
| Database | PostgreSQL 16 + PostGIS |
| Queue | Redis + BullMQ |
| Storage | Local filesystem uploads; optional S3-compatible off-site backup replication |
| Infra | Podman/Docker Compose + Caddy |

Monorepo via pnpm workspaces: `apps/{api,web,mobile}`, `packages/{db,shared}`.

## Quick start

```bash
cp .env.example .env
pnpm install:verified
pnpm infra:up
pnpm db:push
pnpm db:seed
pnpm dev
```

`pnpm install:verified` regenerates the lockfile from committed manifests, verifies its pinned SHA-256, and then performs a frozen install. Dependency changes must update both the generated lockfile and `pnpm-lock.expected.sha256`.

## Run the applications

All commands run from the repository root (pnpm workspaces). Every app reads its
port and URL configuration from `.env`; the local example used in this repository
is `API_PORT=3003` and `PUBLIC_WEB_URL=http://localhost:3006`, so **adjust the
URLs below if your `.env` differs** (`.env.example` ships with 3000/3001 defaults).

| App | Command | URL |
|---|---|---|
| API (Fastify) | `pnpm dev:api` | http://localhost:3003 |
| Web (Next.js) | `pnpm dev:web` | http://localhost:3006 |
| Mobile (Expo Metro) | `pnpm --filter @nnact/mobile dev` | http://localhost:8081 |
| All apps together | `pnpm dev` | see rows above |

### API

```bash
pnpm dev:api
curl http://localhost:3003/api/health   # { ok: true, service: "ofp-api", ... }
```

Also available: `API_PORT=4000 pnpm dev:api` to override `API_PORT` for one run.
For a physical phone to reach the API during mobile development, the API must
listen on your LAN address (bind `0.0.0.0`); the local example uses
`http://192.168.1.191:3003`.

### Web

```bash
pnpm dev:web   # http://localhost:3006
```

The browser origin must match `CORS_ORIGIN` (and `PUBLIC_WEB_URL`) in `.env`;
the API only accepts the configured origins. Any change to `.env` requires
restarting the dev servers.

### Mobile (Expo / React Native)

```bash
# LAN IP of the machine running the API, or your phone's tunnel to it:
EXPO_PUBLIC_API_URL=http://localhost:3003 pnpm --filter @nnact/mobile dev
```

- With Expo Go installed, scan the QR code from `localhost:8081`.
- The app defaults to `http://localhost:3001` when `EXPO_PUBLIC_API_URL` is
  unset (`apps/mobile/App.tsx`). For a physical device point it at the API host's
  LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.191:3003`.
- No emulator is required; the app runs through Expo Go on the phone.

### One-time prerequisites and teardown

```bash
pnpm infra:up    # Postgres (5433), Redis (6379), MinIO (9100/9101), Caddy (8080)
pnpm db:push     # sync Drizzle schema to the local database
pnpm db:seed     # demo org, users, customers, and work orders
pnpm infra:down  # stop only the containers; keep it, else restart with infra:up
```

Run the primary validation gates:

```bash
pnpm release:safety
pnpm audit --prod --audit-level=high
pnpm --filter @nnact/api test
pnpm --filter @nnact/web test:unit
pnpm --filter @nnact/web test:e2e
pnpm --filter @nnact/mobile typecheck
```

## What works today

### Operations

- Multi-tenant organizations, users, roles, customers, properties, equipment, and jobs
- JWT authentication and organization-scoped APIs
- New-customer and existing-customer job intake
- Day, week, and month appointment scheduling
- Dispatcher board with unassigned work, technician lanes, workload counts, search, date navigation, drag-and-drop, accessible reassignment, and conflict prevention
- Job closeout board for start, completion, missing pricing, invoice creation, and recent accounts-receivable handoff
- Estimates, line items, invoices, offline payments, and optional Stripe checkout
- Server-side rejection of zero-dollar and duplicate active invoices
- Concurrency-safe invoice numbering, manual payment application, and Stripe webhook processing
- Branded invoice and estimate previews/exports
- Reviews, recurring work, service-plan foundation, reporting, notifications, and search
- Technician mobile application foundation
- Plugin registry, scoped API tokens, outbound events, and integration surface
- Self-hosting install, update, backup, and restore helpers

### Optional appliance-service records

- Equipment linked to customers and work orders
- Technical sessions and measurement records
- Coverage and correction foundations
- Technician-facing technical record surfaces

## Product surfaces

- `/` — technician-first Today dashboard
- `/jobs/new` — customer and work-order intake
- `/dispatch` — dispatcher board with technician lanes and unassigned work
- `/schedule` — day, week, and month calendar
- `/closeout` — work start, completion, pricing, and invoice handoff
- `/jobs` — work orders and status
- `/customers` — CRM, properties, and equipment
- `/estimates` — estimate workflow
- `/invoices` — invoices and payments
- `/service-plans` — recurring service-plan foundation
- `/documents` — branded operational documents
- `/reports` — operational reporting
- `/settings` — organization and branding settings

## Open-source and sponsorship model

The business model and public voice are governed by `docs/product/BUSINESS_PLAN_AND_VOICE.md`: practical, field-ready, self-hostable, no telemetry, no phone-home licensing, and no artificial limits on the core workflow.

The AGPL core is free to self-host and is never limited by users, technicians, customers, jobs, invoices, locations, or core operational features. Hosted modified versions must follow the obligations in `LICENSE`.

Optional signed entitlements are verified locally without a license server, telemetry, or phone-home. They may represent sponsor recognition, bounded support benefits, or premium first-party plugins; they cannot disable or restrict the core.

A free dashboard may show one clearly labeled, locally configured sponsor placement. NNACT Pro does not use ad networks, tracking pixels, behavioral targeting, or sponsor access to operational data. See `docs/funding/SPONSORSHIP_PLAYBOOK.md`.

Official sponsorship campaigns, release scheduling, and token inventories are maintained in a separate private operations repository. Only approved public sponsor copy and immutable source identifiers enter official builds; the boundary is documented in `docs/operations/OFFICIAL_DISTRIBUTION_BOUNDARY.md`.

## Product direction

The release gate is the complete lead-to-payment loop:

1. Customer and property intake
2. Scheduling and dispatch
3. Technician field execution
4. Estimate approval
5. Closeout, invoice, and payment
6. Customer communication and service history
7. Reporting, integrations, offline resilience, and safe upgrades

See `docs/release/final-product-roadmap.md` and `docs/release/RELEASE_CHECKLIST.md`.

## Security

Read `SECURITY.md` before deploying. Production startup rejects default/short JWT secrets and wildcard or missing production CORS configuration. Authentication, public booking, uploads, and checkout have bounded route-level rate limits. Run `pnpm release:safety` before every release.

Optional Ed25519 support-entitlement keys are documented in `docs/security/KEY_MANAGEMENT.md`. They are not required to run the AGPL core and do not narrow the rights in `LICENSE`.

## Sponsorship

The project sponsorship application, tier design, outreach copy, non-tracking sponsor policy, governance boundaries, and reporting plan are in `docs/funding/SPONSORSHIP_PLAYBOOK.md`.

After the GitHub Sponsors profile is approved, enable the repository Sponsor button. The repository funding configuration targets the `niko4244` GitHub Sponsors profile.

## Deploy

Use the repository deployment and self-hosting scripts under `scripts/` together with the compose configuration. Production deployments must validate migrations, backups, restore procedures, secrets, storage, TLS, CORS, payment webhooks, outbound communication adapters, and the complete release checklist before serving real customers.

Production uploads are stored on the mounted filesystem volume. S3-compatible storage is optional off-site backup replication, not the live upload path.
