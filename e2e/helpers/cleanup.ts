/**
 * E2E テストデータクリーンアップヘルパー
 *
 * テスト中に Convex Dev DB に作成したレシートを afterEach で削除し、
 * 共有 Dev DB にゴミが溜まるのを防ぐ。
 *
 * 仕組み:
 *   Convex HTTP エンドポイント（POST /e2e/cleanup）を呼び出し、
 *   テストユーザーのレシートを全件削除する。
 *
 * 必要な環境変数:
 *   VITE_CONVEX_SITE_URL  — Convex HTTP エンドポイントのベース URL
 *                           例: https://hardy-mockingbird-708.convex.site
 *   E2E_CLEANUP_SECRET    — Convex 側の E2E_CLEANUP_SECRET 環境変数と同じ値
 *   E2E_CLERK_USER_ID     — テストユーザーの Clerk tokenIdentifier
 *                           例: https://xxx.clerk.accounts.dev|user_xxxxxx
 *   E2E_CLERK_USER_EMAIL  — E2E_CLERK_USER_ID 未設定時のフォールバック
 *
 * セットアップ:
 *   1. Convex Dashboard > Settings > Environment Variables に
 *      E2E_CLEANUP_SECRET=<任意のランダム文字列> を追加する。
 *   2. .env.local（ローカル）と GitHub Secrets（CI）に同じ値を設定する。
 *   3. E2E_CLERK_USER_ID は Clerk Dashboard > Users でテストユーザーの
 *      User ID を確認し、"https://<your-domain>.clerk.accounts.dev|<user_id>" の
 *      形式で設定する（AGENTS.md の「E2E クリーンアップ設定」参照）。
 */

import type { Page } from "@playwright/test";
import { getCurrentClerkTokenIdentifier } from "./auth";

export type CleanupOptions = {
  page?: Page;
};

/**
 * テストユーザーのレシートを全件削除する。
 *
 * 環境変数が未設定の場合は警告のみ出してスキップする（ローカル開発の利便性のため）。
 * CI 環境（process.env.CI === 'true'）では未設定の場合にエラーをスローする。
 */
function getCleanupIdentity(): { userId?: string; email?: string } {
  const userId = getCleanupUserId();
  if (userId) {
    return { userId };
  }
  const email = getCleanupUserEmail();
  if (email) {
    return { email };
  }
  return {};
}

async function resolveCleanupIdentity(
  options?: CleanupOptions,
): Promise<{ userId?: string; email?: string }> {
  if (options?.page) {
    try {
      return { userId: await getCurrentClerkTokenIdentifier(options.page) };
    } catch {
      // サインイン直後などセッション未安定時は環境変数ベースにフォールバック
    }
  }
  return getCleanupIdentity();
}

/**
 * CI / global setup 用: cleanup API の認証だけを検証する（データは変更しない）。
 * 401 の場合は実行環境の E2E_CLEANUP_SECRET と backend 側の値が不一致であることを示す。
 */
