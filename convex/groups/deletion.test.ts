// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { acceptGroupInvitationHandler } from "./invitations";

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const OWNER_USER_ID = "https://clerk.example.test|owner";
const MEMBER_USER_ID = "https://clerk.example.test|member";

async function seedOwnedGroup(t: ReturnType<typeof convexTest>, name = "佐藤家") {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      userId: OWNER_USER_ID,
      displayName: "オーナー",
      email: "owner@example.test",
      activeGroupId: groupId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId: OWNER_USER_ID,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    return groupId;
  });
}

function asOwner(t: ReturnType<typeof convexTest>) {
  return t.withIdentity({ tokenIdentifier: OWNER_USER_ID, subject: "owner" });
}

describe("owner group deletion public API", () => {
  it("確認名が一致しない場合はgroupとjobを変更しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedOwnedGroup(t);

    await expect(
      asOwner(t).mutation(api.groups.deletion.requestGroupDeletion, {
        confirmationGroupName: "別の家計",
      }),
    ).rejects.toThrow("グループ名が一致しません");

    const state = await t.run(async (ctx) => ({
      group: await ctx.db.get(groupId),
      jobs: await ctx.db.query("groupDeletionJobs").take(1),
    }));
    expect(state.group?.status).toBe("active");
    expect(state.jobs).toHaveLength(0);
  });

  it("memberは削除previewの取得も削除開始もできない", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedOwnedGroup(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId: MEMBER_USER_ID,
        displayName: "メンバー",
        email: "member@example.test",
        activeGroupId: groupId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("groupMembers", {
        groupId,
        userId: MEMBER_USER_ID,
        role: "member",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const asMember = t.withIdentity({ tokenIdentifier: MEMBER_USER_ID, subject: "member" });

    await expect(asMember.query(api.groups.deletion.getGroupDeletionPreview, {})).rejects.toThrow(
      "グループオーナーのみ実行できます",
    );
    await expect(
      asMember.mutation(api.groups.deletion.requestGroupDeletion, {
        confirmationGroupName: "佐藤家",
      }),
    ).rejects.toThrow("グループオーナーのみ実行できます");

    const state = await t.run(async (ctx) => ({
      group: await ctx.db.get(groupId),
      jobs: await ctx.db.query("groupDeletionJobs").take(1),
    }));
    expect(state.group?.status).toBe("active");
    expect(state.jobs).toHaveLength(0);
  });

  it("bounded previewは100件を超える件数をat_least、派生画像件数をunknownで返す", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedOwnedGroup(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("sourceDocuments", {
          groupId,
          sourceType: "receipt",
          status: "ready",
          createdAt: index + 2,
          updatedAt: index + 2,
        });
        await ctx.db.insert("managementAuditLogs", {
          groupId,
          actorUserId: OWNER_USER_ID,
          action: "group_name_changed",
          targetKind: "group",
          targetId: groupId,
          createdAt: index + 2,
        });
      }
    });

    const preview = await asOwner(t).query(api.groups.deletion.getGroupDeletionPreview, {});

    expect(preview.sourceDocuments).toEqual({ count: 100, accuracy: "at_least" });
    expect(preview.receiptImages).toEqual({ count: 0, accuracy: "unknown" });
    expect(preview.members).toEqual({ count: 1, accuracy: "exact" });
    expect(preview.managementAuditLogs).toEqual({ count: 100, accuracy: "at_least" });
  });

  it("bounded previewは100件以下の管理監査ログ件数をexactで返す", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedOwnedGroup(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert("managementAuditLogs", {
          groupId,
          actorUserId: OWNER_USER_ID,
          action: "group_name_changed",
          targetKind: "group",
          targetId: groupId,
          createdAt: index + 2,
        });
      }
    });

    const preview = await asOwner(t).query(api.groups.deletion.getGroupDeletionPreview, {});

    expect(preview.managementAuditLogs).toEqual({ count: 2, accuracy: "exact" });
  });

  it("削除開始はjob作成・deleting遷移・requesterのactive group解除を原子的に行う", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedOwnedGroup(t);

    const jobId = await asOwner(t).mutation(api.groups.deletion.requestGroupDeletion, {
      confirmationGroupName: "  佐藤家  ",
    });

    const state = await t.run(async (ctx) => ({
      group: await ctx.db.get(groupId),
      job: await ctx.db.get(jobId),
      user: await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", OWNER_USER_ID))
        .unique(),
    }));
    expect(state.group?.status).toBe("deleting");
    expect(state.job).toMatchObject({
      actorUserIdSnapshot: OWNER_USER_ID,
      source: "owner",
      status: "requested",
      isActive: true,
    });
    expect(state.user?.activeGroupId).toBeUndefined();
  });

  it("statusとresumeはmembership削除後もoriginal requester snapshotだけを認可する", async () => {
    const t = convexTest(schema, convexTestModules);
    const jobId = await t.run(async (ctx) => {
      return await ctx.db.insert("groupDeletionJobs", {
        targetGroupIdSnapshot: "00000000000000000000010000groups",
        targetGroupNameSnapshot: "削除途中家計",
        source: "owner",
        actorUserIdSnapshot: OWNER_USER_ID,
        status: "failed",
        stage: "completedEnqueue",
        isActive: false,
        attemptCount: 6,
        maxAttempts: 6,
        lastErrorCategory: "batch_processing_failed",
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
          groupMembers: 1,
          groups: 1,
        },
        createdAt: 1,
        updatedAt: 2,
      });
    });

    const status = await asOwner(t).query(api.groups.deletion.getGroupDeletionStatus, { jobId });
    const strangerStatus = await t
      .withIdentity({ tokenIdentifier: "issuer|stranger" })
      .query(api.groups.deletion.getGroupDeletionStatus, { jobId });
    expect(status).toMatchObject({
      jobId,
      groupName: "削除途中家計",
      status: "failed",
    });
    expect(strangerStatus).toBeNull();

    await expect(
      t
        .withIdentity({ tokenIdentifier: "issuer|stranger" })
        .mutation(api.groups.deletion.resumeGroupDeletion, { jobId }),
    ).rejects.toThrow("削除ジョブが見つかりません");
    expect(await t.run(async (ctx) => await ctx.db.get(jobId))).toMatchObject({
      status: "failed",
      stage: "completedEnqueue",
      isActive: false,
      attemptCount: 6,
    });

    await asOwner(t).mutation(api.groups.deletion.resumeGroupDeletion, { jobId });
    const resumed = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(resumed).toMatchObject({
      status: "requested",
      stage: "completedEnqueue",
      isActive: true,
    });
  });

  it("deletingへ遷移したグループの招待は受け入れない", async () => {
    const t = convexTest(schema, convexTestModules);
    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "削除中家計",
        status: "deleting",
        createdAt: 1,
        updatedAt: 2,
      });
      await ctx.db.insert("groupInvitations", {
        groupId,
        email: "invitee@example.test",
        token: "deleting-group-token",
        status: "pending",
        invitedByUserId: OWNER_USER_ID,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("users", {
        userId: "issuer|invitee",
        displayName: "招待ユーザー",
        email: "invitee@example.test",
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(
      t
        .withIdentity({ tokenIdentifier: "issuer|invitee", email: "invitee@example.test" })
        .run((ctx) => acceptGroupInvitationHandler(ctx, { token: "deleting-group-token" })),
    ).rejects.toThrow("このグループは削除処理中です");
  });
});
