import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const artifactDir = path.resolve("artifacts");

function isoAt(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

function fixtures() {
  const customers = [
    { id: "customer-1", name: "Taylor Morgan", email: "taylor@example.test", phone: "515-555-0101", createdAt: isoAt(6) },
    { id: "customer-2", name: "Jordan Lee", email: "jordan@example.test", phone: "515-555-0102", createdAt: isoAt(6) },
    { id: "customer-3", name: "Casey Nguyen", email: "casey@example.test", phone: "515-555-0103", createdAt: isoAt(6) },
    { id: "customer-4", name: "Morgan Diaz", email: "morgan@example.test", phone: "515-555-0104", createdAt: isoAt(6) },
  ];
  const jobs = [
    { id: "job-scheduled", customerId: "customer-1", title: "Washer not draining", status: "scheduled", scheduledAt: isoAt(9), assignedTo: "tech-1", total: 14900, createdAt: isoAt(6) },
    { id: "job-progress", customerId: "customer-2", title: "Dryer no heat", status: "in_progress", scheduledAt: isoAt(10), assignedTo: "tech-1", total: 22900, createdAt: isoAt(6) },
    { id: "job-ready", customerId: "customer-3", title: "Refrigerator warm", status: "completed", scheduledAt: isoAt(11), assignedTo: "tech-2", total: 31900, createdAt: isoAt(6) },
    { id: "job-pricing", customerId: "customer-4", title: "Dishwasher leaking", status: "completed", scheduledAt: isoAt(12), assignedTo: "tech-2", total: 0, createdAt: isoAt(6) },
    { id: "job-invoiced", customerId: "customer-1", title: "Range burner repair", status: "completed", scheduledAt: isoAt(13), assignedTo: "tech-1", total: 18900, createdAt: isoAt(6) },
  ];
  const invoices = [
    { id: "invoice-existing", jobId: "job-invoiced", number: "INV-1001", status: "sent", total: 18900, createdAt: isoAt(14) },
  ];
  return { customers, jobs, invoices };
}

async function mockCloseoutApi(
  page: Page,
  capture: { patches: Array<{ id: string; body: Record<string, unknown> }>; invoices: Record<string, unknown>[] },
) {
  const data = fixtures();
  await page.route("http://127.0.0.1:3001/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/notifications/unread-count") return fulfillJson(route, { count: 0 });
    if (url.pathname === "/api/notifications") return fulfillJson(route, []);
    if (url.pathname === "/api/jobs" && request.method() === "GET") return fulfillJson(route, data.jobs);
    if (url.pathname === "/api/customers" && request.method() === "GET") return fulfillJson(route, data.customers);
    if (url.pathname === "/api/invoices" && request.method() === "GET") return fulfillJson(route, data.invoices);

    if (url.pathname.startsWith("/api/jobs/") && request.method() === "PATCH") {
      const id = url.pathname.split("/").at(-1)!;
      const body = request.postDataJSON() as Record<string, unknown>;
      capture.patches.push({ id, body });
      const job = data.jobs.find((row) => row.id === id);
      if (!job) return fulfillJson(route, { error: "not found" }, 404);
      Object.assign(job, body);
      return fulfillJson(route, job);
    }

    if (url.pathname === "/api/invoices" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      capture.invoices.push(body);
      const job = data.jobs.find((row) => row.id === body.jobId);
      return fulfillJson(route, {
        id: "invoice-created",
        jobId: body.jobId,
        number: "INV-1002",
        status: "draft",
        total: job?.total ?? 0,
        createdAt: isoAt(15),
      }, 201);
    }

    return fulfillJson(route, {});
  });
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test("desktop closeout moves completed work into invoicing", async ({ page }) => {
  const capture = { patches: [] as Array<{ id: string; body: Record<string, unknown> }>, invoices: [] as Record<string, unknown>[] };
  const runtimeErrors = collectRuntimeErrors(page);
  await mockCloseoutApi(page, capture);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/closeout");

  await expect(page).toHaveTitle(/NNACT Pro/i);
  await expect(page.getByRole("heading", { name: "Job closeout" })).toBeVisible();
  await expect(page.getByTestId("closeout-board")).toBeVisible();
  await expect(page.getByText("Awaiting start").first()).toBeVisible();
  await expect(page.getByText("Needs pricing").first()).toBeVisible();
  await expect(page.getByText("Dishwasher leaking")).toBeVisible();
  await expect(page.getByText("$0.00")).toBeVisible();
  await expect(page.getByRole("link", { name: /Job Closeout/ })).toHaveAttribute("aria-current", "page");

  await page.screenshot({ path: path.join(artifactDir, "closeout-board-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Complete Dryer no heat" }).click();
  await expect.poll(() => capture.patches).toContainEqual({ id: "job-progress", body: { status: "completed" } });
  await expect(page.getByRole("button", { name: "Create invoice for Dryer no heat" })).toBeVisible();

  await page.getByRole("button", { name: "Create invoice for Dryer no heat" }).click();
  await expect.poll(() => capture.invoices).toContainEqual({ jobId: "job-progress" });
  await expect(page.getByText("INV-1002")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create invoice for Dryer no heat" })).toHaveCount(0);

  await page.screenshot({ path: path.join(artifactDir, "closeout-invoiced-desktop.png"), fullPage: true });
  expect(runtimeErrors).toEqual([]);
});

test("mobile closeout preserves every queue without document overflow", async ({ page }) => {
  const capture = { patches: [] as Array<{ id: string; body: Record<string, unknown> }>, invoices: [] as Record<string, unknown>[] };
  const runtimeErrors = collectRuntimeErrors(page);
  await mockCloseoutApi(page, capture);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/closeout");

  await expect(page.getByRole("heading", { name: "Job closeout" })).toBeVisible();
  await expect(page.getByText("Washer not draining")).toBeVisible();
  await expect(page.getByText("Dryer no heat")).toBeVisible();
  await expect(page.getByText("Refrigerator warm")).toBeVisible();
  await expect(page.getByText("Dishwasher leaking")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.screenshot({ path: path.join(artifactDir, "closeout-board-mobile.png"), fullPage: true });
  expect(runtimeErrors).toEqual([]);
});
