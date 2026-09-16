import { expect, it, vi } from "vitest";
import type { ReceiptAnalysisJobRecord } from "../../domain/receiptAnalysisJobs/records";
import type { ReceiptAnalysisStore } from "../../domain/receiptAnalysisJobs/store";
import { deleteReceiptAnalysisDataByUserBatch } from "./operations";

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
