import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAiExpenseQueueData } from "./useAiExpenseQueueData";

const { useQueryMock, useQueriesMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useQueriesMock: vi.fn(),
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    aiExpenseDrafts: { queries: { listByStatus: "drafts", listByStatusPaginated: "registered" } },
    receiptAnalysisJobs: {
      queries: {
        listJobs: "allJobs",
        listActiveJobs: "activeJobs",
        listJobsByBatch: "batchJobs",
        listJobsByDraftIds: "draftJobs",
      },
    },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useQueries: (...args: unknown[]) => useQueriesMock(...args),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
}));

const readyJob = {
  _id: "session-job",
  batchId: "session-batch",
  draftId: "session-draft",
  status: "ready",
  fileName: "receipt.jpg",
};
const readyDraft = {
  _id: "session-draft",
  status: "ready",
  documentType: "receipt",
  imageFileName: "receipt.jpg",
  shopName: "店舗",
  amountYen: 100,
  reviewReasons: [],
};
const options = {
  categories: [],
  hiddenItemIds: [],
  pendingImageDataUrls: new Map([["session-job", "data:image/jpeg;base64,preview"]]),
  sessionBatches: [
    { batchId: "session-batch", jobIds: ["session-job"], fileNames: ["receipt.jpg"] },
  ],
};

beforeEach(() => {
  useQueryMock.mockReset();
  useQueryMock.mockImplementation((reference, args) =>
    reference === "drafts" && args.status === "ready" ? [readyDraft] : [],
  );
  useQueriesMock.mockReset();
  useQueriesMock.mockImplementation((queries) =>
    Object.fromEntries(
      Object.keys(queries).map((key) => [key, key === "session-batch" ? [readyJob] : null]),
    ),
  );
});

describe("キューの用途別ジョブ購読", () => {
  it("解析中とセッション内バッチだけを購読し、プレビューとバッチ紐づけを保つ", () => {
    const { result } = renderHook(() => useAiExpenseQueueData(options));
    expect(useQueryMock).toHaveBeenCalledWith("activeJobs");
    expect(useQueryMock).not.toHaveBeenCalledWith("allJobs");
    expect(useQueriesMock).toHaveBeenCalledWith({
      "session-batch": { query: "batchJobs", args: { batchId: "session-batch" } },
    });
    expect(result.current.items[0]).toMatchObject({
      id: "session-draft",
      jobId: "session-job",
      batchId: "session-batch",
      previewImageDataUrl: "data:image/jpeg;base64,preview",
    });
    expect(result.current.sessionBatchSummaries[0]).toMatchObject({
      readyCount: 1,
      missingCount: 0,
      isAllReady: true,
    });
  });

  it("セッション内バッチが無い間は完了済みジョブを購読しない", () => {
    renderHook(() => useAiExpenseQueueData({ ...options, sessionBatches: [] }));
    expect(useQueriesMock).toHaveBeenCalledWith({});
    expect(useQueryMock).not.toHaveBeenCalledWith("allJobs");
  });

  it("処理中とバッチに同じジョブがあっても処理中カードを重複させない", () => {
    const activeJob = { ...readyJob, status: "running", draftId: undefined };
    useQueryMock.mockImplementation((reference) => (reference === "activeJobs" ? [activeJob] : []));
    useQueriesMock.mockImplementation((queries) =>
      Object.fromEntries(
        Object.keys(queries).map((key) => [key, key === "session-batch" ? [activeJob] : null]),
      ),
    );
    const { result } = renderHook(() => useAiExpenseQueueData(options));
    expect(result.current.groupedItems.processing).toHaveLength(1);
    expect(result.current.jobs).toHaveLength(1);
  });
});

it("複数の再試行対象を1本だけで購読し、再解析ボタン用のjobIdを保つ", () => {
  const reviewDraft = { ...readyDraft, _id: "saved-review", status: "needs_review" };
  const failedDraft = { ...readyDraft, _id: "saved-failed", status: "failed" };
  useQueryMock.mockImplementation((reference, args) => {
    if (reference !== "drafts") return [];
    if (args.status === "ready") return [readyDraft];
    if (args.status === "needs_review") return [reviewDraft];
    if (args.status === "failed") return [failedDraft];
    return [];
  });
  const draftQueryMock = useQueryMock.getMockImplementation()!;
  useQueryMock.mockImplementation((reference, args) =>
    reference === "draftJobs"
      ? args === "skip"
        ? undefined
        : args.draftIds.map((draftId: string) => ({
            ...readyJob,
            _id: `job-${draftId}`,
            draftId,
            batchId: "saved-batch",
          }))
      : draftQueryMock(reference, args),
  );
  const { result } = renderHook(() => useAiExpenseQueueData({ ...options, sessionBatches: [] }));
  expect(useQueryMock.mock.calls.filter(([reference]) => reference === "draftJobs")).toEqual([
    ["draftJobs", { draftIds: ["saved-review", "saved-failed"] }],
  ]);
  expect(useQueriesMock.mock.calls).toEqual([[{}]]);
  expect(result.current.items.find((item) => item.id === "saved-review")?.jobId).toBe(
    "job-saved-review",
  );
  expect(result.current.items.find((item) => item.id === "session-draft")?.jobId).toBeUndefined();
});

