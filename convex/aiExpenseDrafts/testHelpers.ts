import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

export type DraftDoc = {
  _id: string;
  _creationTime: number;
  groupId: string;
  sourceType: "image_upload";
  status: "queued" | "analyzing" | "ready" | "needs_review" | "failed" | "registered";
  documentType: "receipt" | "convenience_payment" | "unknown";
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date?: string;
  amountYen?: number;
  registrationMode?: "detailed" | "totalOnly";
  receiptTotalResolution?: {
    status: "verified" | "ambiguous" | "contradictory";
    protectedAmountYen: number | null;
    candidates: Array<{
      amountYen: number;
      source: "user_confirmed";
      evidence: string;
    }>;
    reasons: string[];
  };
  categoryId?: string;
  confidence: {
    documentType?: number;
    shopName?: number;
    paymentPlace?: number;
    payeeName?: number;
    paymentPurpose?: number;
    date?: number;
    amountYen?: number;
    categoryId?: number;
  };
  warnings: string[];
  reviewReasons: Array<
    | "low_confidence"
    | "missing_required_field"
    | "ambiguous_document_type"
    | "ambiguous_category"
    | "multiple_categories"
    | "user_confirmation_required"
    | "amount_mismatch"
    | "parse_failed"
  >;
  registeredReceiptId?: string;
  createdAt: number;
  updatedAt: number;
};

export type DraftItemDoc = {
  _id: string;
  _creationTime: number;
  groupId: string;
  draftId: string;
  itemName: string;
  amountYen: number;
  categoryName?: string;
  categoryId?: string;
  confidence: {
    itemName?: number;
    amountYen?: number;
    categoryName?: number;
    categoryId?: number;
  };
  warnings?: string[];
  createdAt: number;
  updatedAt: number;
};

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

export function createMutationCtx(
  identity: UserIdentity | null,
  opts: {
    getDocById?: Record<
      string,
      DraftDoc | DraftItemDoc | { groupId: string; isActive?: boolean } | null
    >;
    insertedDoc?: DraftDoc;
    insertedIds?: string[];
    items?: DraftItemDoc[];
    expenseEntries?: Array<{
      _id: string;
      groupId: string;
      categoryId?: string;
    }>;
    runMutation?: ReturnType<typeof vi.fn>;
    groupId?: string;
  } = {},
): MutationCtx {
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

  const insertedIds = opts.insertedIds ?? ["new-draft-id"];
  let insertCallCount = 0;
  const insertMock = vi.fn().mockImplementation(async () => {
    const nextId = insertedIds[Math.min(insertCallCount, insertedIds.length - 1)];
    insertCallCount += 1;
    return nextId;
  });
  const patchMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockResolvedValue(undefined);
  const getMock = vi.fn().mockImplementation(async (id: string) => {
    if (id === "new-draft-id" && opts.insertedDoc) {
      return opts.insertedDoc;
    }
    return opts.getDocById?.[id] ?? null;
  });
  const queryMock = vi.fn().mockImplementation((_tableName: string) => ({
    withIndex: vi
      .fn()
      .mockImplementation((_indexName: string, builder?: (q: unknown) => unknown) => {
        // groupMembers の by_user_id クエリはグループメンバーを返す
        if (_indexName === "by_user_id") {
          if (builder) {
            const q = { eq: vi.fn().mockImplementation(() => q) };
            builder(q);
          }
          return { unique: vi.fn().mockResolvedValue(groupMember) };
        }
        const rows =
          _tableName === "expenseEntries" ? (opts.expenseEntries ?? []) : (opts.items ?? []);
        return {
          take: vi.fn().mockImplementation(async (limit: number) => rows.slice(0, limit)),
          order: vi.fn().mockReturnValue({
            take: vi.fn().mockImplementation(async (limit: number) => rows.slice(0, limit)),
            collect: vi.fn().mockResolvedValue(rows),
          }),
          collect: vi.fn().mockResolvedValue(rows),
        };
      }),
  }));
  const runMutationMock = opts.runMutation ?? vi.fn().mockResolvedValue(["entry-1", "entry-2"]);

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      get: getMock,
      insert: insertMock,
      patch: patchMock,
      delete: deleteMock,
      query: queryMock,
    },
    runMutation: runMutationMock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as MutationCtx;
}

