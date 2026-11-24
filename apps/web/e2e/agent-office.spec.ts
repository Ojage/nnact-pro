import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

// The page is behind a build-time flag; build with NEXT_PUBLIC_AGENT_OFFICE_ENABLED=true to run this.
test.skip(process.env.NEXT_PUBLIC_AGENT_OFFICE_ENABLED !== "true", "Agent Office flag is off in this build");

const artifactDir = path.resolve("artifacts");
const API = "http://127.0.0.1:3001";

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
      room({ id: "dispatch-agent", displayName: "Dispatch agent", stage: "building", status: "offline", lastSeenAt: null }),
      room({ id: "payments-agent", displayName: "Payments agent", tier: "T3", stage: "planned", status: "offline", lastSeenAt: null }),
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
    if (p.endsWith("/pause") && request.method() === "POST") {
      onControl?.(p, request.postDataJSON());
      return fulfillJson(route, { ok: true });
    }
    return fulfillJson(route, {});
  });
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test("floor plan shows live and vacant offices and applies streamed updates", async ({ page }) => {
  await mockOfficeApi(page);
  await page.goto("/agents");

  const intake = page.getByRole("button", { name: "Intake agent" });
  await expect(intake).toContainText("Working");
  await expect(intake).toContainText("Drafting job from WhatsApp, step 2 of 4");
  await expect(page.getByRole("button", { name: "Payments agent" })).toContainText("Coming soon");
  await expect(page.getByRole("link", { name: /Draft jobs to review/ })).toContainText("2");
  // Spend at 85% of the cap raises a warning in words, not only color.
  await expect(page.getByRole("region", { name: "Alerts" })).toContainText("85% of its daily cost cap");
  // The streamed update lands within the 1 s throttle.
  await expect(intake).toContainText("5 queued");
  await page.screenshot({ path: path.join(artifactDir, "agent-office-floor.png"), fullPage: true });
});

test("drawer tabs work from the keyboard and pausing needs a reason and confirmation", async ({ page }) => {
  const controls: Array<{ path: string; body: unknown }> = [];
  await mockOfficeApi(page, (p, body) => controls.push({ path: p, body }));
  await page.goto("/agents");

  await page.getByRole("button", { name: "Intake agent" }).click();
  const drawer = page.getByRole("dialog", { name: "Intake agent" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("tab", { name: "Now" })).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByText("Extract job fields")).toBeVisible();

  await drawer.getByRole("tab", { name: "Now" }).focus();
  await page.keyboard.press("End");
  await expect(drawer.getByRole("tab", { name: "Controls" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(drawer.getByRole("tab", { name: "Controls" })).toHaveAttribute("aria-selected", "true");

  await drawer.getByRole("button", { name: "Pause agent" }).click();
  await expect(drawer.getByRole("alert")).toContainText("at least 5 characters");
  await drawer.getByLabel("Reason").fill("Provider outage, holding new work");
  await drawer.getByRole("button", { name: "Pause agent" }).click();

  const confirm = page.getByRole("dialog", { name: "Pause Intake agent?" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Pause agent" }).click();
  await expect.poll(() => controls.length).toBe(1);
  expect(controls[0]).toEqual({ path: "/api/agent-office/agents/intake-agent/pause", body: { reason: "Provider outage, holding new work" } });

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: "Intake agent" })).toBeFocused();
});

test("logs tab filters by level and search", async ({ page }) => {
  await mockOfficeApi(page);
  await page.goto("/agents");
  await page.getByRole("button", { name: "Intake agent" }).click();
  const drawer = page.getByRole("dialog", { name: "Intake agent" });
  await drawer.getByRole("tab", { name: "Logs" }).click();
  const lines = drawer.getByRole("list", { name: "Log lines" });
  await expect(lines.getByRole("listitem")).toHaveCount(2);
  await drawer.getByLabel("Level").selectOption("warn");
  await expect(lines.getByRole("listitem")).toHaveCount(1);
  await drawer.getByLabel("Level").selectOption("debug");
  await drawer.getByLabel("Search").fill("received");
  await expect(lines.getByRole("listitem")).toHaveCount(1);
});

test("small screens default to the list view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOfficeApi(page);
  await page.goto("/agents");
  await expect(page.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("table")).toContainText("Intake agent");
  await page.screenshot({ path: path.join(artifactDir, "agent-office-mobile.png"), fullPage: true });
});
