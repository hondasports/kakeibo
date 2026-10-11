// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { convexTestModules } from "./test.setup";
import {
  STRANDED_RECOVERY_BATCH_SIZE,
  STRANDED_RECOVERY_CANDIDATE_CAP,
  STRANDED_RECOVERY_EXPIRED_LOG_LIMIT,
} from "../lib/usecase/accountDeletion/recoverStrandedAccountDeletions";
import {
  deleteOrphanedGroupMemberships,
  loadAccountDeletionClassification,
} from "./accountDeletion";

describe("loadAccountDeletionClassification", () => {
  it("削除済みグループへの membership を回収対象にし、有効な共有グループは離脱として分類する", async () => {
    const orphanMembership = {
      _id: "membership-orphan" as Id<"groupMembers">,
      groupId: "group-deleted" as Id<"groups">,
      userId: "user-001",
      role: "owner" as const,
    };
    const activeMembership = {
      _id: "membership-active" as Id<"groupMembers">,
      groupId: "group-active" as Id<"groups">,
      userId: "user-001",
      role: "member" as const,
    };
    const take = vi.fn(async (count: number) => {
      expect(count).toBeLessThanOrEqual(10_000);
      return [orphanMembership, activeMembership];
    });
    const withIndex = vi.fn((indexName: string) => {
      if (indexName === "by_user_id") {
        return { take };
      }
      return {
        take: vi.fn().mockResolvedValue([
          { ...activeMembership, role: "member" },
          { ...activeMembership, _id: "membership-owner", userId: "owner-001", role: "owner" },
        ]),
      };
    });
    const ctx = {
      db: {
        query: vi.fn().mockReturnValue({ withIndex }),
        get: vi
          .fn()
          .mockImplementation(async (groupId: Id<"groups">) =>
            groupId === "group-active" ? { _id: groupId, name: "共有家計" } : null,
          ),
      },
    } as unknown as Pick<QueryCtx, "db">;

    const result = await loadAccountDeletionClassification(ctx, "user-001");

    expect(result.classification.groupsToLeave).toMatchObject([
      { groupId: "group-active", groupName: "共有家計", role: "member" },
    ]);
    expect(result.orphanMemberships).toEqual([orphanMembership]);
  });
});

describe("deleteOrphanedGroupMemberships", () => {
  it("孤立 membership だけを削除する", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const orphanMembership = { _id: "membership-orphan" as Id<"groupMembers"> };

    await deleteOrphanedGroupMemberships(
      { db: { delete: deleteMock } } as unknown as Pick<MutationCtx, "db">,
      [orphanMembership],
    );

    expect(deleteMock).toHaveBeenCalledOnce();
    expect(deleteMock).toHaveBeenCalledWith("membership-orphan");
  });
});

