import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const artifactDir = path.resolve("artifacts");

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function mockShellApi(page: Page) {
  await page.route("http://127.0.0.1:3001/**", async (route) => {
    const url = route.request().url();
    const body = url.includes("unread")
      ? JSON.stringify({ count: 0 })
      : url.includes("notifications")
        ? JSON.stringify([])
        : JSON.stringify({});

    await route.fulfill({ status: 200, contentType: "application/json", body });
  });
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await mockShellApi(page);
});

test("desktop diagnostic flow renders ordered route evidence and mode changes", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-qa/diagnostics");

  await expect(page).toHaveTitle(/OpenFieldPro/i);
  await expect(page.getByRole("heading", { name: "OpenFieldPro diagnostic visual QA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diagnostic tree" })).toBeVisible();
  await expect(page.getByTestId("route-topology-audit")).toBeVisible();
  await expect(page.getByText("SEG-L1-01")).toBeVisible();
  await expect(page.getByText("SEG-L1-02")).toBeVisible();
  await expect(page.getByText("SEG-L2-01")).toBeVisible();
  await expect(page.getByText("SEG-L2-02")).toBeVisible();
  await expect(page.getByText("2 passed")).toBeVisible();
  await expect(page.getByText("1 review")).toBeVisible();

  await page.screenshot({ path: path.join(artifactDir, "diagnostics-guided-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "field mode" }).click();
  await expect(page.getByRole("heading", { name: "Direct field checks" })).toBeVisible();

  const heaterStep = page.getByRole("button", { name: /Verify heater continuity/ });
  await expect(heaterStep).toBeVisible();
  await heaterStep.click();

  await expect(page.getByRole("heading", { name: "Verify heater continuity" })).toBeVisible();
  await expect(
    page.getByText(/Power disconnected; verify zero volts before resistance testing · Unit unplugged/),
  ).toBeVisible();
  await expect(page.getByText("Across-load continuity path").first()).toBeVisible();

  await page.getByRole("button", { name: "Report workflow issue" }).click();
  await expect(page.getByRole("heading", { name: "Report a workflow defect" })).toBeVisible();
  await page.screenshot({ path: path.join(artifactDir, "diagnostics-field-desktop.png"), fullPage: true });

  expect(runtimeErrors).toEqual([]);
});

test("mobile diagnostic flow shows every ordered segment without page overflow", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-qa/diagnostics");

  await expect(page.getByRole("heading", { name: "OpenFieldPro diagnostic visual QA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "guided mode" })).toBeVisible();
  await expect(page.getByRole("button", { name: "field mode" })).toBeVisible();
  await expect(page.getByTestId("route-topology-audit")).toBeVisible();

  for (const segmentId of ["SEG-L1-01", "SEG-L1-02", "SEG-L2-01", "SEG-L2-02", "SEG-CTL-01", "SEG-CTL-02", "SEG-HARNESS-07"]) {
    await expect(page.getByText(segmentId, { exact: true })).toBeVisible();
  }

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(bodyOverflow).toBeLessThanOrEqual(1);

  await page.screenshot({ path: path.join(artifactDir, "diagnostics-guided-mobile.png"), fullPage: true });
  expect(runtimeErrors).toEqual([]);
});
