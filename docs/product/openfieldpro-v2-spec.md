# OpenFieldPro Product Specification v2

## Product definition

OpenFieldPro is an open-source, self-hostable field service operations platform with appliance diagnostic execution built into the work-order lifecycle.

It combines:

- CRM, customers, properties, equipment, scheduling, dispatch, jobs, estimates, invoices, payments, reviews, service plans, documents, reporting, integrations, and mobile workflows
- model-specific diagnostic sessions with exact test points, operating conditions, measured values, wiring evidence, workflow validation, and correction governance

The operations core is comparable in scope and workflow ambition to subscription-first field-service suites. The diagnostic core is the appliance-specific differentiator.

## Product promise

A service company should be able to run the business in OpenFieldPro, while a qualified appliance technician can move from assigned job to defensible diagnosis without manually reconstructing the procedure from disconnected documents.

## Non-goals

OpenFieldPro will not:

- replace qualified technicians,
- guarantee a diagnosis or repair outcome,
- silently generate field instructions from unvalidated output,
- claim universal appliance coverage,
- make partner or sponsor incentives part of diagnostic logic,
- sacrifice the complete operations workflow to become a standalone diagram viewer,
- or hide unsupported, experimental, or suspended states.

## Primary users

### Technician

Needs the next appointment, exact appliance, applicable workflow, current check, expected result, wiring path, and a fast way to record evidence.

### Dispatcher or service manager

Needs schedule, job state, diagnostic state, blocked sessions, escalations, return visits, and complete handoffs.

### Owner

Needs CRM, estimates, invoices, payments, margins, service plans, reviews, customer retention, and operational control.

### Technical lead or content reviewer

Needs workflow authoring, endpoint and route review, electrical review, visual audit, correction handling, versioning, and publication control.

### Customer

Needs appointment information, plain-language findings, an estimate, approval, payment, receipt, and warranty record—not internal diagnostic content.

## Core object model

### Job

The commercial and scheduling container.

### Equipment

The exact appliance installed at a property.

### Job-equipment link

Makes one appliance the primary technical subject of the job.

### Diagnostic workflow

A model-family, symptom, fault, component, or circuit-specific procedure.

### Workflow version

An immutable published evidence package with applicability, source revision, reviewers, limitations, and validation status.

### Diagnostic step

One field-executable check, decision, reference, or stop condition.

### Trace route

The validated wiring-diagram path supporting a step.

### Diagnostic session

The technician’s actual execution record for one appliance and complaint.

### Measurement

A real field result attached to a session and step.

### Correction report

A field-reported defect or usability issue that can trigger triage, suspension, correction, and regression review.

## Experience architecture

### Technician navigation

- Today
- Jobs
- Diagnostics
- Sync and Issues

### Operations navigation

- Schedule and Dispatch
- Pipeline
- Customers and Equipment
- Estimates
- Invoices and Payments
- Service Plans
- Documents
- Price Book

### Quality navigation

- Coverage and Quality
- Reviews
- Reports

### System navigation

- Integrations
- Settings

## Core field flow

1. Technician opens the assigned job.
2. Technician confirms the exact appliance make, model, and serial.
3. System shows validated, pilot, experimental, unsupported, or suspended applicability.
4. Technician records the customer-reported complaint separately from observed behavior.
5. Technician selects Guided Mode or Field Mode.
6. System presents one exact check with safety state, power state, meter mode, points, operating condition, expected result, interpretation, and wiring evidence.
7. Technician records the actual reading or an explicit inability to perform the check.
8. Workflow advances only from stored evidence.
9. Technician reaches diagnosed, inconclusive, unsafe, unsupported, escalated, or completed disposition.
10. System generates technician, customer, estimate, and escalation outputs.

## Field Mode

For direct access by technicians who already know the component or circuit.

Required capabilities:

- search or browse component/circuit checks,
- exact pin-to-pin tests,
- source, control, load, feedback, and return paths,
- expected values and test conditions,
- related service tests, faults, service pointers, and parts context,
- measured-value capture,
- and synchronized wiring evidence.

## Guided Mode

For symptom- or fault-led diagnosis.

Required capabilities:

- user-observable symptom entry,
- separate error-code entry,
- ordered Power → Control → Load → Feedback logic where applicable,
- pass/fail and range branching,
- visible explanation for the next step,
- no immediate part replacement recommendation,
- and explicit stop/escalation states.

## Diagnostic step contract