describe("account deletion group purge orchestration", () => {
  // requestAccountDeletion が登録する Node 専用 action を edge-runtime の teardown 後に実行しない。
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("25件を超えるsole-ownerグループをbounded child jobへ分割する", async () => {
    const t = convexTest(schema, convexTestModules);
    const userId = "https://clerk.example.test|account-delete-batch";
    await t.run(async (ctx) => {
      const user = await ctx.db.insert("users", {
        userId,
        displayName: "退会テスト",
        email: "account-delete@example.test",
        createdAt: 1,
        updatedAt: 1,
      });
      for (let index = 0; index < 26; index += 1) {
        const groupId = await ctx.db.insert("groups", {
          name: `退会対象${index}`,
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("groupMembers", {
          groupId,
          userId,
          role: "owner",
          createdAt: 1,
          updatedAt: 1,
        });
        if (index === 0) await ctx.db.patch(user, { activeGroupId: groupId });
      }
    });

    const requestId = await t
      .withIdentity({ tokenIdentifier: userId, subject: "clerk-account-delete-batch" })
      .mutation(api.accountDeletion.requestAccountDeletion, { confirmationText: "削除" });
    await t.mutation(internal.accountDeletion.prepareAccountDeletionBatch, { requestId });
    await t.mutation(internal.accountDeletion.prepareAccountDeletionBatch, { requestId });

    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(requestId),
      purges: await ctx.db
        .query("accountDeletionGroupPurges")
        .withIndex("by_request_id", (q) => q.eq("requestId", requestId))
        .take(30),
      groups: await ctx.db.query("groups").take(30),
    }));
    expect(state.request?.status).toBe("purging_groups");
    expect(state.purges).toHaveLength(26);
    expect(state.groups.filter((group) => group.status === "deleting")).toHaveLength(26);
  });

  it("子ジョブ失敗時はidentity/userを保持したまま退会要求をfailedにする", async () => {
    const t = convexTest(schema, convexTestModules);
    const userId = "https://clerk.example.test|account-delete-failure";
    const { requestId, jobId, userDbId } = await t.run(async (ctx) => {
      const userDbId = await ctx.db.insert("users", {
        userId,
        displayName: "失敗テスト",
        email: "failure@example.test",
        createdAt: 1,
        updatedAt: 1,
      });
      const groupId = await ctx.db.insert("groups", {
        name: "失敗対象",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("groupMembers", {
        groupId,
        userId,
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      const jobId = await ctx.db.insert("groupDeletionJobs", {
        targetGroupIdSnapshot: groupId,
        targetGroupNameSnapshot: "失敗対象",
        source: "account_deletion",
        status: "failed",
        stage: "finalSweep",
        isActive: false,
        attemptCount: 6,
        maxAttempts: 6,
        lastErrorCategory: "purge_failed",
        deletedCounts: {
          receiptAnalysisImageJobs: 0,
          aiExpenseDraftItems: 0,
          aiExpenseDrafts: 0,
          receiptAnalysisBatches: 0,
          expenseEntries: 0,
          receipts: 0,
          sourceDocuments: 0,
          storageFiles: 0,
          weekSessions: 0,
          categories: 0,
          groupInvitations: 0,
          managementAuditLogs: 0,
          groupMembers: 0,
          groups: 0,
        },
        createdAt: 1,
        updatedAt: 1,
      });
      const requestId = await ctx.db.insert("accountDeletionRequests", {
        userId,
        clerkUserId: "clerk-account-delete-failure",
        status: "purging_groups",
        leftGroupCount: 0,
        deletedGroupCount: 1,
        attemptCount: 0,
        maxAttempts: 6,
        createdAt: 1,
        updatedAt: 1,
        preparationCompletedAt: 1,
      });
      await ctx.db.insert("accountDeletionGroupPurges", {
        requestId,
        groupDeletionJobId: jobId,
        targetGroupIdSnapshot: groupId,
        targetGroupNameSnapshot: "失敗対象",
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
      return { requestId, jobId, userDbId };
    });

    await t.mutation(internal.accountDeletion.advanceAccountDeletionPurge, { requestId });
    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(requestId),
      user: await ctx.db.get(userDbId),
    }));
    expect(state.request?.status).toBe("failed");
    expect(state.request?.lastErrorCode).toBe("purge_failed");
    expect(state.user).not.toBeNull();
    expect(jobId).toBeDefined();
  });

  it("完了時に対象ユーザーへ紐づくLINE webhookイベントも削除する", async () => {
    const t = convexTest(schema, convexTestModules);
    const userId = "https://clerk.example.test|account-delete-line-events";
    const { requestId, userDbId } = await t.run(async (ctx) => {
      const userDbId = await ctx.db.insert("users", {
        userId,
        displayName: "LINEイベント退会テスト",
        createdAt: 1,
        updatedAt: 1,
      });
      const requestId = await ctx.db.insert("accountDeletionRequests", {
        userId,
        clerkUserId: "clerk-account-delete-line-events",
        status: "identity_deleted",
        leftGroupCount: 0,
        deletedGroupCount: 0,
        attemptCount: 0,
        maxAttempts: 6,
        createdAt: 1,
        updatedAt: 1,
        identityDeletedAt: 1,
        recipientEmailSnapshot: "delete-complete@example.test",
      });
      await ctx.db.insert("lineWebhookEvents", {
        webhookEventId: "account-delete-line-event",
        eventType: "text",
        delivery: "linked",
        userId,
        messageText: "退会対象",
        createdAt: 1,
      });
      await ctx.db.insert("lineImageJobs", {
        webhookEventId: "account-delete-line-image-job",
        userId,
        messageId: "account-delete-message",
        status: "pending",
        createdAt: 1,
        updatedAt: 1,
      });
      const batchId = await ctx.db.insert("receiptAnalysisBatches", {
        groupId: await ctx.db.insert("groups", {
          name: "g",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        }),
        createdByUserId: userId,
        totalCount: 1,
        processedCount: 1,
        status: "completed",
        createdAt: 1,
        updatedAt: 1,
      });
      const linkId = await ctx.db.insert("lineAccountLinks", {
        userId,
        lineUserId: "line-u-delete",
        status: "active",
        linkedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("lineNotificationJobs", {
        userId,
        batchId,
        type: "ai_review_required",
        pendingCount: 1,
        linkId,
        linkedAtSnapshot: 1,
        lineUserIdSnapshot: "line-u-delete",
        text: "退会対象の通知",
        status: "queued",
        attemptCount: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("lineNotificationEvents", {
        userId,
        batchId,
        type: "ai_review_required",
        dedupeKey: `ai-review-required-line/${batchId}`,
        outcome: "queued",
        createdAt: 1,
        updatedAt: 1,
      });
      return { requestId, userDbId };
    });

    for (let i = 0; i < 10; i += 1) {
      await t.mutation(internal.accountDeletion.finalizeAccountDeletion, { requestId });
    }

    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(requestId),
      user: await ctx.db.get(userDbId),
      events: await ctx.db
        .query("lineWebhookEvents")
        .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", userId))
        .collect(),
      jobs: await ctx.db
        .query("lineImageJobs")
        .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", userId))
        .collect(),
      notificationJobs: await ctx.db
        .query("lineNotificationJobs")
        .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", userId))
        .collect(),
      notificationEvents: await ctx.db
        .query("lineNotificationEvents")
        .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", userId))
        .collect(),
      emails: await ctx.db.query("transactionalEmailJobs").collect(),
    }));
    expect(state.request?.status).toBe("completed");
    expect(state.user).toBeNull();
    expect(state.events).toHaveLength(0);
    expect(state.jobs).toHaveLength(0);
    expect(state.notificationJobs).toHaveLength(0);
    expect(state.notificationEvents).toHaveLength(0);
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0].templateType).toBe("account_deletion_completed");
  });

  it("退会完了でLINE連携データを削除し、他ユーザー分は残してLINE userを再連携できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const userId = "https://clerk.example.test|account-delete-line-link";
    const otherUserId = "https://clerk.example.test|account-delete-line-link-other";
    const { requestId, userDbId } = await t.run(async (ctx) => {
      const userDbId = await ctx.db.insert("users", {
        userId,
        displayName: "LINE連携退会テスト",
        createdAt: 1,
        updatedAt: 1,
      });
      const requestId = await ctx.db.insert("accountDeletionRequests", {
        userId,
        clerkUserId: "clerk-account-delete-line-link",
        status: "identity_deleted",
        leftGroupCount: 0,
        deletedGroupCount: 0,
        attemptCount: 0,
        maxAttempts: 6,
        createdAt: 1,
        updatedAt: 1,
        identityDeletedAt: 1,
      });
      const groupId = await ctx.db.insert("groups", {
        name: "g",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      for (const owner of [userId, otherUserId]) {
        const batchId = await ctx.db.insert("receiptAnalysisBatches", {
          groupId,
          createdByUserId: owner,
          totalCount: 1,
          processedCount: 1,
          status: "completed",
          createdAt: 1,
          updatedAt: 1,
        });
        const activeLinkId = await ctx.db.insert("lineAccountLinks", {
          userId: owner,
          lineUserId: `line-${owner}-active`,
          status: "active",
          linkedAt: 2,
          createdAt: 2,
          updatedAt: 2,
        });
        await ctx.db.insert("lineAccountLinks", {
          userId: owner,
          lineUserId: `line-${owner}-old`,
          status: "revoked",
          linkedAt: 1,
          createdAt: 1,
          updatedAt: 1,
          revokedAt: 2,
        });
        await ctx.db.insert("lineLinkRequests", {
          userId: owner,
          stateHash: `state-${owner}`,
          nonceHash: `nonce-${owner}`,
          codeVerifier: "verifier",
          status: "completed",
          expiresAt: 10,
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("lineLinkAuditLogs", {
          userId: owner,
          action: "linked",
          result: "success",
          createdAt: 1,
        });
        // linkId で lineAccountLinks を参照するため、リンクより先に消える必要がある。
        await ctx.db.insert("lineNotificationJobs", {
          userId: owner,
          batchId,
          type: "ai_review_required",
          pendingCount: 1,
          linkId: activeLinkId,
          linkedAtSnapshot: 2,
          lineUserIdSnapshot: `line-${owner}-active`,
          text: "通知",
          status: "queued",
          attemptCount: 0,
          createdAt: 1,
          updatedAt: 1,
        });
      }
      return { requestId, userDbId };
    });

    for (let i = 0; i < 12; i += 1) {
      await t.mutation(internal.accountDeletion.finalizeAccountDeletion, { requestId });
    }

    const countFor = (owner: string) =>
      t.run(async (ctx) => ({
        links: await ctx.db
          .query("lineAccountLinks")
          .withIndex("by_user_id_and_status", (q) => q.eq("userId", owner))
          .collect(),
        requests: await ctx.db
          .query("lineLinkRequests")
          .withIndex("by_user_id_and_expires_at", (q) => q.eq("userId", owner))
          .collect(),
        audits: await ctx.db
          .query("lineLinkAuditLogs")
          .withIndex("by_user_id", (q) => q.eq("userId", owner))
          .collect(),
        jobs: await ctx.db
          .query("lineNotificationJobs")
          .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", owner))
          .collect(),
      }));
    const deleted = await countFor(userId);
    expect(await t.run(async (ctx) => ctx.db.get(userDbId))).toBeNull();
    expect(deleted.links).toHaveLength(0);
    expect(deleted.requests).toHaveLength(0);
    expect(deleted.audits).toHaveLength(0);
    expect(deleted.jobs).toHaveLength(0);
    const other = await countFor(otherUserId);
    expect(other.links).toHaveLength(2);
    expect(other.requests).toHaveLength(1);
    expect(other.audits).toHaveLength(1);
    expect(other.jobs).toHaveLength(1);

    // 退会済みユーザーの旧LINE userは、もう家計ユーザーへ解決されない。
    const lineUserId = `line-${userId}-active`;
    await t.mutation(internal.lineWebhook.internal.claimEvents, {
      events: [
        {
          webhookEventId: "after-delete-event",
          eventType: "text",
          lineUserId,
          messageId: "after-delete-message",
          messageText: "今週の支出",
          replyToken: "after-delete-reply-token",
        },
      ],
    });
    const [afterEvent] = await t.run(async (ctx) =>
      ctx.db
        .query("lineWebhookEvents")
        .withIndex("by_webhook_event_id", (q) => q.eq("webhookEventId", "after-delete-event"))
        .collect(),
    );
    expect(afterEvent?.delivery).toBe("unlinked");
    expect(afterEvent?.userId).toBeUndefined();

    // 別ユーザーが同じLINE userを連携しても LINE_LINK_CONFLICT にならない。
    const newUserId = "https://clerk.example.test|account-delete-line-link-new";
    const stateHash = "state-after-delete";
    await t.mutation(internal.lineLink.internal.createRequest, {
      userId: newUserId,
      stateHash,
      nonceHash: "nonce-after-delete",
      codeVerifier: "verifier",
      expiresAt: Date.now() + 60_000,
    });
    const claim = await t.mutation(internal.lineLink.internal.claimRequest, {
      stateHash,
      userId: newUserId,
    });
    if (!claim.ok) throw new Error("claim should succeed");
    await expect(
      t.mutation(internal.lineLink.internal.finalizeRequest, {
        requestId: claim.requestId,
        userId: newUserId,
        lineUserId,
        nonceHash: claim.nonceHash,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("25件を超える共有membershipもページングで取りこぼさず離脱する", async () => {
    const t = convexTest(schema, convexTestModules);
    const userId = "https://clerk.example.test|account-delete-shared-batch";
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId,
        displayName: "共有退会テスト",
        createdAt: 1,
        updatedAt: 1,
      });
      for (let index = 0; index < 26; index += 1) {
        const groupId = await ctx.db.insert("groups", {
          name: `共有退会対象${index}`,
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("groupMembers", {
          groupId,
          userId: `owner-${index}`,
          role: "owner",
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("groupMembers", {
          groupId,
          userId,
          role: "member",
          createdAt: 1,
          updatedAt: 1,
        });
      }
    });
    const requestId = await t
      .withIdentity({ tokenIdentifier: userId, subject: "clerk-account-delete-shared-batch" })
      .mutation(api.accountDeletion.requestAccountDeletion, { confirmationText: "削除" });
    await t.mutation(internal.accountDeletion.prepareAccountDeletionBatch, { requestId });
    await t.mutation(internal.accountDeletion.prepareAccountDeletionBatch, { requestId });
    const remaining = await t.run(
      async (ctx) =>
        await ctx.db
          .query("groupMembers")
          .withIndex("by_user_id", (q) => q.eq("userId", userId))
          .take(30),
    );
    expect(remaining).toHaveLength(0);
  });
});

describe("getMyAccountDeletionStatus", () => {
  it("退会完了直後の未認証呼び出しは例外ではなく null を返す", async () => {
    const t = convexTest(schema, convexTestModules);
    await expect(t.query(api.accountDeletion.getMyAccountDeletionStatus, {})).resolves.toBeNull();
  });

  it("進行中の削除要求があるとステータスを返す", async () => {
    const t = convexTest(schema, convexTestModules);
    const userId = "https://clerk.example.test|account-delete-status";
    await t.run(async (ctx) => {
      await ctx.db.insert("accountDeletionRequests", {
        userId,
        clerkUserId: "clerk-account-delete-status",
        status: "purging_groups",
        leftGroupCount: 0,
        deletedGroupCount: 0,
        attemptCount: 0,
        maxAttempts: 6,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(
      t
        .withIdentity({ tokenIdentifier: userId, subject: "clerk-account-delete-status" })
        .query(api.accountDeletion.getMyAccountDeletionStatus, {}),
    ).resolves.toMatchObject({ status: "purging_groups" });
  });
});

describe("recoverStrandedRequests（Clerk削除済みfailedの自動復旧）", () => {
  const DAY = 24 * 60 * 60 * 1000;
  // scheduleProcess が登録する Node 専用 action を teardown 後に実行しない。
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function insertFailed(
    t: ReturnType<typeof convexTest>,
    overrides: Partial<{
      status: "failed" | "completed" | "identity_deleted";
      identityDeletedAt: number | undefined;
    }> = {},
  ) {
    return await t.run(async (ctx) =>
      ctx.db.insert("accountDeletionRequests", {
        userId: `user-${Math.random()}`,
        clerkUserId: "clerk-x",
        status: overrides.status ?? "failed",
        leftGroupCount: 0,
        deletedGroupCount: 0,
        attemptCount: 6,
        maxAttempts: 6,
        lastErrorCode: "finalization_failed",
        lastErrorMessage: "退会処理の完了に失敗しました。",
        createdAt: 1,
        updatedAt: Date.now() - 1000,
        preparationCompletedAt: 1,
        ...("identityDeletedAt" in overrides
          ? { identityDeletedAt: overrides.identityDeletedAt }
          : { identityDeletedAt: Date.now() - 1000 }),
      }),
    );
  }

  const scheduledCount = (t: ReturnType<typeof convexTest>) =>
    t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).length);

  it("failed かつ identityDeletedAt ありの直近リクエストを identity_deleted へ戻して再スケジュールする", async () => {
    const t = convexTest(schema, convexTestModules);
    const id = await insertFailed(t);
    await t.mutation(internal.accountDeletion.recoverStrandedRequests, {});
    const request = await t.run((ctx) => ctx.db.get(id));
    expect(request).toMatchObject({ status: "identity_deleted", attemptCount: 0 });
    expect(request?.lastErrorCode).toBeUndefined();
    expect(await scheduledCount(t)).toBe(1);
  });

  it("identityDeletedAt が無い failed は本人が再試行できるため触らない", async () => {
    const t = convexTest(schema, convexTestModules);
    const id = await insertFailed(t, { identityDeletedAt: undefined });
    await t.mutation(internal.accountDeletion.recoverStrandedRequests, {});
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("failed");
    expect(await scheduledCount(t)).toBe(0);
  });

  it("identityDeletedAt から14日を超えた failed は触らず console.error で通知する", async () => {
    const t = convexTest(schema, convexTestModules);
    const id = await insertFailed(t, { identityDeletedAt: Date.now() - 15 * DAY });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await t.mutation(internal.accountDeletion.recoverStrandedRequests, {});
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("failed");
    expect(await scheduledCount(t)).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(
      "Account deletion recovery abandoned",
      expect.objectContaining({ requestId: id }),
    );
    errorSpy.mockRestore();
  });

  it("completed など failed 以外は触らない", async () => {
    const t = convexTest(schema, convexTestModules);
    const completed = await insertFailed(t, { status: "completed" });
    const finalizing = await insertFailed(t, { status: "identity_deleted" });
    await t.mutation(internal.accountDeletion.recoverStrandedRequests, {});
    expect((await t.run((ctx) => ctx.db.get(completed)))?.status).toBe("completed");
    expect((await t.run((ctx) => ctx.db.get(finalizing)))?.attemptCount).toBe(6);
    expect(await scheduledCount(t)).toBe(0);
  });

  it("1回の実行で再駆動する件数は10件までで、再実行すると残りを処理する", async () => {
    const t = convexTest(schema, convexTestModules);
    for (let i = 0; i < 12; i += 1) await insertFailed(t);
    await t.mutation(internal.accountDeletion.recoverStrandedRequests, {});
    const failedAfterFirst = await t.run(
      async (ctx) =>
        (await ctx.db.query("accountDeletionRequests").take(20)).filter(
          (request) => request.status === "failed",
        ).length,
    );
    expect(failedAfterFirst).toBe(2);
    await t.mutation(internal.accountDeletion.recoverStrandedRequests, {});
    expect(await scheduledCount(t)).toBe(12);
  });

  it("identityDeletedAt なしの新しい failed が150件あっても、古い復旧対象を復旧する", async () => {
    const t = convexTest(schema, convexTestModules);
    const eligible = await insertFailed(t, { identityDeletedAt: Date.now() - 2 * DAY });
    await t.run(async (ctx) => {
      for (let i = 0; i < 150; i += 1) {
        await ctx.db.insert("accountDeletionRequests", {
          userId: `retryable-${i}`,
          clerkUserId: "clerk-retryable",
          status: "failed",
          leftGroupCount: 0,
          deletedGroupCount: 0,
          attemptCount: 6,
          maxAttempts: 6,
          createdAt: 1,
          updatedAt: Date.now() + 1000 + i,
        });
      }
    });
    await t.mutation(internal.accountDeletion.recoverStrandedRequests, {});
    expect((await t.run((ctx) => ctx.db.get(eligible)))?.status).toBe("identity_deleted");
    expect(await scheduledCount(t)).toBe(1);
    const untouched = await t.run(async (ctx) =>
      (await ctx.db.query("accountDeletionRequests").take(200)).filter(
        (request) => request.status === "failed",
      ),
    );
    expect(untouched).toHaveLength(150);
  });

  it("期限切れの failed が大量にあっても、ログは上限件数までで復旧対象は復旧される", async () => {
    const t = convexTest(schema, convexTestModules);
    for (let i = 0; i < 25; i += 1) {
      await insertFailed(t, { identityDeletedAt: Date.now() - 20 * DAY - i });
    }
    const eligible = await insertFailed(t, { identityDeletedAt: Date.now() - DAY });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await t.mutation(internal.accountDeletion.recoverStrandedRequests, {});
    expect((await t.run((ctx) => ctx.db.get(eligible)))?.status).toBe("identity_deleted");
    expect(await scheduledCount(t)).toBe(1);
    expect(errorSpy).toHaveBeenCalledTimes(STRANDED_RECOVERY_EXPIRED_LOG_LIMIT);
    expect(errorSpy).toHaveBeenCalledWith(
      "Account deletion recovery abandoned",
      expect.objectContaining({ expiredLogged: 20, expiredTruncated: true }),
    );
    const stillFailed = await t.run(async (ctx) =>
      (await ctx.db.query("accountDeletionRequests").take(50)).filter(
        (request) => request.status === "failed",
      ),
    );
    expect(stillFailed).toHaveLength(25);
    errorSpy.mockRestore();
  });

  it("failed に戻った後に届いた古い markDeletingIdentity は状態を変えない", async () => {
    const t = convexTest(schema, convexTestModules);
    const id = await insertFailed(t, { identityDeletedAt: undefined });
    expect(await t.mutation(internal.accountDeletion.markDeletingIdentity, { requestId: id })).toBe(
      null,
    );
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("failed");
  });

  it("failed でも markIdentityDeleted は Clerk 削除成功を記録し identity_deleted へ進める", async () => {
    const t = convexTest(schema, convexTestModules);
    const id = await insertFailed(t, { identityDeletedAt: undefined });
    expect(
      await t.mutation(internal.accountDeletion.markIdentityDeleted, { requestId: id }),
    ).not.toBeNull();
    const request = await t.run((ctx) => ctx.db.get(id));
    expect(request).toMatchObject({ status: "identity_deleted", attemptCount: 0 });
    expect(request?.identityDeletedAt).toBeDefined();
    expect(request?.lastErrorCode).toBeUndefined();
  });

  it("completed に対する markIdentityDeleted は何もしない", async () => {
    const t = convexTest(schema, convexTestModules);
    const id = await insertFailed(t, { status: "completed", identityDeletedAt: undefined });
    expect(await t.mutation(internal.accountDeletion.markIdentityDeleted, { requestId: id })).toBe(
      null,
    );
    const request = await t.run((ctx) => ctx.db.get(id));
    expect(request?.status).toBe("completed");
    expect(request?.identityDeletedAt).toBeUndefined();
  });

  it("Clerk 削除成功の直前に別 action が failed にしても、記録後は finalize で完了できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const id = await t.run((ctx) =>
      ctx.db.insert("accountDeletionRequests", {
        userId: "user-race",
        clerkUserId: "clerk-race",
        status: "requested",
        leftGroupCount: 0,
        deletedGroupCount: 0,
        attemptCount: 0,
        maxAttempts: 6,
        createdAt: 1,
        updatedAt: 1,
        preparationCompletedAt: 1,
      }),
    );
    await t.mutation(internal.accountDeletion.markDeletingIdentity, { requestId: id });
    // action A が Clerk 削除に成功する間に、古い action B が上限到達で failed にする。
    await t.mutation(internal.accountDeletion.scheduleRetry, {
      requestId: id,
      code: "clerk_failed",
      message: "stale",
      finalization: false,
    });
    await t.run((ctx) => ctx.db.patch(id, { status: "failed" }));
    await t.mutation(internal.accountDeletion.markIdentityDeleted, { requestId: id });
    const marked = await t.run((ctx) => ctx.db.get(id));
    expect(marked?.status).toBe("identity_deleted");
    expect(marked?.identityDeletedAt).toBeDefined();
    await t.mutation(internal.accountDeletion.finalizeAccountDeletion, { requestId: id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("completed");
  });

  it("再駆動して再び failed に戻った行は後ろへ回り、他の least-recently-updated 行が再駆動される", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids: Awaited<ReturnType<typeof insertFailed>>[] = [];
    for (let i = 0; i < 25; i += 1) {
      // i が小さいほど identityDeletedAt は古い（index 順の先頭）。
      ids.push(await insertFailed(t, { identityDeletedAt: Date.now() - 5 * DAY + i * 1000 }));
    }
    // 古い 10 件は直前に再駆動して再び failed に戻った想定（updatedAt が新しい）。
    await t.run(async (ctx) => {
      for (const id of ids.slice(0, 10)) await ctx.db.patch(id, { updatedAt: Date.now() + 1000 });
    });
    await t.mutation(internal.accountDeletion.recoverStrandedRequests, {});
    const statuses = await t.run(async (ctx) =>
      Promise.all(ids.map(async (id) => (await ctx.db.get(id))?.status)),
    );
    expect(statuses.slice(0, 10).every((s) => s === "failed")).toBe(true);
    expect(statuses.slice(10, 20).every((s) => s === "identity_deleted")).toBe(true);
    expect(statuses.slice(20).every((s) => s === "failed")).toBe(true);
    expect(await scheduledCount(t)).toBe(STRANDED_RECOVERY_BATCH_SIZE);
  });

  it("復旧候補が上限を超えたら飽和警告を console.error に出す", async () => {
    const t = convexTest(schema, convexTestModules);
    await t.run(async (ctx) => {
      for (let i = 0; i < STRANDED_RECOVERY_CANDIDATE_CAP + 1; i += 1) {
        await ctx.db.insert("accountDeletionRequests", {
          userId: `sat-${i}`,
          clerkUserId: "clerk-sat",
          status: "failed",
          leftGroupCount: 0,
          deletedGroupCount: 0,
          attemptCount: 6,
          maxAttempts: 6,
          createdAt: 1,
          updatedAt: Date.now() - 1000,
          preparationCompletedAt: 1,
          identityDeletedAt: Date.now() - 1000,
        });
      }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await t.mutation(internal.accountDeletion.recoverStrandedRequests, {});
    expect(errorSpy).toHaveBeenCalledWith(
      "Account deletion recovery saturated",
      expect.objectContaining({ candidateCap: STRANDED_RECOVERY_CANDIDATE_CAP }),
    );
    expect(await scheduledCount(t)).toBe(STRANDED_RECOVERY_BATCH_SIZE);
    errorSpy.mockRestore();
  });

  it("正常フロー（requested→deleting_identity→identity_deleted）の遷移は許可される", async () => {
    const t = convexTest(schema, convexTestModules);
    const id = await t.run((ctx) =>
      ctx.db.insert("accountDeletionRequests", {
        userId: "user-normal",
        clerkUserId: "clerk-normal",
        status: "requested",
        leftGroupCount: 0,
        deletedGroupCount: 0,
        attemptCount: 0,
        maxAttempts: 6,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await t.mutation(internal.accountDeletion.markDeletingIdentity, { requestId: id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("deleting_identity");
    await t.mutation(internal.accountDeletion.markIdentityDeleted, { requestId: id });
    const request = await t.run((ctx) => ctx.db.get(id));
    expect(request?.status).toBe("identity_deleted");
    expect(request?.identityDeletedAt).toBeDefined();
  });
});
