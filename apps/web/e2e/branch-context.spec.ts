import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "owner-1",
  name: "Morgan Owner",
  email: "owner@example.test",
  role: "owner",
  orgId: "00000000-0000-4000-8000-000000000001",
};

const org = {
  id: user.orgId,
  name: "NNACT Home Appliance and Maintenance Services",
  shortName: "NHARM",
  publicId: "302918475601",
};

const branches = [
  { id: "main-branch", name: "Main Branch", isDefault: true },
  { id: "buea-north", name: "Buea North", isDefault: false },
];

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockBranchApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") return fulfillJson(route, user);
    if (url.pathname === "/api/branches/me") {
      const requested = url.searchParams.get("branch");
      const active = branches.some((branch) => branch.id === requested) ? requested : branches[0].id;
      return fulfillJson(route, {
        org,
        branches,
        requestedBranchId: requested,
        activeBranchId: active,
        canAddBranch: false,
      });
    }
    if (url.pathname === "/api/notifications/unread-count") return fulfillJson(route, { count: 0 });
    if (url.pathname === "/api/notifications") return fulfillJson(route, []);
    return fulfillJson(route, []);
  });
}

test("working-in chips show the short org id and open the branch selector", async ({ page }) => {
  await mockBranchApi(page);
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Welcome, Morgan" }).getByText("NHARM")).toBeVisible();
  await expect(page.getByText("Main Branch").first()).toBeVisible();
  await expect(page.getByText("302918475601")).toBeVisible();
  await expect(page.getByText("main-branch")).toBeVisible();

  await page.getByRole("button", { name: "Change branch, currently Main Branch" }).click();
  const dialog = page.getByRole("dialog", { name: "Change branch" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Buea North/ }).click();

  await expect(page).toHaveURL(/branch=buea-north/);
  await expect(page.getByRole("button", { name: "Branch: Buea North. Change branch" })).toBeVisible();
});

test("the top-bar branch button opens the same selector", async ({ page }) => {
  await mockBranchApi(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Branch: Main Branch. Change branch" }).click();
  const dialog = page.getByRole("dialog", { name: "Change branch" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Current/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Close branch selector" }).click();
  await expect(dialog).toBeHidden();
});
