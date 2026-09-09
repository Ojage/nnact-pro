import { expect, test, type Page, type Route } from "@playwright/test";

const estimate = {
  id: "11111111-1111-4111-8111-111111111111",
  orgId: "org-1",
  jobId: "job-1",
  number: "EST-1001",
  total: 20_000,
  accepted: false,
  status: "draft",
  selectedOptionId: null,
  createdAt: "2026-07-16T12:00:00.000Z",
  lineItems: [],
  options: ["Good", "Better", "Best"].map((label, position) => ({
    id: `option-${position + 1}`,
    estimateId: "11111111-1111-4111-8111-111111111111",
    label,
    position,
    total: 20_000 + position * 10_000,
    lineItems: [{ id: `line-${position + 1}`, optionId: `option-${position + 1}`, description: `${label} repair`, quantity: 1, unitPrice: 20_000 + position * 10_000, unitCost: 0, createdAt: "2026-07-16T12:00:00.000Z" }],
  })),
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockEstimate(page: Page) {
  await page.route("http://127.0.0.1:3001/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/estimates/${estimate.id}` && request.method() === "GET") return json(route, estimate);
    if (path === "/api/auth/me") return json(route, { id: "owner-1", name: "Morgan Owner", email: "owner@example.test", role: "owner" });
    if (path === "/api/jobs" && request.method() === "GET") {
      return json(route, [
        { id: "job-1", customerId: "customer-1", title: "Dryer not heating", status: "in_progress", scheduledAt: "2026-07-20T13:00:00.000Z", assignedTo: "tech-1", total: 20_000, createdAt: "2026-07-16T12:00:00.000Z" },
      ]);
    }
    if (path === "/api/customers" && request.method() === "GET") {
      return json(route, [
        { id: "customer-1", name: "Taylor Morgan", email: "taylor@example.test", phone: "515-555-0101", createdAt: "2026-07-15T12:00:00.000Z" },
      ]);
    }
    if (path === `/api/estimates/${estimate.id}/send` && request.method() === "POST") {
      estimate.status = "sent";
      return json(route, estimate);
    }
    if (path.includes("/lines") && request.method() === "POST") return json(route, { lineItem: {}, total: 25_000 }, 201);
    if (path === "/api/notifications/unread-count") return json(route, { count: 0 });
    if (path === "/api/notifications") return json(route, []);
    return json(route, {});
  });
}

test("dispatcher reviews Good, Better, Best and marks the estimate sent", async ({ page }) => {
  await mockEstimate(page);
  await page.goto(`/estimates/${estimate.id}`);
  await expect(page.getByRole("tab", { name: /Good/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Better/ })).toBeVisible();
  await page.getByRole("tab", { name: /Best/ }).click();
  await expect(page.getByText("Best repair")).toBeVisible();
  await page.getByRole("button", { name: "Mark sent" }).click();
  await page.getByRole("button", { name: "Yes, mark sent" }).click();
  await expect(page.getByText("sent", { exact: true })).toBeVisible();
  await expect(page.getByText("3 options")).toBeVisible();
});

test("estimate option editor has no horizontal overflow on mobile", async ({ page }) => {
  await mockEstimate(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/estimates/${estimate.id}`);
  await expect(page.getByRole("tab", { name: /Good/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
