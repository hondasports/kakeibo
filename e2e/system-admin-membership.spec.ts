import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import {
  cleanupSystemAdminMembershipFixture,
  seedSystemAdminMembershipFixture,
} from "./helpers/cleanup";

const fixtureEnabled = Boolean(
  process.env.VITE_CONVEX_SITE_URL &&
  process.env.E2E_CLEANUP_SECRET &&
  process.env.APP_ENV !== "production" &&
  process.env.E2E_SYSTEM_ADMIN_MEMBERSHIP_FIXTURE === "true",
);

test.describe("system admin membership operation", () => {
  test("@smoke ユーザー詳細からA→B transferを確認し、activeGroupIdも補正する", async ({ page }) => {
    test.skip(
      !fixtureEnabled,
      "E2E_SYSTEM_ADMIN_MEMBERSHIP_FIXTURE=trueのdevelopment/previewでのみfixtureを実行します",
    );
    await gotoAuthenticated(page, "/", { ensureGroup: true });
    const prefix = "e2e-system-admin-291-transfer";
    const fixture = await seedSystemAdminMembershipFixture(page, prefix);
    try {
      await page.goto(`/admin/users/${fixture.targetUserId}`);
      await expect(page.getByRole("heading", { name: "ユーザー詳細" })).toBeVisible();
      await page.getByRole("button", { name: "移動元に選択" }).click();
      await page.getByLabel("追加・移動先グループを検索").fill(`${prefix}-B`);
      await page.getByRole("button", { name: "このグループへ移動" }).click();
      await page.getByLabel("操作理由").fill("E2E transfer確認");
      await page.getByRole("button", { name: "実行する" }).click();
      await expect(
        page.getByText("操作を完了しました。監査ログと通知outboxに記録しました。"),
      ).toBeVisible();
      const targetMembership = page.getByTestId(`system-admin-membership-${fixture.groupB}`);
      await expect(targetMembership).toContainText(`${prefix}-B`);
      await expect(targetMembership).toContainText(fixture.groupB);
      await expect(page.getByTestId("system-admin-active-group")).toContainText(fixture.groupB);
    } finally {
      await cleanupSystemAdminMembershipFixture(fixture);
    }
  });
});
