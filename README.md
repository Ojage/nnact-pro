# OpenFieldPro

Open-source, self-hostable **field service management** — a HouseCall Pro alternative.
CRM, scheduling/dispatch, work orders, estimates, invoicing, and payments for home-service
businesses (HVAC, plumbing, electrical, cleaning, etc.).

> **Status: Phase 1 — Foundation.** The full-stack spine is in place and runs end-to-end
> (Postgres → Drizzle → Fastify API → Next web, plus an Expo technician app and the infra
> compose). The remaining HouseCall Pro modules are built by following the same vertical
> slice — see the roadmap below.

## Stack

| Layer | Tech |
|---|---|
| Backend | Fastify 5 + TypeScript + Drizzle ORM + Zod |
| Frontend | Next.js 15 (App Router, RSC) |
| Mobile | React Native (Expo) |
| Database | PostgreSQL 16 + PostGIS |
| Queue | Redis + BullMQ *(wired in Phase 2 for reminders)* |
| Storage | MinIO (S3-compatible) |
| Infra | Podman/Docker Compose + Caddy |

Monorepo via pnpm workspaces: `apps/{api,web,mobile}`, `packages/{db,shared}`.

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm infra:up        # postgres + redis + minio + caddy (podman or docker)
pnpm db:push         # create tables from the Drizzle schema
pnpm db:seed         # demo org + customers + a job + invoice
pnpm dev             # api on :3001, web on :3000
# open http://localhost:3000  (or http://localhost:8080 via Caddy)
```

Run the unit check (no database needed):

```bash
pnpm --filter @ofp/api test
```

## What works today (the vertical slice)

- **Multi-tenant schema** for every core HouseCall concept: orgs, users/technicians,
  customers, properties, jobs (work orders), line items, estimates, invoices, payments,
  appointments. Money is integer cents throughout.
- **API**: `GET/POST /api/customers`, `GET /api/customers/:id`, `GET/POST /api/jobs`,
  `PATCH /api/jobs/:id`, `GET /api/health`. Validated with Zod, scoped by org.
- **Web**: dashboard (open jobs, scheduled count, completed revenue) + customers table.
- **Mobile**: technician job list (Expo).

## Roadmap to HouseCall Pro parity

Each row is one vertical slice on the existing spine (schema → API route → web page).

| Phase | Module | Notes |
|---|---|---|
| 1 ✅ | Customers, Jobs, Dashboard | done — the reference slice |
| 2 | Auth & orgs (JWT) | replace the `x-org-id` shim in `routes/org.ts` |
| 2 | Scheduling / dispatch calendar | `appointments` table exists; add calendar UI + drag-assign |
| 2 | Estimates → accept → convert to job | `estimates` table exists |
| 3 | Invoicing + line-item editor | `invoices`/`line_items` exist; add PDF + email send |
| 3 | Online payments | Stripe keys in `.env`; add checkout + webhook → `payments` |
| 3 | Reminders & notifications | Redis/BullMQ workers (SMS/email) |
| 4 | Online booking page | public org route → creates a `lead` job |
| 4 | Recurring jobs, reviews, reporting | |

## License

See [LICENSE]. Self-host freely.
