/**
 * 退会済みユーザーに取り残された LINE 連携データを削除する一回限りの内部 migration。
 *
 * 背景: finalize の purge に lineAccountLinks を加える前に完了した退会では、active な連携が残り、
 * LINE webhook の解決と再連携（LINE_LINK_CONFLICT）を妨げる。また LINE OAuth を開始しただけで
 * 連携を完了せず退会したユーザーには lineAccountLinks が無く、lineLinkRequests / lineLinkAuditLogs
 * だけが残るため、リンクだけを列挙すると取りこぼす。
 *
 * 対象: users に行が無い userId（tokenIdentifier）の
 *   - lineAccountLinks と、その userId の lineNotificationJobs / lineNotificationEvents /
 *     lineLinkRequests / lineLinkAuditLogs（phase "links"）
 *   - リンクを持たない孤立 userId の lineLinkRequests（phase "requests"）
 *   - リンクを持たない孤立 userId の lineLinkAuditLogs（phase "auditLogs"）
 * 存在するユーザー、および終端でない accountDeletionRequests を持つ userId には触れない。
 * lineNotificationJobs は linkId で lineAccountLinks を参照するため、リンクより先に削除する。
 *
 * 3 つの phase は links → requests → auditLogs の順に、それぞれ独立した pagination で走査する。
 * cursor は "<phase>:<Convex の cursor>" の文字列で、省略時は links の先頭から始まる。
 * 最後の phase（auditLogs）が終わった時だけ isDone=true / continueCursor=null になる。
 *
 * すべて internal 関数でクライアントから呼べない。cron は追加せず、運用者が手動で実行する。
 * 必ず非本番 deployment で先に実行・検証してから、本番へ同じ手順を適用すること。
 *
 * 【削除は不可逆。判定の根拠が「users 行の不在」だけである点に注意】
 * 孤児の判定は「users に行が無く、終端でない accountDeletionRequests も無い」ことだけで、
 * 「退会が完了した」という積極的な証拠は要求しない（完了済みの退会リクエストは日次 cron で消えるため、
 * 古い退会は証拠が残らない）。そのため、次の生きたユーザーを孤児と誤判定して連携を消しうる:
 *   - プロフィール作成（upsertUser）に失敗した認証済みユーザー。UI は使え、LINE 連携も開始できるため、
 *     users 行が無いまま有効な LINE 連携を持ちうる（src/features/auth/hooks/useInitializeUser.ts は失敗をログのみで継続する）。
 * したがって運用者は、dryRun の件数（orphanLinks / orphanRequests / orphanAuditLogs）が想定の退会者数と
 * 妥当に一致することを確認してから executeBatch を実行すること。想定より多い場合は実行せず、
 * 内訳を調べてから判断する。誤って消した連携は、本人が LINE 連携をやり直せば復旧する（データ損失は連携情報に限られる）。
 *
 * 実行手順（対象 deployment は Convex CLI の通常の指定方法で選ぶ。最初は非本番）:
 *   1. dry run（カウントのみ。continueCursor が null になるまで、返った値をそのまま cursor に渡して繰り返す）
 *      pnpm exec convex run orphanedLineLinkMigration:dryRun '{}'
 *      pnpm exec convex run orphanedLineLinkMigration:dryRun '{"cursor":"<continueCursor>"}'
 *   2. 実行（1 batch 後に自分自身を再スケジュールして全 phase を最後まで進む。何度実行しても冪等）
 *      pnpm exec convex run orphanedLineLinkMigration:executeBatch '{}'
 *   3. 検証（continueCursor が null になるまで繰り返し、
 *      remainingOrphanLinks / remainingOrphanRequests / remainingOrphanAuditLogs が全 page で 0 であること）
 *      pnpm exec convex run orphanedLineLinkMigration:verify '{}'
 *      pnpm exec convex run orphanedLineLinkMigration:verify '{"cursor":"<continueCursor>"}'
 *
 * ログ・戻り値は件数のみで、lineUserId や userId を含めない。
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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

const PHASES = ["links", "requests", "auditLogs"] as const;
type Phase = (typeof PHASES)[number];

/** cursor は "<phase>:<Convex cursor>"。省略は links の先頭。Convex cursor に ":" が含まれても最初の ":" だけで分割する。 */
function parseCursor(cursor: string | null | undefined): { phase: Phase; inner: string | null } {
  if (cursor === null || cursor === undefined) return { phase: "links", inner: null };
  const index = cursor.indexOf(":");
  const phase = PHASES.find((p) => p === cursor.slice(0, index));
  if (index < 0 || phase === undefined) throw new Error("invalid cursor");
  const inner = cursor.slice(index + 1);
  return { phase, inner: inner === "" ? null : inner };
}

