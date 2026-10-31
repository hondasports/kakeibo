import { describe, expect, it, vi } from "vitest";
import type { ReceiptAnalysisJobRecord } from "../../domain/receiptAnalysisJobs/records";
import {
  MAX_RECEIPT_ANALYSIS_BATCH_FILES,
  ReceiptAnalysisJobDomainError,
} from "../../domain/receiptAnalysisJobs/rules";
import type { ReceiptAnalysisStore } from "../../domain/receiptAnalysisJobs/store";
import {
  createReceiptAnalysisBatch,
  finalizeReceiptAnalysisAttempt,
  deleteReceiptAnalysisDataByUserBatch,
  retryReceiptAnalysisJob,
  updateReceiptAnalysisJobStatus,
} from "./operations";

describe("createReceiptAnalysisBatch", () => {
  const fileNames = (count: number) =>
    Array.from({ length: count }, (_, index) => `receipt-${index}.png`);

  it("上限10件はbatchとjobを全件作成する", async () => {
    const jobs = new Map<string, ReceiptAnalysisJobRecord>();
    const store = {
      insertBatch: vi.fn().mockResolvedValue("batch-1"),
      insertJob: vi.fn().mockImplementation(async (fields: { imageIndex: number }) => {
        const id = `job-${fields.imageIndex}`;
        jobs.set(id, { id, ...fields } as ReceiptAnalysisJobRecord);
        return id;
      }),
      getJob: vi.fn().mockImplementation(async (id: string) => jobs.get(id) ?? null),
      getBatch: vi
        .fn()
        .mockResolvedValue({ id: "batch-1", totalCount: MAX_RECEIPT_ANALYSIS_BATCH_FILES }),
    } as unknown as ReceiptAnalysisStore;

    const result = await createReceiptAnalysisBatch(
      store,
      "group-1",
      "user-1",
      fileNames(MAX_RECEIPT_ANALYSIS_BATCH_FILES),
    );

    expect(result.jobs).toHaveLength(MAX_RECEIPT_ANALYSIS_BATCH_FILES);
    expect(store.insertBatch).toHaveBeenCalledTimes(1);
    expect(store.insertJob).toHaveBeenCalledTimes(MAX_RECEIPT_ANALYSIS_BATCH_FILES);
  });

  it("上限を超える11件はドメインエラーで拒否しbatchもjobも作らない", async () => {
    const store = {
      insertBatch: vi.fn(),
      insertJob: vi.fn(),
      getJob: vi.fn(),
      getBatch: vi.fn(),
    } as unknown as ReceiptAnalysisStore;

    await expect(
      createReceiptAnalysisBatch(
        store,
        "group-1",
        "user-1",
        fileNames(MAX_RECEIPT_ANALYSIS_BATCH_FILES + 1),
      ),
    ).rejects.toBeInstanceOf(ReceiptAnalysisJobDomainError);
    await expect(
      createReceiptAnalysisBatch(
        store,
        "group-1",
        "user-1",
        fileNames(MAX_RECEIPT_ANALYSIS_BATCH_FILES + 1),
      ),
    ).rejects.toThrow("一度に解析できるのは10枚までです");
    expect(store.insertBatch).not.toHaveBeenCalled();
    expect(store.insertJob).not.toHaveBeenCalled();
  });
});

describe("updateReceiptAnalysisJobStatus", () => {
  const deps = (store: Partial<ReceiptAnalysisStore>) => ({
    store: store as ReceiptAnalysisStore,
    scheduler: { scheduleAiReviewCheck: vi.fn() },
  });

  it.each(["ready", "running", "failed", "needs_review", "cancelled"] as const)(
    "status:%s の job は running を適用しない",
    async (status) => {
      const store = {
        getJob: vi.fn().mockResolvedValue({ status, groupId: "group-1", batchId: "batch-1" }),
        patchJob: vi.fn(),
      };
      const result = await updateReceiptAnalysisJobStatus(deps(store), {
        jobId: "job-1",
        status: "running",
      });
      expect(result).toEqual({ applied: false });
      expect(store.patchJob).not.toHaveBeenCalled();
    },
  );

  it("queued の job は running に遷移する", async () => {
    const store = {
      getJob: vi
        .fn()
        .mockResolvedValue({ status: "queued", groupId: "group-1", batchId: "batch-1" }),
      patchJob: vi.fn(),
    };
    const result = await updateReceiptAnalysisJobStatus(deps(store), {
      jobId: "job-1",
      status: "running",
    });
    expect(result).toEqual({ applied: true });
    expect(store.patchJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "running" }),
    );
  });

  it("queued 以外へ遷移する更新は job の status を見ない", async () => {
    const store = {
      getJob: vi
        .fn()
        .mockResolvedValue({ status: "running", groupId: "group-1", batchId: "batch-1" }),
      patchJob: vi.fn(),
      getBatch: vi.fn().mockResolvedValue(null),
    };
    const result = await updateReceiptAnalysisJobStatus(deps(store), {
      jobId: "job-1",
      status: "needs_review",
      draftId: "draft-1",
    });
    expect(result).toEqual({ applied: true });
  });
});

describe("receipt analysis domain errors", () => {
  it("retry 不可の job はドメインエラーで拒否する", async () => {
    const store = {
      getJob: vi.fn().mockResolvedValue({ status: "ready", groupId: "group-1" }),
    } as unknown as ReceiptAnalysisStore;
    await expect(retryReceiptAnalysisJob(store, "group-1", "job-1")).rejects.toBeInstanceOf(
      ReceiptAnalysisJobDomainError,
    );
    await expect(retryReceiptAnalysisJob(store, "group-1", "job-1")).rejects.toThrow(
      "Only failed or needs_review jobs can be retried",
    );
  });

  it("別グループの job は Job not found のドメインエラーで拒否する", async () => {
    const store = {
      getJob: vi.fn().mockResolvedValue({ status: "failed", groupId: "group-2" }),
    } as unknown as ReceiptAnalysisStore;
    await expect(retryReceiptAnalysisJob(store, "group-1", "job-1")).rejects.toBeInstanceOf(
      ReceiptAnalysisJobDomainError,
    );
    await expect(retryReceiptAnalysisJob(store, "group-1", "job-1")).rejects.toThrow(
      "Job not found",
    );
  });
});

