import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const artifactDir = path.resolve("artifacts");
const API = process.env.NNPWEB_E2E_API ?? "http://127.0.0.1:3001";

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function room(overrides: Record<string, unknown>) {
  return {
    tier: "T1",
    stage: "live",
    status: "idle",
    enabled: true,
    current: null,
    queueDepth: 0,
    costTodayCents: 0,
    costCapCents: 200,
    activity: [0, 1, 0, 2, 3, 1, 0, 0, 4, 2, 1, 0],
    runsToday: 14,
    errorsToday: 0,
    lastSeenAt: minutesAgo(0),
    version: "2026.11.23",
    ...overrides,
  };
}

const intakeWorking = room({
  id: "intake-agent",
  displayName: "Intake agent",
  tier: "T3",
  status: "working",
  queueDepth: 3,
  costTodayCents: 170,
  current: {
    runId: "run-1",
    task: "agent.extract",
    label: "Drafting job from WhatsApp",
    stepName: "extract",
    stepIndex: 2,
    stepCount: 4,
    startedAt: minutesAgo(1),
  },
});

function overview() {
  return {
    generatedAt: new Date().toISOString(),
    costTodayCents: 215,
    approvals: { draftJobs: 2, quoteProposals: 1, dispatchSuggestions: 0 },
    agents: [
      intakeWorking,
      room({ id: "quoting-agent", displayName: "Quoting agent", costTodayCents: 45 }),
      room({ id: "dispatch-agent", displayName: "Dispatch agent", stage: "live", status: "offline", lastSeenAt: null }),
      room({ id: "payments-agent", displayName: "Payments agent", tier: "T3", stage: "live", status: "offline", lastSeenAt: null }),
    ],
  };
}

const detail = {
  agent: intakeWorking,
  metrics: {
    runsPerHour: [0, 1, 0, 2, 3, 1, 0, 0, 4, 2, 1, 0],
    successRate: 0.93,
    latencyP50Ms: 2_400,
    latencyP95Ms: 9_800,
    costTodayCents: 170,
    costCapCents: 200,
    inputTokensToday: 18_200,
    outputTokensToday: 2_100,
    errorsByType: [{ type: "provider_timeout", count: 1 }],
    deadLetters: 0,
    queueDepth: 3,
    approvals: { accepted: 9, edited: 3, rejected: 1 },
  },
  config: {
    scopes: ["draft-jobs:create", "agent-runs:write"],
    never: ["confirm-price", "assign-job"],
    tasks: ["agent.extract"],
    featureFlagKey: "agents.intake.enabled",
    flagEnabled: true,
    costCapEnv: "AGENT_DAILY_COST_CAP_CENTS",
    maxAttempts: 3,
    promptVersion: "intake-v4",
    version: "2026.11.23",
  },
  controlHistory: [],
};