function encodeCursor(phase: Phase, inner: string | null): string {
  return `${phase}:${inner ?? ""}`;
}

type PageRow = {
  id: Id<"lineAccountLinks"> | Id<"lineLinkRequests"> | Id<"lineLinkAuditLogs">;
  userId: string;
};
type PhasePage = { rows: PageRow[]; isDone: boolean; continueCursor: string };

async function loadPage(ctx: ReadCtx, phase: Phase, inner: string | null): Promise<PhasePage> {
  const opts = { cursor: inner, numItems: BATCH_SIZE };
  switch (phase) {
    case "links": {
      const page = await ctx.db.query("lineAccountLinks").paginate(opts);
      return { ...page, rows: page.page.map((d) => ({ id: d._id, userId: d.userId })) };
    }
    case "requests": {
      const page = await ctx.db.query("lineLinkRequests").paginate(opts);
      return { ...page, rows: page.page.map((d) => ({ id: d._id, userId: d.userId })) };
    }
    case "auditLogs": {
      const page = await ctx.db.query("lineLinkAuditLogs").paginate(opts);
      return { ...page, rows: page.page.map((d) => ({ id: d._id, userId: d.userId })) };
    }
  }
}

/** 次に渡す cursor。持ち越し中は同じ位置、phase が尽きたら次の phase の先頭、全 phase 完了で null。 */
function nextCursor(phase: Phase, page: PhasePage, retryCursor: string | null): string | null {
  if (retryCursor !== null) return retryCursor;
  if (!page.isDone) return encodeCursor(phase, page.continueCursor);
  const next = PHASES[PHASES.indexOf(phase) + 1];
  return next === undefined ? null : encodeCursor(next, null);
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
  // 読み取り上限(CHILD_LIMIT + 1)に達した場合、残りに進行中のリクエストがあるかを判断できない。
  // 削除は不可逆なので、判断できないときは孤立とみなさず安全側(削除しない)に倒す。
  const truncated = requests.length > CHILD_LIMIT;
  return inProgress || truncated ? "in_progress_deletion" : "orphan";
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
    phase: v.string(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    orphanLinks: v.number(),
    orphanRequests: v.number(),
    orphanAuditLogs: v.number(),
    skippedInProgressDeletion: v.number(),
    // links phase の子データ件数は孤立 userId ごとに CHILD_LIMIT 件で打ち切る概算（上限付き）。
    // requests / auditLogs phase はその page の孤立行数。links phase と重複しうる上限見積もりで、
    // 最終的な残件の判定は verify で行う。
    wouldDelete: countsValidator,
  }),
  handler: async (ctx, args) => {
    const { phase, inner } = parseCursor(args.cursor);
    const page = await loadPage(ctx, phase, inner);
    const wouldDelete = emptyChildCounts();
    const seenUsers = new Set<string>();
    let orphanLinks = 0;
    let orphanRequests = 0;
    let orphanAuditLogs = 0;
    let skippedInProgressDeletion = 0;
    for (const row of page.rows) {
      const state = await classifyUser(ctx, row.userId);
      if (state === "in_progress_deletion") skippedInProgressDeletion += 1;
      if (state !== "orphan") continue;
      if (phase === "requests") {
        orphanRequests += 1;
        wouldDelete.lineLinkRequests += 1;
        continue;
      }
      if (phase === "auditLogs") {
        orphanAuditLogs += 1;
        wouldDelete.lineLinkAuditLogs += 1;
        continue;
      }
      orphanLinks += 1;
      if (seenUsers.has(row.userId)) continue;
      seenUsers.add(row.userId);
      for (const table of CHILD_TABLES) {
        wouldDelete[table] += Math.min(
          (await takeChildren(ctx, table, row.userId)).length,
          CHILD_LIMIT,
        );
      }
    }
    const next = nextCursor(phase, page, null);
    return {
      phase,
      isDone: next === null,
      continueCursor: next,
      orphanLinks,
      orphanRequests,
      orphanAuditLogs,
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
  phase: v.string(),
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
  deletedLinks: v.number(),
  deferredLinks: v.number(),
  skippedLinks: v.number(),
  // requests / auditLogs phase で削除した孤立行数と、孤立でないため触れなかった行数。
  sweptRows: v.number(),
  skippedRows: v.number(),
  deleted: countsValidator,
});

