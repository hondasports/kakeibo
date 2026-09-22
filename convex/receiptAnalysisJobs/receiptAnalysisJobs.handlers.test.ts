import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  countNeedsReviewJobsByBatchIdHandler,
  deleteReceiptAnalysisDataByUserBatchHandler,
  finalizeAnalysisAttemptHandler,
  finalizeBatchStatusHandler,
  getBatchByIdHandler,
  getJobByIdHandler,
  incrementBatchProcessedCountHandler,
  scheduleAiReviewNotificationIfNeeded,
  updateJobStatusHandler,
} from "./internal";
import { cancelImageJobHandler, createBatchHandler, retryImageJobHandler } from "./mutations";
import { listBatchesHandler, listJobsByBatchHandler } from "./queries";
import {
  GROUP_ID,
  createIdentity,
  createInternalCtx,
  createMutationCtx,
  createQueryCtx,
} from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

describe("createBatchHandler", () => {
  it("未認証ユーザーは実行できない", async () => {
    const ctx = createMutationCtx(null);
    await expect(createBatchHandler(ctx, { fileNames: ["a.png"] })).rejects.toThrow(ConvexError);
  });

  it("空の fileNames は拒否する", async () => {
    const ctx = createMutationCtx(createIdentity());
    await expect(createBatchHandler(ctx, { fileNames: [] })).rejects.toThrow(ConvexError);
  });

  it("batch と jobs を作成する", async () => {
    const identity = createIdentity();
    const ctx = createMutationCtx(identity, {
      docs: {
        "new-batch-id": { _id: "new-batch-id", groupId: GROUP_ID },
        "new-job-id-0": { _id: "new-job-id-0", groupId: GROUP_ID },
        "new-job-id-1": { _id: "new-job-id-1", groupId: GROUP_ID },
      },
    });
    const result = await createBatchHandler(ctx, { fileNames: ["a.png", "b.png"] });
    expect(result.batch).toBeTruthy();
    expect(result.jobs).toHaveLength(2);
    expect(ctx.db.insert).toHaveBeenCalledTimes(3); // batch + 2 jobs
    expect(ctx.db.insert).toHaveBeenNthCalledWith(
      1,
      "receiptAnalysisBatches",
      expect.objectContaining({ createdByUserId: identity.tokenIdentifier }),
    );
  });
});

describe("listBatchesHandler", () => {
  it("未認証ユーザーは実行できない", async () => {
    const ctx = createQueryCtx(null);
    await expect(listBatchesHandler(ctx)).rejects.toThrow(ConvexError);
  });
});

describe("listJobsByBatchHandler", () => {
  it("未認証ユーザーは実行できない", async () => {
    const ctx = createQueryCtx(null);
    await expect(
      listJobsByBatchHandler(ctx, { batchId: "batch-1" as Id<"receiptAnalysisBatches"> }),
    ).rejects.toThrow(ConvexError);
  });

  it("他グループの batch は拒否する", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      docs: {
        "batch-1": { groupId: "group-other", _id: "batch-1" },
      },
    });
    await expect(
      listJobsByBatchHandler(ctx, { batchId: "batch-1" as Id<"receiptAnalysisBatches"> }),
    ).rejects.toThrow(ConvexError);
  });
});

describe("retryImageJobHandler", () => {
  it("未認証ユーザーは実行できない", async () => {
    const ctx = createMutationCtx(null);
    await expect(
      retryImageJobHandler(ctx, { jobId: "job-1" as Id<"receiptAnalysisImageJobs"> }),
    ).rejects.toThrow(ConvexError);
  });

  it("failed と needs_review 以外の job は再試行できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": { groupId: GROUP_ID, status: "ready" },
      },
    });
    await expect(
      retryImageJobHandler(ctx, { jobId: "job-1" as Id<"receiptAnalysisImageJobs"> }),
    ).rejects.toThrow("Only failed or needs_review jobs can be retried");
  });

  it("failed job を queued に戻す", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": { groupId: GROUP_ID, status: "failed" },
      },
    });
    await retryImageJobHandler(ctx, { jobId: "job-1" as Id<"receiptAnalysisImageJobs"> });
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "queued", error: undefined }),
    );
  });

  it("needs_review job を queued に戻して再解析できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": { groupId: GROUP_ID, status: "needs_review" },
      },
    });

    await retryImageJobHandler(ctx, { jobId: "job-1" as Id<"receiptAnalysisImageJobs"> });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "queued", error: undefined }),
    );
  });

  it("needs_review でも他グループの job は再試行できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": { groupId: "group-other", status: "needs_review" },
      },
    });

    await expect(
      retryImageJobHandler(ctx, { jobId: "job-1" as Id<"receiptAnalysisImageJobs"> }),
    ).rejects.toThrow("Job not found");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("queued job は二重に再試行できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": { groupId: GROUP_ID, status: "queued" },
      },
    });

    await expect(
      retryImageJobHandler(ctx, { jobId: "job-1" as Id<"receiptAnalysisImageJobs"> }),
    ).rejects.toThrow("Only failed or needs_review jobs can be retried");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});

