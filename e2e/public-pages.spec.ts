import { test, expect } from "@playwright/test";
import { bypassClerkBotDetection } from "./helpers/auth";

/**
 * 公開・異常系ページ E2E（Milestone 23 / #249-#255, #266, #268）
 *
 * 未ログインでも閲覧できる公開ページ、404、メンテナンス、Error Boundary を確認する。
 * 認証は不要なため storageState を空にする。
 */

test.describe("公開・異常系ページ", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("@public @smoke 未ログインで /privacy を表示できる (#249)", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "プライバシーポリシー" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "運営者" })).toBeVisible();
    await expect(page.getByText(/Googleログインにより取得されるメールアドレス/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "レシート画像の外部API送信" })).toBeVisible();
    await expect(page.getByText(/OpenAI（レシート画像の AI 解析/)).toBeVisible();
    await expect(
      page.getByText(/Gmail \/ Google Drive \/ Google Calendar 等の内容は取得しません/),
    ).toBeVisible();
    await expect(page.getByText("© 2026 Tatsuya Miyamoto")).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/hondasports",
    );
  });

  test("@public @smoke 未ログインで /terms を表示できる (#250)", async ({ page }) => {
    await page.goto("/terms");

    await expect(page.getByRole("heading", { name: "利用規約" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "サービス内容" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "グループ共有" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "禁止事項" })).toBeVisible();
    await expect(page.getByText(/外部 API に送信して読み取る/)).toBeVisible();
    await expect(page.getByText(/家計管理・支出記録の正確性を保証しません/)).toBeVisible();
  });

  test("@public @smoke 未ログインで /updates を表示できる (#285)", async ({ page }) => {
    await page.goto("/updates");

    await expect(page.getByRole("heading", { name: "Suzumemoの更新履歴" })).toBeVisible();
    await expect(page.getByText("まだ公開された更新履歴はありません。")).toBeVisible();
    await expect(page.getByText("今後の新機能や改善内容はこちらでお知らせします。")).toBeVisible();
    await expect(page.getByText(/^Version /)).toBeVisible();
    await expect(page.getByRole("link", { name: "プライバシー" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(page.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
    await expect(page.getByText("© 2026 Tatsuya Miyamoto")).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/hondasports",
    );
  });

  test("@public 未ログインで存在しないURLに404を表示する (#253/#266)", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-m23");

    await expect(page.getByText("404 Not Found")).toBeVisible();
    await expect(page.getByRole("img", { name: "Suzumemo" })).toBeVisible();
    await expect(page.getByText("スズメモ")).toBeVisible();
    await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
    await expect(
      page.getByText(/指定されたページは移動または削除された可能性があります/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "ホームへ戻る" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "プライバシー" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(page.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(page.getByText("© 2026 Tatsuya Miyamoto")).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/hondasports",
    );
  });

  test("未ログインのログイン画面から法務ページへリンクできる (#249/#250)", async ({ page }) => {
    await bypassClerkBotDetection(page);
    await page.goto("/");

    // デプロイ環境ではClerk初期化に10秒を超えることがあるため余裕を持たせる
    await expect(page.getByRole("button", { name: "Googleでログイン" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "プライバシーポリシー" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(page.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
    await expect(page.getByText("© 2026 Tatsuya Miyamoto")).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/hondasports",
    );
  });

  test("@public 未ログインで /maintenance を表示できる (#255)", async ({ page }) => {
    await page.goto("/maintenance");

    await expect(page.getByText("Maintenance")).toBeVisible();
    await expect(page.getByRole("img", { name: "Suzumemo スズメモ" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "ただいまメンテナンス中です" })).toBeVisible();
    await expect(
      page.getByText(/Suzumemo を安心して使えるように、ただいま整えています/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "再読み込み" })).toBeVisible();
    await expect(page.getByRole("link", { name: "プライバシー" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(page.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
    await expect(page.getByText("© 2026 Tatsuya Miyamoto")).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/hondasports",
    );
  });

  test("未ログインで Error Boundary のデザイン画面を表示する (#254/#268)", async ({ page }) => {
    await page.goto("/__e2e__/app-error-boundary");

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Application Error")).toBeVisible();
    await expect(page.getByRole("img", { name: "Suzumemo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "問題が発生しました" })).toBeVisible();
    await expect(
      page.getByText(/画面の表示中にエラーが発生しました。再読み込みしても直らない場合は/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "再読み込み" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ホームへ戻る" })).toBeVisible();
  });
});
