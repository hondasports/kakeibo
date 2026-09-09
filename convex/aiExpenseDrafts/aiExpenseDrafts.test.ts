import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { analyzeReceiptImageToDraftHandler } from "./actions";
import {
  createFailedDraftFromImageAnalysisHandler,
  createFromExtractionHandler,
  deleteOrphanedDraftHandler,
} from "./internal";
import { getWithItemsHandler, listByStatusHandler } from "./queries";
import {
  deleteDraftHandler,
  registerReadyDraftsAsExpenseEntriesHandler,
  registerReadyDraftsHandler,
  updateForReviewHandler,
} from "./mutations";

type DraftDoc = {
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

type DraftItemDoc = {
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

function createIdentity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    tokenIdentifier: "https://issuer.example|user-001",
    subject: "user-001",
    issuer: "https://issuer.example",
    ...overrides,
  };
}

const GROUP_ID = "group-001";
const OTHER_GROUP_ID = "group-other";

function createMutationCtx(
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

function createQueryCtx(
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

function createActionCtx(
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

async function withEnv(
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

const ownedDraft: DraftDoc = {
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

const readyDraft: DraftDoc = {
  ...ownedDraft,
  _id: "draft-ready",
  status: "ready",
  reviewReasons: [],
  warnings: [],
  categoryId: "cat-food",
};

const readyDraftItems: DraftItemDoc[] = [
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

const mixedCategoryDraftItems: DraftItemDoc[] = [
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

describe("aiExpenseDrafts", () => {
  it("画像解析成功時に抽出結果を receipt ではなく AI 支出下書きとして保存する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      insertedDoc: {
        ...ownedDraft,
        _id: "new-draft-id",
        status: "needs_review",
      },
    });

    const result = await createFromExtractionHandler(ctx, {
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-06-01",
      amountYen: 1200,
      rawObservationLines: [
        {
          rawText: "合計 1,200円",
          amountText: "1,200円",
          amountYen: 1200,
          lineRoleCandidates: ["total"],
          roleConfidence: 0.95,
          explicitlyPrinted: true,
          sourceLineIndex: 4,
        },
      ],
      receiptLineClassifications: [
        {
          sourceLineIndex: 4,
          status: "classified",
          candidates: [
            {
              role: "totalCandidate",
              score: 0.98,
              evidence: ["explicit_label:total", "position:receipt_footer"],
            },
          ],
        },
      ],
      confidence: {
        shopName: 0.92,
        date: 0.88,
        amountYen: 0.95,
      },
      warnings: ["日付の印字が薄い"],
      reviewReasons: ["low_confidence"],
    });

    expect(result).toMatchObject({
      _id: "new-draft-id",
      groupId: GROUP_ID,
      status: "needs_review",
      warnings: ["日付の印字が薄い"],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        groupId: GROUP_ID,
        sourceType: "image_upload",
        status: "needs_review",
        documentType: "receipt",
        shopName: "スーパー青葉",
        receiptDataContractVersion: 1,
        rawObservation: expect.objectContaining({
          source: "ai_ocr",
          lines: [expect.objectContaining({ rawText: "合計 1,200円", amountYen: 1200 })],
        }),
        receiptInterpretation: expect.objectContaining({
          source: "ai",
          values: expect.objectContaining({
            amountYen: 1200,
            shopName: "スーパー青葉",
            receiptLineClassifications: [
              expect.objectContaining({
                sourceLineIndex: 4,
                candidates: [expect.objectContaining({ role: "totalCandidate" })],
              }),
            ],
          }),
        }),
      }),
    );
    expect(dbInsert).not.toHaveBeenCalledWith("receipts", expect.anything());
    const insertedDraft = dbInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(insertedDraft).not.toHaveProperty("imageDataUrl");
    expect(insertedDraft).not.toHaveProperty("image");
  });

  it("keywordless負額販促行のlineTypeとwarningを下書き明細へ保存する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      insertedDoc: { ...ownedDraft, _id: "new-draft-id", status: "needs_review" },
    });

    await createFromExtractionHandler(ctx, {
      documentType: "receipt",
      shopName: "マルアイ",
      date: "2026-08-16",
      amountYen: 7462,
      confidence: { shopName: 1, date: 1, amountYen: 1 },
      warnings: [],
      reviewReasons: ["user_confirmation_required"],
      items: [
        {
          itemName: "M002 玉ねぎ3玉",
          lineType: "unknown",
          amountYen: -16,
          printedAmountYen: -16,
          confidence: { itemName: 0.8, amountYen: 1 },
          warnings: ["negative_amount_line_type_uncertain"],
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({
        itemName: "M002 玉ねぎ3玉",
        lineType: "unknown",
        amountYen: -16,
        printedAmountYen: -16,
        warnings: ["negative_amount_line_type_uncertain"],
      }),
    );
  });

  it("再解析では新しいAI interpretationを保存しつつuser overrideを正本にする", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "category-food": { groupId: GROUP_ID },
      },
      insertedDoc: { ...ownedDraft, _id: "new-draft-id", status: "needs_review" },
    });
    const preservedUserOverride = {
      source: "user" as const,
      updatedAt: 123,
      fields: ["shopName", "amountYen"],
      values: {
        status: "needs_review" as const,
        documentType: "receipt" as const,
        shopName: "ユーザー確定店舗",
        date: "2026-07-03",
        amountYen: 7803,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "category-food" as any,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: ["amount_mismatch" as const],
        items: [],
      },
    };

    await createFromExtractionHandler(ctx, {
      documentType: "receipt",
      shopName: "AI再解析店舗",
      date: "2026-07-04",
      amountYen: 803,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "category-food" as any,
      confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
      warnings: [],
      preservedUserOverride,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        shopName: "ユーザー確定店舗",
        amountYen: 7803,
        receiptUserOverride: preservedUserOverride,
        receiptInterpretation: expect.objectContaining({
          source: "ai",
          values: expect.objectContaining({ shopName: "AI再解析店舗", amountYen: 803 }),
        }),
      }),
    );
  });

  it("税率別集計と正規化済み明細を下書きへ保存する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      insertedDoc: { ...ownedDraft, _id: "new-draft-id", status: "needs_review" },
    });

    await createFromExtractionHandler(ctx, {
      documentType: "receipt",
      shopName: "TRIAL",
      date: "2026-07-03",
      amountYen: 1683,
      receiptTotalResolution: {
        status: "verified",
        protectedAmountYen: 1683,
        candidates: [
          {
            amountYen: 1683,
            source: "explicit_label",
            evidence: "extraction.amountYen",
          },
        ],
        reasons: [],
      },
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 1559,
          taxableAmountBasis: "tax_excluded",
          taxYen: 124,
          taxIncludedAmountYen: 1683,
          roundingMethod: "floor",
          confidence: {},
          warnings: [],
        },
      ],
      confidence: { shopName: 1, date: 1, amountYen: 1 },
      warnings: [],
      items: [
        {
          itemName: "たまご",
          amountYen: 322,
          printedAmountYen: 298,
          amountBasis: "tax_excluded",
          taxRatePercent: 8,
          taxMarker: "*",
          allocatedTaxYen: 24,
          normalizedAmountYen: 322,
          quantity: 1,
          unitPriceYen: 298,
          confidence: {},
          warnings: [],
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        amountYen: 1683,
        taxSummaries: expect.any(Array),
        receiptTotalResolution: expect.objectContaining({
          status: "verified",
          protectedAmountYen: 1683,
          candidates: expect.arrayContaining([
            expect.objectContaining({ source: "explicit_label", evidence: "extraction.amountYen" }),
          ]),
        }),
      }),
    );
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({
        amountYen: 322,
        printedAmountYen: 298,
        allocatedTaxYen: 24,
        normalizedAmountYen: 322,
      }),
    );
  });

  it("下書き保存時は抽出精度にかかわらずユーザー確認を必須にする", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "category-food": {
          groupId: GROUP_ID,
        },
      },
      insertedDoc: {
        ...ownedDraft,
        _id: "new-draft-id",
        status: "needs_review",
        reviewReasons: ["user_confirmation_required"],
      },
    });

    await createFromExtractionHandler(ctx, {
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-06-01",
      amountYen: 1200,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "category-food" as any,
      confidence: {
        documentType: 0.92,
        shopName: 0.91,
        date: 0.93,
        amountYen: 0.96,
        categoryId: 0.9,
      },
      warnings: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        status: "needs_review",
        reviewReasons: ["user_confirmation_required"],
      }),
    );
  });

  it("下書き保存時に明細項目のカテゴリ名・カテゴリID・警告を保存する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "category-food": {
          groupId: GROUP_ID,
        },
        "category-medical": {
          groupId: GROUP_ID,
        },
      },
      insertedDoc: {
        ...ownedDraft,
        _id: "new-draft-id",
        status: "ready",
        reviewReasons: [],
      },
      insertedIds: ["new-draft-id", "item-food", "item-medical"],
    });

    await createFromExtractionHandler(ctx, {
      documentType: "receipt",
      shopName: "ドラッグストアA",
      date: "2026-06-21",
      amountYen: 1130,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "category-food" as any,
      confidence: {
        documentType: 0.92,
        shopName: 0.91,
        date: 0.93,
        amountYen: 0.96,
        categoryId: 0.9,
      },
      warnings: [],
      items: [
        {
          itemName: "パン",
          amountYen: 150,
          categoryName: "食費",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoryId: "category-food" as any,
          confidence: {
            itemName: 0.9,
            amountYen: 0.95,
            categoryName: 0.8,
            categoryId: 0.8,
          },
          warnings: [],
        },
        {
          itemName: "胃薬",
          amountYen: 980,
          categoryName: "医療費",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoryId: "category-medical" as any,
          confidence: {
            itemName: 0.85,
            amountYen: 0.95,
            categoryName: 0.82,
            categoryId: 0.82,
          },
          warnings: ["品名が不鮮明です"],
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenNthCalledWith(
      2,
      "aiExpenseDraftItems",
      expect.objectContaining({
        groupId: GROUP_ID,
        draftId: "new-draft-id",
        itemName: "パン",
        amountYen: 150,
        categoryName: "食費",
        categoryId: "category-food",
        confidence: expect.objectContaining({
          categoryName: 0.8,
          categoryId: 0.8,
        }),
        warnings: [],
      }),
    );
    expect(dbInsert).toHaveBeenNthCalledWith(
      3,
      "aiExpenseDraftItems",
      expect.objectContaining({
        itemName: "胃薬",
        amountYen: 980,
        categoryName: "医療費",
        categoryId: "category-medical",
        warnings: ["品名が不鮮明です"],
      }),
    );
  });

  it("画像解析失敗時に failed 状態の下書きを作成する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      insertedDoc: {
        ...ownedDraft,
        _id: "new-draft-id",
        status: "failed",
        documentType: "unknown",
        warnings: ["画像解析に失敗しました"],
        reviewReasons: ["parse_failed"],
      },
    });

    await createFailedDraftFromImageAnalysisHandler(ctx, {
      warning: "画像解析に失敗しました",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        groupId: GROUP_ID,
        status: "failed",
        documentType: "unknown",
        warnings: ["画像解析に失敗しました"],
        reviewReasons: ["parse_failed"],
      }),
    );
  });

  it("存在しないカテゴリを指定した下書き作成は拒否する", async () => {
    const ctx = createMutationCtx(createIdentity());

    await expect(
      createFromExtractionHandler(ctx, {
        documentType: "receipt",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "category-missing" as any,
        confidence: {},
        warnings: [],
      }),
    ).rejects.toMatchObject({ data: "Category does not belong to the current group" });
  });

  it("作成直後に下書きを取得できない場合は失敗として扱う", async () => {
    const ctx = createMutationCtx(createIdentity());

    await expect(
      createFromExtractionHandler(ctx, {
        documentType: "receipt",
        confidence: {},
        warnings: [],
      }),
    ).rejects.toMatchObject({ data: "AI expense draft was not found after creation" });
  });

  it("失敗下書きの作成直後に下書きを取得できない場合は失敗として扱う", async () => {
    const ctx = createMutationCtx(createIdentity());

    await expect(
      createFailedDraftFromImageAnalysisHandler(ctx, {
        warning: "解析に失敗しました",
      }),
    ).rejects.toMatchObject({ data: "AI expense draft was not found after creation" });
  });

  it("孤立した下書きと明細を同じグループから削除する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-orphan": { ...ownedDraft, _id: "draft-orphan" },
      },
      items: [
        {
          ...readyDraftItems[0],
          _id: "item-orphan",
          draftId: "draft-orphan",
        },
      ],
    });

    await deleteOrphanedDraftHandler(ctx, { draftId: "draft-orphan" as Id<"aiExpenseDrafts"> });

    expect(ctx.db.delete).toHaveBeenCalledWith("item-orphan");
    expect(ctx.db.delete).toHaveBeenCalledWith("draft-orphan");
  });

  it("未認証ユーザーは下書きを作成できない", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      createFromExtractionHandler(ctx, {
        documentType: "receipt",
        confidence: {},
        warnings: [],
        reviewReasons: ["missing_required_field"],
      }),
    ).rejects.toMatchObject({ data: "Not authenticated" });
  });

  it("同意がない場合は画像解析を実行せず、下書きも作成しない", async () => {
    const ctx = createActionCtx(createIdentity(), false);

    await expect(
      analyzeReceiptImageToDraftHandler(ctx, {
        imageDataUrl: "data:image/jpeg;base64,AAA",
      }),
    ).rejects.toMatchObject({ data: "Receipt image external API consent is required" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(ctx.runMutation as any as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("解析成功後の下書き保存失敗は解析失敗として握りつぶさない", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      const runMutation = vi.fn().mockRejectedValue(new Error("draft insert failed"));
      const ctx = createActionCtx(createIdentity(), true, { runMutation });

      await expect(
        analyzeReceiptImageToDraftHandler(ctx, {
          imageDataUrl: "data:image/jpeg;base64,AAA",
        }),
      ).rejects.toThrow("draft insert failed");

      expect(runMutation).toHaveBeenCalledTimes(1);
    });
  });

  it("mock 解析結果から documentType 付きで下書きを作成する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      const runMutation = vi.fn().mockResolvedValue({
        _id: "draft-mock",
        status: "needs_review",
      });
      const ctx = createActionCtx(createIdentity(), true, { runMutation });

      await analyzeReceiptImageToDraftHandler(ctx, {
        imageDataUrl: "data:image/jpeg;base64,AAA",
      });

      expect(runMutation).toHaveBeenCalledTimes(1);
      const [, callArgs] = runMutation.mock.calls[0];
      expect(callArgs).toEqual(
        expect.objectContaining({
          documentType: "receipt",
          confidence: expect.objectContaining({
            documentType: expect.any(Number),
            shopName: expect.any(Number),
            date: expect.any(Number),
            amountYen: expect.any(Number),
          }),
        }),
      );
    });
  });

  it("カテゴリ名マッチングで categoryId を解決する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      const runQuery = vi
        .fn()
        .mockResolvedValueOnce({
          hasAcceptedExternalApiConsent: true,
          acceptedAt: 1234567890,
        })
        .mockResolvedValueOnce([
          { _id: "cat-food", name: "食費", color: "#F4A27A", isActive: true, sortOrder: 1 },
        ]);
      const runMutation = vi.fn().mockResolvedValue({
        _id: "draft-matched",
        status: "needs_review",
      });

      const ctx = createActionCtx(createIdentity(), true, { runQuery, runMutation });

      await analyzeReceiptImageToDraftHandler(ctx, {
        imageDataUrl: "data:image/jpeg;base64,AAA",
      });

      expect(runMutation).toHaveBeenCalledTimes(1);
      const [, callArgs2] = runMutation.mock.calls[0];
      expect(callArgs2).toEqual(
        expect.objectContaining({
          categoryId: "cat-food",
        }),
      );
    });
  });

  it.each([1, 101])("税サマリーなしの%d件目の課税明細も本登録前に検証する", async (count) => {
    const items = Array.from({ length: count }, (_, index) => ({
      _id: "item-" + index,
      _creationTime: index,
      groupId: GROUP_ID,
      draftId: "draft-ready",
      itemName: "商品",
      amountYen: 1,
      printedAmountYen: 1,
      normalizedAmountYen: 1,
      amountBasis: "tax_included",
      taxRatePercent: index === count - 1 ? 8 : 0,
      taxAllocationStatus: "unallocated",
      categoryId: "cat-food",
      confidence: {},
      createdAt: 0,
      updatedAt: 0,
    }));
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "draft-ready": { ...readyDraft, amountYen: count } },
      items,
    });
    await expect(
      registerReadyDraftsHandler(ctx, { draftIds: ["draft-ready" as Id<"aiExpenseDrafts">] }),
    ).rejects.toThrow("税額または税込登録額が未確定");
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("101件の確認済み非課税明細を切り捨てず登録する", async () => {
    const items = Array.from({ length: 101 }, (_, index) => ({
      _id: "item-" + index,
      _creationTime: index,
      groupId: GROUP_ID,
      draftId: "draft-ready",
      itemName: "商品",
      amountYen: 1,
      printedAmountYen: 1,
      normalizedAmountYen: 1,
      amountBasis: "tax_included",
      taxRatePercent: 0,
      taxAllocationStatus: "allocated",
      categoryId: "cat-food",
      confidence: {},
      createdAt: 0,
      updatedAt: 0,
    }));
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": { ...readyDraft, amountYen: 101 },
        "cat-food": { groupId: GROUP_ID, isActive: true },
      },
      items,
      insertedIds: ["receipt-101"],
    });
    await expect(
      registerReadyDraftsHandler(ctx, { draftIds: ["draft-ready" as Id<"aiExpenseDrafts">] }),
    ).resolves.toMatchObject({ registeredReceiptIds: ["receipt-101"] });
  });

  it("登録準備OKの下書きを receipts としてまとめて登録し、下書きを registered に更新する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": readyDraft,
        "draft-payment": {
          ...readyDraft,
          _id: "draft-payment",
          documentType: "convenience_payment",
          shopName: "セブンイレブン",
          payeeName: "東京都",
          paymentPurpose: "自動車税",
          amountYen: 39100,
        },
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
      insertedIds: ["receipt-001", "receipt-002"],
    });

    const result = await registerReadyDraftsHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftIds: ["draft-ready", "draft-payment"] as any,
    });

    expect(result).toEqual({
      registeredDraftIds: ["draft-ready", "draft-payment"],
      registeredReceiptIds: ["receipt-001", "receipt-002"],
      alreadyRegisteredDraftIds: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenNthCalledWith(
      1,
      "receipts",
      expect.objectContaining({
        groupId: GROUP_ID,
        date: "2026-06-01",
        type: "expense",
        shopName: "スーパー青葉",
        amountYen: 1200,
        categoryId: "cat-food",
      }),
    );
    expect(dbInsert).toHaveBeenNthCalledWith(
      2,
      "receipts",
      expect.objectContaining({
        shopName: "東京都 自動車税",
        amountYen: 39100,
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledTimes(2);
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-ready",
      expect.objectContaining({
        status: "registered",
        registeredReceiptId: "receipt-001",
        derivedRegistration: expect.objectContaining({
          source: "derived",
          destination: "receipt",
          amountYen: 1200,
          categoryIds: ["cat-food"],
        }),
      }),
    );
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-payment",
      expect.objectContaining({
        status: "registered",
        registeredReceiptId: "receipt-002",
      }),
    );
  });

  it("すでに登録済みの下書きは再登録せず、未登録の ready 下書きだけ登録する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": readyDraft,
        "draft-registered": {
          ...readyDraft,
          _id: "draft-registered",
          status: "registered",
          registeredReceiptId: "receipt-already",
        },
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
      insertedIds: ["receipt-003"],
    });

    const result = await registerReadyDraftsHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftIds: ["draft-ready", "draft-registered", "draft-ready"] as any,
    });

    expect(result).toEqual({
      registeredDraftIds: ["draft-ready"],
      registeredReceiptIds: ["receipt-003"],
      alreadyRegisteredDraftIds: ["draft-registered"],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledTimes(1);
  });

  it("ready 以外の下書きが含まれる場合はまとめて登録を拒否する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": readyDraft,
        "draft-review": {
          ...readyDraft,
          _id: "draft-review",
          status: "needs_review",
          reviewReasons: ["low_confidence"],
        },
      },
    });

    await expect(
      registerReadyDraftsHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftIds: ["draft-ready", "draft-review"] as any,
      }),
    ).rejects.toMatchObject({ data: "Only ready drafts can be registered" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).insert as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).patch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("他ユーザーの下書きはまとめて登録できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-other": {
          ...readyDraft,
          _id: "draft-other",
          groupId: OTHER_GROUP_ID,
        },
      },
    });

    await expect(
      registerReadyDraftsHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftIds: ["draft-other"] as any,
      }),
    ).rejects.toMatchObject({ data: "AI expense draft does not belong to the current group" });
  });

  it("登録対象が空なら何もせず空の結果を返す", async () => {
    const ctx = createMutationCtx(createIdentity());

    await expect(registerReadyDraftsHandler(ctx, { draftIds: [] })).resolves.toEqual({
      registeredDraftIds: [],
      registeredReceiptIds: [],
      alreadyRegisteredDraftIds: [],
    });
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("存在しない下書きの登録は拒否する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "draft-missing": null },
    });

    await expect(
      registerReadyDraftsHandler(ctx, {
        draftIds: ["draft-missing" as Id<"aiExpenseDrafts">],
      }),
    ).rejects.toMatchObject({ data: "AI expense draft not found" });
  });

  it("確認が必要な下書きを編集して登録準備OKへ戻す", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
    });

    await updateForReviewHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftId: "draft-owned" as any,
      documentType: "receipt",
      shopName: "スーパー青葉 北浜店",
      paymentPlace: "北浜",
      payeeName: "スーパー青葉",
      paymentPurpose: "食料品",
      date: "2026-06-02",
      amountYen: 1680,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-food" as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({
        status: "ready",
        reviewReasons: [],
      }),
    );
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({
        shopName: "スーパー青葉 北浜店",
        paymentPlace: "北浜",
        payeeName: "スーパー青葉",
        paymentPurpose: "食料品",
        date: "2026-06-02",
        amountYen: 1680,
        categoryId: "cat-food",
      }),
    );
  });

  it("確認下書きの明細を置き換えて登録準備OKへ戻す", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
      items: [
        {
          _id: "old-item-1",
          _creationTime: 1,
          groupId: GROUP_ID,
          draftId: "draft-owned",
          itemName: "古い明細",
          amountYen: 100,
          categoryId: "cat-food",
          confidence: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      insertedIds: ["new-item-1", "new-item-2"],
    });

    await updateForReviewHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftId: "draft-owned" as any,
      documentType: "receipt",
      shopName: "ドラッグストアA",
      date: "2026-06-21",
      amountYen: 1380,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-food" as any,
      items: [
        {
          itemName: "パン",
          amountYen: 400,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoryId: "cat-food" as any,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          warnings: [],
        },
        {
          itemName: "胃薬",
          amountYen: 980,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoryId: "cat-food" as any,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          warnings: [],
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbDelete = (ctx.db as any).delete as ReturnType<typeof vi.fn>;
    expect(dbDelete).toHaveBeenCalledWith("old-item-1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({
        draftId: "draft-owned",
        itemName: "パン",
        amountYen: 400,
        categoryId: "cat-food",
      }),
    );
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({
        draftId: "draft-owned",
        itemName: "胃薬",
        amountYen: 980,
        categoryId: "cat-food",
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({
        status: "ready",
        reviewReasons: [],
      }),
    );
  });

  it("確認下書きの割引明細を負数で保存できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-daily": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
      insertedIds: ["new-item-1", "new-item-2"],
    });

    await updateForReviewHandler(ctx, {
      draftId: "draft-owned" as Id<"aiExpenseDrafts">,
      documentType: "receipt",
      shopName: "クスリキリン堂 稲美店",
      date: "2026-06-29",
      amountYen: 990,
      categoryId: "cat-daily" as Id<"categories">,
      items: [
        {
          itemName: "キュレル ジェルメイク",
          amountYen: 1100,
          categoryId: "cat-daily" as Id<"categories">,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
        {
          itemName: "クーポン券割引 10%",
          amountYen: -110,
          categoryId: "cat-daily" as Id<"categories">,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({
        itemName: "クーポン券割引 10%",
        amountYen: -110,
        categoryId: "cat-daily",
      }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({ status: "ready", reviewReasons: [] }),
    );
  });

  it("他ユーザーの確認下書きは編集できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-other": {
          ...ownedDraft,
          _id: "draft-other",
          groupId: OTHER_GROUP_ID,
        },
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
    });

    await expect(
      updateForReviewHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftId: "draft-other" as any,
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-02",
        amountYen: 1680,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-food" as any,
      }),
    ).rejects.toMatchObject({ data: "AI expense draft does not belong to the current group" });
  });

  it("書類種別が未判定の確認下書きは登録準備OKへ戻せない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
    });

    await expect(
      updateForReviewHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftId: "draft-owned" as any,
        documentType: "unknown",
        shopName: "スーパー青葉",
        date: "2026-06-02",
        amountYen: 1680,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-food" as any,
      }),
    ).rejects.toMatchObject({ data: "Draft document type must be selected to mark ready" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).patch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("実在しない支出日の確認下書きは登録準備OKへ戻せない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-food": { groupId: GROUP_ID, isActive: true },
      },
    });

    await expect(
      updateForReviewHandler(ctx, {
        draftId: "draft-owned" as Id<"aiExpenseDrafts">,
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-02-30",
        amountYen: 1680,
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).rejects.toMatchObject({ data: "Draft date must be a valid YYYY-MM-DD date" });
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("登録準備OK状態の下書きはレビュー編集できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": {
          ...ownedDraft,
          _id: "draft-ready",
          status: "ready",
        },
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
    });

    await updateForReviewHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftId: "draft-ready" as any,
      documentType: "receipt",
      shopName: "スーパー青葉 北浜店",
      date: "2026-06-02",
      amountYen: 1680,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-food" as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-ready",
      expect.objectContaining({
        status: "ready",
        reviewReasons: [],
      }),
    );
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-ready",
      expect.objectContaining({
        shopName: "スーパー青葉 北浜店",
      }),
    );
  });

  it("登録済みの下書きは同じexpenseEntryを再利用してレビュー編集できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-registered": {
          ...ownedDraft,
          _id: "draft-registered",
          status: "registered",
          categoryId: "cat-food",
        },
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
      expenseEntries: [{ _id: "entry-existing", groupId: GROUP_ID, categoryId: "cat-food" }],
    });

    await updateForReviewHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftId: "draft-registered" as any,
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-06-02",
      amountYen: 1680,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-food" as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(patch).toHaveBeenCalledWith(
      "entry-existing",
      expect.objectContaining({ categoryId: "cat-food", source: "ai_suggested" }),
    );
    expect((ctx.db as any).insert as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("legacy receiptへ登録済みの下書きはexpenseEntryへ二重登録しない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-registered": {
          ...readyDraft,
          _id: "draft-registered",
          status: "registered",
          registeredReceiptId: "receipt-1",
        },
        "cat-food": { groupId: GROUP_ID, isActive: true },
      },
    });

    await expect(
      updateForReviewHandler(ctx, {
        draftId: "draft-registered" as Id<"aiExpenseDrafts">,
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-02",
        amountYen: 1680,
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).rejects.toMatchObject({
      data: "Legacy receipt registrations cannot be edited from the AI queue",
    });
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("払込票は統合した店名・内容で登録準備OKへ戻せる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-food": {
          groupId: GROUP_ID,
          isActive: true,
        },
      },
    });

    await updateForReviewHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftId: "draft-owned" as any,
      documentType: "convenience_payment",
      shopName: "大阪市水道局 水道料金",
      date: "2026-06-02",
      amountYen: 1680,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-food" as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({
        status: "ready",
      }),
    );
    expect(dbPatch).toHaveBeenCalledWith(
      "draft-owned",
      expect.objectContaining({
        shopName: "大阪市水道局 水道料金",
        paymentPlace: undefined,
        payeeName: undefined,
        paymentPurpose: undefined,
      }),
    );
  });

  it("無効化済みカテゴリでは確認下書きを登録準備OKへ戻せない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
        "cat-inactive": {
          groupId: GROUP_ID,
          isActive: false,
        },
      },
    });

    await expect(
      updateForReviewHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftId: "draft-owned" as any,
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-02",
        amountYen: 1680,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-inactive" as any,
      }),
    ).rejects.toMatchObject({ data: "Inactive category cannot be used for reviewed drafts" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).patch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("未登録下書きは明細ごとキューから削除できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
      },
      items: [
        {
          _id: "item-1",
          _creationTime: 1,
          groupId: GROUP_ID,
          draftId: "draft-owned",
          itemName: "牛乳",
          amountYen: 198,
          confidence: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await deleteDraftHandler(ctx, { draftId: "draft-owned" as any });

    expect(result).toEqual({ deleted: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).delete as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("item-1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).delete as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("draft-owned");
  });

  it("登録済み下書きはキューから削除できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-registered": {
          ...ownedDraft,
          _id: "draft-registered",
          status: "registered",
          registeredReceiptId: "receipt-1",
        },
      },
    });

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deleteDraftHandler(ctx, { draftId: "draft-registered" as any }),
    ).rejects.toMatchObject({
      data: "Registered AI expense draft cannot be deleted from the queue",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).delete as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("listByStatus は認証ユーザー本人の下書きだけ返す", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      drafts: [
        ownedDraft,
        {
          ...ownedDraft,
          _id: "draft-other",
          groupId: OTHER_GROUP_ID,
        },
      ],
    });

    const result = await listByStatusHandler(ctx, { status: "needs_review" });

    expect(result).toEqual([ownedDraft]);
  });

  it("listByStatus はraw observation・AI interpretation・user overrideを破壊せず返す", async () => {
    const contractDraft = {
      ...ownedDraft,
      rawObservation: {
        source: "ai_ocr",
        observedAt: 1,
        lines: [
          {
            rawText: "合計 1,200円",
            amountText: "1,200円",
            amountYen: 1200,
            lineRoleCandidates: ["total"],
            roleConfidence: 0.9,
            explicitlyPrinted: true,
            sourceLineIndex: 5,
          },
        ],
      },
      receiptInterpretation: { source: "ai", interpretedAt: 1, values: { amountYen: 1200 } },
      receiptUserOverride: { source: "user", updatedAt: 2, fields: ["amountYen"] },
    };
    const ctx = createQueryCtx(createIdentity(), { drafts: [contractDraft] });

    const result = await listByStatusHandler(ctx, { status: "needs_review" });

    expect(result[0]).toMatchObject({
      rawObservation: contractDraft.rawObservation,
      receiptInterpretation: contractDraft.receiptInterpretation,
      receiptUserOverride: contractDraft.receiptUserOverride,
    });
  });

  it("listByStatus は明細のカテゴリ別集約サマリーを返す", async () => {
    const draft = {
      ...readyDraft,
      amountYen: 1500,
    };
    const ctx = createQueryCtx(createIdentity(), {
      drafts: [draft],
      items: [
        ...mixedCategoryDraftItems,
        {
          _id: "draft-item-uncategorized",
          _creationTime: 0,
          groupId: GROUP_ID,
          draftId: "draft-ready",
          itemName: "未分類品",
          amountYen: 120,
          confidence: { itemName: 0.99, amountYen: 0.99, categoryId: 0.7 },
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });

    const result = await listByStatusHandler(ctx, { status: "ready" });

    expect(result).toEqual([
      expect.objectContaining({
        _id: "draft-ready",
        itemSummary: {
          itemTotalYen: 1500,
          itemDifferenceYen: 0,
          hasUncategorizedItems: true,
          hasLowConfidenceItems: true,
          categoryAggregates: [
            { categoryId: "cat-food", amountYen: 400 },
            { categoryId: "cat-medical", amountYen: 980 },
          ],
        },
      }),
    ]);
  });

  it("getWithItems は他ユーザーの下書きを参照できない", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      getDocById: {
        "draft-other": {
          ...ownedDraft,
          _id: "draft-other",
          groupId: OTHER_GROUP_ID,
        },
      },
    });

    await expect(
      getWithItemsHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftId: "draft-other" as any,
      }),
    ).rejects.toMatchObject({ data: "AI expense draft does not belong to the current group" });
  });

  // ---------------------------------------------------------------------------
  // Issue #173: カテゴリ候補生成ロジック連携
  // ---------------------------------------------------------------------------

  it("カテゴリ名がカテゴリリストに存在しない場合は categoryId を undefined で渡す", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      // mock の categoryName は "食費" だが、カテゴリリストには "日用品" だけ
      const runQuery = vi
        .fn()
        .mockResolvedValueOnce({
          hasAcceptedExternalApiConsent: true,
          acceptedAt: 1234567890,
        })
        .mockResolvedValueOnce([
          { _id: "cat-daily", name: "日用品", color: "#A6B28B", isActive: true, sortOrder: 2 },
        ]);
      const runMutation = vi.fn().mockResolvedValue({
        _id: "draft-no-category",
        status: "needs_review",
      });

      const ctx = createActionCtx(createIdentity(), true, { runQuery, runMutation });

      await analyzeReceiptImageToDraftHandler(ctx, {
        imageDataUrl: "data:image/jpeg;base64,AAA",
      });

      expect(runMutation).toHaveBeenCalledTimes(1);
      const [, callArgs] = runMutation.mock.calls[0];
      // 一致するカテゴリがなければ categoryId は含まれない（または undefined）
      expect(callArgs.categoryId).toBeUndefined();
    });
  });

  it("カテゴリ候補生成・解決フローで正しく categoryId が解決される", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      // mock の categoryName は "食費"。buildCategoryCandidates → resolveCategoryIdFromCandidates で categoryId が解決される
      const runQuery = vi
        .fn()
        .mockResolvedValueOnce({
          hasAcceptedExternalApiConsent: true,
          acceptedAt: 1234567890,
        })
        .mockResolvedValueOnce([
          { _id: "cat-food", name: "食費", color: "#F4A27A", isActive: true, sortOrder: 1 },
          { _id: "cat-tax", name: "税金", color: "#AAB7C4", isActive: true, sortOrder: 9 },
        ]);
      const runMutation = vi.fn().mockResolvedValue({
        _id: "draft-payment",
        status: "needs_review",
      });

      const ctx = createActionCtx(createIdentity(), true, { runQuery, runMutation });

      await analyzeReceiptImageToDraftHandler(ctx, {
        imageDataUrl: "data:image/jpeg;base64,AAA",
      });

      // mock モードでは documentType: "receipt", categoryName: "食費" が返るため
      // buildCategoryCandidates で "食費" が候補に入り categoryId が解決される
      expect(runMutation).toHaveBeenCalledTimes(1);
      const [, callArgs] = runMutation.mock.calls[0];
      expect(callArgs.categoryId).toBe("cat-food");
    });
  });

  it("画像解析の明細ごとに categoryId を解決して下書き明細へ渡す", async () => {
    const runQuery = vi
      .fn()
      .mockResolvedValueOnce({
        hasAcceptedExternalApiConsent: true,
        acceptedAt: 1234567890,
      })
      .mockResolvedValueOnce([
        { _id: "cat-food", name: "食費", color: "#F4A27A", isActive: true, sortOrder: 1 },
        { _id: "cat-medical", name: "医療費", color: "#C8D9A2", isActive: true, sortOrder: 2 },
      ]);
    const runMutation = vi.fn().mockResolvedValue({
      _id: "draft-line-items",
      status: "needs_review",
    });
    const ctx = createActionCtx(createIdentity(), true, { runQuery, runMutation });
    const extractionSpy = vi.spyOn(globalThis, "fetch");
    extractionSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    documentType: "receipt",
                    shopName: "ドラッグストアA",
                    paymentPlace: "",
                    payeeName: "",
                    paymentPurpose: "",
                    date: "2026-06-21",
                    amountYen: 1130,
                    categoryName: "食費",
                    items: [
                      {
                        itemName: "パン",
                        printedAmountYen: 150,
                        amountBasis: "tax_included",
                        taxRatePercent: 10,
                        taxMarker: "",
                        quantity: 1,
                        unitPriceYen: 150,
                        categoryName: "食費",
                        confidence: {
                          itemName: 0.9,
                          printedAmountYen: 0.95,
                          amountBasis: 0.9,
                          taxRatePercent: 0.9,
                          categoryName: 0.8,
                        },
                        warnings: [],
                      },
                      {
                        itemName: "胃薬",
                        printedAmountYen: 980,
                        amountBasis: "tax_included",
                        taxRatePercent: 10,
                        taxMarker: "",
                        quantity: 1,
                        unitPriceYen: 980,
                        categoryName: "医療費",
                        confidence: {
                          itemName: 0.85,
                          printedAmountYen: 0.95,
                          amountBasis: 0.9,
                          taxRatePercent: 0.9,
                          categoryName: 0.82,
                        },
                        warnings: ["品名が不鮮明です"],
                      },
                    ],
                    taxSummaries: [],
                    confidence: {
                      documentType: 0.92,
                      shopName: 0.85,
                      paymentPlace: 0.1,
                      payeeName: 0.1,
                      paymentPurpose: 0.1,
                      date: 0.9,
                      amountYen: 0.98,
                      categoryName: 0.7,
                    },
                    warnings: [],
                  }),
                },
              ],
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    try {
      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          await analyzeReceiptImageToDraftHandler(ctx, {
            imageDataUrl: "data:image/jpeg;base64,AAA",
          });
          const requestBody = JSON.parse(String(extractionSpy.mock.calls[0]?.[1]?.body)) as {
            text: {
              format: {
                schema: {
                  properties: {
                    items: { items: { properties: { categoryName: { enum: string[] } } } };
                  };
                };
              };
            };
          };
          expect(
            requestBody.text.format.schema.properties.items.items.properties.categoryName.enum,
          ).toEqual(["", "食費", "医療費"]);
        },
      );
    } finally {
      extractionSpy.mockRestore();
    }

    expect(runMutation).toHaveBeenCalledTimes(1);
    const [, callArgs] = runMutation.mock.calls[0];
    expect(callArgs.items).toEqual([
      expect.objectContaining({
        itemName: "パン",
        amountYen: 150,
        categoryName: "食費",
        categoryId: "cat-food",
        confidence: expect.objectContaining({
          itemName: 0.9,
          amountYen: 0.95,
          categoryName: 0.8,
          categoryId: 0.8,
        }),
        warnings: [],
      }),
      expect.objectContaining({
        itemName: "胃薬",
        amountYen: 980,
        categoryName: "医療費",
        categoryId: "cat-medical",
        warnings: ["品名が不鮮明です"],
      }),
    ]);
  });

  describe("registerReadyDraftsAsExpenseEntries", () => {
    it("明細ありのready下書きはカテゴリ別に集約してexpenseEntriesに登録できる", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 1380,
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
          "cat-medical": { groupId: GROUP_ID, isActive: true },
        },
        insertedIds: ["entry-food", "entry-medical"],
        items: mixedCategoryDraftItems,
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
      });

      expect(result.registeredDraftIds).toContain("draft-ready");
      expect(result.createdExpenseEntryIds).toHaveLength(2);
      expect(result.createdExpenseEntryIds).toEqual(["entry-food", "entry-medical"]);
      expect(ctx.db.insert).toHaveBeenCalledTimes(2);
      expect(ctx.db.insert).toHaveBeenNthCalledWith(
        1,
        "expenseEntries",
        expect.objectContaining({
          amount: 400,
          aiExpenseDraftId: "draft-ready",
          categoryId: "cat-food",
          date: "2026-06-01",
          source: "ai_suggested",
        }),
      );
      expect(ctx.db.insert).toHaveBeenNthCalledWith(
        2,
        "expenseEntries",
        expect.objectContaining({
          amount: 980,
          aiExpenseDraftId: "draft-ready",
          categoryId: "cat-medical",
          date: "2026-06-01",
          source: "ai_suggested",
        }),
      );
      expect(ctx.db.patch).toHaveBeenCalledWith(
        "draft-ready",
        expect.objectContaining({
          status: "registered",
          derivedRegistration: expect.objectContaining({
            source: "derived",
            destination: "expense_entries",
            amountYen: 1380,
            categoryIds: ["cat-food", "cat-medical"],
          }),
        }),
      );
    });

    it("割引明細を同じカテゴリから減額して正味額で登録する", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 2189,
          },
          "cat-other": { groupId: GROUP_ID, isActive: true },
          "cat-food": { groupId: GROUP_ID, isActive: true },
          "cat-daily": { groupId: GROUP_ID, isActive: true },
        },
        insertedIds: ["entry-other", "entry-food", "entry-daily"],
        items: [
          {
            ...readyDraftItems[0],
            _id: "item-tobacco",
            itemName: "キャメル・メンソール・コ（2個）",
            amountYen: 1060,
            categoryId: "cat-other",
          },
          {
            ...readyDraftItems[0],
            _id: "item-food",
            itemName: "マルちゃん ごつ盛 塩",
            amountYen: 139,
            categoryId: "cat-food",
          },
          {
            ...readyDraftItems[0],
            _id: "item-daily",
            itemName: "キュレル ジェルメイク",
            amountYen: 1100,
            categoryId: "cat-daily",
          },
          {
            ...readyDraftItems[0],
            _id: "item-discount",
            itemName: "クーポン券割引 10%",
            amountYen: -110,
            categoryId: "cat-daily",
          },
        ],
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
      });

      expect(result.createdExpenseEntryIds).toEqual(["entry-other", "entry-food", "entry-daily"]);
      expect(ctx.db.insert).toHaveBeenNthCalledWith(
        3,
        "expenseEntries",
        expect.objectContaining({ amount: 990, categoryId: "cat-daily" }),
      );
    });

    it("割引後のカテゴリ正味額が0円以下なら登録しない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 100,
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
          "cat-daily": { groupId: GROUP_ID, isActive: true },
        },
        items: [
          {
            ...readyDraftItems[0],
            amountYen: 200,
            categoryId: "cat-food",
          },
          {
            ...readyDraftItems[1],
            amountYen: 100,
            categoryId: "cat-daily",
          },
          {
            ...readyDraftItems[1],
            _id: "item-discount",
            itemName: "クーポン券割引",
            amountYen: -200,
            categoryId: "cat-daily",
          },
        ],
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toMatchObject({ data: "Draft category total must be greater than zero" });
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    it("明細なしのready下書きは既存どおり単一expenseEntryに登録できる", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": readyDraft,
          "cat-food": { groupId: GROUP_ID, isActive: true },
        },
        insertedIds: ["entry-1"],
        items: [],
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
      });

      expect(result.createdExpenseEntryIds).toEqual(["entry-1"]);
      expect(ctx.db.insert).toHaveBeenCalledWith(
        "expenseEntries",
        expect.objectContaining({
          amount: 1200,
          categoryId: "cat-food",
          title: "スーパー青葉",
        }),
      );
    });

    it("未分類の明細があるready下書きはexpenseEntries登録できない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 1500,
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
        },
        items: [
          readyDraftItems[0],
          {
            ...readyDraftItems[1],
            categoryId: undefined,
          },
        ],
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toMatchObject({ data: "Draft item category is required to register" });
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(ctx.db.patch).not.toHaveBeenCalled();
    });

    it("明細合計と下書き合計が一致しないready下書きはexpenseEntries登録できない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 9999,
            taxRatePercent: null,
            taxableAmountYen: null,
            taxYen: null,
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
        },
        items: readyDraftItems,
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toMatchObject({ data: "Draft item total must match draft amount" });
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(ctx.db.patch).not.toHaveBeenCalled();
    });

    it("totalOnlyはユーザー確認済み合計を1件だけ登録し明細不一致を集計へ入れない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 9999,
            registrationMode: "totalOnly",
            receiptTotalResolution: {
              status: "verified",
              protectedAmountYen: 9999,
              candidates: [
                {
                  amountYen: 9999,
                  source: "user_confirmed",
                  evidence: "review.amountYen",
                },
              ],
              reasons: [],
            },
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
        },
        insertedIds: ["entry-total"],
        items: readyDraftItems,
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
      });

      expect(result.createdExpenseEntryIds).toEqual(["entry-total"]);
      expect(ctx.db.insert).toHaveBeenCalledTimes(1);
      expect(ctx.db.insert).toHaveBeenCalledWith(
        "expenseEntries",
        expect.objectContaining({ amount: 9999, categoryId: "cat-food" }),
      );
      expect(ctx.db.patch).toHaveBeenCalledWith(
        "draft-ready",
        expect.objectContaining({
          derivedRegistration: expect.objectContaining({
            registrationMode: "totalOnly",
            amountYen: 9999,
            categoryIds: ["cat-food"],
          }),
        }),
      );
    });

    it("totalOnlyはAI推定だけの合計を登録しない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            registrationMode: "totalOnly",
            receiptTotalResolution: {
              status: "ambiguous",
              protectedAmountYen: 1200,
              candidates: [],
              reasons: [],
            },
          },
        },
        items: readyDraftItems,
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toMatchObject({
        data: "Receipt total must be confirmed before total-only registration",
      });
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    it("低信頼度の明細が残るready下書きはexpenseEntries登録できない", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: {
          "draft-ready": {
            ...readyDraft,
            amountYen: 1500,
          },
          "cat-food": { groupId: GROUP_ID, isActive: true },
        },
        items: [
          readyDraftItems[0],
          {
            ...readyDraftItems[1],
            confidence: { itemName: 0.99, amountYen: 0.99, categoryId: 0.7 },
          },
        ],
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toMatchObject({
        data: "Low confidence draft items must be reviewed before register",
      });
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(ctx.db.patch).not.toHaveBeenCalled();
    });

    it("既にregisteredの下書きはスキップする", async () => {
      const registeredDraft: DraftDoc = {
        ...readyDraft,
        _id: "draft-registered",
        status: "registered",
      };
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "draft-registered": registeredDraft },
      });

      const result = await registerReadyDraftsAsExpenseEntriesHandler(ctx, {
        draftIds: ["draft-registered" as Id<"aiExpenseDrafts">],
      });

      expect(result.registeredDraftIds).toHaveLength(0);
      expect(result.alreadyRegisteredDraftIds).toContain("draft-registered");
    });

    it("ready状態でない下書きはエラー", async () => {
      const needsReviewDraft = { ...readyDraft, status: "needs_review" as const };
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "draft-needs-review": needsReviewDraft },
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-needs-review" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("他グループの下書きはエラー", async () => {
      const otherUserDraft = { ...readyDraft, groupId: OTHER_GROUP_ID };
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "draft-ready": otherUserDraft },
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("存在しない下書きはエラー", async () => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "draft-missing": null },
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-missing" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("itemsが空で必須値不足のready下書きはエラー", async () => {
      const invalidReadyDraft: DraftDoc = {
        ...readyDraft,
        amountYen: undefined,
        categoryId: undefined,
      };
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "draft-ready": invalidReadyDraft },
        items: [],
      });

      await expect(
        registerReadyDraftsAsExpenseEntriesHandler(ctx, {
          draftIds: ["draft-ready" as Id<"aiExpenseDrafts">],
        }),
      ).rejects.toThrow(ConvexError);
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(ctx.db.patch).not.toHaveBeenCalled();
    });
  });
});
