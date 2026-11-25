import { ConvexError, v } from "convex/values";
import { RECEIPT_ANALYSIS_JOB_STATUSES } from "../../lib/domain/receiptAnalysisJobs/records";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  getReceiptAnalysisBatchDocument,
  getReceiptAnalysisJobDocument,
} from "../../lib/convex/receiptAnalysisJobs/convexReceiptAnalysisStore";
import { createReceiptAnalysisMutationDeps } from "../../lib/convex/receiptAnalysisJobs/receiptAnalysisDeps";
import { ReceiptAnalysisJobDomainError } from "../../lib/domain/receiptAnalysisJobs/rules";
import { getTodayDateStringInJapan } from "../../lib/domain/common/date";
import {
  isReceiptAnalysisDailyLimitReached,
  RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG,
  resolveEffectiveDailyUsageCount,
  withDailyLimitWarningTag,
} from "../../lib/domain/receiptAnalysisJobs/dailyUsage";
import {
  deleteReceiptAnalysisDataByUserBatch as deleteUserDataBatch,
  finalizeReceiptAnalysisAttempt,
  recomputeReceiptAnalysisBatchProgress,
  recoverStaleReceiptAnalysisJobs as recoverStaleJobs,
  scheduleAiReviewNotificationIfNeeded as scheduleNotification,
  updateReceiptAnalysisJobStatus,
} from "../../lib/usecase/receiptAnalysisJobs/operations";
import { requireGroupMembershipForGroup } from "../groups/membership";
import { toConvexEndpointError } from "../lib/errors";
import type { DraftResultImageJobStatus } from "../../lib/domain/receiptAnalysisJobs/status";
import { DRAFT_RESULT_IMAGE_JOB_STATUSES } from "../../lib/domain/receiptAnalysisJobs/status";

export { isTerminalImageJobStatus } from "../../lib/domain/receiptAnalysisJobs/status";

function convexError(error: unknown): never {
  toConvexEndpointError(error, [ReceiptAnalysisJobDomainError]);
}

export async function getBatchByIdHandler(
  ctx: QueryCtx,
  { batchId }: { batchId: Id<"receiptAnalysisBatches"> },
) {
  return await getReceiptAnalysisBatchDocument(ctx, batchId);
}

export async function scheduleAiReviewNotificationIfNeeded(
  ctx: MutationCtx,
  { batchId, status }: { batchId: Id<"receiptAnalysisBatches">; status: string },
) {
  await scheduleNotification(createReceiptAnalysisMutationDeps(ctx), batchId, status);
}

export async function updateJobStatusHandler(
  ctx: MutationCtx,
  args: {
    jobId: Id<"receiptAnalysisImageJobs">;
    status: "running" | "ready" | "needs_review" | "failed";
    draftId?: Id<"aiExpenseDrafts">;
    error?: string;
    expectedDraftId?: Id<"aiExpenseDrafts"> | null;
  },
) {
  try {
    if (args.status === "running") {
      // 有料解析の開始確定と日次上限の消費を同一 mutation で行う。
      // usecase 側の遷移ガード（queued かつ expectedDraftId 一致）と同じ条件のときだけ枠を消費し、
      // 重複起動や状態遷移済みの job では消費しない。同一トランザクション内なので読み書きの間に状態は変わらない。
      const job = await ctx.db.get(args.jobId);
      const expectedMatches =
        args.expectedDraftId === undefined || (job?.draftId ?? null) === args.expectedDraftId;
      if (job && job.status === "queued" && expectedMatches) {
        // 開始確定と同じ transaction で認証済み主体の所属を確認する。action 側の確認後に
        // 所属が変わったケースもここで拒否でき、失敗下書きの作成者を利用者単位に保てる。
        // 所属・グループを確認できない場合は throw して開始を確定しない（書き込み前なので
        // rollback してよい）。
        const membership = await requireGroupMembershipForGroup(ctx, job.groupId);
        const group = await ctx.db.get(job.groupId);
        if (!group) throw new ConvexError("グループが見つかりません");
        const now = Date.now();
        const todayJstDate = getTodayDateStringInJapan(now);
        const effectiveCount = resolveEffectiveDailyUsageCount(
          group.receiptAnalysisDailyUsage ?? null,
          todayJstDate,
        );
        if (isReceiptAnalysisDailyLimitReached(effectiveCount)) {
          // 上限到達時は有料解析を行わず job を failed に確定し、バッチを整合させる。
          // 通常の解析失敗と同じく失敗下書きを作り、失敗表示・再試行・通知の既存経路に乗せる。
          // 再試行元の下書きがある場合は新しい下書きで置き換えず、既存の下書きを保持する。
          // ここでは throw せず戻り値で拒否理由を返す。throw すると job 確定ごと rollback する。
          const deps = createReceiptAnalysisMutationDeps(ctx);
          let failedDraftId = job.draftId;
          if (failedDraftId === undefined) {
            failedDraftId = (await deps.store.insertFailedAnalysisDraft({
              groupId: job.groupId,
              createdByUserId: membership.userId,
              imageFileName: job.fileName,
              warning: RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG,
            })) as Id<"aiExpenseDrafts">;
          }
          // 保持する既存下書きにはタグを再度付けて、上限による案内がカードに残るようにする。
          // 下書きの内容や他の警告は保持する。
          if (job.draftId !== undefined) {
            const preservedDraft = await deps.store.getDraft(job.draftId);
            // job の参照に旧データの不整合があっても、他グループの下書きの警告は更新しない
            if (preservedDraft && preservedDraft.groupId === job.groupId) {
              await deps.store.setDraftWarnings(
                job.draftId,
                withDailyLimitWarningTag(preservedDraft.warnings ?? []),
              );
            }
          }
          await ctx.db.patch(args.jobId, {
            status: "failed",
            draftId: failedDraftId,
            error: RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG,
            updatedAt: now,
          });
          // 終端確定なので batch の進捗を job の実状態から再計算する。
          // 停止回復を経た再試行（初回が未計上）でも終端が件数へ反映され、バッチは待ち状態に残らない。
          await recomputeReceiptAnalysisBatchProgress(deps.store, job.batchId, now);
          // 通常の解析失敗と同じく、確認を促す通知のスケジュール経路にも乗せる
          await scheduleNotification(deps, job.batchId, "failed", now);
          return { applied: false, denialReason: "daily_limit" as const };
        }
        await ctx.db.patch(group._id, {
          receiptAnalysisDailyUsage: {
            jstDate: todayJstDate,
            count: effectiveCount + 1,
            updatedAt: now,
          },
        });
      }
    }
    return await updateReceiptAnalysisJobStatus(createReceiptAnalysisMutationDeps(ctx), args);
  } catch (error) {
    convexError(error);
  }
}

