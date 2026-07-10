# OpenFieldPro Final Product Roadmap

OpenFieldPro is an open-source field service operations platform with a dedicated appliance diagnostic-execution layer.

The product must advance two connected tracks:

1. **Operations parity** — the complete business workflow expected from a modern field-service platform.
2. **Diagnostic differentiation** — exact, validated appliance diagnostic execution connected to the work order and equipment history.

Neither track should erase the other. Operations makes OpenFieldPro usable as the system of record; diagnostics gives appliance-service organizations a reason to choose it.

## Product principles

- The free core remains operationally complete: customers, jobs, dispatch, estimates, invoices, payments, reviews, reporting, documents, service plans, and mobile technician workflow.
- The appliance is the center of technical work. The job remains the commercial and scheduling container.
- Diagnostic sessions have their own lifecycle and evidence record.
- A workflow must be visibly validated, pilot, experimental, unsupported, suspended, or retired.
- No executable check publishes without exact meter points, operating conditions, expected results, route continuity, and visual audit.
- Actual measurements are stored before branching.
- Unsupported is a successful trust state, not a search failure.
- Sponsor or partner content must never affect or appear inside diagnostic decisions.
- Self-hosting is a deployment and control benefit, not a substitute for product value.
- Public copy should describe product mechanisms and present capabilities without generic hype.

## Current release tracks

| Track | Goal | Status |
|---|---|---|
| Product shell | Group navigation around Field, Operations, Quality, and System | Implemented |
| Today dashboard | Prioritize next visit, appliance, diagnostic state, and work required | Implemented |
| Diagnostic schema | Workflows, steps, trace routes, sessions, measurements, and corrections | Implemented foundation |
| Diagnostic API | Intake, sessions, measurements, publication guard, coverage, and corrections | Implemented foundation |
| Diagnostic web | Command center, intake, Field/Guided execution, evidence, and quality | Implemented foundation |
| Technician mobile | Next-action home and diagnostic attention | Implemented foundation |
| Real diagram renderer | Vector diagram, synchronized selectable routes, zoom/pan, overlays | Next |
| Offline diagnostic package | Durable local mirror for jobs, appliances, workflows, diagrams, and writes | Next |
| Workflow authoring | Document intake, endpoints, step editor, trace review, publication review | Planned |
| Escalation packet | Structured readings, photos, route history, and open questions | Planned |
| Customer portal | Estimate approval, invoice payment, appointment, and plain-language summary | In progress |
| Dispatch board | Drag/drop calendar, technician columns, unassigned queue, and route pressure | In progress |
| Job completion | Technician status, notes, photos, signature, parts used, and payment | In progress |
| Documents | Branded estimates, invoices, receipts, and diagnostic completion reports | In progress |
| Service plans | Customer integration, renewal worker, included visits, and portal status | Foundation implemented |
| Accounting | CSV export first, then provider adapters | Planned |
| Integrations | API keys, event delivery, retry log, import/export, and partner workflows | Partially implemented |
| Trust | Permissions, audit log, workflow version immutability, rights controls | Partially implemented |
| Self-hosting | Install, update, backup, restore, release packaging, upgrade tests | Foundation implemented |

## Priority sequence

### 1. Make the field diagnostic loop real

- Render the source wiring diagram rather than only route metadata.
- Synchronize the active check and selected route.
- Preserve source, control, load, feedback, and return semantics.
- Add explicit live/de-energized safety gates.
- Add customer complaint and technician observation editing inside the session.
- Use branch rules to advance to the correct next step.
- Add complete, inconclusive, unsafe, unsupported, and escalated outputs.

### 2. Complete durable offline field use

- Persist assigned jobs, equipment, workflow versions, steps, diagrams, and source metadata locally.
- Queue measurements, notes, photos, status, and correction reports.
- Surface pending sync and conflict states.
- Never silently overwrite measurements.
- Alert the user when an offline workflow was suspended before sync.

### 3. Build workflow authoring and governance

- Author or import supported model families.
- Resolve and review endpoints.
- Create technician-facing checks.
- Bind real segment IDs from the diagram graph.
- Run continuity, island, branch, crossing, and semantic audits.
- Require electrical and field-usability review.
- Publish immutable workflow versions.
- Suspend, correct, regression-test, and republish.

### 4. Connect diagnosis to the operations lifecycle

- Show linked appliance and diagnostic state on every applicable work order.
- Create line-item and estimate handoff from the supported recommendation.
- Generate technician and customer summaries.
- Store service history on the appliance record.
- Carry unresolved diagnostics into return visits.
- Preserve workflow version and readings after invoice completion.

### 5. Finish operations parity

- Complete customer portal and secure public links.
- Finish technician job completion, signature, parts used, and payment collection.
- Polish dispatch drag/drop and route pressure.
- Add reliable email/SMS adapters.
- Complete documents and accounting export.
- Finish service-plan lifecycle.
- Harden roles, permissions, audit logs, release packaging, and upgrades.

### 6. Validate before broad expansion

- Pilot one complete model family.
- Measure field activation, completion, blocked steps, corrections, and repeat use.
- Add coverage according to actual unsupported demand.
- Validate production and support cost before low-price subscription assumptions.
- Do not make accuracy, time-savings, callback, or revenue claims without field evidence.

## Definition of done — operations core

A service business can:

1. Install or update OpenFieldPro without editing application code.
2. Create an organization, users, roles, and branding.
3. Add customers, properties, appliances, jobs, estimates, invoices, payments, reviews, and service plans.
4. Dispatch technicians and track commercial and technical job states.
5. Let customers approve estimates, pay invoices, and view appropriate service records.
6. Complete a work order from the technician mobile experience, including notes, photos, parts, signature, and payment.
7. Export accounting data and integrate through supported APIs or webhooks.
8. Back up and restore the full stack.

## Definition of done — diagnostic core

A qualified appliance technician can:

1. Open an assigned work order.
2. Confirm the exact appliance model and serial.
3. See validated, pilot, experimental, unsupported, or suspended applicability.
4. Start one diagnostic session attached to the job and equipment.
5. Record customer complaint and technician observation separately.
6. Enter Guided Mode from a symptom or fault, or Field Mode from a circuit/component.
7. See one exact test with safety state, meter mode, points, condition, expected result, and wiring path.
8. Record the actual reading before the workflow advances.
9. Work without continuous connectivity.
10. Reach a supported repair, inconclusive, unsafe, unsupported, or escalated disposition.
11. Produce a technician summary, customer explanation, estimate handoff, and escalation packet.
12. Report a field defect that can suspend, correct, version, regression-test, and republish the workflow.

## Release gate

OpenFieldPro is not ready to market diagnostic coverage until at least one complete model family:

- passes endpoint and route validation,
- passes electrical and visual review,
- operates offline,
- survives real technician field use,
- records corrections without losing prior evidence,
- and produces a defensible completion or escalation record.
