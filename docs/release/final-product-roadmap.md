# OpenFieldPro Final Product Roadmap

This document defines the remaining product work needed to move OpenFieldPro from a functional field-service app into a polished, self-hostable product.

## Product principles

- Free core FSM stays complete: customers, jobs, dispatch, estimates, invoices, payments, reviews, reporting, and mobile technician workflow.
- Pro adds polish and business presentation: branding, sponsor removal, customer-facing templates, branded service plans, and premium exports.
- Business adds integrations: accounting sync, automation connectors, webhooks, partner workflows, and implementation support.
- Sponsor placement must be useful, labeled, local/configurable, and never telemetry-based.
- Competitor products should not be named directly in repo copy, docs, UI, metadata, or comments. Use generic language such as commercial field-service suites or subscription-first field-service software.

## Release tracks

| Track | Goal | Status |
|---|---|---|
| Landing / brand | Field Command landing page, brand kit, no direct competitor naming | Implemented |
| Service plans | Real membership/service-plan data model and API | Foundation implemented |
| Customer portal | Estimate approvals, invoice payment, appointment visibility, service-plan view | Planned |
| Technician mobile | Full job detail, status changes, notes, photos, signature, parts used, offline queue | Planned |
| Dispatch board | Drag/drop calendar, technician columns, unassigned queue, route pressure | Planned |
| Documents | Branded estimates, invoices, receipts, work-order completion reports | Planned |
| Sponsor slot | Static/local sponsor config, Pro removal path, no tracking | Foundation implemented |
| Accounting | CSV export first, then accounting-provider adapters | Planned |
| Webhooks/API | API keys, event delivery, retry log, integration docs | Partially implemented through plugin foundation |
| Self-hosting | install/update/backup/restore scripts and operator docs | Foundation implemented |
| Trust | License, security notes, audit log, permissions hardening | Partially implemented |

## Recommended commit order

1. Finish service-plan UI on customer profiles.
2. Add customer portal pages for estimates, invoices, payments, and plan status.
3. Complete technician mobile workflow.
4. Add document renderer for invoices/estimates/receipts.
5. Add sponsor-slot component to dashboard/mobile surfaces.
6. Add CSV export package and accounting adapter interface.
7. Harden deployment scripts and add upgrade tests.
8. Add permission policy and audit-log table.

## Definition of done

OpenFieldPro is release-ready when a service business can:

1. Install or update it without hand-editing app code.
2. Create an org and configure company branding.
3. Add customers, properties, equipment, jobs, estimates, invoices, payments, and reviews.
4. Dispatch technicians and track job status.
5. Let customers approve estimates and pay invoices.
6. Run service plans with included visits and renewal reminders.
7. Use the mobile app for field notes, photos, signatures, and payment collection.
8. Export accounting data or connect a business integration.
9. Back up and restore the full stack.
10. Remove sponsor placement through Pro while keeping the free core usable.
