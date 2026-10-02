// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import type { ActionCtx } from "./_generated/server";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { convexTestModules } from "./test.setup";
import { e2ePurgeOrphansHandler } from "./e2ePurge";

const E2E_SECRET = "test-secret";

const originalEnvironment = {
  appEnv: process.env.APP_ENV,
  secret: process.env.E2E_CLEANUP_SECRET,
};

afterEach(() => {
  if (originalEnvironment.appEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = originalEnvironment.appEnv;
  if (originalEnvironment.secret === undefined) delete process.env.E2E_CLEANUP_SECRET;
  else process.env.E2E_CLEANUP_SECRET = originalEnvironment.secret;
});

function purgeRequest(secret = E2E_SECRET) {
  return new Request("https://example.test/e2e/purge-orphans", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-E2E-Cleanup-Secret": secret },
    body: "{}",
  });
}

const DELETION_COUNTS = {
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
};

describe("e2ePurge orphan purge", () => {
  it("memberless group を cascade 削除し、member 保持・deleting の group は温存する", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await t.run(async (ctx) => {
      const orphanGroupId = await ctx.db.insert("groups", {
        name: "E2E家計グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const categoryId = await ctx.db.insert("categories", {
        groupId: orphanGroupId,
        name: "食費",
        color: "#000000",
        isActive: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("weekSessions", {
        groupId: orphanGroupId,
        weekStartDate: "2026-09-28",
        weekEndDate: "2026-10-04",
        status: "draft",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("receipts", {
        groupId: orphanGroupId,
        date: "2026-09-28",
        type: "expense",
        shopName: "テストスーパー",
        amountYen: 500,
        categoryId,
        weekStartDate: "2026-09-28",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("expenseEntries", {
        groupId: orphanGroupId,
        date: "2026-09-28",
        amount: 500,
        categoryId,
        title: "テスト支出",
        entryType: "expense",
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
      });
      const draftId = await ctx.db.insert("aiExpenseDrafts", {
        groupId: orphanGroupId,
        sourceType: "image_upload",
        status: "ready",
        documentType: "receipt",
        confidence: {},
        reviewReasons: [],
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("aiExpenseDraftItems", {
        groupId: orphanGroupId,
        draftId,
        itemName: "テスト品目",
        amountYen: 100,
        confidence: {},
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("groupInvitations", {
        groupId: orphanGroupId,
        email: "invite@example.com",
        token: "token-1",
        status: "pending",
        invitedByUserId: "user-x",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("sourceDocuments", {
        groupId: orphanGroupId,
        sourceType: "manual",
        status: "finalized",
        createdAt: 1,
        updatedAt: 1,
      });

      const memberedGroupId = await ctx.db.insert("groups", {
        name: "実使用グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("groupMembers", {
        groupId: memberedGroupId,
        userId: "clerk|real-user",
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("weekSessions", {
        groupId: memberedGroupId,
        weekStartDate: "2026-09-28",
        weekEndDate: "2026-10-04",
        status: "draft",
        createdAt: 1,
        updatedAt: 1,
      });

      const deletingGroupId = await ctx.db.insert("groups", {
        name: "削除中グループ",
        status: "deleting",
        createdAt: 1,
        updatedAt: 1,
      });

      return { orphanGroupId, memberedGroupId, deletingGroupId };
    });

    const scan = await t.query(internal.e2ePurge.listOrphanedGroupIds, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(scan.orphanIds).toEqual([ids.orphanGroupId]);
    expect(scan.isDone).toBe(true);

    const result = await t.mutation(internal.e2ePurge.purgeGroupsBatch, {
      groupIds: [ids.orphanGroupId, ids.memberedGroupId, ids.deletingGroupId],
    });
    expect(result).toEqual({ deletedCount: 1, skippedCount: 2, failedCount: 0 });

    const remaining = await t.run(async (ctx) => ({
      groups: await ctx.db.query("groups").collect(),
      weekSessions: await ctx.db.query("weekSessions").collect(),
      receipts: await ctx.db.query("receipts").collect(),
      expenseEntries: await ctx.db.query("expenseEntries").collect(),
      categories: await ctx.db.query("categories").collect(),
      drafts: await ctx.db.query("aiExpenseDrafts").collect(),
      draftItems: await ctx.db.query("aiExpenseDraftItems").collect(),
      invitations: await ctx.db.query("groupInvitations").collect(),
      sourceDocuments: await ctx.db.query("sourceDocuments").collect(),
    }));

    expect(remaining.groups.map((g) => g._id)).toEqual(
      expect.arrayContaining([ids.memberedGroupId, ids.deletingGroupId]),
    );
    expect(remaining.weekSessions.map((w) => w.groupId)).toEqual([ids.memberedGroupId]);
    expect(remaining.receipts).toHaveLength(0);
    expect(remaining.expenseEntries).toHaveLength(0);
    expect(remaining.categories).toHaveLength(0);
    expect(remaining.drafts).toHaveLength(0);
    expect(remaining.draftItems).toHaveLength(0);
    expect(remaining.invitations).toHaveLength(0);
    expect(remaining.sourceDocuments).toHaveLength(0);
  });

  it("参照先 group が消えた audit log / terminal deletion job を削除し、生存参照・非 terminal は温存する", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await t.run(async (ctx) => {
      const liveGroupId = await ctx.db.insert("groups", {
        name: "生存グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const deadGroupId = await ctx.db.insert("groups", {
        name: "消えるグループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });

      const orphanAuditLogId = await ctx.db.insert("managementAuditLogs", {
        groupId: deadGroupId,
        actorUserId: "clerk|actor",
        action: "group_name_changed",
        targetKind: "group",
        createdAt: 1,
      });
      const liveAuditLogId = await ctx.db.insert("managementAuditLogs", {
        groupId: liveGroupId,
        actorUserId: "clerk|actor",
        action: "member_removed",
        targetKind: "member",
        createdAt: 1,
      });
      const orphanWeekSessionId = await ctx.db.insert("weekSessions", {
        groupId: deadGroupId,
        weekStartDate: "2026-01-05",
        weekEndDate: "2026-01-11",
        status: "draft",
        createdAt: 1,
        updatedAt: 1,
      });
      const liveWeekSessionId = await ctx.db.insert("weekSessions", {
        groupId: liveGroupId,
        weekStartDate: "2026-01-05",
        weekEndDate: "2026-01-11",
        status: "draft",
        createdAt: 1,
        updatedAt: 1,
      });

      const orphanJobId = await ctx.db.insert("groupDeletionJobs", {
        targetGroupIdSnapshot: deadGroupId,
        targetGroupNameSnapshot: "消えるグループ",
        source: "owner",
        status: "completed",
        stage: "completedEnqueue",
        isActive: false,
        attemptCount: 1,
        maxAttempts: 3,
        deletedCounts: { ...DELETION_COUNTS },
        createdAt: 1,
        updatedAt: 1,
        completedAt: 2,
      });
      await ctx.db.insert("groupDeletionNotificationRecipients", {
        jobId: orphanJobId,
        recipientUserId: "clerk|actor",
        createdAt: 1,
        updatedAt: 1,
      });
      const liveJobId = await ctx.db.insert("groupDeletionJobs", {
        targetGroupIdSnapshot: liveGroupId,
        targetGroupNameSnapshot: "生存グループ",
        source: "owner",
        status: "completed",
        stage: "completedEnqueue",
        isActive: false,
        attemptCount: 1,
        maxAttempts: 3,
        deletedCounts: { ...DELETION_COUNTS },
        createdAt: 1,
        updatedAt: 1,
        completedAt: 2,
      });
      const runningJobId = await ctx.db.insert("groupDeletionJobs", {
        targetGroupIdSnapshot: deadGroupId,
        targetGroupNameSnapshot: "消えるグループ",
        source: "owner",
        status: "running",
        stage: "receipts",
        isActive: true,
        attemptCount: 0,
        maxAttempts: 3,
        deletedCounts: { ...DELETION_COUNTS },
        createdAt: 1,
        updatedAt: 1,
      });

      return {
        liveGroupId,
        deadGroupId,
        orphanAuditLogId,
        liveAuditLogId,
        orphanWeekSessionId,
        liveWeekSessionId,
        orphanJobId,
        liveJobId,
        runningJobId,
      };
    });

    // deadGroupId の group ドキュメントだけを消して orphan 状態を作る。
    await t.run(async (ctx) => {
      await ctx.db.delete(ids.deadGroupId);
    });

    const auditResult = await t.mutation(internal.e2ePurge.purgeOrphanGroupScopedDocsStep, {
      table: "managementAuditLogs",
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(auditResult.deletedCount).toBe(1);
    expect(auditResult.isDone).toBe(true);

    const weekSessionResult = await t.mutation(internal.e2ePurge.purgeOrphanGroupScopedDocsStep, {
      table: "weekSessions",
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(weekSessionResult.deletedCount).toBe(1);
    expect(weekSessionResult.isDone).toBe(true);

    const jobResult = await t.mutation(internal.e2ePurge.purgeOrphanDeletionJobsStep, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(jobResult.deletedCount).toBe(1);
    expect(jobResult.isDone).toBe(true);

    const remaining = await t.run(async (ctx) => ({
      auditLogs: await ctx.db.query("managementAuditLogs").collect(),
      weekSessions: await ctx.db.query("weekSessions").collect(),
      jobs: await ctx.db.query("groupDeletionJobs").collect(),
      recipients: await ctx.db.query("groupDeletionNotificationRecipients").collect(),
    }));
    expect(remaining.auditLogs.map((l) => l._id)).toEqual([ids.liveAuditLogId]);
    expect(remaining.weekSessions.map((w) => w._id)).toEqual([ids.liveWeekSessionId]);
    expect(remaining.jobs.map((j) => j._id)).toEqual(
      expect.arrayContaining([ids.liveJobId, ids.runningJobId]),
    );
    expect(remaining.recipients).toHaveLength(0);
  });

  it("terminal email job と webhook event を削除し、進行中 job は温存する", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await t.run(async (ctx) => {
      const makeJob = (status: "sent" | "failed" | "queued" | "retrying") =>
        ctx.db.insert("transactionalEmailJobs", {
          templateType: "group_deleted",
          payloadJson: "{}",
          recipientEmail: "e2e@example.com",
          normalizedRecipientEmail: "e2e@example.com",
          subject: "test",
          provider: "resend",
          status,
          attemptCount: 1,
          maxAttempts: 6,
          createdAt: 1,
          updatedAt: 1,
        });
      const sentJobId = await makeJob("sent");
      const failedJobId = await makeJob("failed");
      const queuedJobId = await makeJob("queued");
      const retryingJobId = await makeJob("retrying");
      const eventId = await ctx.db.insert("emailWebhookEvents", {
        svixId: "msg_1",
        provider: "resend",
        eventType: "email.delivered",
        payloadJson: "{}",
        processedAt: 1,
        createdAt: 1,
      });
      return { sentJobId, failedJobId, queuedJobId, retryingJobId, eventId };
    });

    const jobResult = await t.mutation(internal.e2ePurge.purgeTerminalEmailJobsStep, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(jobResult.deletedCount).toBe(2);

    const eventResult = await t.mutation(internal.e2ePurge.purgeEmailWebhookEventsStep, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(eventResult.deletedCount).toBe(1);

    const remaining = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("transactionalEmailJobs").collect(),
      events: await ctx.db.query("emailWebhookEvents").collect(),
    }));
    expect(remaining.jobs.map((j) => j._id)).toEqual(
      expect.arrayContaining([ids.queuedJobId, ids.retryingJobId]),
    );
    expect(remaining.events).toHaveLength(0);
  });

  it("membership のない e2e-seed ユーザーだけ削除し、member 保持 seed ユーザーと通常ユーザーは温存する", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await t.run(async (ctx) => {
      const groupId: Id<"groups"> = await ctx.db.insert("groups", {
        name: "seed group",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const orphanSeedUserId = await ctx.db.insert("users", {
        userId: "e2e-seed|group-member-1",
        displayName: "orphan seed",
        createdAt: 1,
        updatedAt: 1,
      });
      const memberedSeedUserId = await ctx.db.insert("users", {
        userId: "e2e-seed|group-member-2",
        displayName: "membered seed",
        activeGroupId: groupId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("groupMembers", {
        groupId,
        userId: "e2e-seed|group-member-2",
        role: "member",
        createdAt: 1,
        updatedAt: 1,
      });
      const normalUserId = await ctx.db.insert("users", {
        userId: "clerk|real-user",
        displayName: "real user",
        createdAt: 1,
        updatedAt: 1,
      });
      return { orphanSeedUserId, memberedSeedUserId, normalUserId };
    });

    const result = await t.mutation(internal.e2ePurge.purgeOrphanSeedUsersStep, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(result.deletedCount).toBe(1);

    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users.map((u) => u._id)).toEqual(
      expect.arrayContaining([ids.memberedSeedUserId, ids.normalUserId]),
    );
  });

  it("runOrphanPurge は APP_ENV=development 以外で no-op（skipped）になる", async () => {
    process.env.APP_ENV = "production";
    const t = convexTest(schema, convexTestModules);
    await t.run(async (ctx) => {
      await ctx.db.insert("groups", {
        name: "orphan-group",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    });

    const result = await t.action(internal.e2ePurge.runOrphanPurge, {});

    expect(result.skipped).toBe(true);
    expect(result.hasMore).toBe(false);
    expect(result.stats.groupsDeleted).toBe(0);
    const groups = await t.run(async (ctx) => ctx.db.query("groups").collect());
    expect(groups).toHaveLength(1);
  });

  it("ページング: numItems を超える group がある場合は isDone=false と cursor を返す", async () => {
    const t = convexTest(schema, convexTestModules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 5; index += 1) {
        await ctx.db.insert("groups", {
          name: `orphan-${index}`,
          status: "active",
          createdAt: index,
          updatedAt: index,
        });
      }
    });

    const first = await t.query(internal.e2ePurge.listOrphanedGroupIds, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.orphanIds).toHaveLength(2);
    expect(first.isDone).toBe(false);

    const seen: string[] = [...first.orphanIds];
    let cursor: string | null = first.continueCursor;
    let isDone = first.isDone;
    while (!isDone) {
      const page = await t.query(internal.e2ePurge.listOrphanedGroupIds, {
        paginationOpts: { numItems: 2, cursor },
      });
      seen.push(...page.orphanIds);
      cursor = page.continueCursor;
      isDone = page.isDone;
    }
    expect(seen).toHaveLength(5);
  });
});

describe("e2ePurgeOrphansHandler", () => {
  function createActionCtx() {
    return {
      runQuery: vi.fn().mockResolvedValue({ orphanIds: [], isDone: true, continueCursor: "" }),
      runMutation: vi.fn().mockResolvedValue({ deletedCount: 0, isDone: true, continueCursor: "" }),
    } as unknown as ActionCtx;
  }

  it("APP_ENV が development 以外なら 503 を返し、内部関数を呼ばない", async () => {
    process.env.APP_ENV = "production";
    process.env.E2E_CLEANUP_SECRET = E2E_SECRET;
    const ctx = createActionCtx();

    const response = await e2ePurgeOrphansHandler(ctx, purgeRequest());

    expect(response.status).toBe(503);
    expect(ctx.runQuery).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("secret 不一致なら 401 を返す", async () => {
    process.env.APP_ENV = "development";
    process.env.E2E_CLEANUP_SECRET = E2E_SECRET;
    const ctx = createActionCtx();

    const response = await e2ePurgeOrphansHandler(ctx, purgeRequest("wrong"));

    expect(response.status).toBe(401);
    expect(ctx.runQuery).not.toHaveBeenCalled();
  });

  it("正当な secret なら purge ステップを実行し stats を返す", async () => {
    process.env.APP_ENV = "development";
    process.env.E2E_CLEANUP_SECRET = E2E_SECRET;
    const ctx = createActionCtx();

    const response = await e2ePurgeOrphansHandler(ctx, purgeRequest());

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      hasMore: boolean;
      stats: Record<string, number>;
    };
    expect(body.ok).toBe(true);
    expect(body.hasMore).toBe(false);
    expect(body.stats.groupsDeleted).toBe(0);
    expect(ctx.runQuery).toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalled();
  });

  it("step のバッチ失敗は握りつぶさず hasMore=true と stepFailures を返す", async () => {
    process.env.APP_ENV = "development";
    process.env.E2E_CLEANUP_SECRET = E2E_SECRET;
    const ctx = {
      runQuery: vi.fn().mockResolvedValue({ orphanIds: [], isDone: true, continueCursor: "" }),
      runMutation: vi
        .fn()
        .mockRejectedValueOnce(new Error("poisoned batch"))
        .mockResolvedValue({ deletedCount: 0, isDone: true, continueCursor: "" }),
    } as unknown as ActionCtx;

    const response = await e2ePurgeOrphansHandler(ctx, purgeRequest());

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      hasMore: boolean;
      stats: Record<string, number>;
    };
    expect(body.ok).toBe(true);
    expect(body.hasMore).toBe(true);
    expect(body.stats.stepFailures).toBe(1);
  });
});
