import type { ReceiptAnalysisReader } from "../../domain/receiptAnalysisJobs/store";

export const listReceiptAnalysisBatches = (reader: ReceiptAnalysisReader, groupId: string) =>
  reader.listBatchesByGroup(groupId, 50);

export const listReceiptAnalysisJobs = (reader: ReceiptAnalysisReader, groupId: string) =>
  reader.listJobsByGroup(groupId, 100);

export async function listReceiptAnalysisJobsByBatch(
  reader: ReceiptAnalysisReader,
  groupId: string,
  batchId: string,
) {
  const batch = await reader.getBatch(batchId);
  if (!batch || batch.groupId !== groupId) throw new Error("Batch not found");
  return reader.listJobsByBatch(batchId, 50);
}

export async function getReceiptAnalysisJobByDraftId(
  reader: ReceiptAnalysisReader,
  groupId: string,
  draftId: string,
) {
  const job = await reader.findJobByDraftId(draftId);
  return !job || job.groupId !== groupId ? null : job;
}