it("100件を超えるjobを全て削除するまでbatchを保持する", async () => {
  const jobs: ReceiptAnalysisJobRecord[] = Array.from({ length: 101 }, (_, imageIndex) => ({
    id: `job-${imageIndex}`,
    creationTime: imageIndex,
    batchId: "batch-1",
    groupId: "group-1",
    imageIndex,
    fileName: `${imageIndex}.jpg`,
    status: "queued",
    createdAt: 1,
    updatedAt: 1,
  }));
  let batchDeleted = false;
  const deleteBatch = vi.fn(async () => {
    batchDeleted = true;
  });
  const store = {
    takeBatchesByGroupAndUser: async () =>
      batchDeleted
        ? []
        : [
            {
              id: "batch-1",
              creationTime: 1,
              groupId: "group-1",
              createdByUserId: "user-1",
              totalCount: 101,
              processedCount: 0,
              status: "queued",
              createdAt: 1,
              updatedAt: 1,
            },
          ],
    listJobsByBatch: async () => jobs.slice(0, 100),
    deleteJob: async (id: string) => {
      const index = jobs.findIndex((job) => job.id === id);
      if (index >= 0) jobs.splice(index, 1);
    },
    deleteBatch,
  } as unknown as ReceiptAnalysisStore;

  await expect(
    deleteReceiptAnalysisDataByUserBatch(store, {
      groupId: "group-1",
      userId: "user-1",
    }),
  ).resolves.toEqual({ deletedBatchCount: 0, deletedJobCount: 100, hasMore: true });
  expect(deleteBatch).not.toHaveBeenCalled();

  await expect(
    deleteReceiptAnalysisDataByUserBatch(store, {
      groupId: "group-1",
      userId: "user-1",
    }),
  ).resolves.toEqual({ deletedBatchCount: 1, deletedJobCount: 1, hasMore: false });
  expect(jobs).toHaveLength(0);
  expect(deleteBatch).toHaveBeenCalledOnce();
});

it("解析中にjobが削除されたら生成結果だけを片付けて終了する", async () => {
  const store = {
    getJob: vi.fn().mockResolvedValue(null),
    findJobByDraftId: vi.fn().mockResolvedValue(null),
    deleteDraftAndItems: vi.fn(),
    patchJob: vi.fn(),
  } as unknown as ReceiptAnalysisStore;
  await expect(
    finalizeReceiptAnalysisAttempt(
      { store, scheduler: { scheduleAiReviewCheck: vi.fn() } },
      {
        jobId: "deleted-job",
        groupId: "group-1",
        expectedDraftId: null,
        newDraftId: "generated-draft",
        status: "ready",
      },
    ),
  ).resolves.toEqual({ applied: false });
  expect(store.deleteDraftAndItems).toHaveBeenCalledWith("generated-draft", "group-1");
  expect(store.patchJob).not.toHaveBeenCalled();
});

it.each(["preserved", "linked"])("job消失時も%s draftを削除しない", async (kind) => {
  const store = {
    getJob: vi.fn().mockResolvedValue(null),
    findJobByDraftId: vi.fn().mockResolvedValue(kind === "linked" ? { id: "other-job" } : null),
    deleteDraftAndItems: vi.fn(),
  } as unknown as ReceiptAnalysisStore;
  await expect(
    finalizeReceiptAnalysisAttempt(
      { store, scheduler: { scheduleAiReviewCheck: vi.fn() } },
      {
        jobId: "deleted-job",
        groupId: "group-1",
        expectedDraftId: kind === "preserved" ? "draft" : null,
        newDraftId: "draft",
        status: "ready",
      },
    ),
  ).resolves.toEqual({ applied: false });
  expect(store.deleteDraftAndItems).not.toHaveBeenCalled();
});

it("旧actionからgroupIdなしで届く完了更新も受理する", async () => {
  const store = {
    getJob: vi
      .fn()
      .mockResolvedValue({ groupId: "group-1", draftId: "new-draft", status: "ready" }),
    deleteDraftAndItems: vi.fn(),
  } as unknown as ReceiptAnalysisStore;
  await expect(
    finalizeReceiptAnalysisAttempt(
      { store, scheduler: { scheduleAiReviewCheck: vi.fn() } },
      {
        jobId: "job",
        expectedDraftId: null,
        newDraftId: "new-draft",
        status: "ready",
      },
    ),
  ).resolves.toEqual({ applied: false });
  expect(store.deleteDraftAndItems).not.toHaveBeenCalled();
});

it("旧actionのjobが消失してgroupも不明なら推測でdraftを削除しない", async () => {
  const store = {
    getJob: vi.fn().mockResolvedValue(null),
    deleteDraftAndItems: vi.fn(),
  } as unknown as ReceiptAnalysisStore;
  await expect(
    finalizeReceiptAnalysisAttempt(
      { store, scheduler: { scheduleAiReviewCheck: vi.fn() } },
      {
        jobId: "job",
        expectedDraftId: null,
        newDraftId: "draft",
        status: "ready",
      },
    ),
  ).resolves.toEqual({ applied: false });
  expect(store.deleteDraftAndItems).not.toHaveBeenCalled();
});
