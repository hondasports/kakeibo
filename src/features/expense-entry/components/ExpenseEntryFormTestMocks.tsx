import { beforeEach, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";

const { createExpenseEntriesMock, createIncomeEntryMock, aiExpenseDraftsByStatusQueryMock } =
  vi.hoisted(() => ({
    createExpenseEntriesMock: vi.fn(),
    createIncomeEntryMock: vi.fn(),
    aiExpenseDraftsByStatusQueryMock: vi.fn(),
  }));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    expenseEntries: {
      mutations: {
        createExpenseEntries: "expenseEntries.mutations.createExpenseEntries",
        createIncomeEntry: "expenseEntries.mutations.createIncomeEntry",
      },
    },
    aiExpenseDrafts: {
      mutations: {
        deleteDraft: "aiExpenseDrafts.mutations.deleteDraft",
        registerReadyDrafts: "aiExpenseDrafts.mutations.registerReadyDrafts",
      },
      queries: {
        listByStatus: "aiExpenseDrafts.queries.listByStatus",
      },
    },
    users: {
      mutations: {
        acceptReceiptImageExternalApiConsent:
          "users.mutations.acceptReceiptImageExternalApiConsent",
      },
      queries: {
        getReceiptImageConsent: "users.queries.getReceiptImageConsent",
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
  },
}));

vi.mock("convex/react", () => ({
  useMutation: (functionRef: string) => {
    if (functionRef === "expenseEntries.mutations.createExpenseEntries") {
      return createExpenseEntriesMock;
    }
    if (functionRef === "expenseEntries.mutations.createIncomeEntry") {
      return createIncomeEntryMock;
    }
    if (functionRef === "aiExpenseDrafts.mutations.deleteDraft") {
      return vi.fn().mockResolvedValue({ deleted: true });
    }
    if (functionRef === "aiExpenseDrafts.mutations.registerReadyDrafts") {
      return vi.fn().mockResolvedValue(undefined);
    }
    if (functionRef === "receiptAnalysisJobs.mutations.createBatch") {
      return vi.fn().mockResolvedValue({ batch: { _id: "batch-1" }, jobs: [] });
    }
    if (functionRef === "receiptAnalysisJobs.mutations.retryImageJob") {
      return vi.fn().mockResolvedValue(undefined);
    }
    if (functionRef === "receiptAnalysisJobs.mutations.cancelImageJob") {
      return vi.fn().mockResolvedValue(undefined);
    }
    if (functionRef === "users.mutations.acceptReceiptImageExternalApiConsent") {
      return vi.fn().mockResolvedValue(undefined);
    }
    return vi.fn().mockResolvedValue(undefined);
  },
  useAction: (functionRef: string) => {
    if (functionRef === "receiptAnalysisJobs.actions.analyzeImageJob") {
      return vi.fn().mockResolvedValue(undefined);
    }
    return vi.fn().mockResolvedValue(undefined);
  },
  useQuery: (functionRef: string, args?: unknown) => {
    if (functionRef === "users.queries.getReceiptImageConsent") {
      return { hasAcceptedExternalApiConsent: true, acceptedAt: 1234567890 };
    }
    if (functionRef === "aiExpenseDrafts.queries.listByStatus") {
      return aiExpenseDraftsByStatusQueryMock(args);
    }
    if (functionRef === "receiptAnalysisJobs.queries.listJobs") {
      return [];
    }
    return undefined;
  },
  useConvex: () => ({
    query: vi.fn().mockResolvedValue(null),
  }),
}));

export const categories = [
  { _id: "cat-food" as Id<"categories">, name: "食費", color: "#AAB7C4" },
  { _id: "cat-daily" as Id<"categories">, name: "日用品", color: "#A6B28B" },
];

beforeEach(() => {
  createExpenseEntriesMock.mockReset();
  createExpenseEntriesMock.mockResolvedValue(undefined);
  createIncomeEntryMock.mockReset();
  createIncomeEntryMock.mockResolvedValue(undefined);
  aiExpenseDraftsByStatusQueryMock.mockReset();
  aiExpenseDraftsByStatusQueryMock.mockReturnValue([]);
});

export { createExpenseEntriesMock, createIncomeEntryMock, aiExpenseDraftsByStatusQueryMock };
