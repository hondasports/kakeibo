/**
 * 退会済みユーザーに取り残された LINE 連携データを削除する一回限りの内部 migration。
 *
 * 背景: finalize の purge に lineAccountLinks を加える前に完了した退会では、active な連携が残り、
 * LINE webhook の解決と再連携（LINE_LINK_CONFLICT）を妨げる。
 *
 * 対象: users に行が無い userId（tokenIdentifier）の lineAccountLinks と、その userId の
 * lineNotificationJobs / lineNotificationEvents / lineLinkRequests / lineLinkAuditLogs。
 * 存在するユーザー、および終端でない accountDeletionRequests を持つ userId には触れない。
 * lineNotificationJobs は linkId で lineAccountLinks を参照するため、リンクより先に削除する。
 *
 * すべて internal 関数でクライアントから呼べない。cron は追加せず、運用者が手動で実行する。
 * 必ず非本番 deployment で先に実行・検証してから、本番へ同じ手順を適用すること。
 *
 * 実行手順（対象 deployment は Convex CLI の通常の指定方法で選ぶ。最初は非本番）:
 *   1. dry run（カウントのみ。cursor が null になるまで continueCursor を渡して繰り返す）
 *      pnpm exec convex run orphanedLineLinkMigration:dryRun '{}'
 *      pnpm exec convex run orphanedLineLinkMigration:dryRun '{"cursor":"<continueCursor>"}'
 *   2. 実行（1 batch 後に自分自身を再スケジュールして最後まで進む。何度実行しても冪等）
 *      pnpm exec convex run orphanedLineLinkMigration:executeBatch '{}'
 *   3. 検証（remainingOrphanLinks が全 page で 0 であること）
 *      pnpm exec convex run orphanedLineLinkMigration:verify '{}'
 *
 * ログ・戻り値は件数のみで、lineUserId や userId を含めない。
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// 1 transaction の書き込み上限に収めるための小さな batch。
// 最悪 BATCH_SIZE * (CHILD_LIMIT * 4 + 1) 件 = 約 2,000 件の削除。
const BATCH_SIZE = 10;
const CHILD_LIMIT = 50;

const CHILD_TABLES = [
  "lineNotificationJobs",
  "lineNotificationEvents",
  "lineLinkRequests",
  "lineLinkAuditLogs",
] as const;
type ChildTable = (typeof CHILD_TABLES)[number];

const TERMINAL_DELETION_STATUSES = new Set(["completed", "failed"]);

type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

async function loadLinkPage(ctx: ReadCtx, cursor: string | null) {
  return await ctx.db.query("lineAccountLinks").paginate({ cursor, numItems: BATCH_SIZE });
}

type UserState = "exists" | "in_progress_deletion" | "orphan";

/** users に行が無く、進行中の退会リクエストも無い userId だけを孤立とみなす。 */
async function classifyUser(ctx: ReadCtx, userId: string): Promise<UserState> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) => q.eq("userId", userId))
    .first();
  if (user !== null) return "exists";
  const requests = await ctx.db
    .query("accountDeletionRequests")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .take(CHILD_LIMIT + 1);
  const inProgress = requests.some((request) => !TERMINAL_DELETION_STATUSES.has(request.status));
  return inProgress ? "in_progress_deletion" : "orphan";
}

async function takeChildren(ctx: ReadCtx, table: ChildTable, userId: string) {
  // 全テーブルとも userId 先頭の index がある。
  switch (table) {
    case "lineNotificationJobs":
      return await ctx.db
        .query("lineNotificationJobs")
        .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", userId))
        .take(CHILD_LIMIT + 1);
    case "lineNotificationEvents":
      return await ctx.db
        .query("lineNotificationEvents")
        .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", userId))
        .take(CHILD_LIMIT + 1);
    case "lineLinkRequests":
      return await ctx.db
        .query("lineLinkRequests")
        .withIndex("by_user_id_and_expires_at", (q) => q.eq("userId", userId))
        .take(CHILD_LIMIT + 1);
    case "lineLinkAuditLogs":
      return await ctx.db
        .query("lineLinkAuditLogs")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .take(CHILD_LIMIT + 1);
  }
}

