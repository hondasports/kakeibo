import {
  MAX_RECEIPT_ANALYSIS_DRAFT_IDS,
  RECEIPT_ANALYSIS_RETRY_DRAFT_STATUSES,
} from "../../../../lib/domain/receiptAnalysisJobs/rules";
import { api } from "../../../../convex/_generated/api";
import { useCallback, useMemo } from "react";
import { usePaginatedQuery, useQueries, useQuery } from "convex/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { getSectionKey } from "../../receipt-review/components/labels";
import { getImageCaptureFailureHint } from "../../../../lib/domain/aiExpenseDrafts/failure";
import { mapDraftToQueueItem } from "../../receipt-review/utils/mappers";
import type { AiExpenseQueueCategory, AiExpenseQueueItem } from "../../../types/aiExpenseQueue";
import type { AiExpenseQueueBatchSummary, AiExpenseUploadBatch } from "../types/types";
import type { AiExpenseDraft } from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";

const REGISTERED_PAGE_SIZE = 10;

export function useAiExpenseQueueData({
  categories,
  hiddenItemIds,
  pendingImageDataUrls,
  sessionBatches,
  retryBatchIds = [],
  initialItems,
}: {
  categories: AiExpenseQueueCategory[];
  hiddenItemIds: string[];
  pendingImageDataUrls: Map<string, string>;
  sessionBatches: AiExpenseUploadBatch[];
  retryBatchIds?: string[];
  initialItems?: AiExpenseQueueItem[];
}) {
  const readyDrafts = useQuery(api.aiExpenseDrafts.queries.listByStatus, { status: "ready" }) as
    | AiExpenseDraft[]
    | undefined;
  const needsReviewDrafts = useQuery(api.aiExpenseDrafts.queries.listByStatus, {
    status: "needs_review",
  }) as AiExpenseDraft[] | undefined;
  const failedDrafts = useQuery(api.aiExpenseDrafts.queries.listByStatus, { status: "failed" }) as
    | AiExpenseDraft[]
    | undefined;
  const registeredPage = usePaginatedQuery(
    api.aiExpenseDrafts.queries.listByStatusPaginated,
    { status: "registered" },
    { initialNumItems: REGISTERED_PAGE_SIZE },
  );
  const registeredDrafts = registeredPage.results as AiExpenseDraft[];
  const { loadMore } = registeredPage;
  const loadMoreRegistered = useCallback(() => loadMore(REGISTERED_PAGE_SIZE), [loadMore]);
  const activeJobs = useQuery(api.receiptAnalysisJobs.queries.listActiveJobs) as
    | Doc<"receiptAnalysisImageJobs">[]
    | undefined;
  const batchQueries = useMemo(
    () =>
      Object.fromEntries(
        [...new Set([...sessionBatches.map((batch) => batch.batchId), ...retryBatchIds])].map(
          (batchId) => [
            batchId,
            {
              query: api.receiptAnalysisJobs.queries.listJobsByBatch,
              args: { batchId: batchId as Id<"receiptAnalysisBatches"> },
            },
          ],
        ),
      ),
    [sessionBatches, retryBatchIds],
  );
  const batchResults = useQueries(batchQueries);
  const batchJobs = useMemo(
    () =>
      Object.values(batchResults).flatMap((result) => {
        if (result instanceof Error) throw result;
        return (result as Doc<"receiptAnalysisImageJobs">[] | undefined) ?? [];
      }),
    [batchResults],
  );
  const retryDraftIds = useMemo(() => {
    const linkedDraftIds = new Set([...batchJobs, ...(activeJobs ?? [])].map((job) => job.draftId));
    const candidates =
      initialItems && initialItems.length > 0
        ? initialItems.map((item) => ({ id: item.id, status: item.status }))
        : [...(needsReviewDrafts ?? []), ...(failedDrafts ?? [])].map((draft) => ({
            id: draft._id,
            status: draft.status,
          }));
    return [
      ...new Set(
        candidates
          .filter(
            (draft) =>
              RECEIPT_ANALYSIS_RETRY_DRAFT_STATUSES.some((status) => status === draft.status) &&
              !linkedDraftIds.has(draft.id as Id<"aiExpenseDrafts">) &&
              !hiddenItemIds.includes(draft.id),
          )
          .map((draft) => draft.id as Id<"aiExpenseDrafts">),
      ),
    ].slice(0, MAX_RECEIPT_ANALYSIS_DRAFT_IDS);
  }, [activeJobs, batchJobs, failedDrafts, hiddenItemIds, initialItems, needsReviewDrafts]);
  const retryDraftJobs = useQuery(
    api.receiptAnalysisJobs.queries.listJobsByDraftIds,
    retryDraftIds.length > 0 ? { draftIds: retryDraftIds } : "skip",
  );
  const jobs = useMemo(() => {
    const byId = new Map(
      [...batchJobs, ...(activeJobs ?? []), ...(retryDraftJobs ?? [])].map((job) => [job._id, job]),
    );
    return [...byId.values()];
  }, [activeJobs, batchJobs, retryDraftJobs]);
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
    return (activeJobs ?? [])
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
  }, [activeJobs, pendingImageDataUrls]);

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
  const unregisteredDraftIds = useMemo(() => {
    if (
      readyDrafts === undefined ||
      needsReviewDrafts === undefined ||
      failedDrafts === undefined
    ) {
      return undefined;
    }
    return new Set(
      [...readyDrafts, ...needsReviewDrafts, ...failedDrafts].map((draft) => draft._id),
    );
  }, [failedDrafts, needsReviewDrafts, readyDrafts]);
  const sessionBatchSummaries = useMemo<AiExpenseQueueBatchSummary[]>(() => {
    const itemByJobId = new Map<string, AiExpenseQueueItem>();
    for (const item of items) {
      if (item.jobId) {
        itemByJobId.set(item.jobId, item);
      }
    }
    const jobById = new Map((jobs ?? []).map((job) => [job._id as string, job]));
    // 登録済みは初回ページ分しか読まないため、下書きを作り終えたジョブのうち
    // 未登録の一覧（ready / needs_review / failed）に無いものを登録済みとみなす。
    // 削除した下書きは hiddenItemIds に残るので、登録済みに数えない。
    const isRegisteredOutsidePage = (jobId: string) => {
      const draftId = jobById.get(jobId)?.draftId;
      return (
        unregisteredDraftIds !== undefined &&
        draftId !== undefined &&
        !unregisteredDraftIds.has(draftId) &&
        !hiddenItemIds.includes(draftId)
      );
    };

    return sessionBatches.flatMap((batch) => {
      const batchItems = batch.jobIds.flatMap((jobId) => {
        const item = itemByJobId.get(jobId);
        return item ? [item] : [];
      });
      const registeredOutsidePageCount = batch.jobIds.filter(
        (jobId) => !itemByJobId.has(jobId) && isRegisteredOutsidePage(jobId),
      ).length;
      const readyItems = batchItems.filter((item) => item.status === "ready");
      const queuedCount = batchItems.filter((item) => item.status === "queued").length;
      const analyzingCount = batchItems.filter((item) => item.status === "analyzing").length;
      const needsReviewCount = batchItems.filter((item) => item.status === "needs_review").length;
      const failedCount = batchItems.filter((item) => item.status === "failed").length;
      const registeredCount =
        batchItems.filter((item) => item.status === "registered").length +
        registeredOutsidePageCount;

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
        missingCount: batch.jobIds.length - batchItems.length - registeredOutsidePageCount,
        isAllReady:
          batchItems.length === batch.jobIds.length &&
          batchItems.length > 0 &&
          batchItems.every((item) => item.status === "ready"),
      };

      return summary.registeredCount === summary.totalCount ? [] : [summary];
    });
  }, [hiddenItemIds, items, jobs, sessionBatches, unregisteredDraftIds]);

  return {
    clearableItems,
    groupedItems,
    items,
    jobs,
    readyItemIds,
    readyItems,
    registeredListStatus: registeredPage.status,
    loadMoreRegistered,
    sessionBatchSummaries,
    unbatchedReadyItems,
  };
}
