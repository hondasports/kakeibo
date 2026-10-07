import { expect, test, type Locator, type Page } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import {
  cleanupLineLink,
  cleanupNotificationData,
  cleanupSystemAdminMembershipFixture,
  seedSystemAdminMembershipFixture,
} from "./helpers/cleanup";

const adminFixtureEnabled = Boolean(
  process.env.VITE_CONVEX_SITE_URL &&
  process.env.E2E_CLEANUP_SECRET &&
  process.env.APP_ENV !== "production" &&
  process.env.E2E_SYSTEM_ADMIN_MEMBERSHIP_FIXTURE === "true",
);

async function setAdminNotificationSwitch(
  page: Page,
  row: Locator,
  enabled: boolean,
  reason: string,
): Promise<void> {
  const toggle = row.getByRole("switch");
  if ((await toggle.isChecked()) === enabled) return;
  await toggle.click();
  const dialog = page.getByRole("dialog", { name: "通知設定の変更" });
  await dialog.getByRole("textbox", { name: "変更理由（必須）" }).fill(reason);
  const confirm = dialog.getByRole("checkbox", {
    name: "必須メールを停止することを確認しました",
  });
  if ((await confirm.count()) > 0) {
    await confirm.check();
  }
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("通知設定を更新しました")).toBeVisible({ timeout: 15_000 });
  await expect(toggle).toBeChecked({ checked: enabled });
}

