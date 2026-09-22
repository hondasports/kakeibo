import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { createExpenseEntries } from "./mutations";

// ---------------------------------------------------------------------------
// テスト用型定義
// ---------------------------------------------------------------------------

export type CategoryDoc = {
  _id: string;
  _creationTime: number;
  groupId: string;
  name: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type AiExpenseDraftDoc = {
  _id: string;
  _creationTime: number;
  groupId: string;
  sourceType: "image_upload";
  sourceDocumentId?: string;
  status: "queued" | "analyzing" | "ready" | "needs_review" | "failed" | "registered";
  documentType: "receipt" | "convenience_payment" | "unknown";
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date?: string;
  amountYen?: number;
  categoryId?: string;
  confidence: Record<string, number | undefined>;
  warnings: string[];
  reviewReasons: string[];
  registeredReceiptId?: string;
  createdAt: number;
  updatedAt: number;
};

export type AiExpenseDraftItemDoc = {
  _id: string;
  _creationTime: number;
  draftId: string;
  itemName?: string;
  amountYen: number;
  categoryId?: string;
  confidence: Record<string, number | undefined>;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type ExpenseEntryDoc = {
  _id: string;
  _creationTime: number;
  groupId: string;
  date: string;
  amount: number;
  categoryId: string;
  title: string;
  memo?: string;
  entryType: "expense" | "income";
  source: "manual" | "ai_suggested" | "imported";
  createdAt: number;
  updatedAt: number;
};

export const catFoodId = "cat-food" as Id<"categories">;
export const catDailyId = "cat-daily" as Id<"categories">;
export const draftReadyId = "draft-ready" as Id<"aiExpenseDrafts">;
export const sourceDocumentId = "source-doc-1" as Id<"sourceDocuments">;
export const entryId = "entry-001" as Id<"expenseEntries">;

export const GROUP_ID = "group-001" as Id<"groups">;
export const OTHER_GROUP_ID = "group-other" as Id<"groups">;

export type RegisteredMutation = {
  _handler: (ctx: MutationCtx, args: unknown) => Promise<unknown>;
};

export function invokeRegisteredMutation(
  mutation: unknown,
  ctx: MutationCtx,
  args: unknown,
): Promise<unknown> {
  return (mutation as RegisteredMutation)._handler(ctx, args);
}

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

export function createIdentity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    tokenIdentifier: "https://issuer.example|user-001",
    subject: "user-001",
    issuer: "https://issuer.example",
    ...overrides,
  };
}

export function createMutationCtx(
  identity: UserIdentity | null,
  opts: {
    getDocById?: Record<
      string,
      CategoryDoc | AiExpenseDraftDoc | AiExpenseDraftItemDoc | ExpenseEntryDoc | null
    >;
    groupId?: Id<"groups">;
  } = {},
): MutationCtx {
  const insertMock = vi.fn().mockResolvedValue("new-entry-id");
  const getDocById = opts.getDocById ?? {};
  const ctxGroupId = opts.groupId ?? GROUP_ID;

  const getMock = vi.fn().mockImplementation(async (id: string) => {
    return getDocById[id] ?? null;
  });

  const groupMember =
    identity !== null
      ? {
          _id: "member-001",
          _creationTime: 1000,
          groupId: ctxGroupId,
          userId: identity.tokenIdentifier,
          role: "owner",
        }
      : null;

  const withIndexMock = vi
    .fn()
    .mockImplementation((_indexName: string, builder: (q: unknown) => unknown) => {
      const q = {
        eq: vi.fn().mockImplementation(() => q),
        gte: vi.fn().mockImplementation(() => q),
        lte: vi.fn().mockImplementation(() => q),
      };
      builder(q);

      // groupMembers テーブルのクエリ
      if (_indexName === "by_user_id") {
        return { unique: vi.fn().mockResolvedValue(groupMember) };
      }

      return {
        take: vi.fn().mockResolvedValue([]),
        order: vi.fn().mockReturnValue({ take: vi.fn().mockResolvedValue([]) }),
      };
    });
  const queryMock = vi.fn().mockReturnValue({ withIndex: withIndexMock });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      get: getMock,
      insert: insertMock,
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      query: queryMock,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as MutationCtx;
}

export const activeFoodCategory: CategoryDoc = {
  _id: "cat-food",
  _creationTime: 0,
  groupId: GROUP_ID,
  name: "食費",
  color: "#AAB7C4",
  isActive: true,
  sortOrder: 1,
  createdAt: 0,
  updatedAt: 0,
};

export const activeDailyCategory: CategoryDoc = {
  _id: "cat-daily",
  _creationTime: 0,
  groupId: GROUP_ID,
  name: "日用品",
  color: "#A6B28B",
  isActive: true,
  sortOrder: 2,
  createdAt: 0,
  updatedAt: 0,
};

// ---------------------------------------------------------------------------
// createExpenseEntries
// ---------------------------------------------------------------------------

export const readyDraft: AiExpenseDraftDoc = {
  _id: "draft-ready",
  _creationTime: 0,
  groupId: GROUP_ID,
  sourceType: "image_upload",
  status: "ready",
  documentType: "receipt",
  shopName: "スーパー青葉",
  date: "2026-06-01",
  amountYen: 1500,
  categoryId: "cat-food",
  confidence: { shopName: 0.92, date: 0.95, amountYen: 0.98, categoryId: 0.88 },
  warnings: [],
  reviewReasons: [],
  createdAt: 0,
  updatedAt: 0,
};

export const baseExpenseEntry: ExpenseEntryDoc = {
  _id: "entry-001",
  _creationTime: 0,
  groupId: GROUP_ID,
  date: "2026-06-07",
  amount: 1280,
  categoryId: "cat-food",
  title: "スーパーA",
  memo: "夕食",
  entryType: "expense",
  source: "manual",
  createdAt: 0,
  updatedAt: 0,
};
