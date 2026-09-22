import { afterEach, beforeEach, vi } from "vitest";
const {
  registerReadyDraftsAsExpenseEntriesMock,
  legacyRegisterReadyDraftsMock,
  updateForReviewMock,
  resetReceiptToAiInterpretationMock,
  createBatchMock,
  analyzeImageJobMock,
  retryImageJobMock,
  cancelImageJobMock,
  deleteDraftMock,
  acceptReceiptImageExternalApiConsentMock,
  useQueryMock,
} = vi.hoisted(() => ({
  registerReadyDraftsAsExpenseEntriesMock: vi.fn(),
  legacyRegisterReadyDraftsMock: vi.fn(),
  updateForReviewMock: vi.fn(),
  resetReceiptToAiInterpretationMock: vi.fn(),
  createBatchMock: vi.fn(),
  analyzeImageJobMock: vi.fn(),
  retryImageJobMock: vi.fn(),
  cancelImageJobMock: vi.fn(),
  deleteDraftMock: vi.fn(),
  acceptReceiptImageExternalApiConsentMock: vi.fn(),
  useQueryMock: vi.fn(),
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    aiExpenseDrafts: {
      queries: {
        getWithItems: "aiExpenseDrafts.queries.getWithItems",
        listByStatus: "aiExpenseDrafts.queries.listByStatus",
      },
      mutations: {
        registerReadyDrafts: "aiExpenseDrafts.mutations.registerReadyDrafts",
        registerReadyDraftsAsExpenseEntries:
          "aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries",
        updateForReview: "aiExpenseDrafts.mutations.updateForReview",
        resetReceiptToAiInterpretation: "aiExpenseDrafts.mutations.resetReceiptToAiInterpretation",
        deleteDraft: "aiExpenseDrafts.mutations.deleteDraft",
      },
    },
    receiptAnalysisJobs: {
      queries: {
        listJobs: "receiptAnalysisJobs.queries.listJobs",
      },
      mutations: {
        createBatch: "receiptAnalysisJobs.mutations.createBatch",
        retryImageJob: "receiptAnalysisJobs.mutations.retryImageJob",
        cancelImageJob: "receiptAnalysisJobs.mutations.cancelImageJob",
      },
      actions: {
        analyzeImageJob: "receiptAnalysisJobs.actions.analyzeImageJob",
      },
    },
    users: {
      queries: {
        getReceiptImageConsent: "users.queries.getReceiptImageConsent",
      },
      mutations: {
        acceptReceiptImageExternalApiConsent:
          "users.mutations.acceptReceiptImageExternalApiConsent",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: string) => {
    if (reference === "aiExpenseDrafts.mutations.updateForReview") return updateForReviewMock;
    if (reference === "aiExpenseDrafts.mutations.resetReceiptToAiInterpretation") {
      return resetReceiptToAiInterpretationMock;
    }
    if (reference === "aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries") {
      return registerReadyDraftsAsExpenseEntriesMock;
    }
    if (reference === "aiExpenseDrafts.mutations.registerReadyDrafts") {
      return legacyRegisterReadyDraftsMock;
    }
    if (reference === "aiExpenseDrafts.mutations.deleteDraft") return deleteDraftMock;
    if (reference === "receiptAnalysisJobs.mutations.createBatch") return createBatchMock;
    if (reference === "receiptAnalysisJobs.mutations.retryImageJob") return retryImageJobMock;
    if (reference === "receiptAnalysisJobs.mutations.cancelImageJob") return cancelImageJobMock;
    if (reference === "users.mutations.acceptReceiptImageExternalApiConsent") {
      return acceptReceiptImageExternalApiConsentMock;
    }
    return vi.fn();
  },
  useAction: (reference: string) => {
    if (reference === "receiptAnalysisJobs.actions.analyzeImageJob") return analyzeImageJobMock;
    return vi.fn();
  },
  useQuery: (reference: string, args: unknown) => useQueryMock(reference, args),
  useConvex: () => ({
    query: vi.fn().mockResolvedValue(null),
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.mocked(globalThis.createImageBitmap).mockResolvedValue({
    width: 100,
    height: 100,
    close: vi.fn(),
  } as unknown as ImageBitmap);
  registerReadyDraftsAsExpenseEntriesMock.mockReset();
  registerReadyDraftsAsExpenseEntriesMock.mockResolvedValue(undefined);
  legacyRegisterReadyDraftsMock.mockReset();
  legacyRegisterReadyDraftsMock.mockResolvedValue(undefined);
  updateForReviewMock.mockReset();
  updateForReviewMock.mockResolvedValue({ status: "ready", reviewReasons: [] });
  resetReceiptToAiInterpretationMock.mockReset();
  resetReceiptToAiInterpretationMock.mockResolvedValue(undefined);
  createBatchMock.mockReset();
  createBatchMock.mockResolvedValue({
    batch: { _id: "batch-1" },
    jobs: [{ _id: "job-1" }, { _id: "job-2" }],
  });
  analyzeImageJobMock.mockReset();
  analyzeImageJobMock.mockResolvedValue(undefined);
  retryImageJobMock.mockReset();
  retryImageJobMock.mockResolvedValue(undefined);
  cancelImageJobMock.mockReset();
  cancelImageJobMock.mockResolvedValue(undefined);
  deleteDraftMock.mockReset();
  deleteDraftMock.mockResolvedValue({ deleted: true });
  acceptReceiptImageExternalApiConsentMock.mockReset();
  acceptReceiptImageExternalApiConsentMock.mockResolvedValue(undefined);
  useQueryMock.mockReset();
  useQueryMock.mockImplementation((reference: string, _args: unknown) => {
    if (reference === "receiptAnalysisJobs.queries.listJobs") return [];
    if (reference === "users.queries.getReceiptImageConsent") {
      return { hasAcceptedExternalApiConsent: true, acceptedAt: 1234567890 };
    }
    return [];
  });
});

export {
  registerReadyDraftsAsExpenseEntriesMock,
  legacyRegisterReadyDraftsMock,
  updateForReviewMock,
  resetReceiptToAiInterpretationMock,
  createBatchMock,
  analyzeImageJobMock,
  retryImageJobMock,
  cancelImageJobMock,
  deleteDraftMock,
  acceptReceiptImageExternalApiConsentMock,
  useQueryMock,
};
