# ADR: Dispatch Agent suggestions

Date: 2026-11-23
Status: Accepted
Sequence: 0055

## Context

Dispatchers currently assign jobs from memory. NNACT technicians ride motorbikes, work from landmark-based addresses, and have uneven skills, home areas, workloads, and customer history. The available data is split across `users`, `appointments`, `jobs`, `repair_outcomes`, `service_visits`, and free-text job/customer addresses. There is no persisted technician skill, home-area, structured job-location, or assignment-outcome data.

## Decision

Build a Dispatch Agent that produces **suggestions only**. A dispatcher always makes the final assignment through the existing assignment endpoints. The agent never writes `jobs.assigned_to`, never creates appointments, and never notifies technicians.

### Data relied on

- `users`: active technicians/owners, names, roles, and profile text.
- `appointments`: scheduled starts/ends and technician conflicts.
- `jobs`: status, scheduled time, service address/category, assigned technician, customer, and history.
- `repair_outcomes`: technician outcome, confidence, labor minutes, and failed-attempt flags.
- `service_visits`: additional scheduled technician work.
- Org-wide `businessSettings`: service areas and working hours.
- New additive tables/columns:
  - `technician_profiles`: home area and daily visit cap.
  - `technician_skills`: skills/certifications/specialties managed by owners.
  - `jobs.town`, `jobs.neighborhood`, `jobs.landmark`, `jobs.zone`: structured landmark/location data.
  - `dispatch_suggestions`: current and historical suggestions, factors, reasons, state, outcomes, and comparison data.

### Scoring design

Hard constraints are deterministic and evaluated before scoring:

1. Active staff with an assignable role.
2. Required skill/certification match when the job type requires one.
3. No appointment conflict in the proposed visit window.
4. Capacity not exceeded for the day.

Remaining candidates receive a transparent score from:

- area proximity by exact `zone`, `neighborhood`, or `town` match against technician home area;
- current workload relative to the daily cap;
- prior completed jobs of the same service category/appliance;
- prior jobs for the same customer;
- repair-outcome quality signal.

Ties are broken by technician id so results are stable. The score and each factor are persisted with the suggestion.

The model may only:

- normalize messy landmark directions into an area string;
- write plain-language reasons for candidates already selected by deterministic code.

The model may not select candidates, skip hard constraints, assign jobs, quote prices, promise arrival times, or invent technicians. Candidate ids returned by the model are validated against the deterministic candidate set; invalid output is discarded and fixed fallback reasons are used.

### Human-approval boundary

Suggestions are stored with state `shadow` or `shown`. In shadow mode they are logged but hidden from the UI. The dispatcher's eventual assignment is compared with the suggestion by the worker and recorded as `accepted`, `changed`, or `ignored`. In normal mode the job page shows up to three suggestions. Clicking assign calls the existing appointment PATCH when an appointment exists, otherwise the existing job PATCH; only after that succeeds does the API record the outcome. Reject and ignore are staff-only actions with persisted reasons.

### Rollout and rollback

The feature is off by default via `DISPATCH_AGENT_ENABLED=false`. Shadow mode defaults on. UI visibility requires both the global flag and shadow mode off. Rollback is setting the flag to false; additive schema objects can be dropped in a later migration without affecting existing assignment paths.