type ChildCounts = Record<ChildTable, number>;
const emptyChildCounts = (): ChildCounts => ({
  lineNotificationJobs: 0,
  lineNotificationEvents: 0,
  lineLinkRequests: 0,
  lineLinkAuditLogs: 0,
});

const countsValidator = v.object({
  lineNotificationJobs: v.number(),
  lineNotificationEvents: v.number(),
  lineLinkRequests: v.number(),
  lineLinkAuditLogs: v.number(),
});

export const dryRun = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    orphanLinks: v.number(),
    skippedInProgressDeletion: v.number(),
    // 子データ件数は page 内の孤立 userId ごとに CHILD_LIMIT 件で打ち切る概算（上限付き）。
    wouldDelete: countsValidator,
  }),
  handler: async (ctx, args) => {
    const page = await loadLinkPage(ctx, args.cursor ?? null);
    const wouldDelete = emptyChildCounts();
    const seenUsers = new Set<string>();
    let orphanLinks = 0;
    let skippedInProgressDeletion = 0;
    for (const link of page.page) {
      const state = await classifyUser(ctx, link.userId);
      if (state === "in_progress_deletion") skippedInProgressDeletion += 1;
      if (state !== "orphan") continue;
      orphanLinks += 1;
      if (seenUsers.has(link.userId)) continue;
      seenUsers.add(link.userId);
      for (const table of CHILD_TABLES) {
        wouldDelete[table] += Math.min(
          (await takeChildren(ctx, table, link.userId)).length,
          CHILD_LIMIT,
        );
      }
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      orphanLinks,
      skippedInProgressDeletion,
      wouldDelete,
    };
  },
});

async function deleteChildren(
  ctx: MutationCtx,
  userId: string,
  deleted: ChildCounts,
): Promise<boolean> {
  let complete = true;
  for (const table of CHILD_TABLES) {
    const docs = await takeChildren(ctx, table, userId);
    for (const doc of docs.slice(0, CHILD_LIMIT)) {
      await ctx.db.delete(doc._id);
      deleted[table] += 1;
    }
    if (docs.length > CHILD_LIMIT) complete = false;
  }
  return complete;
}

const executeResultValidator = v.object({
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
  deletedLinks: v.number(),
  deferredLinks: v.number(),
  skippedLinks: v.number(),
  deleted: countsValidator,
});

export const executeBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: executeResultValidator,
  handler: async (ctx, args) => {
    const page = await loadLinkPage(ctx, args.cursor ?? null);
    const deleted = emptyChildCounts();
    let deletedLinks = 0;
    let deferredLinks = 0;
    let skippedLinks = 0;
    for (const link of page.page as Doc<"lineAccountLinks">[]) {
      if ((await classifyUser(ctx, link.userId)) !== "orphan") {
        skippedLinks += 1;
        continue;
      }
      // 通知 job / event を含む子データをリンクより先に消す。上限超過なら次回に持ち越す。
      if (!(await deleteChildren(ctx, link.userId, deleted))) {
        deferredLinks += 1;
        continue;
      }
      await ctx.db.delete(link._id);
      deletedLinks += 1;
    }
    // 持ち越しがある間は同じ cursor を再実行する（削除が進むため必ず収束する）。
    const nextCursor = deferredLinks > 0 ? (args.cursor ?? null) : page.continueCursor;
    const isDone = page.isDone && deferredLinks === 0;
    console.log(
      `orphanedLineLinkMigration: deletedLinks=${deletedLinks} deferredLinks=${deferredLinks} skippedLinks=${skippedLinks} done=${isDone}`,
    );
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.orphanedLineLinkMigration.executeBatch, {
        ...(nextCursor === null ? {} : { cursor: nextCursor }),
      });
    }
    return {
      isDone,
      continueCursor: isDone ? null : nextCursor,
      deletedLinks,
      deferredLinks,
      skippedLinks,
      deleted,
    };
  },
});

export const verify = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    remainingOrphanLinks: v.number(),
  }),
  handler: async (ctx, args) => {
    const page = await loadLinkPage(ctx, args.cursor ?? null);
    let remainingOrphanLinks = 0;
    for (const link of page.page) {
      if ((await classifyUser(ctx, link.userId)) === "orphan") remainingOrphanLinks += 1;
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      remainingOrphanLinks,
    };
  },
});
