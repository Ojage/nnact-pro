import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const artifactDir = path.resolve("artifacts");

interface AppointmentFixture {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

function isoAt(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function createFixtures() {
  const appointments: AppointmentFixture[] = [
    {
      id: "appointment-unassigned",
      jobId: "job-dishwasher",
      technicianId: null,
      startsAt: isoAt(8, 0),
      endsAt: isoAt(9, 15),
    },
    {
      id: "appointment-alex",
      jobId: "job-range",
      technicianId: "tech-alex",
      startsAt: isoAt(9, 30),
      endsAt: isoAt(10, 30),
    },
    {
      id: "appointment-jamie",
      jobId: "job-refrigerator",
      technicianId: "tech-jamie",
      startsAt: isoAt(11, 0),
      endsAt: isoAt(12, 30),
    },
  ];

  const jobs = [
    {
      id: "job-dishwasher",
      customerId: "customer-1",
      title: "Dishwasher no drain",
      status: "scheduled",
      scheduledAt: isoAt(8, 0),
      assignedTo: null,
      total: 8900,
      createdAt: isoAt(6, 0),
    },
    {
      id: "job-range",
      customerId: "customer-2",
      title: "Range not heating",
      status: "in_progress",
      scheduledAt: isoAt(9, 30),
      assignedTo: "tech-alex",
      total: 14900,
      createdAt: isoAt(6, 15),
    },
    {
      id: "job-refrigerator",
      customerId: "customer-3",
      title: "Refrigerator warm",
      status: "scheduled",
      scheduledAt: isoAt(11, 0),
      assignedTo: "tech-jamie",
      total: 12900,
      createdAt: isoAt(6, 30),
    },
  ];

  const users = [
    {
      id: "owner-1",
      orgId: "org-1",
      email: "owner@example.test",
      name: "Morgan Owner",
      role: "owner",
      active: true,
      createdAt: isoAt(5, 0),
    },
    {
      id: "tech-alex",
      orgId: "org-1",
      email: "alex@example.test",
      name: "Alex Rivera",
      role: "technician",
      active: true,
      createdAt: isoAt(5, 0),
    },
    {
      id: "tech-jamie",
      orgId: "org-1",
      email: "jamie@example.test",
      name: "Jamie Chen",
      role: "technician",
      active: true,
      createdAt: isoAt(5, 0),
    },
  ];

  return { appointments, jobs, users };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockOperationsApi(page: Page, onPatch?: (body: Record<string, unknown>) => void) {
  const fixtures = createFixtures();

  await page.route("http://127.0.0.1:3001/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/notifications/unread-count") {
      return fulfillJson(route, { count: 0 });
    }
    if (url.pathname === "/api/notifications") {
      return fulfillJson(route, []);
    }
    if (url.pathname === "/api/jobs") {
      return fulfillJson(route, fixtures.jobs);
    }
    if (url.pathname === "/api/users") {
      return fulfillJson(route, fixtures.users);
    }
    if (url.pathname === "/api/appointments" && request.method() === "GET") {
      return fulfillJson(route, fixtures.appointments);
    }
    if (url.pathname.startsWith("/api/appointments/") && request.method() === "PATCH") {
      const id = url.pathname.split("/").at(-1)!;
      const body = request.postDataJSON() as { technicianId?: string | null };
      onPatch?.(body);
      const appointment = fixtures.appointments.find((item) => item.id === id);
      if (!appointment) return fulfillJson(route, { error: "not found" }, 404);
      appointment.technicianId = body.technicianId ?? null;
      return fulfillJson(route, appointment);
    }

    return fulfillJson(route, {});
  });
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test("dispatcher reassigns an unassigned visit and the board updates", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  let patchBody: Record<string, unknown> | undefined;
  await mockOperationsApi(page, (body) => { patchBody = body; });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dispatch");

  await expect(page).toHaveTitle(/OpenFieldPro/i);
  await expect(page.getByRole("heading", { name: "Dispatch board" })).toBeVisible();
  await expect(page.getByTestId("dispatch-board")).toBeVisible();

  const unassignedLane = page.getByTestId("dispatch-lane-unassigned");
  const alexLane = page.getByTestId("dispatch-lane-tech-alex");
  const jamieLane = page.getByTestId("dispatch-lane-tech-jamie");

  await expect(unassignedLane.getByText("Dishwasher no drain")).toBeVisible();
  await expect(alexLane.getByText("Range not heating")).toBeVisible();
  await expect(jamieLane.getByText("Refrigerator warm")).toBeVisible();

  await page.screenshot({ path: path.join(artifactDir, "dispatch-board-desktop-before.png"), fullPage: true });

  await page.getByLabel("Assign Dishwasher no drain").selectOption("tech-alex");

  await expect(unassignedLane.getByText("Dishwasher no drain")).toHaveCount(0);
  await expect(alexLane.getByText("Dishwasher no drain")).toBeVisible();
  expect(patchBody).toEqual({ technicianId: "tech-alex" });

  await page.screenshot({ path: path.join(artifactDir, "dispatch-board-desktop-assigned.png"), fullPage: true });
  expect(runtimeErrors).toEqual([]);
});

test("mobile dispatch board stacks lanes without document overflow", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await mockOperationsApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dispatch");

  await expect(page.getByRole("heading", { name: "Dispatch board" })).toBeVisible();
  await expect(page.getByTestId("dispatch-lane-unassigned")).toBeVisible();
  await expect(page.getByTestId("dispatch-lane-tech-alex")).toBeVisible();
  await expect(page.getByLabel("Assign Dishwasher no drain")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.screenshot({ path: path.join(artifactDir, "dispatch-board-mobile.png"), fullPage: true });
  expect(runtimeErrors).toEqual([]);
});
