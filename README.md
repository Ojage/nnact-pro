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

## What works today

- **Multi-tenant schema** for every core HouseCall concept: orgs, users/technicians,
  customers, properties, jobs (work orders), line items, estimates, invoices, payments,
  appointments. Money is integer cents throughout.
- **Auth (Phase 2)**: `POST /api/auth/register` (creates org + owner), `POST /api/auth/login`,
  `GET /api/auth/me`. JWT via `@fastify/jwt`; passwords hashed with stdlib scrypt + constant-time
  verify. Org is resolved from the verified token (header/first-org fallback in dev only).
  Demo login: `owner@demo.test` / `demo12345` after seeding.
- **Scheduling/dispatch (Phase 2)**: `GET/POST /api/appointments` (with `?from&to` range),
  `PATCH /api/appointments/:id` (reschedule/reassign — the backend for calendar drag-drop).
  Booking a job auto-moves it to `scheduled`.
- **Invoicing + payments (Phase 3)**: line items (`/api/jobs/:id/line-items`) recompute the job
  total; `POST /api/invoices` generates a numbered invoice from a job; `POST /api/invoices/:id/pay`
  records offline payments (cash/check/card) and flips status to `paid` when covered (partials and
  overpayment handled). Online card via `POST /api/invoices/:id/checkout` (Stripe-optional, returns
  501 with guidance when unconfigured) + a **signature-verified** `/api/stripe/webhook`. Web invoices view.
- **API (Phase 1)**: `customers` + `jobs` CRUD, `GET /api/health`. Zod-validated, org-scoped.
- **Web**: dashboard, customers table, **schedule view**, **sign-in form**.
- **Mobile**: technician job list (Expo).
- **Tests**: money math (3/3) + password hashing (4/4), both runnable with zero install via
  `node --experimental-strip-types --test`.

## Roadmap to HouseCall Pro parity

Each row is one vertical slice on the existing spine (schema → API route → web page).

| Phase | Module | Notes |
|---|---|---|
| 1 ✅ | Customers, Jobs, Dashboard | done — the reference slice |
| 2 ✅ | Auth & orgs (JWT) | done — scrypt + `@fastify/jwt`; token-scoped tenancy |
| 2 ✅ | Scheduling / dispatch | done — appointments API + schedule view; drag-assign UI is the next polish on the existing PATCH |
| 2 | Estimates → accept → convert to job | `estimates` table exists |
| 3 ✅ | Invoicing + line-item editor | done — line items recompute job totals; invoice generated from job; PDF/email is the next polish |
| 3 ✅ | Online payments | done — offline `/pay` (cash/check/card) + Stripe-optional `/checkout` + signature-verified webhook |
| 3 | Reminders & notifications | Redis/BullMQ workers (SMS/email) |
| 4 | Online booking page | public org route → creates a `lead` job |
| 4 | Recurring jobs, reviews, reporting | |

## License

See [LICENSE]. Self-host freely.
