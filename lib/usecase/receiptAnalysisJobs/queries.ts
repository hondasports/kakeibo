import type { ReceiptAnalysisReader } from "../../domain/receiptAnalysisJobs/store";
import { ReceiptAnalysisJobDomainError } from "../../domain/receiptAnalysisJobs/rules";

export const listReceiptAnalysisBatches = (reader: ReceiptAnalysisReader, groupId: string) =>
  reader.listBatchesByGroup(groupId, 50);

export const listActiveReceiptAnalysisJobs = (reader: ReceiptAnalysisReader, groupId: string) =>
  reader.listActiveJobsByGroup(groupId, 100);

export async function listReceiptAnalysisJobsByBatch(
  reader: ReceiptAnalysisReader,
  groupId: string,
  batchId: string,
) {
  const batch = await reader.getBatch(batchId);
  if (!batch || batch.groupId !== groupId)
    throw new ReceiptAnalysisJobDomainError("Batch not found");
  return reader.listJobsByBatch(batchId);
}

export async function listReceiptAnalysisJobsByDraftIds(
  reader: ReceiptAnalysisReader,
  groupId: string,
  draftIds: string[],
) {
  const jobs = await Promise.all(
    [...new Set(draftIds)].map(async (draftId) => {
      const job = await reader.findJobByDraftId(draftId);
      return job?.groupId === groupId ? job : null;
    }),
  );
  return jobs.filter((job) => job !== null);
}
