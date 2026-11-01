import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { cleanupSystemAdminSearchFixture, seedSystemAdminSearchFixture } from "./helpers/cleanup";

const fixtureEnabled = Boolean(
  process.env.VITE_CONVEX_SITE_URL &&
  process.env.E2E_CLEANUP_SECRET &&
  process.env.APP_ENV !== "production" &&
  process.env.E2E_SYSTEM_ADMIN_SEARCH_FIXTURE === "true",
);

test.describe("system admin conditionless search", () => {
  test("@smoke 未入力のユーザー・グループ・管理者候補検索を実行できる", async ({ page }) => {
    test.skip(
      !fixtureEnabled,
      "E2E_SYSTEM_ADMIN_SEARCH_FIXTURE=trueのdevelopment/previewでのみfixtureを実行します",
    );
    await gotoAuthenticated(page, "/", { ensureGroup: false });
    const prefix = "e2e-system-admin-504-search";
    const fixture = await seedSystemAdminSearchFixture(page, prefix);

    try {
      await page.goto("/admin/users");
      await expect(page.getByRole("heading", { name: "ユーザー検索" })).toBeVisible();
      await expect(page.getByRole("button", { name: "検索" })).toBeEnabled();
      await page.getByRole("button", { name: "検索" }).click();
      await expect(page.getByRole("heading", { name: `${prefix}-user-24` })).toBeVisible();
      await expect(page.getByRole("button", { name: "次のページ" })).toBeVisible();
      await page.getByRole("button", { name: "次のページ" }).click();
      await expect(page.getByRole("heading", { name: `${prefix}-user-0` })).toBeVisible();

      await page.goto("/admin/groups");
      await expect(page.getByRole("heading", { name: "グループ検索" })).toBeVisible();
      await page.getByRole("button", { name: "検索" }).click();
      const newestGroup = page.getByRole("heading", { name: `${prefix}-group-23` });
      await expect(newestGroup).toBeVisible();
      await expect(newestGroup.locator("..").getByText("状態: archived")).toBeVisible();
      await expect(page.getByRole("button", { name: "次のページ" })).toBeVisible();

      await page.goto("/admin/system-admins");
      await expect(
        page.getByRole("heading", { name: "システム管理者", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "候補を検索" }).click();
      const candidates = page.getByLabel("管理者付与候補");
      await expect(candidates).toBeVisible();
      await expect(candidates.getByRole("button", { name: "このユーザーを付与" })).toHaveCount(10);
      await expect(page.getByRole("button", { name: "次のページ" })).not.toBeVisible();
    } finally {
      await cleanupSystemAdminSearchFixture(fixture);
    }
  });
});