describe("cancelImageJobHandler", () => {
  it("未認証ユーザーは実行できない", async () => {
    const ctx = createMutationCtx(null);
    await expect(
      cancelImageJobHandler(ctx, { jobId: "job-1" as Id<"receiptAnalysisImageJobs"> }),
    ).rejects.toThrow(ConvexError);
  });

  it("running job を cancelled にしてキューから外せる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": {
          _id: "job-1",
          groupId: GROUP_ID,
          status: "running",
        },
      },
    });

    await cancelImageJobHandler(ctx, { jobId: "job-1" as Id<"receiptAnalysisImageJobs"> });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "cancelled", draftId: undefined }),
    );
  });

  it("draft 付き failed job は下書きと明細を削除して cancelled にする", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": {
          _id: "job-1",
          groupId: GROUP_ID,
          status: "failed",
          draftId: "draft-1",
        },
        "draft-1": {
          _id: "draft-1",
          groupId: GROUP_ID,
          status: "failed",
        },
      },
      queryResult: [{ _id: "item-1" }],
    });

    await cancelImageJobHandler(ctx, { jobId: "job-1" as Id<"receiptAnalysisImageJobs"> });

    expect(ctx.db.delete).toHaveBeenCalledWith("item-1");
    expect(ctx.db.delete).toHaveBeenCalledWith("draft-1");
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "cancelled" }),
    );
  });
});

describe("updateJobStatusHandler", () => {
  it("cancelled job に後続の解析結果が戻っても draft を残さない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": {
          _id: "job-1",
          groupId: GROUP_ID,
          status: "cancelled",
        },
        "draft-1": {
          _id: "draft-1",
          groupId: GROUP_ID,
          status: "ready",
        },
      },
      queryResult: [{ _id: "item-1" }],
    });

    await updateJobStatusHandler(ctx, {
      jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
      status: "ready",
      draftId: "draft-1" as Id<"aiExpenseDrafts">,
    });

    expect(ctx.db.delete).toHaveBeenCalledWith("item-1");
    expect(ctx.db.delete).toHaveBeenCalledWith("draft-1");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("job が needs_review になったら batch に 60 分後の通知をスケジュールする", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": {
          _id: "job-1",
          groupId: GROUP_ID,
          batchId: "batch-1",
          status: "running",
        },
        "batch-1": {
          _id: "batch-1",
          groupId: GROUP_ID,
          createdByUserId: "https://issuer.example|user-001",
        },
      },
    });

    await updateJobStatusHandler(ctx, {
      jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
      status: "needs_review",
      draftId: "draft-1" as Id<"aiExpenseDrafts">,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "needs_review" }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ aiReviewNotificationScheduledAt: expect.any(Number) }),
    );
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(
      60 * 60 * 1000,
      expect.anything(),
      expect.objectContaining({ batchId: "batch-1" }),
    );
  });

  it("通知スケジュール済みの batch には重複スケジュールしない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": {
          _id: "job-1",
          groupId: GROUP_ID,
          batchId: "batch-1",
          status: "running",
        },
        "batch-1": {
          _id: "batch-1",
          groupId: GROUP_ID,
          createdByUserId: "https://issuer.example|user-001",
          aiReviewNotificationScheduledAt: 1000,
        },
      },
    });

    await updateJobStatusHandler(ctx, {
      jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
      status: "needs_review",
      draftId: "draft-1" as Id<"aiExpenseDrafts">,
    });

    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("running への遷移では通知をスケジュールしない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": {
          _id: "job-1",
          groupId: GROUP_ID,
          batchId: "batch-1",
          status: "queued",
        },
        "batch-1": {
          _id: "batch-1",
          groupId: GROUP_ID,
          createdByUserId: "https://issuer.example|user-001",
        },
      },
    });

    await updateJobStatusHandler(ctx, {
      jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
      status: "running",
    });

    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("期待した旧draftから既に切り替わっていれば遅延startを拒否する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      docs: {
        "job-1": {
          _id: "job-1",
          groupId: GROUP_ID,
          batchId: "batch-1",
          status: "ready",
          draftId: "draft-new",
        },
      },
    });

    const result = await updateJobStatusHandler(ctx, {
      jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
      status: "running",
      expectedDraftId: "draft-old" as Id<"aiExpenseDrafts">,
    });

    expect(result).toEqual({ applied: false });
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});