test.describe("通知設定（Issue #893）", () => {
  test.afterEach(async ({ page }) => {
    await cleanupNotificationData({ page });
    await cleanupLineLink({ page });
  });

  test("@smoke AIレビューのメール通知をOFF→再読込→ONに戻せる", async ({ page }) => {
    await gotoAuthenticated(page, "/settings");
    const section = page.locator("#notifications");
    await expect(section.getByRole("heading", { name: "通知設定" })).toBeVisible();

    const emailSwitch = section.getByRole("switch", { name: "AIレビューのメール通知" });
    await expect(emailSwitch).toBeChecked();
    await emailSwitch.click();
    await expect(section.getByText("通知設定を保存しました")).toBeVisible({ timeout: 15_000 });
    await expect(emailSwitch).not.toBeChecked();

    await page.reload();
    await expect(section.getByRole("switch", { name: "AIレビューのメール通知" })).not.toBeChecked();

    await section.getByRole("switch", { name: "AIレビューのメール通知" }).click();
    await expect(section.getByText("通知設定を保存しました")).toBeVisible({ timeout: 15_000 });
    await expect(section.getByRole("switch", { name: "AIレビューのメール通知" })).toBeChecked();

    await expect(section.getByText("個別に停止できません")).toBeVisible();
  });

  test("@smoke mock LINE連携後にLINE通知をopt-inして解除できる", async ({ page }) => {
    await cleanupLineLink({ page });
    await gotoAuthenticated(page, "/settings");
    const section = page.locator("#notifications");

    const lineSwitch = section.getByRole("switch", { name: "AIレビューのLINE通知" });
    await expect(lineSwitch).toBeDisabled();
    await expect(section.getByText("連携しても自動ではONになりません")).toBeVisible();

    await page.getByRole("button", { name: "LINEと連携する" }).click();
    await expect(page.getByText("LINEアカウントを連携しました")).toBeVisible({ timeout: 15_000 });

    await expect(lineSwitch).toBeEnabled();
    await lineSwitch.click();
    await expect(section.getByText("通知設定を保存しました")).toBeVisible({ timeout: 15_000 });
    await expect(lineSwitch).toBeChecked();

    await page.reload();
    await expect(section.getByRole("switch", { name: "AIレビューのLINE通知" })).toBeChecked();

    await page.getByRole("button", { name: "連携を解除する" }).click();
    await page
      .getByRole("dialog", { name: "LINE連携を解除しますか？" })
      .getByRole("button", { name: "解除する" })
      .click();
    await expect(page.getByText("LINEアカウントは連携されていません")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("@smoke 管理者が全体設定を変更し監査ログに記録される", async ({ page }) => {
    test.skip(
      !adminFixtureEnabled,
      "E2E_SYSTEM_ADMIN_MEMBERSHIP_FIXTURE=trueのdevelopment/previewでのみfixtureを実行します",
    );
    await gotoAuthenticated(page, "/", { ensureGroup: true });
    const prefix = "e2e-system-admin-291-notifications";
    const fixture = await seedSystemAdminMembershipFixture(page, prefix);

    try {
      await page.goto("/admin/notifications");
      await expect(page.getByRole("heading", { name: "通知設定" })).toBeVisible();

      const lineRow = page
        .getByRole("row")
        .filter({ hasText: "AIレビュー依頼" })
        .filter({ hasText: "LINE" });
      const mandatoryRow = page
        .getByRole("row")
        .filter({ hasText: "グループ削除の完了" })
        .filter({ hasText: "必須" });
      const lineSwitch = lineRow.getByRole("switch");
      const mandatorySwitch = mandatoryRow.getByRole("switch");
      const lineEnabledBefore = await lineSwitch.isChecked();
      const mandatoryEnabledBefore = await mandatorySwitch.isChecked();

      try {
        if (!lineEnabledBefore) {
          await lineSwitch.click();
          const lineDialog = page.getByRole("dialog", { name: "通知設定の変更" });
          await lineDialog
            .getByRole("textbox", { name: "変更理由（必須）" })
            .fill("E2E: LINE通知を有効化");
          await lineDialog.getByRole("button", { name: "保存" }).click();
          await expect(page.getByText("通知設定を更新しました")).toBeVisible({
            timeout: 15_000,
          });
        }

        if (mandatoryEnabledBefore) {
          await mandatorySwitch.click();
          const mandatoryDialog = page.getByRole("dialog", { name: "通知設定の変更" });
          await expect(mandatoryDialog.getByText("このメールは必須通知です")).toBeVisible();
          await mandatoryDialog
            .getByRole("textbox", { name: "変更理由（必須）" })
            .fill("E2E: 必須メール停止の検証");
          await mandatoryDialog
            .getByRole("checkbox", { name: "必須メールを停止することを確認しました" })
            .check();
          await mandatoryDialog.getByRole("button", { name: "保存" }).click();
          await expect(page.getByText("通知設定を更新しました")).toBeVisible({
            timeout: 15_000,
          });
        }

        await page.reload();
        await expect(lineSwitch).toBeChecked();
        await expect(mandatorySwitch).not.toBeChecked();

        await page.goto("/admin/audit-logs");
        await expect(page.getByText("通知設定変更").first()).toBeVisible();
      } finally {
        await page.goto("/admin/notifications");
        await expect(page.getByRole("heading", { name: "通知設定" })).toBeVisible();
        await setAdminNotificationSwitch(
          page,
          lineRow,
          lineEnabledBefore,
          "E2E: 後片付けで元の値へ戻す",
        );
        await setAdminNotificationSwitch(
          page,
          mandatoryRow,
          mandatoryEnabledBefore,
          "E2E: 後片付けで元の値へ戻す",
        );
      }
    } finally {
      await cleanupSystemAdminMembershipFixture(fixture);
    }
  });

  test("@smoke 未認証と非管理者は /admin/notifications を利用できない", async ({ page }) => {
    await page.goto("/admin/notifications");
    // デプロイ環境ではClerk初期化に10秒を超えることがあるため余裕を持たせる
    await expect(page.getByRole("button", { name: "Googleでログイン" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "通知設定" })).not.toBeVisible();

    await gotoAuthenticated(page, "/admin/notifications");
    await expect(page.getByRole("heading", { name: "管理画面を利用できません" })).toBeVisible();
    await expect(page.getByText("家計データは表示されません")).not.toBeVisible();
  });
});
