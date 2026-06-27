# Odysseus -> OFP migration: branch comparison

This document captures the file-level and commit-level diff between
`archive/odysseus-original` (the preserved Odysseus project) and `ofp-monorepo`
(the new Turborepo-based OpenFieldPro monorepo). It exists because these two
branches share **no common history** (OFP was force-pushed as a clean
replacement), so GitHub's PR review UI and the compare URL cannot render the
diff. This file is the recovery mechanism.

## At a glance

| Metric | `archive/odysseus-original` | `ofp-monorepo` |
|---|---:|---:|
| Commits | 486 | 9 |
| HEAD | `89f8268` | `78a1c2f` |
| First commit | 2026-05-31T23:58:26+09:00 | 2026-06-27T00:26:16-05:00 |
| Last commit | 2026-06-26T23:31:22-05:00 | 2026-06-27T09:24:54-05:00 |
| Default branch on GitHub | - | `ofp-monorepo` |

**Summary of the OFP replacement:** ` 777 files changed, 4596 insertions(+), 354684 deletions(-)`

## Top-level directory shape

**`archive/odysseus-original` (Odysseus)**
- `.dockerignore/` -- 1 files at HEAD
- `.env.example/` -- 1 files at HEAD
- `.gitattributes/` -- 1 files at HEAD
- `.gitignore/` -- 1 files at HEAD
- `ACKNOWLEDGMENTS.md/` -- 1 files at HEAD
- `CHANGELOG.md/` -- 1 files at HEAD
- `CLAUDE.md/` -- 1 files at HEAD
- `CONTRIBUTING.md/` -- 1 files at HEAD
- `Dockerfile/` -- 1 files at HEAD
- `LICENSE/` -- 1 files at HEAD
- `README.md/` -- 1 files at HEAD
- `ROADMAP.md/` -- 1 files at HEAD
- `SECURITY.md/` -- 1 files at HEAD
- `THREAT_MODEL.md/` -- 1 files at HEAD
- `TUNNEL.md/` -- 1 files at HEAD

**`ofp-monorepo` (OFP)**
- `.env.example/` -- 1 files at HEAD
- `.gitignore/` -- 1 files at HEAD
- `README.md/` -- 1 files at HEAD
- `apps/` -- 1 files at HEAD
- `deploy.ps1/` -- 1 files at HEAD
- `deploy.sh/` -- 1 files at HEAD
- `infra/` -- 1 files at HEAD
- `landing/` -- 1 files at HEAD
- `package.json/` -- 1 files at HEAD
- `packages/` -- 1 files at HEAD
- `pnpm-workspace.yaml/` -- 1 files at HEAD

## Largest file-level changes (top 30 by total line changes)

Source: `git diff --stat origin/archive/odysseus-original origin/ofp-monorepo`

| Path | `+` | `-` |
|---|---:|---:|
| `static/style.css` | 0 | 19 |
| `static/lib/docx.umd.min.js` | 0 | 11 |
| `services/hwfit/data/hf_models.json` | 0 | 10 |
| `static/css/components.css` | 0 | 8 |
| `static/css/tools.css` | 0 | 7 |
| `static/js/document.js` | 0 | 5 |
| `static/js/slashCommands.js` | 0 | 4 |
| `src/tool_implementations.py` | 0 | 3 |
| `static/app.js` | 0 | 3 |
| `static/js/chat.js` | 0 | 3 |
| `static/js/emailLibrary.js` | 0 | 3 |
| `static/js/notes.js` | 0 | 3 |
| `static/js/settings.js` | 0 | 3 |
| `.env.example` | 1 | 1 |
| `.gitignore` | 1 | 1 |
| `README.md` | 1 | 1 |
| `package.json` | 1 | 1 |
| `routes/cookbook_routes.py` | 0 | 2 |
| `routes/email_routes.py` | 0 | 2 |
| `src/agent_loop.py` | 0 | 2 |
| `src/builtin_actions.py` | 0 | 2 |
| `src/task_scheduler.py` | 0 | 2 |
| `static/css/chat.css` | 0 | 2 |
| `static/css/editor.css` | 0 | 2 |
| `static/css/modals.css` | 0 | 2 |
| `static/index.html` | 0 | 2 |
| `static/js/admin.js` | 0 | 2 |
| `static/js/calendar.js` | 0 | 2 |
| `static/js/chatRenderer.js` | 0 | 2 |
| `static/js/cookbookRunning.js` | 0 | 2 |

## Commits on `ofp-monorepo` (9 total)