export async function finalizeAnalysisAttemptHandler(
  ctx: MutationCtx,
  args: {
    jobId: Id<"receiptAnalysisImageJobs">;
    groupId?: Id<"groups">;
    expectedDraftId: Id<"aiExpenseDrafts"> | null;
    expectedDraftUpdatedAt?: number;
    newDraftId: Id<"aiExpenseDrafts">;
    status: DraftResultImageJobStatus;
    error?: string;
  },
) {
  try {
    return await finalizeReceiptAnalysisAttempt(createReceiptAnalysisMutationDeps(ctx), args);
  } catch (error) {
    convexError(error);
  }
}

export async function recomputeBatchProgressHandler(
  ctx: MutationCtx,
  args: { batchId: Id<"receiptAnalysisBatches"> },
) {
  try {
    await recomputeReceiptAnalysisBatchProgress(
      createReceiptAnalysisMutationDeps(ctx).store,
      args.batchId,
    );
  } catch (error) {
    convexError(error);
  }
}

export async function getJobByIdHandler(
  ctx: QueryCtx,
  { jobId }: { jobId: Id<"receiptAnalysisImageJobs"> },
) {
  const job = await getReceiptAnalysisJobDocument(ctx, jobId);
  if (!job) throw new ConvexError("Job not found");
  return job;
}

export async function deleteReceiptAnalysisDataByUserBatchHandler(
  ctx: MutationCtx,
  args: { groupId: Id<"groups">; userId: string; limit?: number },
) {
  return deleteUserDataBatch(createReceiptAnalysisMutationDeps(ctx).store, args);
}

export async function recoverStaleReceiptAnalysisJobsHandler(ctx: MutationCtx) {
  return await recoverStaleJobs(createReceiptAnalysisMutationDeps(ctx));
}

const jobStatusValidator = v.union(
  ...RECEIPT_ANALYSIS_JOB_STATUSES.map((status) => v.literal(status)),
);

export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("receiptAnalysisImageJobs"),
    status: jobStatusValidator,
    draftId: v.optional(v.id("aiExpenseDrafts")),
    error: v.optional(v.string()),
    expectedDraftId: v.optional(v.union(v.id("aiExpenseDrafts"), v.null())),
  },
  handler: updateJobStatusHandler,
});

const draftResultImageJobStatusValidator = v.union(
  ...DRAFT_RESULT_IMAGE_JOB_STATUSES.map((status) => v.literal(status)),
);

export const finalizeAnalysisAttempt = internalMutation({
  args: {
    jobId: v.id("receiptAnalysisImageJobs"),
    groupId: v.optional(v.id("groups")),
    expectedDraftId: v.union(v.id("aiExpenseDrafts"), v.null()),
    expectedDraftUpdatedAt: v.optional(v.number()),
    newDraftId: v.id("aiExpenseDrafts"),
    status: draftResultImageJobStatusValidator,
    error: v.optional(v.string()),
  },
  handler: finalizeAnalysisAttemptHandler,
});

export const recomputeBatchProgress = internalMutation({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: recomputeBatchProgressHandler,
});

// デプロイ開始前に起動した旧 analyzeImageJob action は、処理終了時に旧2 mutation 名を
// 別トランザクションの runMutation で呼ぶ。Convex のデプロイをまたいでも job 終端後の
// バッチ更新が失敗しないよう、旧名と旧 {batchId} 引数を冪等な再計算へ接続して維持する。
// 再計算は job の実状態から導くため、旧経路が2つを順に呼んでも件数を重複加算しない。
export const incrementBatchProcessedCount = internalMutation({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: recomputeBatchProgressHandler,
});

export const finalizeBatchStatus = internalMutation({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: recomputeBatchProgressHandler,
});

export const getBatchById = internalQuery({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: getBatchByIdHandler,
});

export const getJobById = internalQuery({
  args: { jobId: v.id("receiptAnalysisImageJobs") },
  handler: getJobByIdHandler,
});

export const deleteReceiptAnalysisDataByUserBatch = internalMutation({
  args: {
    groupId: v.id("groups"),
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: deleteReceiptAnalysisDataByUserBatchHandler,
});

export const recoverStaleReceiptAnalysisJobs = internalMutation({
  args: {},
  handler: recoverStaleReceiptAnalysisJobsHandler,
});
