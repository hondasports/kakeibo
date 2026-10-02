import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { httpAction, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isE2eAppEnvironment, requireE2eSecret } from "./e2eHttp/e2eAuth";
import { deleteAllGroupScopedData } from "./groups/lib/deleteGroupPhysically";
import { TERMINAL_EMAIL_JOB_STATUSES } from "../lib/domain/email/rules";

// ---------------------------------------------------------------------------
// POST /e2e/purge-orphans — E2E 残滓データの物理削除
//
// 共有 dev deployment では E2E 実行のたびにグループが作られ、membership cleanup
// 後も groups ドキュメント自体・監査ログ・削除ジョブ・メール記録が残り続ける。
// このエンドポイント（と同じステップを回す日次 cron）が、member を持たない
// 孤児グループの cascade 削除と、参照先を失った運用レコードの掃除を行う。
//
// セキュリティ:
//   - HTTP 経路は X-E2E-Cleanup-Secret + APP_ENV=development のみ許可。
//   - cron 経路の internal action も APP_ENV=development 以外では no-op。
//   - member を持つ group、users（孤立 e2e-seed を除く）、systemAdmin 系は対象外。
// ---------------------------------------------------------------------------

const PURGE_BATCH_LIMIT = 200;
const GROUP_DELETE_BATCH = 25;
const PURGE_ACTION_BUDGET_MS = 8 * 60 * 1000;
// 残留が purge 速度を上回る暴走を防ぐ self-reschedule の連鎖上限。
const MAX_PURGE_CHAIN_DEPTH = 10;

const stepResultValidator = v.object({
  deletedCount: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
});

const purgeStatsValidator = v.object({
  groupsDeleted: v.number(),
  groupsSkipped: v.number(),
  groupDeleteFailed: v.number(),
  orphanGroupDocsDeleted: v.number(),
  deletionJobsDeleted: v.number(),
  emailJobsDeleted: v.number(),
  emailEventsDeleted: v.number(),
  seedUsersDeleted: v.number(),
  stepFailures: v.number(),
});

export type OrphanPurgeStats = {
  groupsDeleted: number;
  groupsSkipped: number;
  groupDeleteFailed: number;
  orphanGroupDocsDeleted: number;
  deletionJobsDeleted: number;
  emailJobsDeleted: number;
  emailEventsDeleted: number;
  seedUsersDeleted: number;
  stepFailures: number;
};

function emptyStats(): OrphanPurgeStats {
  return {
    groupsDeleted: 0,
    groupsSkipped: 0,
    groupDeleteFailed: 0,
    orphanGroupDocsDeleted: 0,
    deletionJobsDeleted: 0,
    emailJobsDeleted: 0,
    emailEventsDeleted: 0,
    seedUsersDeleted: 0,
    stepFailures: 0,
  };
}

// 物理削除済み group を指す group-scoped ドキュメントを掃除する対象テーブル。
// 全テーブルで `groupId: v.id("groups")` が必須フィールドであることが前提。
const ORPHAN_GROUP_SCOPED_TABLES = [
  "groupMembers",
  "groupInvitations",
  "managementAuditLogs",
  "sourceDocuments",
  "expenseEntries",
  "receipts",
  "weekSessions",
  "categories",
  "aiExpenseDrafts",
  "aiExpenseDraftItems",
  "receiptAnalysisBatches",
  "receiptAnalysisImageJobs",
] as const;

type DbReader = Pick<QueryCtx, "db">["db"];

async function isMemberlessGroup(db: DbReader, groupId: Id<"groups">): Promise<boolean> {
  const member = await db
    .query("groupMembers")
    .withIndex("by_group_id", (q) => q.eq("groupId", groupId))
    .first();
  return member === null;
}

