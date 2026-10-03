import { httpAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  getConfiguredE2eUserId,
  readE2eJsonObject,
  requireE2eSecret,
  requireE2eUserId,
} from "./e2eAuth";

type E2eCleanupBody = {
  userId?: string;
  seededUserId?: string;
  email?: string;
  groupId?: string;
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
  seedGroupMember?: { displayName: string; email: string };
};

const STRING_FIELDS = ["userId", "seededUserId", "email", "groupId", "weekStartDate"] as const;
const MAX_E2E_FIELD_LENGTH = 512;
const MAX_E2E_EMAIL_LENGTH = 320;
const BOOLEAN_FIELDS = [
  "resetWeekSession",
  "deleteE2eCategories",
  "clearMonthlyIncome",
  "clearAiExpenseQueue",
  "clearE2eExpenseEntries",
  "clearGroupMemberships",
  "clearGroupInvitations",
  "clearLineLink",
  "clearNotificationData",
] as const;

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

function validateCleanupBody(body: E2eCleanupBody) {
  for (const field of STRING_FIELDS) {
    if (
      body[field] !== undefined &&
      (typeof body[field] !== "string" || body[field].length > MAX_E2E_FIELD_LENGTH)
    ) {
      return `Invalid ${field}.`;
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      return `Invalid ${field}.`;
    }
  }
  if (
    body.setGroupMemberRole !== undefined &&
    !["owner", "member"].includes(body.setGroupMemberRole)
  ) {
    return "Invalid setGroupMemberRole.";
  }
  if (body.seedGroupMember !== undefined) {
    if (
      body.seedGroupMember === null ||
      typeof body.seedGroupMember !== "object" ||
      typeof body.seedGroupMember.displayName !== "string" ||
      typeof body.seedGroupMember.email !== "string" ||
      body.seedGroupMember.displayName.length > MAX_E2E_FIELD_LENGTH ||
      body.seedGroupMember.email.length > MAX_E2E_EMAIL_LENGTH
    ) {
      return "Invalid seedGroupMember.";
    }
  }
  return null;
}

function isSeededMembershipCleanupOnly(body: E2eCleanupBody) {
  return (
    body.userId !== undefined &&
    body.email === undefined &&
    body.seededUserId !== undefined &&
    body.seededUserId.startsWith("e2e-seed|") &&
    body.groupId === undefined &&
    body.clearGroupMemberships === true &&
    body.resetWeekSession !== true &&
    body.deleteE2eCategories !== true &&
    body.clearMonthlyIncome !== true &&
    body.clearAiExpenseQueue !== true &&
    body.clearE2eExpenseEntries !== true &&
    body.clearGroupInvitations !== true &&
    body.clearLineLink !== true &&
    body.clearNotificationData !== true &&
    body.setGroupMemberRole === undefined &&
    body.seedGroupMember === undefined
  );
}

async function resolveE2eGroupId(
  ctx: ActionCtx,
  body: E2eCleanupBody,
  userId: string,
): Promise<Id<"groups"> | null> {
  const configuredGroupId = await ctx.runQuery(internal.groups.e2e.getGroupIdByUserId, { userId });
  if (!body.groupId) {
    return configuredGroupId;
  }

  const requestedGroupId = await ctx.runQuery(internal.groups.e2e.normalizeGroupId, {
    groupId: body.groupId,
  });
  if (requestedGroupId === null || requestedGroupId !== configuredGroupId) {
    return null;
  }
  return configuredGroupId;
}