describe("finalizeAnalysisAttemptHandler", () => {
  it("成功attemptだけがjobを切り替え、後着の失敗attemptは自分のdraftだけ片付ける", async () => {
    const docs = new Map<string, Record<string, unknown>>([
      [
        "job-1",
        {
          _id: "job-1",
          groupId: GROUP_ID,
          batchId: "batch-1",
          status: "running",
          draftId: "draft-old",
        },
      ],
      ["batch-1", { _id: "batch-1", processedCount: 0, totalCount: 1 }],
      ["draft-old", { _id: "draft-old", groupId: GROUP_ID }],
      ["draft-success", { _id: "draft-success", groupId: GROUP_ID }],
      ["draft-failed", { _id: "draft-failed", groupId: GROUP_ID }],
    ]);
    const removed: string[] = [];
    const ctx = {
      db: {
        get: vi.fn(async (id: string) => docs.get(id) ?? null),
        patch: vi.fn(async (id: string, values: Record<string, unknown>) => {
          docs.set(id, { ...(docs.get(id) ?? {}), ...values });
        }),
        delete: vi.fn(async (id: string) => {
          removed.push(id);
          docs.delete(id);
        }),
        query: vi.fn(() => ({
          withIndex: vi.fn(() => ({
            collect: vi.fn(async () => []),
            order: vi.fn(() => ({ take: vi.fn(async () => []) })),
          })),
        })),
      },
      scheduler: { runAfter: vi.fn() },
    } as unknown as MutationCtx;

    const success = await finalizeAnalysisAttemptHandler(ctx, {
      jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
      expectedDraftId: "draft-old" as Id<"aiExpenseDrafts">,
      newDraftId: "draft-success" as Id<"aiExpenseDrafts">,
      status: "ready",
    });
    const staleFailure = await finalizeAnalysisAttemptHandler(ctx, {
      jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
      expectedDraftId: "draft-old" as Id<"aiExpenseDrafts">,
      newDraftId: "draft-failed" as Id<"aiExpenseDrafts">,
      status: "failed",
      error: "遅延失敗",
    });

    expect(success).toEqual({ applied: true });
    expect(staleFailure).toEqual({ applied: false });
    expect(docs.get("job-1")).toMatchObject({ status: "ready", draftId: "draft-success" });
    expect(removed).toEqual(expect.arrayContaining(["draft-old", "draft-failed"]));
    expect(removed).not.toContain("draft-success");
  });

  it("旧draftが編集中に変わっていれば再解析結果で上書きしない", async () => {
    const docs = new Map<string, Record<string, unknown>>([
      [
        "job-1",
        {
          _id: "job-1",
          groupId: GROUP_ID,
          batchId: "batch-1",
          status: "running",
          draftId: "draft-old",
        },
      ],
      [
        "batch-1",
        {
          _id: "batch-1",
          aiReviewNotificationScheduledAt: 1,
        },
      ],
      [
        "draft-old",
        {
          _id: "draft-old",
          groupId: GROUP_ID,
          status: "needs_review",
          updatedAt: 11,
        },
      ],
      [
        "draft-new",
        {
          _id: "draft-new",
          groupId: GROUP_ID,
          status: "ready",
          updatedAt: 20,
        },
      ],
    ]);
    const removed: string[] = [];
    const ctx = {
      db: {
        get: vi.fn(async (id: string) => docs.get(id) ?? null),
        patch: vi.fn(async (id: string, values: Record<string, unknown>) => {
          docs.set(id, { ...(docs.get(id) ?? {}), ...values });
        }),
        delete: vi.fn(async (id: string) => {
          removed.push(id);
          docs.delete(id);
        }),
        query: vi.fn(() => ({
          withIndex: vi.fn(() => ({ collect: vi.fn(async () => []) })),
        })),
      },
      scheduler: { runAfter: vi.fn() },
    } as unknown as MutationCtx;

    const result = await finalizeAnalysisAttemptHandler(ctx, {
      jobId: "job-1" as Id<"receiptAnalysisImageJobs">,
      expectedDraftId: "draft-old" as Id<"aiExpenseDrafts">,
      expectedDraftUpdatedAt: 10,
      newDraftId: "draft-new" as Id<"aiExpenseDrafts">,
      status: "ready",
    });

    expect(result).toEqual({ applied: false, reason: "draft_changed" });
    expect(docs.get("job-1")).toMatchObject({
      status: "needs_review",
      draftId: "draft-old",
    });
    expect(removed).toContain("draft-new");
    expect(removed).not.toContain("draft-old");
  });
});