export const listOrphanedGroupIds = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    orphanIds: v.array(v.id("groups")),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("groups").paginate(args.paginationOpts);
    const orphanIds: Id<"groups">[] = [];
    for (const group of result.page) {
      if (group.status === "deleting") {
        continue;
      }
      if (await isMemberlessGroup(ctx.db, group._id)) {
        orphanIds.push(group._id);
      }
    }
    return {
      orphanIds,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const purgeGroupsBatch = internalMutation({
  args: { groupIds: v.array(v.id("groups")) },
  returns: v.object({
    deletedCount: v.number(),
    skippedCount: v.number(),
    failedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    let deletedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    for (const groupId of args.groupIds) {
      const group = await ctx.db.get(groupId);
      if (
        group === null ||
        group.status === "deleting" ||
        !(await isMemberlessGroup(ctx.db, groupId))
      ) {
        skippedCount += 1;
        continue;
      }
      try {
        await deleteAllGroupScopedData(ctx, groupId);
        deletedCount += 1;
      } catch {
        // dangling storage reference等で失敗しても残りのgroup処理を止めない。
        failedCount += 1;
      }
    }
    return { deletedCount, skippedCount, failedCount };
  },
});

// 参照先 group が物理削除済みの group-scoped ドキュメントを掃除する。
// purge の group cascade と併用し、過去の不完全削除や並行 E2E 実行で残った
// 孤児ドキュメント（死んだ groupId を指す doc）を除去する。
export const purgeOrphanGroupScopedDocsStep = internalMutation({
  args: {
    table: v.union(
      v.literal("groupMembers"),
      v.literal("groupInvitations"),
      v.literal("managementAuditLogs"),
      v.literal("sourceDocuments"),
      v.literal("expenseEntries"),
      v.literal("receipts"),
      v.literal("weekSessions"),
      v.literal("categories"),
      v.literal("aiExpenseDrafts"),
      v.literal("aiExpenseDraftItems"),
      v.literal("receiptAnalysisBatches"),
      v.literal("receiptAnalysisImageJobs"),
    ),
    paginationOpts: paginationOptsValidator,
  },
  returns: stepResultValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db.query(args.table).paginate(args.paginationOpts);
    let deletedCount = 0;
    for (const doc of result.page) {
      const record = doc as { groupId?: Id<"groups">; imageStorageId?: Id<"_storage"> };
      if (record.groupId === undefined || (await ctx.db.get(record.groupId)) !== null) {
        continue;
      }
      if (record.imageStorageId !== undefined) {
        const metadata = await ctx.db.system.get("_storage", record.imageStorageId);
        if (metadata !== null) {
          try {
            await ctx.storage.delete(record.imageStorageId);
          } catch {
            // storage 削除に成功するまで参照を保持し、次回の purge で再試行する。
            continue;
          }
        }
      }
      await ctx.db.delete(doc._id);
      deletedCount += 1;
    }
    return { deletedCount, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

// 参照先 group が消えた terminal 状態の groupDeletionJobs と通知受信者を掃除する。
export const purgeOrphanDeletionJobsStep = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: stepResultValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("groupDeletionJobs").paginate(args.paginationOpts);
    let deletedCount = 0;
    for (const job of result.page) {
      const groupId = await ctx.db.normalizeId("groups", job.targetGroupIdSnapshot);
      const groupMissing = groupId === null || (await ctx.db.get(groupId)) === null;
      const terminal = job.status === "completed" || job.status === "failed";
      if (!groupMissing || !terminal) {
        continue;
      }
      const recipients = await ctx.db
        .query("groupDeletionNotificationRecipients")
        .withIndex("by_job_id", (q) => q.eq("jobId", job._id))
        .collect();
      for (const recipient of recipients) {
        await ctx.db.delete(recipient._id);
      }
      await ctx.db.delete(job._id);
      deletedCount += 1;
    }
    return { deletedCount, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

// terminal 状態の transactionalEmailJobs を掃除する。queued/送信中のジョブは保持。
export const purgeTerminalEmailJobsStep = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: stepResultValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("transactionalEmailJobs").paginate(args.paginationOpts);
    const terminal = new Set<string>(TERMINAL_EMAIL_JOB_STATUSES);
    let deletedCount = 0;
    for (const job of result.page) {
      if (terminal.has(job.status)) {
        await ctx.db.delete(job._id);
        deletedCount += 1;
      }
    }
    return { deletedCount, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

// 処理済み webhook イベント記録を掃除する（運用上の再生用バッファではない）。
export const purgeEmailWebhookEventsStep = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: stepResultValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("emailWebhookEvents").paginate(args.paginationOpts);
    let deletedCount = 0;
    for (const event of result.page) {
      await ctx.db.delete(event._id);
      deletedCount += 1;
    }
    return { deletedCount, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

// membership を持たない e2e-seed ユーザーの users ドキュメントを掃除する。
export const purgeOrphanSeedUsersStep = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: stepResultValidator,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("users").paginate(args.paginationOpts);
    let deletedCount = 0;
    for (const user of result.page) {
      if (!user.userId.startsWith("e2e-seed|")) {
        continue;
      }
      const membership = await ctx.db
        .query("groupMembers")
        .withIndex("by_user_id", (q) => q.eq("userId", user.userId))
        .first();
      if (membership === null) {
        await ctx.db.delete(user._id);
        deletedCount += 1;
      }
    }
    return { deletedCount, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

type RunnerCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

async function drainPurgeSteps(
  ctx: RunnerCtx,
  stats: OrphanPurgeStats,
  budgetMs: number,
): Promise<{ hasMore: boolean; shouldReschedule: boolean }> {
  const deadline = Date.now() + budgetMs;
  const overDeadline = () => Date.now() >= deadline;
  // 時間予算超過で残った step だけ self-reschedule 対象。失敗 step は次回 cron に委ねる。
  let shouldReschedule = false;

  // 1. memberless groups の cascade 削除
  let groupScanDone = false;
  let groupScanFailed = false;
  let groupCursor: string | null = null;
  while (!groupScanDone && !overDeadline()) {
    const scan: {
      orphanIds: Id<"groups">[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(internal.e2ePurge.listOrphanedGroupIds, {
      paginationOpts: { numItems: PURGE_BATCH_LIMIT, cursor: groupCursor },
    });
    groupScanDone = scan.isDone;
    groupCursor = scan.continueCursor;
    for (let index = 0; index < scan.orphanIds.length; index += GROUP_DELETE_BATCH) {
      if (overDeadline()) {
        break;
      }
      try {
        const res: {
          deletedCount: number;
          skippedCount: number;
          failedCount: number;
        } = await ctx.runMutation(internal.e2ePurge.purgeGroupsBatch, {
          groupIds: scan.orphanIds.slice(index, index + GROUP_DELETE_BATCH),
        });
        stats.groupsDeleted += res.deletedCount;
        stats.groupsSkipped += res.skippedCount;
        stats.groupDeleteFailed += res.failedCount;
      } catch {
        // バッチ自体の失敗（commit時エラー等）で drain 全体を止めない。
        // cursor は進んでいるので、失敗分は次回 scan で再検出される。
        stats.stepFailures += 1;
        groupScanFailed = true;
      }
    }
  }

  // 2. 死んだ groupId を指す group-scoped ドキュメントを全対象テーブルで掃除
  let hasMore = false;
  if (!groupScanDone) {
    hasMore = true;
    if (!groupScanFailed) {
      shouldReschedule = true;
    }
  }
  for (const table of ORPHAN_GROUP_SCOPED_TABLES) {
    let done = false;
    let failed = false;
    let cursor: string | null = null;
    while (!done && !overDeadline()) {
      try {
        const res: { deletedCount: number; isDone: boolean; continueCursor: string } =
          await ctx.runMutation(internal.e2ePurge.purgeOrphanGroupScopedDocsStep, {
            table,
            paginationOpts: { numItems: PURGE_BATCH_LIMIT, cursor },
          });
        stats.orphanGroupDocsDeleted += res.deletedCount;
        done = res.isDone;
        cursor = res.continueCursor;
      } catch {
        // 同じ cursor で再実行しても失敗する poisoned batch を避けてこのテーブルを諦める。
        stats.stepFailures += 1;
        failed = true;
        break;
      }
    }
    if (!done) {
      hasMore = true;
      if (!failed) {
        shouldReschedule = true;
      }
    }
  }

  // 3. 参照先を失った運用レコード・メール記録の掃除
  const tableSteps = [
    { fn: internal.e2ePurge.purgeOrphanDeletionJobsStep, key: "deletionJobsDeleted" },
    { fn: internal.e2ePurge.purgeTerminalEmailJobsStep, key: "emailJobsDeleted" },
    { fn: internal.e2ePurge.purgeEmailWebhookEventsStep, key: "emailEventsDeleted" },
    { fn: internal.e2ePurge.purgeOrphanSeedUsersStep, key: "seedUsersDeleted" },
  ] as const;

  for (const step of tableSteps) {
    let done = false;
    let failed = false;
    let cursor: string | null = null;
    while (!done && !overDeadline()) {
      try {
        const res: { deletedCount: number; isDone: boolean; continueCursor: string } =
          await ctx.runMutation(step.fn, {
            paginationOpts: { numItems: PURGE_BATCH_LIMIT, cursor },
          });
        stats[step.key] += res.deletedCount;
        done = res.isDone;
        cursor = res.continueCursor;
      } catch {
        stats.stepFailures += 1;
        failed = true;
        break;
      }
    }
    if (!done) {
      hasMore = true;
      if (!failed) {
        shouldReschedule = true;
      }
    }
  }

  return { hasMore, shouldReschedule };
}

// 日次 cron 用の internal action。development 以外では no-op。
// バジェット超過で残りがある場合は self-schedule して処理を継続する。
export const runOrphanPurge = internalAction({
  args: { chainDepth: v.optional(v.number()) },
  returns: v.object({
    skipped: v.boolean(),
    hasMore: v.boolean(),
    stats: purgeStatsValidator,
  }),
  handler: async (ctx, args) => {
    if (!isE2eAppEnvironment()) {
      return { skipped: true, hasMore: false, stats: emptyStats() };
    }

    const chainDepth = args.chainDepth ?? 0;
    const stats = emptyStats();
    const { hasMore, shouldReschedule } = await drainPurgeSteps(ctx, stats, PURGE_ACTION_BUDGET_MS);
    if (shouldReschedule && chainDepth < MAX_PURGE_CHAIN_DEPTH) {
      await ctx.scheduler.runAfter(0, internal.e2ePurge.runOrphanPurge, {
        chainDepth: chainDepth + 1,
      });
    }
    return { skipped: false, hasMore, stats };
  },
});

export const e2ePurgeOrphansHandler = httpAction(async (ctx, req) => {
  const authError = requireE2eSecret(req, "E2E orphan purge is not enabled in this environment.");
  if (authError) {
    return authError;
  }

  const stats = emptyStats();
  const { hasMore } = await drainPurgeSteps(ctx, stats, PURGE_ACTION_BUDGET_MS);

  return new Response(JSON.stringify({ ok: true, hasMore, stats }), {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
});