- 78a1c2f Materialize Drizzle migration (initial, all 13 tables)
- 77063f1 Wire unified activity log (POST/GET /api/activities + emitter + customer timeline)
- b6f08b6 Add margin rollup to /api/reports/summary + dashboard cards
- a9c4da6 Wire margin tracking end-to-end (jobs.laborCostCents + lineItems.unitCost)
- d79e401 Add margin tracking + activities timeline (jobs.laborCostCents, lineItems.unitCost, activities table)
- 76eedcb Finish roadmap + deploy prep
- b11cf08 Phase 3: invoicing + payments (offline-first, Stripe-optional)
- 9864ff1 Phase 2: JWT auth + scheduling/dispatch
- eee2a97 Phase 1 foundation: full-stack OFP monorepo

## Last 30 commits on `archive/odysseus-original` (of 486 total)

Most recent Odysseus work at the time the archive ref was created. Full history:
`git log origin/archive/odysseus-original`

- 89f8268 docs(gitignore,changelog): close OFP bootstrap -- mirror HOLD regex, resolve Pending-commit contradiction
- d288cfc docs: OFP first-push recipe + cross-refs â€” lessons from 2026-06-27 force-push chain including side-by-side force-push vs delete-and-recreate framework
- 5395f15 build(gitignore): tighten CI/dev exclusions + add pre-commit-config parity
- e99eb05 chore: initial OFP snapshot (code + tests + docs only) (--no-verify: husky CSS-lint hook is irrelevant to backend+docs initial push)
- 0e6cbd8 Drop GPU-only flags from the CPU-only (-ngl 0) serve command (#1433)
- 5c6bd0f Fix Edge/Chromium sidebar section-title clipping (#1420)
- 57abe69 Let the output "x" delete work when no model/session exists (#1431)
- 583df3d Recognize gemma3/llama4/mistral-small3.1+/multimodal as vision models (#1430)
- 70103d8 fix(email): no-op IMAP connection leak in _auto_summarize_pass_single on exception (#1423)
- 8450cee Surface upload failures instead of silently dropping the files (#1425)
- 1ecd113 Keep presets loading with bad local state (#1417)
- 4d1829a Clear the composer draft when entering the New Chat / welcome state (#1408)
- 5fd71f6 Keep group chat session cache loading (#1418)
- 0ec8415 Fix multi-file uploads tripping the per-IP concurrency guard (#1346) (#1362)
- fd37cce Ignore invalid personal docs state (#1401)
- abbc073 Reject invalid preset CLI stores (#1395)
- a5282e9 Pin the SearXNG image so a broken :latest can't block startup (#1419)
- 35c40bc Fall back from invalid settings stores (#1416)
- 77b63ed Keep Cookbook download-failure toasts visible long enough to read (#1412)
- 1f2a06f fix: MCP reconnect via tool passes only server_id to connect_server (#1385)
- 69d6fe4 Wrap the README banner in a code fence so it renders as typed (#1403)
- 7af168f fix: rag add_directory records the dir so list/remove can see it (#1369)
- 7ce2db2 fix: prevent iOS focus-zoom on form fields (touch only) (#1323)
- cb114d6 Remove stray PR screenshots accidentally committed under docs/ (#1351)
- 50a486b fix(cookbook): add NVFP4 to quantization picker dropdown (#1378)
- b6843c7 Route "read that report" to manage_research instead of the HTML render (#1375)
- b544682 fix(hwfit): detect unified-memory NVIDIA (Grace Blackwell GB10 / DGX Spark) instead of 'No GPU' (#1340) (#1372)
- 66c9349 fix(skills): markdown save must not rename the skill, so delete keeps working (#1333) (#1365)
- c3fd969 fix: once-schedule comparison uses local time against UTC date (#1349)
- ce7f5db Inject current date into deep research planning and query prompts (#1347)

## How to recover the full diff locally

```bash
# from a clone of https://github.com/niko4244/openfieldpro
git fetch origin

# file-level diff (works for unrelated histories)
git diff --stat origin/archive/odysseus-original origin/ofp-monorepo

# commit-level diff (one side is empty since they have no merge-base)
git log origin/ofp-monorepo ^origin/archive/odysseus-original --oneline
git log origin/archive/odysseus-original ^origin/ofp-monorepo --oneline

# inspect the archived Odysseus history directly
git checkout origin/archive/odysseus-original -- .
```

## Why no PR?

`POST /repos/niko4244/openfieldpro/pulls` returned **HTTP 422**:

> The ofp-monorepo branch has no history in common with archive/odysseus-original

GitHub's PR review UI requires a 3-way merge base to render the file diff; the
compare URL `.../compare/archive/odysseus-original...ofp-monorepo` similarly
returns **404** for unrelated histories. This file replaces that gap.

## Background

- **Default branch** on `niko4244/openfieldpro`: `ofp-monorepo`.
- The original `main` (which held 426 Odysseus commits + 3 OFP-document commits) was renamed to `archive/odysseus-original` to preserve the work under a descriptive name.
- The OFP monorepo replaces Odysseus entirely; no code is shared between the two branches.
- This file is the user-facing artifact of the diff. The 426-commit Odysseus history remains on `archive/odysseus-original` for `git log` / `git checkout` / `git diff`.