export const executeBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: executeResultValidator,
  handler: async (ctx, args) => {
    const { phase, inner } = parseCursor(args.cursor);
    const page = await loadPage(ctx, phase, inner);
    const deleted = emptyChildCounts();
    let deletedLinks = 0;
    let deferredLinks = 0;
    let skippedLinks = 0;
    let sweptRows = 0;
    let skippedRows = 0;
    for (const row of page.rows) {
      if ((await classifyUser(ctx, row.userId)) !== "orphan") {
        if (phase === "links") skippedLinks += 1;
        else skippedRows += 1;
        continue;
      }
      if (phase !== "links") {
        // リンクを持たない孤立 userId の連携リクエスト / 監査ログ。page 内の行を直接削除する。
        await ctx.db.delete(row.id);
        deleted[phase === "requests" ? "lineLinkRequests" : "lineLinkAuditLogs"] += 1;
        sweptRows += 1;
        continue;
      }
      // 通知 job / event を含む子データをリンクより先に消す。上限超過なら次回に持ち越す。
      if (!(await deleteChildren(ctx, row.userId, deleted))) {
        deferredLinks += 1;
        continue;
      }
      await ctx.db.delete(row.id);
      deletedLinks += 1;
    }
    // 持ち越しがある間は同じ cursor を再実行する（削除が進むため必ず収束する）。
    const retryCursor = deferredLinks > 0 ? encodeCursor(phase, inner) : null;
    const next = nextCursor(phase, page, retryCursor);
    const isDone = next === null;
    console.log(
      `orphanedLineLinkMigration: phase=${phase} deletedLinks=${deletedLinks} deferredLinks=${deferredLinks} skippedLinks=${skippedLinks} sweptRows=${sweptRows} skippedRows=${skippedRows} done=${isDone}`,
    );
    if (next !== null) {
      await ctx.scheduler.runAfter(0, internal.orphanedLineLinkMigration.executeBatch, {
        cursor: next,
      });
    }
    return {
      phase,
      isDone,
      continueCursor: next,
      deletedLinks,
      deferredLinks,
      skippedLinks,
      sweptRows,
      skippedRows,
      deleted,
    };
  },
});

export const verify = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    phase: v.string(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    remainingOrphanLinks: v.number(),
    remainingOrphanRequests: v.number(),
    remainingOrphanAuditLogs: v.number(),
  }),
  handler: async (ctx, args) => {
    const { phase, inner } = parseCursor(args.cursor);
    const page = await loadPage(ctx, phase, inner);
    let remaining = 0;
    for (const row of page.rows) {
      if ((await classifyUser(ctx, row.userId)) === "orphan") remaining += 1;
    }
    const next = nextCursor(phase, page, null);
    return {
      phase,
      isDone: next === null,
      continueCursor: next,
      remainingOrphanLinks: phase === "links" ? remaining : 0,
      remainingOrphanRequests: phase === "requests" ? remaining : 0,
      remainingOrphanAuditLogs: phase === "auditLogs" ? remaining : 0,
    };
  },
});