// ---------------------------------------------------------------------------
// POST /e2e/cleanup
// ---------------------------------------------------------------------------
//
// E2E テスト専用のデータクリーンアップエンドポイント。
// テストグループのレシート削除と、必要に応じた週次セッション状態リセットを行い、
// Dev DB のゴミや状態依存を防ぐ。
//
// セキュリティ:
//   - X-E2E-Cleanup-Secret ヘッダーで認証する。
//     値は環境変数 E2E_CLEANUP_SECRET と照合する。
//   - APP_ENV が development 以外、または固定テストユーザーが未設定の場合は拒否する。
//
// リクエストボディ:
//   {
//     "userId": "<Clerk の tokenIdentifier>",   // 固定E2Eユーザー（認証主体）
//     "seededUserId": "<e2e-seed|...>",        // 所属削除だけを許可するE2E seedユーザー
//     "email": "<Clerk の email>",              // userId の代替解決用
//     "groupId": "<groups テーブルの ID>",        // グループデータのクリーンアップ用
//     "clearGroupMemberships": true,
//     "resetWeekSession": true,
//     "weekStartDate": "YYYY-MM-DD",
//     "deleteE2eCategories": true,
//     "clearAiExpenseQueue": true,
//     "clearLineLink": true
//   }
//
// レスポンス:
//   200: { "deletedCount": <削除件数> }
//   401: 認証失敗
//   503: E2E設定未完了または本番環境（誤操作防止）
//
export const e2eCleanupHandler = httpAction(async (ctx, req) => {
  const authError = requireE2eSecret(req, "E2E cleanup is not enabled in this environment.");
  if (authError) {
    return authError;
  }

  const bodyResult = await readE2eJsonObject<E2eCleanupBody>(req);
  if (bodyResult instanceof Response) {
    return bodyResult;
  }
  const body = bodyResult;
  const validationError = validateCleanupBody(body);
  if (validationError) return badRequest(validationError);

  const userIdByEmail = body.email
    ? await ctx.runQuery(internal.users.internal.getUserIdByEmail, { email: body.email })
    : null;
  const actorUserId = userIdByEmail ?? body.userId ?? null;

  if (!actorUserId) {
    return badRequest("userId or email is required.");
  }
  const userAuthorizationError = requireE2eUserId(actorUserId);
  if (userAuthorizationError) {
    return userAuthorizationError;
  }

  const configuredUserId = getConfiguredE2eUserId();
  const isSeededCleanup = body.seededUserId !== undefined;
  if (isSeededCleanup && !isSeededMembershipCleanupOnly(body)) {
    return new Response(JSON.stringify({ error: "Forbidden." }), {
      status: 403,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }

  const resolvedUserId = body.seededUserId ?? actorUserId;
  if (isSeededCleanup) {
    const actorGroupId = configuredUserId
      ? await ctx.runQuery(internal.groups.e2e.getGroupIdByUserId, {
          userId: configuredUserId,
        })
      : null;
    const seededGroupId = await ctx.runQuery(internal.groups.e2e.getGroupIdByUserId, {
      userId: resolvedUserId,
    });
    if (!actorGroupId || (seededGroupId !== null && actorGroupId !== seededGroupId)) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
      });
    }
  }

  const resolvedGroupId = await resolveE2eGroupId(ctx, body, resolvedUserId);
  if (body.groupId && resolvedGroupId === null) {
    return new Response(JSON.stringify({ error: "Forbidden." }), {
      status: 403,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }

  if (body.resetWeekSession && !resolvedGroupId) {
    return badRequest("groupId is required.");
  }

  let receipts: { deletedCount: number } | null = null;
  if (resolvedGroupId && !isSeededCleanup) {
    receipts = await ctx.runMutation(internal.receipts.crud.deleteReceiptsByUser, {
      groupId: resolvedGroupId,
      userId: resolvedUserId,
    });
  }

  let aiExpenseQueue: {
    deletedDraftCount: number;
    deletedItemCount: number;
    deletedBatchCount: number;
    deletedJobCount: number;
  } | null = null;
  if (resolvedGroupId && body.clearAiExpenseQueue) {
    let deletedDraftCount = 0;
    let deletedItemCount = 0;
    let deletedBatchCount = 0;
    let deletedJobCount = 0;

    while (true) {
      const draftResult: {
        deletedDraftCount: number;
        deletedItemCount: number;
        hasMore: boolean;
      } = await ctx.runMutation(internal.aiExpenseDrafts.internal.deleteDraftsByUserBatch, {
        groupId: resolvedGroupId,
        userId: resolvedUserId,
      });
      deletedDraftCount += draftResult.deletedDraftCount;
      deletedItemCount += draftResult.deletedItemCount;
      if (!draftResult.hasMore) {
        break;
      }
    }

    while (true) {
      const jobResult: { deletedBatchCount: number; deletedJobCount: number; hasMore: boolean } =
        await ctx.runMutation(
          internal.receiptAnalysisJobs.internal.deleteReceiptAnalysisDataByUserBatch,
          {
            groupId: resolvedGroupId,
            userId: resolvedUserId,
          },
        );
      deletedBatchCount += jobResult.deletedBatchCount;
      deletedJobCount += jobResult.deletedJobCount;
      if (!jobResult.hasMore) {
        break;
      }
    }

    aiExpenseQueue = {
      deletedDraftCount,
      deletedItemCount,
      deletedBatchCount,
      deletedJobCount,
    };
  }

  let weekSession: { reset: boolean } | null = null;
  if (resolvedGroupId && body.resetWeekSession) {
    if (!body.weekStartDate) {
      return new Response(
        JSON.stringify({ error: "weekStartDate is required when resetWeekSession is true." }),
        {
          status: 400,
          headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
        },
      );
    }

    weekSession = await ctx.runMutation(internal.weekSessions.internal.resetWeekSessionForUser, {
      groupId: resolvedGroupId,
      weekStartDate: body.weekStartDate,
    });
  }

  let categories: { deletedCount: number } | null = null;
  if (resolvedGroupId && body.deleteE2eCategories) {
    categories = await ctx.runMutation(internal.categories.internal.deleteE2eCategoriesByUser, {
      groupId: resolvedGroupId,
    });
  }

  let monthlyIncome: { cleared: boolean } | null = null;
  if (body.clearMonthlyIncome && resolvedUserId) {
    monthlyIncome = await ctx.runMutation(internal.users.internal.clearUserMonthlyIncome, {
      userId: resolvedUserId,
    });
  }

  let lineLink: { deletedCount: number } | null = null;
  if (body.clearLineLink && resolvedUserId) {
    let deletedCount = 0;
    let hasMore = true;
    while (hasMore) {
      const result = await ctx.runMutation(internal.lineLink.internal.clearE2eDataForUser, {
        userId: resolvedUserId,
      });
      deletedCount += result.deletedCount;
      hasMore = result.hasMore;
    }
    lineLink = { deletedCount };
  }

  let notificationData: { deletedCount: number } | null = null;
  if (body.clearNotificationData && resolvedUserId) {
    let deletedCount = 0;
    let hasMore = true;
    while (hasMore) {
      const result = await ctx.runMutation(
        internal.notifications.internal.clearE2eNotificationDataForUser,
        {
          userId: resolvedUserId,
        },
      );
      deletedCount += result.deletedCount;
      hasMore = result.hasMore;
    }
    notificationData = { deletedCount };
  }

  let expenseEntries: { deletedCount: number } | null = null;
  if (resolvedGroupId && body.clearE2eExpenseEntries) {
    expenseEntries = await ctx.runMutation(
      internal.expenseEntries.internal.deleteE2eExpenseEntriesByUser,
      {
        groupId: resolvedGroupId,
        userId: resolvedUserId,
      },
    );
  }

  let groupMemberships: { deletedCount: number } | null = null;
  if (body.clearGroupMemberships) {
    if (resolvedUserId) {
      groupMemberships = await ctx.runMutation(internal.groups.e2e.deleteGroupMembershipsByUser, {
        userId: resolvedUserId,
      });
    }
  }

  let groupMemberRole: { updated: boolean } | null = null;
  if (body.setGroupMemberRole && resolvedUserId) {
    groupMemberRole = await ctx.runMutation(internal.groups.e2e.setGroupMemberRoleForE2e, {
      userId: resolvedUserId,
      role: body.setGroupMemberRole,
    });
  }

  let groupInvitations: { deletedCount: number } | null = null;
  if (resolvedGroupId && body.clearGroupInvitations) {
    groupInvitations = await ctx.runMutation(internal.groups.e2e.clearGroupInvitationsForE2e, {
      groupId: resolvedGroupId,
    });
  }

  let seededGroupMember: { memberUserId: string } | null = null;
  if (body.seedGroupMember) {
    if (!resolvedGroupId) {
      return badRequest("groupId is required.");
    }

    const displayName = body.seedGroupMember.displayName?.trim();
    const memberEmail = body.seedGroupMember.email?.trim().toLowerCase();
    if (!displayName || !memberEmail) {
      return new Response(
        JSON.stringify({ error: "seedGroupMember.displayName and email are required." }),
        {
          status: 400,
          headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
        },
      );
    }

    seededGroupMember = await ctx.runMutation(internal.groups.e2e.seedGroupMemberForE2e, {
      groupId: resolvedGroupId,
      displayName,
      email: memberEmail,
    });
  }

  return new Response(
    JSON.stringify({
      receipts,
      aiExpenseQueue,
      weekSession,
      categories,
      monthlyIncome,
      lineLink,
      notificationData,
      expenseEntries,
      groupMemberships,
      groupMemberRole,
      groupInvitations,
      seededGroupMember,
    }),
    {
      status: 200,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    },
  );
});