export async function verifyCleanupAuth(): Promise<void> {
  const siteUrl = process.env.VITE_CONVEX_SITE_URL;
  const secret = process.env.E2E_CLEANUP_SECRET;

  if (!siteUrl || !secret) {
    if (process.env.CI) {
      throw new Error(
        "E2E cleanup の事前検証に必要な環境変数が未設定です。" +
          "VITE_CONVEX_SITE_URL, E2E_CLEANUP_SECRET を設定してください。",
      );
    }
    return;
  }

  const res = await fetch(`${siteUrl}/e2e/cleanup-auth-check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-E2E-Cleanup-Secret": secret,
    },
  });

  if (res.ok) {
    return;
  }

  const text = await res.text();
  if (res.status === 401) {
    throw new Error(
      "E2E cleanup の認証に失敗しました (401)。" +
        "CIでは start-ci-convex.mjs がジョブ内で生成した secret と backend が不一致になっています。" +
        "ローカルでは .env.local の E2E_CLEANUP_SECRET と選択中の deployment の値が一致しているか確認し、" +
        "pnpm run e2e:env-sync を再実行してください。" +
        ` (${text})`,
    );
  }

  throw new Error(`E2E cleanup の事前検証に失敗しました: ${res.status} ${text}`);
}

export async function cleanupTestReceipts(options?: CleanupOptions): Promise<void> {
  await callCleanupEndpoint(await resolveCleanupIdentity(options));
}

/**
 * テスト中に作成した AI 支出キュー関連データを削除する。
 */
export async function cleanupAiExpenseQueue(options?: CleanupOptions): Promise<void> {
  await callCleanupEndpoint({
    ...(await resolveCleanupIdentity(options)),
    clearAiExpenseQueue: true,
  });
}

/**
 * テスト中に作成した E2E 専用 expenseEntries を削除する。
 */
export async function cleanupE2eExpenseEntries(options?: CleanupOptions): Promise<void> {
  await callCleanupEndpoint({
    ...(await resolveCleanupIdentity(options)),
    clearE2eExpenseEntries: true,
  });
}

/**
 * テスト中に作成した E2E 専用カテゴリを削除する。
 */
export async function cleanupTestCategories(options?: CleanupOptions): Promise<void> {
  await callCleanupEndpoint({
    ...(await resolveCleanupIdentity(options)),
    deleteE2eCategories: true,
  });
}

export async function cleanupAiExpenseQueueByUser(userId: string): Promise<void> {
  await callCleanupEndpoint({
    userId,
    clearAiExpenseQueue: true,
  });
}

export async function cleanupE2eExpenseEntriesByUser(userId: string): Promise<void> {
  await callCleanupEndpoint({
    userId,
    clearE2eExpenseEntries: true,
  });
}

export async function cleanupTestCategoriesByUser(userId: string): Promise<void> {
  await callCleanupEndpoint({
    userId,
    deleteE2eCategories: true,
  });
}

/**
 * 指定週のテストユーザーの週次セッションを draft に戻し、振り返りメモをクリアする。
 */
export async function resetTestWeekSession(
  weekStartDate: string,
  options?: CleanupOptions,
): Promise<void> {
  await callCleanupEndpoint({
    ...(await resolveCleanupIdentity(options)),
    resetWeekSession: true,
    weekStartDate,
  });
}

function getCleanupUserId(): string | undefined {
  return process.env.E2E_CLERK_USER_ID?.trim().replace(/^["']+|["']+$/g, "");
}

function getCleanupUserEmail(): string | undefined {
  return process.env.E2E_CLERK_USER_EMAIL?.trim().replace(/^["']+|["']+$/g, "");
}

/**
 * テストユーザーの月収入設定をクリアする。
 */
export async function cleanupUserMonthlyIncome(options?: CleanupOptions): Promise<void> {
  await callCleanupEndpoint({
    ...(await resolveCleanupIdentity(options)),
    clearMonthlyIncome: true,
  });
}

/** E2Eで作成したLINE連携・一時OAuth要求・監査記録をテストユーザー単位で削除する。 */
export async function cleanupLineLink(options?: CleanupOptions): Promise<void> {
  await callCleanupEndpoint({
    ...(await resolveCleanupIdentity(options)),
    clearLineLink: true,
  });
}

export async function cleanupNotificationData(options?: CleanupOptions): Promise<void> {
  await callCleanupEndpoint({
    ...(await resolveCleanupIdentity(options)),
    clearNotificationData: true,
  });
}

/**
 * テストユーザーのグループ所属を削除する。
 */
export async function cleanupGroupMembershipsByUser(
  userId?: string,
  actorUserId?: string,
): Promise<void> {
  const identity = actorUserId
    ? { userId: actorUserId, seededUserId: userId }
    : userId
      ? { userId }
      : getCleanupIdentity();
  await callCleanupEndpoint({
    ...identity,
    clearGroupMemberships: true,
  });
}

export async function cleanupGroupInvitationsByUser(userId?: string): Promise<void> {
  const identity = userId ? { userId } : getCleanupIdentity();
  await callCleanupEndpoint({
    ...identity,
    clearGroupInvitations: true,
  });
}

/**
 * E2E テスト用: 指定ユーザーのアクティブグループにおけるロールを変更する。
 */
export async function setE2eGroupMemberRole(
  userId: string,
  role: "owner" | "member",
): Promise<void> {
  await callCleanupEndpoint({
    userId,
    setGroupMemberRole: role,
  });
}

export type SystemAdminMembershipFixture = {
  targetUserId: string;
  groupA: string;
  groupB: string;
  actorUserId: string;
  prefix: string;
};

export async function seedSystemAdminMembershipFixture(
  page: Page,
  prefix: string,
): Promise<SystemAdminMembershipFixture> {
  const actorUserId = await getCurrentClerkTokenIdentifier(page);
  const result = await callFixtureEndpoint("seed-system-admin-membership", {
    actorUserId,
    prefix,
  });
  if (!result.targetUserId || !result.groupA || !result.groupB) {
    throw new Error("E2E membership fixture response is incomplete");
  }
  return {
    targetUserId: result.targetUserId,
    groupA: result.groupA,
    groupB: result.groupB,
    actorUserId,
    prefix,
  };
}

export async function cleanupSystemAdminMembershipFixture(
  fixture: Pick<SystemAdminMembershipFixture, "actorUserId" | "prefix">,
): Promise<void> {
  await callFixtureEndpoint("cleanup-system-admin-membership", fixture);
}

export type SystemAdminSearchFixture = {
  actorUserId: string;
  prefix: string;
  userCount: number;
  groupCount: number;
};

export async function seedSystemAdminSearchFixture(
  page: Page,
  prefix: string,
): Promise<SystemAdminSearchFixture> {
  const actorUserId = await getCurrentClerkTokenIdentifier(page);
  const result = await callFixtureEndpoint("seed-system-admin-search", {
    actorUserId,
    prefix,
  });
  if (!result.userCount || !result.groupCount) {
    throw new Error("E2E search fixture response is incomplete");
  }
  return { actorUserId, prefix, userCount: result.userCount, groupCount: result.groupCount };
}

export async function cleanupSystemAdminSearchFixture(
  fixture: Pick<SystemAdminSearchFixture, "actorUserId" | "prefix">,
): Promise<void> {
  await callFixtureEndpoint("cleanup-system-admin-search", fixture);
}

async function callCleanupEndpoint(body: {
  userId?: string;
  seededUserId?: string;
  email?: string;
  resetWeekSession?: boolean;
  weekStartDate?: string;
  deleteE2eCategories?: boolean;
  clearMonthlyIncome?: boolean;
  clearAiExpenseQueue?: boolean;
  clearE2eExpenseEntries?: boolean;
  clearGroupMemberships?: boolean;
  clearGroupInvitations?: boolean;
  clearLineLink?: boolean;
  clearNotificationData?: boolean;
  setGroupMemberRole?: "owner" | "member";
}): Promise<void> {
  const siteUrl = process.env.VITE_CONVEX_SITE_URL;
  const secret = process.env.E2E_CLEANUP_SECRET;
  const userId = body.userId;
  const email = body.email ?? getCleanupUserEmail();

  if (!siteUrl || !secret || (!userId && !email)) {
    if (process.env.CI) {
      throw new Error(
        "E2E クリーンアップに必要な環境変数が未設定です。" +
          "VITE_CONVEX_SITE_URL, E2E_CLEANUP_SECRET, E2E_CLERK_USER_ID または E2E_CLERK_USER_EMAIL を設定してください。",
      );
    }
    // ローカルでは警告のみ（未設定でもテストは続行できる）
    console.warn(
      "[cleanup] VITE_CONVEX_SITE_URL / E2E_CLEANUP_SECRET / E2E_CLERK_USER_ID または E2E_CLERK_USER_EMAIL が未設定のため" +
        "クリーンアップをスキップします。",
    );
    return;
  }

  const requestBody = body.userId ? { ...body } : { email, ...body };

  const res = await fetchCleanupWithRetry(`${siteUrl}/e2e/cleanup`, secret, requestBody);

  const data = (await res.json()) as {
    receipts?: { deletedCount: number } | null;
    aiExpenseQueue?: {
      deletedDraftCount: number;
      deletedItemCount: number;
      deletedBatchCount: number;
      deletedJobCount: number;
    } | null;
    categories?: { deletedCount: number } | null;
    deletedCount?: number;
    weekSession?: { reset: boolean } | null;
    monthlyIncome?: { cleared: boolean } | null;
    expenseEntries?: { deletedCount: number } | null;
    groupMemberships?: { deletedCount: number } | null;
    groupInvitations?: { deletedCount: number } | null;
    lineLink?: { deletedCount: number } | null;
  };
  const deletedCount = data.receipts?.deletedCount ?? data.deletedCount ?? 0;
  if (deletedCount > 0) {
    console.log(`[cleanup] ${deletedCount} 件のレシートを削除しました。`);
  }
  if (data.weekSession?.reset) {
    console.log("[cleanup] 週次セッションをリセットしました。");
  }
  if (data.categories && data.categories.deletedCount > 0) {
    console.log(`[cleanup] ${data.categories.deletedCount} 件のカテゴリを削除しました。`);
  }
  if (data.aiExpenseQueue) {
    const total =
      data.aiExpenseQueue.deletedDraftCount +
      data.aiExpenseQueue.deletedItemCount +
      data.aiExpenseQueue.deletedBatchCount +
      data.aiExpenseQueue.deletedJobCount;
    if (total > 0) {
      console.log(
        `[cleanup] AI キュー関連データを削除しました。` +
          ` drafts=${data.aiExpenseQueue.deletedDraftCount}` +
          ` items=${data.aiExpenseQueue.deletedItemCount}` +
          ` batches=${data.aiExpenseQueue.deletedBatchCount}` +
          ` jobs=${data.aiExpenseQueue.deletedJobCount}`,
      );
    }
  }
  if (data.expenseEntries && data.expenseEntries.deletedCount > 0) {
    console.log(
      `[cleanup] ${data.expenseEntries.deletedCount} 件の E2E expenseEntries を削除しました。`,
    );
  }
  if (data.groupInvitations && data.groupInvitations.deletedCount > 0) {
    console.log(`[cleanup] ${data.groupInvitations.deletedCount} 件のグループ招待を削除しました。`);
  }
}

async function callFixtureEndpoint(
  path:
    | "seed-system-admin-membership"
    | "cleanup-system-admin-membership"
    | "seed-system-admin-search"
    | "cleanup-system-admin-search",
  body: { actorUserId: string; prefix: string },
): Promise<{
  targetUserId?: string;
  groupA?: string;
  groupB?: string;
  userCount?: number;
  groupCount?: number;
}> {
  const siteUrl = process.env.VITE_CONVEX_SITE_URL;
  const secret = process.env.E2E_CLEANUP_SECRET;
  if (!siteUrl || !secret) {
    throw new Error("E2E fixtureに必要なVITE_CONVEX_SITE_URL/E2E_CLEANUP_SECRETが未設定です。");
  }
  const response = await fetch(`${siteUrl}/e2e/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-E2E-Cleanup-Secret": secret },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    targetUserId?: string;
    groupA?: string;
    groupB?: string;
    userCount?: number;
    groupCount?: number;
    error?: string;
  };
  if (
    !response.ok ||
    (path === "seed-system-admin-membership" &&
      (!payload.targetUserId || !payload.groupA || !payload.groupB))
  ) {
    throw new Error(payload.error ?? `E2E fixture request failed: ${response.status}`);
  }
  return payload;
}

async function fetchCleanupWithRetry(
  url: string,
  secret: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const retryableStatuses = new Set([500, 502, 503, 504]);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-E2E-Cleanup-Secret": secret,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 3) {
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      continue;
    }

    if (res.ok) {
      return res;
    }

    const text = await res.text();
    lastError = new Error(`E2E クリーンアップに失敗しました: ${res.status} ${text}`);
    if (!retryableStatuses.has(res.status) || attempt === 3) {
      throw lastError;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }

  throw lastError ?? new Error("E2E クリーンアップに失敗しました");
}