export function createQueryCtx(
  identity: UserIdentity | null,
  opts: {
    drafts?: DraftDoc[];
    items?: DraftItemDoc[];
    getDocById?: Record<string, DraftDoc | null>;
    groupId?: string;
  } = {},
): QueryCtx {
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

  const withIndexMock = vi
    .fn()
    .mockImplementation((indexName: string, builder: (q: unknown) => unknown) => {
      // groupMembers の by_user_id クエリはグループメンバーを返す
      if (indexName === "by_user_id") {
        const q = { eq: vi.fn().mockImplementation(() => q) };
        builder(q);
        return { unique: vi.fn().mockResolvedValue(groupMember) };
      }

      const filters: Record<string, unknown> = {};
      const q = {
        eq: vi.fn().mockImplementation((field: string, value: unknown) => {
          filters[field] = value;
          return q;
        }),
      };
      builder(q);

      const sourceDocs =
        indexName === "by_group_id_and_draft_id" ? (opts.items ?? []) : (opts.drafts ?? []);
      const filteredDocs = sourceDocs.filter((doc) =>
        Object.entries(filters).every(([field, value]) => {
          return (doc as Record<string, unknown>)[field] === value;
        }),
      );
      const chain = {
        order: vi.fn(),
        take: vi.fn().mockImplementation(async (limit?: number) => {
          return typeof limit === "number" ? filteredDocs.slice(0, limit) : filteredDocs;
        }),
        collect: vi.fn().mockResolvedValue(filteredDocs),
      };
      chain.order.mockReturnValue(chain);
      return chain;
    });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      get: vi.fn().mockImplementation(async (id: string) => opts.getDocById?.[id] ?? null),
      query: vi.fn().mockReturnValue({ withIndex: withIndexMock }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as QueryCtx;
}

export function createActionCtx(
  identity: UserIdentity | null,
  hasConsent: boolean,
  opts: {
    runMutation?: ReturnType<typeof vi.fn>;
    runQuery?: ReturnType<typeof vi.fn>;
  } = {},
): ActionCtx {
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

  let queryCallCount = 0;
  const defaultRunQuery = vi.fn().mockImplementation(async () => {
    queryCallCount++;
    if (queryCallCount === 1) {
      return {
        hasAcceptedExternalApiConsent: hasConsent,
        acceptedAt: hasConsent ? 1234567890 : null,
      };
    }
    return [];
  });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    // extractReceiptFieldsHandler 内の requireGroupMembership が ctx.db.query を呼ぶ
    db: {
      query: vi.fn().mockImplementation((_tableName: string) => ({
        withIndex: vi
          .fn()
          .mockImplementation((_indexName: string, builder?: (q: unknown) => unknown) => {
            if (builder) {
              const q = { eq: vi.fn().mockImplementation(() => q) };
              builder(q);
            }
            return { unique: vi.fn().mockResolvedValue(groupMember) };
          }),
      })),
    },
    runQuery: opts.runQuery ?? defaultRunQuery,
    runMutation:
      opts.runMutation ??
      vi.fn().mockResolvedValue({
        _id: "draft-created-by-action",
        status: "needs_review",
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as ActionCtx;
}

export async function withEnv(
  envVars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(envVars)) {
    original[key] = process.env[key];
    if (envVars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = envVars[key];
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

export const ownedDraft: DraftDoc = {
  _id: "draft-owned",
  _creationTime: 1000,
  groupId: GROUP_ID,
  sourceType: "image_upload",
  status: "needs_review",
  documentType: "receipt",
  shopName: "スーパー青葉",
  date: "2026-06-01",
  amountYen: 1200,
  confidence: {
    shopName: 0.92,
    date: 0.88,
    amountYen: 0.95,
  },
  warnings: ["日付の印字が薄い"],
  reviewReasons: ["low_confidence"],
  createdAt: 1000,
  updatedAt: 1000,
};

export const readyDraft: DraftDoc = {
  ...ownedDraft,
  _id: "draft-ready",
  status: "ready",
  reviewReasons: [],
  warnings: [],
  categoryId: "cat-food",
};

export const readyDraftItems: DraftItemDoc[] = [
  {
    _id: "draft-item-1",
    _creationTime: 0,
    groupId: GROUP_ID,
    draftId: "draft-ready",
    itemName: "食料品",
    amountYen: 1000,
    categoryId: "cat-food",
    confidence: { itemName: 0.99, amountYen: 0.99, categoryId: 0.99 },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    _id: "draft-item-2",
    _creationTime: 0,
    groupId: GROUP_ID,
    draftId: "draft-ready",
    itemName: "日用品",
    amountYen: 500,
    categoryId: "cat-food",
    confidence: { itemName: 0.99, amountYen: 0.99, categoryId: 0.99 },
    createdAt: 0,
    updatedAt: 0,
  },
];

export const mixedCategoryDraftItems: DraftItemDoc[] = [
  {
    _id: "draft-item-food-1",
    _creationTime: 0,
    groupId: GROUP_ID,
    draftId: "draft-ready",
    itemName: "パン",
    amountYen: 150,
    categoryId: "cat-food",
    confidence: { itemName: 0.99, amountYen: 0.99, categoryId: 0.99 },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    _id: "draft-item-food-2",
    _creationTime: 0,
    groupId: GROUP_ID,
    draftId: "draft-ready",
    itemName: "牛乳",
    amountYen: 250,
    categoryId: "cat-food",
    confidence: { itemName: 0.99, amountYen: 0.99, categoryId: 0.99 },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    _id: "draft-item-medical",
    _creationTime: 0,
    groupId: GROUP_ID,
    draftId: "draft-ready",
    itemName: "胃薬",
    amountYen: 980,
    categoryId: "cat-medical",
    confidence: { itemName: 0.99, amountYen: 0.99 },
    createdAt: 0,
    updatedAt: 0,
  },
];