it("再試行対象が無ければ補助クエリを購読しない", () => {
  renderHook(() => useAiExpenseQueueData({ ...options, sessionBatches: [] }));
  expect(useQueryMock).toHaveBeenCalledWith("draftJobs", "skip");
});

it("固定IDのinitialItemsだけではジョブを問い合わせず、表示項目を維持する", () => {
  const initialItems = [
    {
      id: "e2e-review-draft",
      fileName: "review.png",
      status: "needs_review" as const,
      documentType: "unknown" as const,
    },
    {
      id: "e2e-failed-draft",
      fileName: "failed.png",
      status: "failed" as const,
      documentType: "unknown" as const,
    },
  ];
  const { result } = renderHook(() =>
    useAiExpenseQueueData({
      ...options,
      sessionBatches: [],
      initialItems,
    }),
  );
  expect(useQueryMock).toHaveBeenCalledWith("draftJobs", "skip");
  expect(result.current.items).toHaveLength(2);
  expect(result.current.items).toMatchObject(
    initialItems.map((item) => ({
      ...item,
      jobId: undefined,
      batchId: undefined,
    })),
  );
});

it("initialItemsがあってもConvexの一覧から取得した再試行対象だけを問い合わせる", () => {
  useQueryMock.mockImplementation((reference, args) => {
    if (reference !== "drafts") return [];
    if (args.status === "needs_review")
      return [{ ...readyDraft, _id: "persisted-review", status: "needs_review" }];
    if (args.status === "failed")
      return [{ ...readyDraft, _id: "persisted-failed", status: "failed" }];
    return [];
  });
  renderHook(() =>
    useAiExpenseQueueData({
      ...options,
      sessionBatches: [],
      initialItems: [
        {
          id: "e2e-review-draft",
          fileName: "review.png",
          status: "needs_review",
          documentType: "unknown",
        },
      ],
    }),
  );
  expect(useQueryMock).toHaveBeenCalledWith("draftJobs", {
    draftIds: ["persisted-review", "persisted-failed"],
  });
});

it("再解析したセッション外バッチで下書きIDが変わっても画像を維持し、今回の追加の要約には含めない", () => {
  let completed = false;
  const oldJob = { ...readyJob, draftId: "old-draft", status: "failed" };
  useQueryMock.mockImplementation((reference, args) => {
    if (reference === "draftJobs") return args === "skip" ? undefined : [oldJob];
    if (reference !== "drafts") return [];
    if (!completed && args.status === "failed")
      return [{ ...readyDraft, _id: "old-draft", status: "failed" }];
    return completed && args.status === "ready" ? [readyDraft] : [];
  });
  useQueriesMock.mockImplementation((queries) =>
    Object.fromEntries(
      Object.entries(queries as Record<string, { query: string }>).map(([key, { query }]) => [
        key,
        query === "batchJobs" ? [readyJob] : oldJob,
      ]),
    ),
  );
  const { result, rerender } = renderHook(
    ({ retryBatchIds }: { retryBatchIds: string[] }) =>
      useAiExpenseQueueData({
        ...options,
        sessionBatches: [],
        retryBatchIds,
      }),
    { initialProps: { retryBatchIds: [] as string[] } },
  );
  expect(result.current.items[0]).toMatchObject({ id: "old-draft", jobId: "session-job" });
  completed = true;
  rerender({ retryBatchIds: ["session-batch"] });
  expect(useQueriesMock).toHaveBeenCalledWith({
    "session-batch": { query: "batchJobs", args: { batchId: "session-batch" } },
  });
  expect(result.current.readyItems[0]).toMatchObject({
    id: "session-draft",
    jobId: "session-job",
    previewImageDataUrl: "data:image/jpeg;base64,preview",
  });
  expect(result.current.sessionBatchSummaries).toEqual([]);
});

it("重複と非表示の候補を除き、一括購読の引数を200件以内に保つ", () => {
  const drafts = Array.from({ length: 202 }, (_, index) => ({
    ...readyDraft,
    _id: `retry-${index}`,
    imageFileName: `${index}.png`,
    status: "needs_review" as const,
    documentType: "unknown" as const,
  }));
  useQueryMock.mockImplementation((reference, args) =>
    reference === "drafts" && args.status === "needs_review" ? [drafts[0], ...drafts] : [],
  );
  renderHook(() =>
    useAiExpenseQueueData({
      ...options,
      sessionBatches: [],
      hiddenItemIds: ["retry-1"],
    }),
  );
  const calls = useQueryMock.mock.calls.filter(([reference]) => reference === "draftJobs");
  expect(calls).toHaveLength(1);
  const ids = calls[0][1].draftIds;
  expect(ids).toHaveLength(200);
  expect(new Set(ids).size).toBe(200);
  expect(ids).not.toContain("retry-1");
});