Executable checks require:

- public technician-facing label,
- purpose,
- step type,
- safety state,
- power state,
- operating condition,
- meter/tool mode,
- Point 1 label and resolved endpoint,
- Point 2 label and resolved endpoint,
- connector, pin, and wire color where applicable,
- expected result or range,
- pass interpretation,
- fail interpretation,
- branch rules,
- trace routes,
- source references,
- accessibility note,
- and validation status.

Internal group or segment IDs remain hidden from normal technician-facing UI.

## Trace-route publication gate

A route must:

- start and end at the resolved meter endpoints,
- use real selectable segment IDs,
- form one expected continuous chain,
- contain no disconnected islands,
- contain no unintended branches,
- preserve junction and crossing semantics,
- enter the correct bus,
- match source/return/reference semantics,
- match the route template,
- pass manual/gold comparison as audit evidence,
- and pass visual trace audit.

## Electrical sequencing

For applicable loads, workflows should establish:

1. source supply,
2. reference or return supply,
3. control input,
4. controlled output,
5. harness path,
6. load terminal,
7. opposite leg or neutral return,
8. across-load voltage,
9. de-energized resistance or continuity where appropriate.

Circuit-specific deviations are allowed only when the technical evidence supports them.

## Trust and safety

- Qualified-technician use is explicit.
- Live and de-energized checks are visually distinct.
- Safety and stop conditions are contextual.
- Unsupported is a first-class state.
- Workflow source and revision remain visible.
- Published versions are immutable.
- Safety-critical corrections suspend the workflow.
- Diagnostic recommendations remain independent from sponsors, vendors, and parts economics.
- Customer-facing documents exclude protected technical content.
- Quantitative claims require field evidence.

## Offline requirements

Before a visit, cache:

- job,
- customer and property,
- equipment,
- current workflow version,
- diagnostic steps,
- diagrams and route assets,
- source metadata,
- prior session notes,
- and repair history.

Offline, allow:

- session start and continuation,
- diagram use,
- measurements,
- notes,
- photos,
- disposition,
- and local summary generation.

On reconnect:

- show pending work,
- upload safely,
- never overwrite measurements silently,
- detect version conflicts,
- and warn if the workflow was suspended while offline.

## Operations integration

Diagnosis must flow into the existing operations system:

- linked appliance and diagnostic state on job,
- repair recommendation to estimate handoff,
- parts and labor line items,
- return-visit state,
- invoice and payment,
- customer-facing summary,
- equipment service history,
- review follow-up,
- and warranty record.

## MVP acceptance criteria

1. A job can be linked to an exact appliance.
2. A technician can start a diagnostic session.
3. Complaint and observation are distinct.
4. Support status is explicit.
5. At least one model family has Field Mode.
6. At least one model family has Guided Mode.
7. Every published check contains exact points, condition, and expected result.
8. Measurements are stored.
9. Branching uses recorded evidence.
10. Wiring evidence remains synchronized to the active check.
11. Unsupported cases stop cleanly.
12. Workflow and source revision remain attached to the session.
13. The field flow works offline.
14. The system produces a diagnostic summary.
15. The finding can create an estimate handoff.
16. A field correction can be reported.
17. A safety-critical correction can suspend a workflow.
18. Internal IDs never leak into technician UI.
19. Managers can see coverage demand and defects.
20. Diagnostic decisions remain free from sponsor influence.

## Success metrics

### Field activation

- supported jobs with a diagnostic session,
- time from opening job to first useful step,
- workflow package download success.

### Execution

- session completion,
- measurement-entry rate,
- step abandonment,
- blocked and escalation rates,
- offline completion.

### Trust and quality

- correction reports,
- safety-critical defects,
- suspended workflows,
- route-validation failures,
- repeated use by technicians.

### Coverage

- supported and unsupported jobs,
- requested model families,
- requested symptoms and faults,
- workflow utilization.

### Operations

- booking and estimate conversion,
- first-visit and return-visit performance,
- revenue and margin,
- outstanding invoices,
- customer retention and reviews.

## Decision gates

- Do not broaden model coverage before initial workflows survive field use.
- Do not publish generated workflows without endpoint, route, electrical, and visual review.
- Do not commit to low-price SaaS assumptions before measuring workflow-production and support cost.
- Do not prioritize peripheral integrations ahead of field adoption blockers.
- Do not publish accuracy, time, callback, or revenue claims without evidence.
