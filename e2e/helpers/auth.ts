import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page } from "@playwright/test";

type GotoAuthenticatedOptions = {
  ensureGroup?: boolean;
};

/**
 * 未認証状態で保護パスを直接開くテスト用の Clerk ボット検出バイパス。
 *
 * clerk.signIn 内部で自動登録される setupClerkTestingToken と同じものを、
 * サインインを伴わない未認証レンダーの検証でも事前に登録する。
 * GitHub Actions のようなデータセンターIPのヘッドレス環境では、実デプロイ
 * （非 localhost ドメイン）上のコールドな Clerk 初期化がボット検出に掛かり
 * `isLoaded` が立ち上がらずログイン画面が描画されないことがある。
 *
 * CLERK_TESTING_TOKEN は global-setup の clerkSetup() が process.env に
 * 注入する。未設定（ローカルでシークレット未提供など）の場合は何もしない。
 */
export async function bypassClerkBotDetection(page: Page): Promise<void> {
  if (!process.env.CLERK_TESTING_TOKEN) return;
  await setupClerkTestingToken({ page });
}

/**
 * Clerk Testing Token でサインインしてページに遷移する認証ヘルパー。
 *
 * clerk.signIn は内部で次の処理を行う:
 *   1. setupClerkTestingToken でルートハンドラーを登録（ボット検出バイパス）
 *   2. page.goto(baseURL) で Clerk がロードされるまで待機
 *   3. CLERK_SECRET_KEY で signInToken を発行し ticket ストラテジーでサインイン
 *
 * 必要な環境変数:
 *   E2E_CLERK_USER_EMAIL, CLERK_SECRET_KEY
 *
 * @param page - Playwright の Page オブジェクト
 * @param path - サインイン後に遷移するパス（デフォルト: '/'）
 * @param options.ensureGroup - true の場合、未所属ならE2E用グループを作成してから遷移する
 */
export async function gotoAuthenticated(
  page: Page,
  path = "/",
  options: GotoAuthenticatedOptions = {},
) {
  const { ensureGroup = true } = options;
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) throw new Error("E2E_CLERK_USER_EMAIL is not set");

  // clerk.signIn は window.Clerk のロードを待つため、事前に page.goto が必要
  await page.goto("/");
  await clerk.signIn({ page, signInParams: { strategy: "email_code", identifier: email } });
  if (ensureGroup) {
    await ensureE2eGroup(page);
  }
  if (path !== "/") await page.goto(path);
}

export async function getCurrentClerkTokenIdentifier(page: Page): Promise<string> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const token = (await page.evaluate(async () => {
      const clerk = (
        window as Window & { Clerk?: { session?: { getToken?: () => Promise<string | null> } } }
      ).Clerk;
      return clerk?.session?.getToken ? await clerk.session.getToken() : null;
    })) as string | null;

    if (token) {
      const payloadPart = token.split(".")[1];
      if (!payloadPart) {
        throw new Error("invalid Clerk token");
      }

      const payloadJson = Buffer.from(payloadPart, "base64url").toString("utf8");
      const payload = JSON.parse(payloadJson) as { iss?: string; sub?: string };
      if (!payload.iss || !payload.sub) {
        throw new Error("Clerk token is missing iss or sub");
      }

      return `${payload.iss}|${payload.sub}`;
    }

    await page.waitForTimeout(200);
  }

  throw new Error("current Clerk token is not available");
}

async function ensureE2eGroup(page: Page) {
  await page.goto("/");

  const setupHeading = page.getByRole("heading", { name: "家族グループを作成" });
  const dashboardHeading = page
    .getByRole("heading", { level: 1, name: "今週のダッシュボード" })
    .or(page.getByRole("heading", { level: 1, name: "今週", exact: true }));

  const destination = await Promise.any([
    dashboardHeading.waitFor({ state: "visible", timeout: 30_000 }).then(() => "dashboard"),
    setupHeading.waitFor({ state: "visible", timeout: 30_000 }).then(() => "setup"),
  ]);

  if (destination === "dashboard") {
    return;
  }

  await page.getByRole("textbox", { name: "グループ名" }).fill("E2E家計グループ");
  await page.getByRole("button", { name: "グループを作成" }).click();
  await dashboardHeading.waitFor({ state: "visible", timeout: 15_000 });
}
