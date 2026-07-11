# OpenFieldPro

Open-source, self-hostable **field service management** for service businesses.

OpenFieldPro is the open alternative to subscription-first platforms such as Housecall Pro: CRM, customers and properties, equipment history, scheduling and dispatch, work orders, estimates, invoicing, payments, documents, service plans, reviews, reporting, integrations, and technician mobile workflows.

Appliance-service organizations can also attach equipment-specific technical records to work orders, but those tools remain optional workflow depth—not the product definition.

> **Status: product foundation.** The operations spine runs end-to-end across Postgres, Fastify, Next.js, and the Expo technician app. Core workflows are implemented at foundation level; dispatch, customer portal, technician completion, documents, accounting export, and release hardening are still being completed.

## Product architecture

### Operations core

- Customers, properties, equipment, and service history
- Scheduling, dispatch, jobs, and return visits
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

Run API tests:

```bash
pnpm --filter @ofp/api test
```

## What works today

### Operations

- Multi-tenant organizations, users, roles, customers, properties, equipment, and jobs
- JWT authentication and organization-scoped APIs
- Day, week, and month appointment scheduling
- Dispatcher board with unassigned work, technician lanes, workload counts, search, date navigation, drag-and-drop, and accessible reassignment controls
- Estimates, line items, invoices, offline payments, and optional Stripe checkout
- Branded invoice and estimate previews/exports
- Reviews, recurring work, service-plan foundation, reporting, notifications, and search
- Technician mobile application foundation
- Plugin registry, scoped API tokens, outbound events, and integration surface
- Self-hosting install, update, backup, and restore helpers

### Optional appliance-service records

- Equipment linked to customers and work orders
- Technical sessions and measurement records
- Coverage and correction foundations
- Technician-facing diagnostic record surfaces

## Product surfaces

- `/` — technician-first Today dashboard
- `/dispatch` — dispatcher board with technician lanes and unassigned work
- `/schedule` — day, week, and month calendar
- `/jobs` — work orders and status
- `/customers` — CRM, properties, and equipment
- `/estimates` — estimate workflow
- `/invoices` — invoices and payments
- `/service-plans` — recurring service-plan foundation
- `/documents` — branded operational documents
- `/reports` — operational reporting
- `/settings` — organization and branding settings

## Product direction

The release gate is the complete lead-to-payment loop:

1. Customer and property intake
2. Scheduling and dispatch
3. Technician field execution
4. Estimate approval
5. Invoice and payment
6. Customer communication and service history
7. Reporting, integrations, offline resilience, and safe upgrades

See `docs/release/final-product-roadmap.md` for the current operations-first roadmap.

## Deploy

Use the repository deployment and self-hosting scripts under `scripts/` together with the compose configuration. Production deployments should validate migrations, backups, restore procedures, secrets, storage, and outbound communication adapters before serving real customers.
