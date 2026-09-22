import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// ---------------------------------------------------------------------------
// テスト用型定義
// ---------------------------------------------------------------------------

export type ReceiptDoc = {
  _id: string;
  _creationTime: number;
  groupId: string;
  date: string;
  type?: "expense" | "income";
  shopName?: string;
  bankName?: string;
  amountYen: number;
  categoryId: string;
  memo?: string;
  weekStartDate: string;
  createdAt: number;
  updatedAt: number;
};

export type ExpenseEntryDoc = {
  _id: string;
  _creationTime: number;
  groupId: string;
  sourceDocumentId?: string;
  aiExpenseDraftId?: string;
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

export const GROUP_ID = "group-001";
export const OTHER_GROUP_ID = "group-other";

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

/**
 * MutationCtx の最小モックを生成する。
 *
 * - ctx.db.get(id) は getDocById で解決する
 * - ctx.db.insert() は "new-receipt-id" を返す。ただし insert 後の get は
 *   insertedDoc を返すよう構成する
 * - ctx.db.patch() / ctx.db.delete() は vi.fn()
 * - ctx.db.query().withIndex().take() は queryDocs を返す
 * - groupMembers テーブルの by_user_id クエリは groupMember を返す
 */
export function createMutationCtx(
  identity: UserIdentity | null,
  opts: {
    getDocById?: Record<string, ReceiptDoc | CategoryDoc | null>;
    insertedDoc?: ReceiptDoc;
    updatedDoc?: ReceiptDoc;
    returnNullAfterPatch?: boolean;
    queryDocs?: ReceiptDoc[];
    groupId?: string;
    weeklyStartDay?: number;
  } = {},
): MutationCtx {
  const insertMock = vi.fn().mockResolvedValue("new-receipt-id");
  const patchMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockResolvedValue(undefined);

  const getDocById = opts.getDocById ?? {};
  const insertedDoc = opts.insertedDoc ?? null;
  const updatedDoc = opts.updatedDoc ?? null;
  const ctxGroupId = opts.groupId ?? GROUP_ID;

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

  // insert 後の get と通常の get を区別するために呼び出し回数を追跡
  let insertCalled = false;
  let patchCalled = false;

  const getMock = vi.fn().mockImplementation(async (id: string) => {
    // insert が完了した後の get は insertedDoc を返す
    if (id === "new-receipt-id" && insertCalled && insertedDoc !== null) {
      return insertedDoc;
    }
    // patch が完了した後の get は updatedDoc を返す
    if (patchCalled && opts.returnNullAfterPatch) {
      return null;
    }
    if (patchCalled && updatedDoc !== null && id === updatedDoc._id) {
      return updatedDoc;
    }
    return getDocById[id] ?? null;
  });

  // insert / patch の後に insertCalled / patchCalled を設定するラッパー
  const insertWrapper = vi.fn().mockImplementation(async (...args: unknown[]) => {
    const result = await insertMock(...args);
    insertCalled = true;
    return result;
  });

  const patchWrapper = vi.fn().mockImplementation(async (...args: unknown[]) => {
    const result = await patchMock(...args);
    patchCalled = true;
    return result;
  });

  const takeMock = vi.fn().mockResolvedValue(opts.queryDocs ?? []);
  const queryChain = { take: takeMock, order: vi.fn() };
  queryChain.order.mockReturnValue(queryChain);
  const withIndexMock = vi
    .fn()
    .mockImplementation((_indexName: string, builder: (q: unknown) => unknown) => {
      const q = {
        eq: vi.fn().mockImplementation(() => q),
        gte: vi.fn().mockImplementation(() => q),
        lte: vi.fn().mockImplementation(() => q),
      };
      builder(q);
      // groupMembers テーブルの by_user_id クエリはグループメンバーを返す
      if (_indexName === "by_user_id") {
        return { unique: vi.fn().mockResolvedValue(groupMember) };
      }
      if (_indexName === "by_token_identifier") {
        return {
          unique: vi
            .fn()
            .mockResolvedValue(
              opts.weeklyStartDay === undefined ? null : { weeklyStartDay: opts.weeklyStartDay },
            ),
        };
      }
      return queryChain;
    });
  const queryMock = vi.fn().mockReturnValue({ withIndex: withIndexMock });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      get: getMock,
      insert: insertWrapper,
      patch: patchWrapper,
      delete: deleteMock,
      query: queryMock,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as MutationCtx;
}

/**
 * QueryCtx の最小モックを生成する。
 * groupMembers テーブルの by_user_id クエリはグループメンバーを返す。
 */
export function createQueryCtx(
  identity: UserIdentity | null,
  queryDocs: ReceiptDoc[] = [],
  expenseEntryDocs: ExpenseEntryDoc[] = [],
  groupId: string = GROUP_ID,
): QueryCtx {
  const groupMember =
    identity !== null
      ? {
          _id: "member-001",
          _creationTime: 1000,
          groupId,
          userId: identity.tokenIdentifier,
          role: "owner",
        }
      : null;

  const makeChain = (docs: Array<Record<string, unknown>>) => ({
    withIndex: vi
      .fn()
      .mockImplementation((_indexName: string, builder: (q: unknown) => unknown) => {
        // groupMembers テーブルのクエリ
        if (_indexName === "by_user_id") {
          const q = { eq: vi.fn().mockImplementation(() => q) };
          builder(q);
          return { unique: vi.fn().mockResolvedValue(groupMember) };
        }

        const filters: Record<string, { eq?: unknown; gte?: unknown; lte?: unknown }> = {};
        const q = {
          eq: vi.fn().mockImplementation((field: string, value: unknown) => {
            filters[field] ??= {};
            filters[field].eq = value;
            return q;
          }),
          gte: vi.fn().mockImplementation((field: string, value: unknown) => {
            filters[field] ??= {};
            filters[field].gte = value;
            return q;
          }),
          lte: vi.fn().mockImplementation((field: string, value: unknown) => {
            filters[field] ??= {};
            filters[field].lte = value;
            return q;
          }),
        };
        builder(q);
        const filteredDocs = docs.filter((doc) =>
          Object.entries(filters).every(([field, condition]) => {
            if (!(field in doc)) {
              return true;
            }
            const value = (doc as Record<string, unknown>)[field];
            if (condition.eq !== undefined && value !== condition.eq) {
              return false;
            }
            if (condition.gte !== undefined && String(value) < String(condition.gte)) {
              return false;
            }
            if (condition.lte !== undefined && String(value) > String(condition.lte)) {
              return false;
            }
            return true;
          }),
        );
        const queryChain = {
          take: vi.fn().mockImplementation(async (limit?: number) => {
            return typeof limit === "number" ? filteredDocs.slice(0, limit) : filteredDocs;
          }),
          order: vi.fn(),
          async *[Symbol.asyncIterator]() {
            yield* filteredDocs;
          },
        };
        queryChain.order.mockReturnValue(queryChain);
        return queryChain;
      }),
  });

  const queryMock = vi.fn().mockImplementation((tableName: string) => {
    if (tableName === "groupMembers") {
      return makeChain([]);
    }
    if (tableName === "expenseEntries") {
      return makeChain(expenseEntryDocs as Record<string, unknown>[]);
    }
    return makeChain(queryDocs as Record<string, unknown>[]);
  });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      get: vi.fn().mockResolvedValue(null),
      query: queryMock,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as QueryCtx;
}

/**
 * QueryCtx の最小モックを生成する（receipts + categories の2クエリ対応）。
 * query() の呼び出し順序（1回目=receipts、2回目=categories）を利用して
 * それぞれ異なるデータを返す。
 * groupMembers テーブルの by_user_id クエリはグループメンバーを返す。
 */
export function createQueryCtxForSummary(
  identity: UserIdentity | null,
  receiptDocs: ReceiptDoc[] = [],
  categoryDocs: CategoryDoc[] = [],
  expenseEntryDocs: ExpenseEntryDoc[] = [],
  groupId: string = GROUP_ID,
): QueryCtx {
  const groupMember =
    identity !== null
      ? {
          _id: "member-001",
          _creationTime: 1000,
          groupId,
          userId: identity.tokenIdentifier,
          role: "owner",
        }
      : null;

  const makeChain = (docs: unknown[], supportsCollect: boolean) => {
    const collectMock = vi.fn().mockResolvedValue(docs);
    const takeMock = vi.fn().mockImplementation(async (limit?: number) => {
      return typeof limit === "number" ? docs.slice(0, limit) : docs;
    });
    const chain: Record<string, unknown> = {
      take: takeMock,
      order: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield* docs;
      },
    };
    if (supportsCollect) {
      chain.collect = collectMock;
    }
    (chain.order as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    const withIndexMock = vi
      .fn()
      .mockImplementation((_indexName: string, builder: (q: unknown) => unknown) => {
        // groupMembers テーブルの by_user_id クエリはグループメンバーを返す
        if (_indexName === "by_user_id") {
          const q = { eq: vi.fn().mockImplementation(() => q) };
          builder(q);
          return { unique: vi.fn().mockResolvedValue(groupMember) };
        }

        const filters: Record<string, { eq?: unknown; gte?: unknown; lte?: unknown }> = {};
        const q = {
          eq: vi.fn().mockImplementation((field: string, value: unknown) => {
            filters[field] ??= {};
            filters[field].eq = value;
            return q;
          }),
          gte: vi.fn().mockImplementation((field: string, value: unknown) => {
            filters[field] ??= {};
            filters[field].gte = value;
            return q;
          }),
          lte: vi.fn().mockImplementation((field: string, value: unknown) => {
            filters[field] ??= {};
            filters[field].lte = value;
            return q;
          }),
        };
        builder(q);
        const filteredDocs = docs.filter((doc) => {
          if (typeof doc !== "object" || doc === null) {
            return true;
          }
          return Object.entries(filters).every(([field, condition]) => {
            if (!(field in doc)) {
              return true;
            }
            const value = (doc as Record<string, unknown>)[field];
            if (condition.eq !== undefined && value !== condition.eq) {
              return false;
            }
            if (condition.gte !== undefined && String(value) < String(condition.gte)) {
              return false;
            }
            if (condition.lte !== undefined && String(value) > String(condition.lte)) {
              return false;
            }
            return true;
          });
        });
        const filteredChain: Record<string, unknown> = {
          take: vi.fn().mockImplementation(async (limit?: number) => {
            return typeof limit === "number" ? filteredDocs.slice(0, limit) : filteredDocs;
          }),
          order: vi.fn(),
          async *[Symbol.asyncIterator]() {
            yield* filteredDocs;
          },
        };
        if (supportsCollect) {
          filteredChain.collect = vi.fn().mockResolvedValue(filteredDocs);
        }
        (filteredChain.order as ReturnType<typeof vi.fn>).mockReturnValue(filteredChain);
        return filteredChain;
      });
    return { withIndex: withIndexMock };
  };

  const queryMock = vi.fn().mockImplementation((tableName: string) => {
    if (tableName === "groupMembers") {
      return makeChain([], false);
    }
    if (tableName === "receipts") {
      return makeChain(receiptDocs, false);
    }
    if (tableName === "expenseEntries") {
      return makeChain(expenseEntryDocs, false);
    }
    return makeChain(categoryDocs, true);
  });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      query: queryMock,
      get: vi.fn().mockImplementation(async (id: string) => {
        return categoryDocs.find((category) => category._id === id) ?? null;
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as QueryCtx;
}

// ---------------------------------------------------------------------------
// テスト用フィクスチャ
// ---------------------------------------------------------------------------

export const USER_ID = "https://issuer.example|user-001";
export const OTHER_USER_ID = "https://issuer.example|user-002";

export const sampleCategory: CategoryDoc = {
  _id: "cat-001",
  _creationTime: 1000,
  groupId: GROUP_ID,
  name: "食費",
  color: "#8B5E3C",
  isActive: true,
  sortOrder: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

export const otherGroupCategory: CategoryDoc = {
  _id: "cat-other",
  _creationTime: 1000,
  groupId: OTHER_GROUP_ID,
  name: "外食",
  color: "#F4A27A",
  isActive: true,
  sortOrder: 3,
  createdAt: 1000,
  updatedAt: 1000,
};

export const sampleReceipt: ReceiptDoc = {
  _id: "receipt-001",
  _creationTime: 1000,
  groupId: GROUP_ID,
  date: "2024-01-10",
  shopName: "スーパー",
  amountYen: 1500,
  categoryId: "cat-001",
  weekStartDate: "2024-01-08",
  createdAt: 1000,
  updatedAt: 1000,
};

export const otherGroupReceipt: ReceiptDoc = {
  _id: "receipt-other",
  _creationTime: 1000,
  groupId: OTHER_GROUP_ID,
  date: "2024-01-10",
  shopName: "コンビニ",
  amountYen: 500,
  categoryId: "cat-other",
  weekStartDate: "2024-01-08",
  createdAt: 1000,
  updatedAt: 1000,
};

// ---------------------------------------------------------------------------
// calculateWeekStartDate テスト
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getMonthlyExpensesSummary テスト用ヘルパー
// ---------------------------------------------------------------------------

export type UserDoc = {
  _id: string;
  _creationTime: number;
  userId: string;
  displayName: string;
  email?: string;
  monthlyIncome?: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * getMonthlyExpensesSummaryHandler が必要とする QueryCtx の最小モックを生成する。
 * receipts テーブルと users テーブルの2つをクエリする。
 * receipts は by_user_id_and_date インデックス + async iteration
 * users は by_token_identifier インデックス + unique()
 */
export function createQueryCtxForMonthlySummary(
  identity: UserIdentity | null,
  receiptDocs: ReceiptDoc[] = [],
  userDoc: UserDoc | null = null,
  expenseEntryDocs: ExpenseEntryDoc[] = [],
): QueryCtx {
  const groupMember =
    identity !== null
      ? {
          _id: "member-001",
          _creationTime: 1000,
          groupId: GROUP_ID,
          userId: identity.tokenIdentifier,
          role: "owner",
        }
      : null;

  const queryMock = vi.fn().mockImplementation((tableName: string) => {
    if (tableName === "groupMembers") {
      // groupMembers: withIndex("by_user_id") → unique() でgroupMemberを返す
      const withIndexMock = vi.fn().mockReturnValue({
        unique: vi.fn().mockResolvedValue(groupMember),
      });
      return { withIndex: withIndexMock };
    } else if (tableName === "receipts") {
      // receipts: withIndex → collect() で全件返す
      const withIndexMock = vi
        .fn()
        .mockImplementation((_indexName: string, builder: (q: unknown) => unknown) => {
          const filters: Record<string, { eq?: unknown; gte?: unknown; lte?: unknown }> = {};
          const q = {
            eq: vi.fn().mockImplementation((field: string, value: unknown) => {
              filters[field] ??= {};
              filters[field].eq = value;
              return q;
            }),
            gte: vi.fn().mockImplementation((field: string, value: unknown) => {
              filters[field] ??= {};
              filters[field].gte = value;
              return q;
            }),
            lte: vi.fn().mockImplementation((field: string, value: unknown) => {
              filters[field] ??= {};
              filters[field].lte = value;
              return q;
            }),
          };
          builder(q);
          const filteredDocs = receiptDocs.filter((doc) =>
            Object.entries(filters).every(([field, condition]) => {
              if (!(field in doc)) return true;
              const value = (doc as Record<string, unknown>)[field];
              if (condition.eq !== undefined && value !== condition.eq) {
                return false;
              }
              if (condition.gte !== undefined && String(value) < String(condition.gte)) {
                return false;
              }
              if (condition.lte !== undefined && String(value) > String(condition.lte)) {
                return false;
              }
              return true;
            }),
          );
          return {
            collect: vi.fn().mockResolvedValue(filteredDocs),
            order: vi.fn().mockReturnThis(),
            take: vi.fn().mockResolvedValue(filteredDocs),
            async *[Symbol.asyncIterator]() {
              yield* filteredDocs;
            },
          };
        });
      return { withIndex: withIndexMock };
    } else if (tableName === "expenseEntries") {
      const withIndexMock = vi
        .fn()
        .mockImplementation((_indexName: string, builder: (q: unknown) => unknown) => {
          const filters: Record<string, { eq?: unknown; gte?: unknown; lte?: unknown }> = {};
          const q = {
            eq: vi.fn().mockImplementation((field: string, value: unknown) => {
              filters[field] ??= {};
              filters[field].eq = value;
              return q;
            }),
            gte: vi.fn().mockImplementation((field: string, value: unknown) => {
              filters[field] ??= {};
              filters[field].gte = value;
              return q;
            }),
            lte: vi.fn().mockImplementation((field: string, value: unknown) => {
              filters[field] ??= {};
              filters[field].lte = value;
              return q;
            }),
          };
          builder(q);
          const filteredDocs = expenseEntryDocs.filter((doc) =>
            Object.entries(filters).every(([field, condition]) => {
              if (!(field in doc)) return true;
              const value = (doc as Record<string, unknown>)[field];
              if (condition.eq !== undefined && value !== condition.eq) {
                return false;
              }
              if (condition.gte !== undefined && String(value) < String(condition.gte)) {
                return false;
              }
              if (condition.lte !== undefined && String(value) > String(condition.lte)) {
                return false;
              }
              return true;
            }),
          );
          return {
            collect: vi.fn().mockResolvedValue(filteredDocs),
            order: vi.fn().mockReturnThis(),
            take: vi.fn().mockResolvedValue(filteredDocs),
            async *[Symbol.asyncIterator]() {
              yield* filteredDocs;
            },
          };
        });
      return { withIndex: withIndexMock };
    } else {
      // users: withIndex → unique() でuserDocを返す
      const withIndexMock = vi.fn().mockReturnValue({
        unique: vi.fn().mockResolvedValue(userDoc),
      });
      return { withIndex: withIndexMock };
    }
  });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      get: vi.fn().mockResolvedValue(null),
      query: queryMock,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as QueryCtx;
}
