import { vi } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { QueryCtx } from "../../../convex/_generated/server";

export function makeExpenseEntry(
  overrides: Partial<Doc<"expenseEntries">> & { _id: Id<"expenseEntries"> },
): Doc<"expenseEntries"> {
  return {
    _creationTime: 0,
    groupId: "group-1" as Id<"groups">,
    sourceDocumentId: undefined,
    aiExpenseDraftId: undefined,
    date: "2024-01-10",
    amount: 1000,
    categoryId: "cat-1" as Id<"categories">,
    title: "スーパー",
    memo: undefined,
    entryType: "expense",
    source: "manual",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as unknown as Doc<"expenseEntries">;
}

export function makeReceipt(
  overrides: Partial<Doc<"receipts">> & { _id: Id<"receipts"> },
): Doc<"receipts"> {
  return {
    _creationTime: 0,
    groupId: "group-1" as Id<"groups">,
    date: "2024-01-10",
    type: "expense",
    shopName: "スーパー",
    bankName: undefined,
    amountYen: 1000,
    categoryId: "cat-1" as Id<"categories">,
    memo: undefined,
    weekStartDate: "2024-01-08",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as unknown as Doc<"receipts">;
}

export function makeSourceDocument(
  overrides: Partial<Doc<"sourceDocuments">> & { _id: Id<"sourceDocuments"> },
): Doc<"sourceDocuments"> {
  return {
    _creationTime: 0,
    groupId: groupId,
    sourceType: "manual",
    status: "finalized",
    date: "2024-01-10",
    totalAmount: 3000,
    shopName: "スーパー北浜",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as unknown as Doc<"sourceDocuments">;
}

export function makeAiExpenseDraft(
  overrides: Partial<Doc<"aiExpenseDrafts">> & { _id: Id<"aiExpenseDrafts"> },
): Doc<"aiExpenseDrafts"> {
  return {
    _creationTime: 0,
    groupId,
    sourceType: "image_upload",
    status: "registered",
    documentType: "receipt",
    shopName: "スーパー北浜",
    amountYen: 3000,
    confidence: {},
    warnings: [],
    reviewReasons: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as unknown as Doc<"aiExpenseDrafts">;
}

export function makeAiExpenseDraftItem(
  overrides: Partial<Doc<"aiExpenseDraftItems">> & { _id: Id<"aiExpenseDraftItems"> },
): Doc<"aiExpenseDraftItems"> {
  return {
    _creationTime: 0,
    groupId,
    draftId: "draft-1" as Id<"aiExpenseDrafts">,
    itemName: "たっぷりホイップあんぱん",
    amountYen: 1200,
    categoryId: "cat-1" as Id<"categories">,
    confidence: {},
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as unknown as Doc<"aiExpenseDraftItems">;
}

export function createQueryCtx({
  expenseEntries = [],
  receipts = [],
  sourceDocuments = [],
  aiExpenseDrafts = [],
  aiExpenseDraftItems = [],
}: {
  expenseEntries?: Doc<"expenseEntries">[];
  receipts?: Doc<"receipts">[];
  sourceDocuments?: Doc<"sourceDocuments">[];
  aiExpenseDrafts?: Doc<"aiExpenseDrafts">[];
  aiExpenseDraftItems?: Doc<"aiExpenseDraftItems">[];
} = {}): QueryCtx {
  const makeQueryBuilder = (docs: unknown[]) => {
    const q: {
      eq: ReturnType<typeof vi.fn>;
      gte: ReturnType<typeof vi.fn>;
      lte: ReturnType<typeof vi.fn>;
    } = {
      eq: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
    };
    q.eq.mockReturnValue(q);
    q.gte.mockReturnValue(q);
    q.lte.mockReturnValue(q);

    const chain: {
      [Symbol.asyncIterator](): AsyncIterator<unknown>;
      order: (direction: "asc" | "desc") => typeof chain;
      take: (limit: number) => Promise<unknown[]>;
    } = {
      [Symbol.asyncIterator]: async function* () {
        yield* docs;
      },
      order: () => chain,
      take: async (limit) => docs.slice(0, limit),
    };

    return { q, chain };
  };

  const query = vi.fn().mockImplementation((tableName: string) => {
    const docs =
      tableName === "expenseEntries"
        ? (expenseEntries as unknown[])
        : tableName === "receipts"
          ? (receipts as unknown[])
          : (aiExpenseDraftItems as unknown[]);
    return {
      withIndex: (_indexName: string, builder: (q: unknown) => unknown) => {
        const { q, chain } = makeQueryBuilder(docs);
        builder(q);
        return chain;
      },
    };
  });

  return {
    db: {
      query,
      get: vi.fn().mockImplementation(async (id: string) => {
        return (
          sourceDocuments.find((document) => document._id === id) ??
          aiExpenseDrafts.find((draft) => draft._id === id) ??
          null
        );
      }),
    },
  } as unknown as QueryCtx;
}

export const groupId = "group-1" as Id<"groups">;
