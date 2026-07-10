# OpenFieldPro

Open-source, self-hostable **field service operations with appliance diagnostic execution**.

OpenFieldPro keeps the complete operations workflow service businesses expect—CRM, scheduling and dispatch, work orders, estimates, invoicing, payments, reminders, reviews, reporting, service plans, documents, and mobile technician workflows—then adds an appliance-specific diagnostic layer that connects the exact equipment record, complaint, meter points, measured results, and validated wiring evidence.

> **Status: product foundation with diagnostic-core implementation in progress.**
> The full-stack operations spine runs end-to-end. The diagnostic domain, API,
> technician command center, workflow intake, measurement capture, coverage dashboard,
> publication gates, and field correction loop are now part of the product direction.

## Product architecture

### Operations core

- Customers, properties, equipment, and service history
- Scheduling, dispatch, jobs, and return visits
- Price book, estimates, approvals, invoices, and payments
- Photos, documents, organization branding, reviews, and service plans
- Reporting, integrations, self-hosting, backup, and restore

### Diagnostic core

- Job-to-appliance binding
- Explicit validated, pilot, experimental, unsupported, suspended, and retired states
- Diagnostic sessions separate from commercial job status
- Field Mode for direct component and circuit checks
- Guided Mode for symptom- and error-code-led diagnosis
- Exact meter points, operating conditions, expected readings, and interpretations
- Actual measurement capture before branching
- Validated trace routes with continuity, island, branch, and visual-audit gates
- Diagnostic completion, inconclusive, unsupported, and escalation dispositions
- Field correction reports, including safety-critical workflow suspension
- Coverage and quality reporting

OpenFieldPro does not claim to replace a qualified technician. It makes diagnostic reasoning visible, executable, recordable, and auditable inside the work-order lifecycle.

## Stack

| Layer | Technology |
|---|---|
| Backend | Fastify 5 + TypeScript + Drizzle ORM + Zod |
| Frontend | Next.js 15 (App Router, RSC) |
| Mobile | React Native (Expo) |
| Database | PostgreSQL 16 + PostGIS |
| Queue | Redis + BullMQ |
| Storage | MinIO / S3-compatible storage |
| Infra | Podman/Docker Compose + Caddy |

Monorepo via pnpm workspaces: `apps/{api,web,mobile}`, `packages/{db,shared}`.

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm db:push
pnpm db:seed
pnpm dev
# Web: http://localhost:3000
# API: http://localhost:3001
```

Run the API unit tests:

```bash
pnpm --filter @ofp/api test
```

## What works today

### Operations

- Multi-tenant organizations, users, roles, customers, properties, equipment, and jobs
- JWT authentication and org-scoped APIs
- Appointment scheduling and reassignment
- Estimates, line items, invoices, offline payments, and optional Stripe checkout
- Branded invoice and estimate previews/exports
- Reviews, recurring work, service-plan foundation, reporting, notifications, and search
- Technician mobile application foundation
- Plugin registry, scoped API tokens, outbound events, and integration surface
- Self-hosting install, update, backup, and restore helpers

### Diagnostic foundation

- Diagnostic workflow, step, trace-route, session, measurement, and correction schemas
- Job-to-equipment link model
- Diagnostic API for workflow authoring, publishing, sessions, measurements, coverage, and corrections
- Publication guard requiring field-ready labels and validated checks
- Automatic suspension of workflows receiving safety-critical correction reports
- Web diagnostic command center
- Diagnostic session intake that requires an exact job and appliance
- Explicit coverage-required fallback when no workflow applies
- Field/Guided execution surface with actual measurement capture
- Wiring-evidence panel showing route endpoints and validation status
- Coverage and quality dashboard
- Technician-first Today dashboard
- Technician mobile home centered on next appointment and diagnostic attention

## Diagnostic trust model

A workflow cannot be published merely because content exists. Executable checks must include:

1. Technician-facing label
2. Meter or tool mode
3. Exact Point 1 and Point 2
4. Operating condition
5. Expected result
6. Validated step status
7. At least one attached trace route
8. Route continuity
9. No disconnected islands
10. No unintended branches
11. Passed visual trace audit

Unsupported or unresolved equipment remains explicitly unsupported. OpenFieldPro must not invent a field path from unreviewed output.

## Product surfaces

- `/` — technician-first Today dashboard with operations snapshot
- `/diagnostics` — active diagnostic command center
- `/diagnostics/new` — job, appliance, complaint, and workflow intake
- `/diagnostics/:id` — Field/Guided execution and measurement capture
- `/coverage` — workflow coverage, demand, and quality state
- Existing operations pages remain available for schedule, pipeline, customers, estimates, invoices, documents, service plans, price book, reviews, reporting, integrations, and settings.

## Database setup

Drizzle includes:

```text
packages/db/src/schema.ts
packages/db/src/service-plans.ts
packages/db/src/diagnostics.ts
```

Apply the schema after pulling diagnostic-core changes:

```bash
pnpm db:push
```

## Deployment

```bash
./deploy.sh           # Linux/macOS
.\deploy.ps1          # Windows
```

Operator helpers:

```bash
scripts/install.sh
scripts/update.sh
scripts/backup.sh
scripts/restore.sh backups/YYYYMMDD-HHMMSS
```

For a public host, configure the production Caddyfile and real values for `JWT_SECRET`, `POSTGRES_PASSWORD`, storage, and payment credentials.

## Product roadmap

The roadmap deliberately advances two connected tracks:

1. **Operations parity:** complete the customer portal, technician job completion, dispatch polish, communication, accounting export, and release packaging.
2. **Diagnostic differentiation:** deliver real diagram rendering, offline workflow packages, authoring and review tools, workflow version immutability, escalation packets, and validated model-family pilots.

See `docs/release/final-product-roadmap.md` and `docs/product/openfieldpro-v2-spec.md`.

## License

See [LICENSE]. Self-host according to the repository license terms.
