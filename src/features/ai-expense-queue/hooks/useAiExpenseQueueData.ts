import { useMemo } from "react";
import { useQuery } from "convex/react";
import { listByStatusApi } from "../../../lib/repositories/aiExpenseDrafts";
import { listJobsApi } from "../../../lib/repositories/receiptAnalysisJobs";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { getSectionKey } from "../../receipt-review/components/labels";
import { getImageCaptureFailureHint } from "../../../../lib/domain/aiExpenseDrafts/failure";
import { mapDraftToQueueItem } from "../../receipt-review/utils/mappers";
import type {
  AiExpenseQueueBatchSummary,
  AiExpenseQueueCategory,
  AiExpenseQueueItem,
  AiExpenseUploadBatch,
} from "../types/types";
import type { AiExpenseDraft } from "../../receipt-review/types/types";

export function useAiExpenseQueueData({
  categories,
  hiddenItemIds,
  pendingImageDataUrls,
  sessionBatches,
  initialItems,
}: {
  categories: AiExpenseQueueCategory[];
  hiddenItemIds: string[];
  pendingImageDataUrls: Map<string, string>;
  sessionBatches: AiExpenseUploadBatch[];
  initialItems?: AiExpenseQueueItem[];
}) {
  const readyDrafts = useQuery(listByStatusApi(), { status: "ready" }) as
    | AiExpenseDraft[]
    | undefined;
  const needsReviewDrafts = useQuery(listByStatusApi(), {
    status: "needs_review",
  }) as AiExpenseDraft[] | undefined;
  const failedDrafts = useQuery(listByStatusApi(), { status: "failed" }) as
    | AiExpenseDraft[]
    | undefined;
  const registeredDrafts = useQuery(listByStatusApi(), {
    status: "registered",
  }) as AiExpenseDraft[] | undefined;
  const jobs = useQuery(listJobsApi()) as Doc<"receiptAnalysisImageJobs">[] | undefined;
  const jobByDraftId = useMemo(() => {
    const result = new Map<string, Doc<"receiptAnalysisImageJobs">>();
    for (const job of jobs ?? []) {
      if (job.draftId) {
        result.set(job.draftId, job);
      }
    }
    return result;
  }, [jobs]);

  const processingItems = useMemo(() => {
    return (jobs ?? [])
      .filter((job) => job.status === "queued" || job.status === "running")
      .map((job): AiExpenseQueueItem => ({
        id: job._id,
        fileName: job.fileName,
        jobId: job._id,
        batchId: job.batchId,
        previewImageDataUrl: pendingImageDataUrls.get(job._id),
        status: job.status === "queued" ? "queued" : "analyzing",
        documentType: "unknown",
      }));
  }, [jobs, pendingImageDataUrls]);

  const initialItemsWithSessionData = useMemo(
    () =>
      initialItems?.map((item) => {
        const job = jobByDraftId.get(item.id);
        return {
          ...item,
          jobId: item.jobId ?? job?._id,
          batchId: item.batchId ?? job?.batchId,
          previewImageDataUrl:
            item.previewImageDataUrl ?? (job ? pendingImageDataUrls.get(job._id) : undefined),
          failureHint:
            item.failureHint ??
            (item.status === "failed"
              ? getImageCaptureFailureHint("failed", item.warnings)
              : undefined),
        };
      }),
    [initialItems, jobByDraftId, pendingImageDataUrls],
  );

  const liveItems = useMemo(() => {
    const mapDraft = (draft: AiExpenseDraft): AiExpenseQueueItem => {
      const job = jobByDraftId.get(draft._id);
      return {
        ...mapDraftToQueueItem(draft, {}, categories, pendingImageDataUrls.get(job?._id ?? "")),
        jobId: job?._id,
        batchId: job?.batchId,
      };
    };

    return [
      ...processingItems,
      ...(readyDrafts ?? []).map(mapDraft),
      ...(needsReviewDrafts ?? []).map(mapDraft),
      ...(failedDrafts ?? []).map(mapDraft),
      ...(registeredDrafts ?? []).map(mapDraft),
    ];
  }, [
    processingItems,
    failedDrafts,
    needsReviewDrafts,
    readyDrafts,
    registeredDrafts,
    categories,
    jobByDraftId,
    pendingImageDataUrls,
  ]);

  const items = useMemo(() => {
    if (initialItemsWithSessionData && initialItemsWithSessionData.length > 0) {
      return [...initialItemsWithSessionData, ...processingItems].filter(
        (item) => !hiddenItemIds.includes(item.id),
      );
    }
    return liveItems.filter((item) => !hiddenItemIds.includes(item.id));
  }, [hiddenItemIds, initialItemsWithSessionData, processingItems, liveItems]);
  const readySectionItems = useMemo(
    () => items.filter((item) => getSectionKey(item.status) === "ready"),
    [items],
  );
  const readyItems = useMemo(() => items.filter((item) => item.status === "ready"), [items]);
  const readyItemIds = useMemo(() => readyItems.map((item) => item.id), [readyItems]);
  const groupedItems = {
    processing: items.filter((item) => getSectionKey(item.status) === "processing"),
    ready: readySectionItems,
    needs_review: items.filter((item) => getSectionKey(item.status) === "needs_review"),
    failed: items.filter((item) => getSectionKey(item.status) === "failed"),
    registered: items.filter((item) => getSectionKey(item.status) === "registered"),
  };
  const clearableItems = items.filter(
    (item) => item.status !== "registered" && item.status !== "registering",
  );
  const sessionBatchIds = useMemo(
    () => new Set(sessionBatches.map((batch) => batch.batchId)),
    [sessionBatches],
  );
  const unbatchedReadyItems = readyItems.filter(
    (item) => !item.batchId || !sessionBatchIds.has(item.batchId),
  );
  const sessionBatchSummaries = useMemo<AiExpenseQueueBatchSummary[]>(() => {
    const itemByJobId = new Map<string, AiExpenseQueueItem>();
    for (const item of items) {
      if (item.jobId) {
        itemByJobId.set(item.jobId, item);
      }
    }

    return sessionBatches.flatMap((batch) => {
      const batchItems = batch.jobIds.flatMap((jobId) => {
        const item = itemByJobId.get(jobId);
        return item ? [item] : [];
      });
      const readyItems = batchItems.filter((item) => item.status === "ready");
      const queuedCount = batchItems.filter((item) => item.status === "queued").length;
      const analyzingCount = batchItems.filter((item) => item.status === "analyzing").length;
      const needsReviewCount = batchItems.filter((item) => item.status === "needs_review").length;
      const failedCount = batchItems.filter((item) => item.status === "failed").length;
      const registeredCount = batchItems.filter((item) => item.status === "registered").length;

      const summary: AiExpenseQueueBatchSummary = {
        ...batch,
        totalCount: batch.jobIds.length,
        readyItems,
        queuedCount,
        analyzingCount,
        processingCount: queuedCount + analyzingCount,
        readyCount: readyItems.length,
        needsReviewCount,
        failedCount,
        registeredCount,
        missingCount: batch.jobIds.length - batchItems.length,
        isAllReady:
          batchItems.length === batch.jobIds.length &&
          batchItems.length > 0 &&
          batchItems.every((item) => item.status === "ready"),
      };

      return summary.registeredCount === summary.totalCount ? [] : [summary];
    });
  }, [items, sessionBatches]);

  return {
    clearableItems,
    groupedItems,
    items,
    jobs,
    readyItemIds,
    readyItems,
    sessionBatchSummaries,
    unbatchedReadyItems,
  };
}