describe("receipt analysis internal handlers", () => {
  it("batch/job取得とneeds_review件数を処理する", async () => {
    const batch = { _id: "batch-1", processedCount: 0, totalCount: 2 };
    const job = { _id: "job-1", batchId: "batch-1", status: "needs_review" };
    const ctx = createInternalCtx({
      docs: { "batch-1": batch, "job-1": job },
      jobs: [job, { status: "ready" }],
    });

    await expect(
      getBatchByIdHandler(ctx, { batchId: "batch-1" as Id<"receiptAnalysisBatches"> }),
    ).resolves.toBe(batch);
    await expect(
      getJobByIdHandler(ctx, { jobId: "job-1" as Id<"receiptAnalysisImageJobs"> }),
    ).resolves.toBe(job);
    await expect(
      countNeedsReviewJobsByBatchIdHandler(ctx, {
        batchId: "batch-1" as Id<"receiptAnalysisBatches">,
      }),
    ).resolves.toBe(1);
    await expect(
      getJobByIdHandler(createInternalCtx(), {
        jobId: "missing" as Id<"receiptAnalysisImageJobs">,
      }),
    ).rejects.toThrow("Job not found");
  });

  it("終端状態で未スケジュールのbatchだけ通知を予約する", async () => {
    const ctx = createInternalCtx({
      docs: { "batch-1": { _id: "batch-1" } },
    });

    await scheduleAiReviewNotificationIfNeeded(ctx, {
      batchId: "batch-1" as Id<"receiptAnalysisBatches">,
      status: "running",
    });
    expect(ctx.db.patch).not.toHaveBeenCalled();

    await scheduleAiReviewNotificationIfNeeded(ctx, {
      batchId: "batch-1" as Id<"receiptAnalysisBatches">,
      status: "failed",
    });
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ aiReviewNotificationScheduledAt: expect.any(Number) }),
    );
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);

    await scheduleAiReviewNotificationIfNeeded(ctx, {
      batchId: "missing" as Id<"receiptAnalysisBatches">,
      status: "failed",
    });
  });

  it("batch処理件数を増やし、未完了・実行中・失敗の状態を分岐する", async () => {
    const ctx = createInternalCtx({
      docs: {
        "batch-1": { _id: "batch-1", processedCount: 0, totalCount: 1 },
        "batch-incomplete": { _id: "batch-incomplete", processedCount: 0, totalCount: 2 },
        "batch-running": { _id: "batch-running", processedCount: 1, totalCount: 1 },
        "batch-failed": { _id: "batch-failed", processedCount: 1, totalCount: 1 },
      },
      jobs: [{ status: "failed" }],
    });

    await incrementBatchProcessedCountHandler(ctx, {
      batchId: "batch-1" as Id<"receiptAnalysisBatches">,
    });
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "batch-1",
      expect.objectContaining({ processedCount: 1, status: "running" }),
    );
    await expect(
      incrementBatchProcessedCountHandler(createInternalCtx(), {
        batchId: "missing" as Id<"receiptAnalysisBatches">,
      }),
    ).rejects.toThrow("Batch not found");

    await finalizeBatchStatusHandler(ctx, {
      batchId: "batch-incomplete" as Id<"receiptAnalysisBatches">,
    });
    await finalizeBatchStatusHandler(ctx, {
      batchId: "batch-running" as Id<"receiptAnalysisBatches">,
    });
    await finalizeBatchStatusHandler(ctx, {
      batchId: "batch-failed" as Id<"receiptAnalysisBatches">,
    });
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "batch-failed",
      expect.objectContaining({ status: "partially_failed" }),
    );
    await finalizeBatchStatusHandler(ctx, {
      batchId: "missing" as Id<"receiptAnalysisBatches">,
    });
    await expect(
      updateJobStatusHandler(createInternalCtx(), {
        jobId: "missing" as Id<"receiptAnalysisImageJobs">,
        status: "ready",
      }),
    ).rejects.toThrow("Job not found");
  });

  it("ユーザー所有の解析データを上限付きで削除する", async () => {
    const ctx = createInternalCtx({
      batches: [{ _id: "batch-1" }, { _id: "batch-2" }],
      jobs: [{ _id: "job-1" }, { _id: "job-2" }],
    });

    await expect(
      deleteReceiptAnalysisDataByUserBatchHandler(ctx, {
        groupId: "group-1" as Id<"groups">,
        userId: "user-1",
        limit: 1,
      }),
    ).resolves.toEqual({ deletedBatchCount: 1, deletedJobCount: 2, hasMore: true });
    expect(ctx.db.delete).toHaveBeenCalledWith("job-1");
    expect(ctx.db.delete).toHaveBeenCalledWith("batch-1");
  });
});
