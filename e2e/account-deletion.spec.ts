import { expect, test, type Page } from "@playwright/test";
import { getCurrentClerkTokenIdentifier, gotoAuthenticated } from "./helpers/auth";
import { cleanupGroupMembershipsByUser } from "./helpers/cleanup";
import { seedGroupMemberForUser } from "./helpers/seed";

async function expandDangerZone(page: Page) {
  const trigger = page.getByRole("button", { name: "危険な操作" });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
}

test("@smoke @group-access 唯一ownerは退会をブロックされ、owner譲渡後に退会確認へ進める", async ({
  page,
}) => {
  let currentUserId: string | undefined;
  let memberUserId: string | undefined;
  try {
    await gotoAuthenticated(page, "/settings");
    currentUserId = await getCurrentClerkTokenIdentifier(page);
    const seeded = await seedGroupMemberForUser(
      currentUserId,
      "退会譲渡先",
      "e2e-account-deletion@example.com",
    );
    memberUserId = seeded.memberUserId;

    await page.getByRole("link", { name: "アカウントを削除" }).click();
    await expect(page.getByRole("heading", { name: "アカウントを削除できません" })).toBeVisible();
    await expect(page.getByText("唯一のオーナーです・メンバー 2人")).toBeVisible();

    await page.getByRole("button", { name: "グループ設定を開く" }).click();
    await expandDangerZone(page);
    await page.getByTestId("ownership-transfer-target-select").getByRole("combobox").click();
    await page.getByRole("option", { name: "退会譲渡先" }).click();
    await page.getByTestId("ownership-transfer-request-button").click();
    await page.getByRole("button", { name: "オーナー権限を譲渡する" }).click();
    await expect(page.getByText("オーナー権限を譲渡しました")).toBeVisible({ timeout: 15_000 });

    await page.goto("/settings/account/delete");
    await expect(page.getByRole("heading", { name: "アカウントを削除します" })).toBeVisible({
      timeout: 15_000,
    });
    const button = page.getByRole("button", { name: "アカウントを削除する" });
    await expect(button).toBeDisabled();
    await page.getByRole("textbox", { name: "確認用入力" }).fill("削除");
    await expect(button).toBeEnabled();
  } finally {
    // seedユーザーの削除認可には本人の所属が必要なため、本人は最後に片付ける。
    try {
      if (memberUserId && currentUserId) {
        await cleanupGroupMembershipsByUser(memberUserId, currentUserId);
      }
    } finally {
      if (currentUserId) await cleanupGroupMembershipsByUser(currentUserId);
    }
  }
});
