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
      return { requestId, userDbId };
    });

    await t.mutation(internal.accountDeletion.finalizeAccountDeletion, { requestId });
    await t.mutation(internal.accountDeletion.finalizeAccountDeletion, { requestId });
    await t.mutation(internal.accountDeletion.finalizeAccountDeletion, { requestId });

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
    }));
    expect(state.request?.status).toBe("completed");
    expect(state.user).toBeNull();
    expect(state.events).toHaveLength(0);
    expect(state.jobs).toHaveLength(0);
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