const runDetail = {
  id: "run-1",
  agentId: "intake-agent",
  task: "agent.extract",
  state: "running",
  outcome: null,
  startedAt: minutesAgo(1),
  finishedAt: null,
  latencyMs: null,
  costCents: null,
  inputTokens: null,
  outputTokens: null,
  error: null,
  retryable: false,
  steps: [
    { id: "s1", runId: "run-1", name: "receive", label: "Receive message", status: "completed", startedAt: minutesAgo(1), finishedAt: minutesAgo(1), summary: "Text message in French" },
    { id: "s2", runId: "run-1", name: "extract", label: "Extract job fields", status: "running", startedAt: minutesAgo(0), finishedAt: null, summary: null },
  ],
  logs: [],
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockOfficeApi(page: Page, onControl?: (path: string, body: unknown) => void) {
  // Keep the first-run walkthrough out of the way regardless of the test port.
  await page.addInitScript(() => window.localStorage.setItem("nnact:walkthrough:banner-dismissed:learn", "1"));
  await page.route(`${API}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const p = url.pathname;
    if (p === "/api/auth/me") return fulfillJson(route, { id: "owner-1", name: "Morgan Owner", email: "owner@example.test", role: "owner" });
    if (p === "/api/notifications/unread-count") return fulfillJson(route, { count: 0 });
    if (p === "/api/notifications") return fulfillJson(route, []);
    if (p === "/api/agent-office/overview") return fulfillJson(route, overview());
    if (p === "/api/agent-office/stream") {
      const update = { type: "agent", agent: { ...intakeWorking, queueDepth: 5 } };
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          // A credentialed EventSource needs an exact origin and explicit credentials.
          "access-control-allow-origin": request.headers()["origin"] ?? "*",
          "access-control-allow-credentials": "true",
        },
        body: `: keep-alive\n\nid: 1\ndata: ${JSON.stringify(update)}\n\n`,
      });
    }
    if (p === "/api/agent-office/agents/intake-agent") return fulfillJson(route, detail);
    if (p === "/api/agent-office/runs/run-1") return fulfillJson(route, runDetail);
    if (p === "/api/agent-office/agents/intake-agent/logs") {
      return fulfillJson(route, {
        lines: [
          { id: "l1", agentId: "intake-agent", runId: "run-1", at: minutesAgo(1), level: "info", message: "Message received" },
          { id: "l2", agentId: "intake-agent", runId: "run-1", at: minutesAgo(0), level: "warn", message: "Provider slow, retrying" },
        ],
      });
    }
    if (request.method() === "POST" && ["/pause", "/start", "/restart"].some((suffix) => p.endsWith(suffix))) {
      const raw = request.postData();
      const body = raw ? JSON.parse(raw) : undefined;
      onControl?.(p, body);
      return fulfillJson(route, { ok: true, started: true });
    }
    return fulfillJson(route, {});
  });
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test("table lists live and vacant agents, summarises the office and applies streamed updates", async ({ page }) => {
  await mockOfficeApi(page);
  await page.goto("/agents");

  const intake = page.getByRole("row", { name: /Intake agent/ });
  await expect(intake).toContainText("Working");
  await expect(intake).toContainText("Drafting job from WhatsApp, step 2 of 4");
  await expect(page.getByRole("row", { name: /Payments agent/ })).toContainText("Offline");
  await expect(page.getByRole("list", { name: "Agent Office summary" })).toContainText("2 drafts");
  // Spend at 85% of the cap raises a warning in words, not only color.
  await expect(page.getByRole("list", { name: "Alerts" })).toContainText("85% of its daily cost cap");
  // The streamed update lands within the 1 s throttle: the queue becomes 5.
  await expect(intake.getByRole("cell").nth(3)).toHaveText("5");
  await page.screenshot({ path: path.join(artifactDir, "agent-office-table.png"), fullPage: true });
});

test("the table filters and sorts, and the floor plan is still a view", async ({ page }) => {
  await mockOfficeApi(page);
  await page.goto("/agents");
  await page.getByLabel("Filter", { exact: true }).fill("quoting");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByLabel("Filter", { exact: true }).fill("");
  await page.getByRole("button", { name: "Name" }).click();
  await expect(page.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");

  await page.getByRole("button", { name: "Floor plan" }).click();
  await expect(page.getByRole("button", { name: "Floor plan" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Intake agent" })).toContainText("Working");
});

test("an agent's details page has section links; pausing needs a reason and confirmation", async ({ page }) => {
  const controls: Array<{ path: string; body: unknown }> = [];
  await mockOfficeApi(page, (p, body) => controls.push({ path: p, body }));
  await page.goto("/agents");

  await page.getByRole("link", { name: "Intake agent", exact: true }).click();
  await page.waitForURL("**/agents/intake-agent");
  await expect(page.getByRole("heading", { level: 1, name: "Intake agent" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Extract job fields")).toBeVisible();

  await page.getByRole("link", { name: "Controls" }).click();
  await page.waitForURL("**/agents/intake-agent?tab=controls");
  await expect(page.getByRole("link", { name: "Controls" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "Pause agent" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "at least 5 characters" })).toBeVisible();
  await page.getByLabel("Reason").fill("Provider outage, holding new work");
  await page.getByRole("button", { name: "Pause agent" }).click();

  const confirm = page.getByRole("dialog", { name: "Pause Intake agent?" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Pause agent" }).click();
  await expect.poll(() => controls.length).toBe(1);
  expect(controls[0]).toEqual({ path: "/api/agent-office/agents/intake-agent/pause", body: { reason: "Provider outage, holding new work" } });

  await page.getByRole("link", { name: "Agent Office" }).first().click();
  await page.waitForURL("**/agents");
});

test("the details toolbar starts and restarts the worker", async ({ page }) => {
  const controls: Array<{ path: string; body: unknown }> = [];
  await mockOfficeApi(page, (p, body) => controls.push({ path: p, body }));
  await page.goto("/agents/intake-agent");
  const toolbar = page.getByRole("toolbar", { name: "Intake agent actions" });
  await toolbar.getByRole("button", { name: "Start", exact: true }).click();
  await toolbar.getByRole("button", { name: "Restart", exact: true }).click();
  await expect.poll(() => controls.length).toBe(2);
  expect(controls).toEqual([
    { path: "/api/agent-office/agents/intake-agent/start", body: undefined },
    { path: "/api/agent-office/agents/intake-agent/restart", body: undefined },
  ]);
});

test("the logs section filters by level and search", async ({ page }) => {
  await mockOfficeApi(page);
  await page.goto("/agents/intake-agent?tab=logs");
  const lines = page.getByRole("list", { name: "Log lines" });
  await expect(lines.getByRole("listitem")).toHaveCount(2);
  const content = page.locator("#main-content");
  await content.getByLabel("Level").selectOption("warn");
  await expect(lines.getByRole("listitem")).toHaveCount(1);
  await content.getByLabel("Level").selectOption("debug");
  await content.getByLabel("Search", { exact: true }).fill("received");
  await expect(lines.getByRole("listitem")).toHaveCount(1);
});

test("on a phone the table scrolls inside its frame, not the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOfficeApi(page);
  await page.goto("/agents");
  await expect(page.getByRole("table")).toContainText("Intake agent");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  await page.screenshot({ path: path.join(artifactDir, "agent-office-mobile.png"), fullPage: true });
});
