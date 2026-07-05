# OpenFieldPro

Open-source, self-hostable **field service management** for service businesses.
CRM, scheduling/dispatch, work orders, estimates, invoicing, payments, reminders,
reviews, reporting, service plans, and mobile technician workflows for home-service businesses
(HVAC, plumbing, electrical, cleaning, appliance repair, and adjacent trades).

> **Status: Product foundation.** The full-stack spine is in place and runs end-to-end
> (Postgres → Drizzle → Fastify API → Next web, plus an Expo technician app and the infra
> compose). The branded landing page, service-plan foundation, sponsor-config foundation,
> branded document renderer, and self-hosting operator scripts are now part of the repo.

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

- **Multi-tenant schema** for core field-service concepts: orgs, users/technicians,
  customers, properties, jobs (work orders), line items, estimates, invoices, payments,
  appointments, service plans, plan enrollments, and plan visits. Money is integer cents throughout.
- **Auth**: `POST /api/auth/register` (creates org + owner), `POST /api/auth/login`,
  `GET /api/auth/me`. JWT via `@fastify/jwt`; passwords hashed with stdlib scrypt + constant-time
  verify. Org is resolved from the verified token (header/first-org fallback in dev only).
  Demo login: `owner@demo.test` / `demo12345` after seeding.
- **Scheduling/dispatch**: `GET/POST /api/appointments` (with `?from&to` range),
  `PATCH /api/appointments/:id` (reschedule/reassign — the backend for calendar drag-drop).
  Booking a job auto-moves it to `scheduled`.
- **Invoicing + payments**: line items (`/api/jobs/:id/line-items`) recompute the job
  total; `POST /api/invoices` generates a numbered invoice from a job; `POST /api/invoices/:id/pay`
  records offline payments (cash/check/card) and flips status to `paid` when covered (partials and
  overpayment handled). Online card via `POST /api/invoices/:id/checkout` (Stripe-optional, returns
  501 with guidance when unconfigured) + a **signature-verified** `/api/stripe/webhook`. Web invoices view.
- **Documents**: shared branded HTML renderer, `/documents` hub, invoice/estimate previews, and direct HTML export routes for print/save-as-PDF workflows.
- **Service plans**: schema, API routes, shared DTOs, navigation, and a starter web page at `/service-plans`.
- **API**: `customers` + `jobs` CRUD, `GET /api/health`. Zod-validated, org-scoped.
- **Web**: dashboard, customers table, schedule view, sign-in form, branded landing page, documents, and service plans.
- **Mobile**: technician job list (Expo).
- **Plugins/integrations**: plugin registry, installs, scoped API tokens, outbound event journal, and plugin API surface.
- **Sponsor config**: local static sponsor configuration example with no tracking/ad-network dependency.
- **Self-hosting**: install, update, backup, and restore helper scripts under `scripts/`.
- **Tests**: money math (3/3) + password hashing (4/4), both runnable with zero install via
  `node --experimental-strip-types --test`.

## Roadmap to full field-service suite parity

Each row is one vertical slice on the existing spine (schema → API route → web page).

| Phase | Module | Notes |
|---|---|---|
| 1 ✅ | Customers, Jobs, Dashboard | done — the reference slice |
| 2 ✅ | Auth & orgs (JWT) | done — scrypt + `@fastify/jwt`; token-scoped tenancy |
| 2 ✅ | Scheduling / dispatch | done — appointments API + schedule view; drag-assign UI is the next polish on the existing PATCH |
| 2 ✅ | Estimates → accept → convert to job | done — create from job, accept advances job to scheduled |
| 3 ✅ | Invoicing + line-item editor | done — line items recompute job totals; invoice generated from job; PDF/email is the next polish |
| 3 ✅ | Online payments | done — offline `/pay` (cash/check/card) + Stripe-optional `/checkout` + signature-verified webhook |
| 3 ✅ | Reminders & notifications | done — `@ofp/worker` sends appointment reminders via pluggable `notify` (ntfy/console; SMS/email plug in) |
| 4 ✅ | Online booking page | done — public `POST /api/public/:orgId/book` → `lead` job (no auth) |
| 4 ✅ | Recurring jobs, reviews, reporting | done — recurring templates materialized by the worker; reviews API; `/api/reports/summary` |
| 5 ◐ | Documents | branded HTML preview/export done — server-side PDF and email delivery remain |
| 5 ◐ | Service plans | foundation done — customer profile integration, renewal worker, and customer portal view remain |
| 5 ◐ | Sponsor slot | config foundation done — dashboard/mobile components and Pro removal toggle remain |
| 5 ◐ | Self-hosting polish | scripts added — permissions, platform testing, and release packaging remain |

See `docs/release/final-product-roadmap.md` for the full final-product checklist.

## Deploy

One command builds the images, runs migrations + seed, and brings the whole stack up behind
Caddy on `:8080` (works with podman or docker compose):

```bash
./deploy.sh           # Linux/macOS
.\deploy.ps1          # Windows
```

Operator scripts:

```bash
scripts/install.sh
scripts/update.sh
scripts/backup.sh
scripts/restore.sh backups/YYYYMMDD-HHMMSS
```

Then:

- **App** → http://localhost:8080  ·  **Landing** → http://localhost:8080/welcome
- **API** → http://localhost:8080/api/health  ·  **Login** → `owner@demo.test` / `demo12345`

For a public host, point the `:8080` block in `infra/Caddyfile.prod` at your domain (Caddy
auto-provisions HTTPS) and set real secrets in `.env` (`JWT_SECRET`, `POSTGRES_PASSWORD`,
and `STRIPE_*` if you want online card payments). Services: `api`, `web`, `worker`, `postgres`,
`redis`, `minio`, `caddy` (see `infra/compose.prod.yml`).

## License

See [LICENSE]. Self-host freely.
