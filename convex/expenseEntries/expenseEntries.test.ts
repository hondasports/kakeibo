import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  createExpenseEntries,
  createExpenseEntriesFromDraft,
  createIncomeEntry,
  createIncomeEntryHandler,
  createExpenseEntriesFromDraftHandler,
  createExpenseEntriesHandler,
  deleteExpenseEntry,
  deleteExpenseEntryHandler,
  updateExpenseEntry,
  updateExpenseEntryHandler,
} from "./mutations";

// ---------------------------------------------------------------------------
// テスト用型定義
// ---------------------------------------------------------------------------

type CategoryDoc = {
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

type AiExpenseDraftDoc = {
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

type AiExpenseDraftItemDoc = {
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

type ExpenseEntryDoc = {
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

const catFoodId = "cat-food" as Id<"categories">;
const catDailyId = "cat-daily" as Id<"categories">;
const draftReadyId = "draft-ready" as Id<"aiExpenseDrafts">;
const sourceDocumentId = "source-doc-1" as Id<"sourceDocuments">;
const entryId = "entry-001" as Id<"expenseEntries">;

const GROUP_ID = "group-001" as Id<"groups">;
const OTHER_GROUP_ID = "group-other" as Id<"groups">;

type RegisteredMutation = {
  _handler: (ctx: MutationCtx, args: unknown) => Promise<unknown>;
};

function invokeRegisteredMutation(
  mutation: unknown,
  ctx: MutationCtx,
  args: unknown,
): Promise<unknown> {
  return (mutation as RegisteredMutation)._handler(ctx, args);
}

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

function createIdentity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    tokenIdentifier: "https://issuer.example|user-001",
    subject: "user-001",
    issuer: "https://issuer.example",
    ...overrides,
  };
}

function createMutationCtx(
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

const activeFoodCategory: CategoryDoc = {
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

const activeDailyCategory: CategoryDoc = {
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

describe("createExpenseEntriesHandler", () => {
  it("単一支出項目を expenseEntries に保存できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "cat-food": activeFoodCategory,
        "cat-daily": activeDailyCategory,
      },
    });

    await createExpenseEntriesHandler(ctx, {
      date: "2026-06-07",
      items: [{ categoryId: catFoodId, amountYen: 2000, title: "スーパー北浜", memo: undefined }],
    });

    expect(ctx.db.insert).toHaveBeenCalledTimes(1);
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({
        date: "2026-06-07",
        amount: 2000,
        categoryId: "cat-food",
        title: "スーパー北浜",
        entryType: "expense",
        source: "manual",
      }),
    );
  });

  it("複数支出項目をそれぞれ expenseEntries に保存できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "cat-food": activeFoodCategory,
        "cat-daily": activeDailyCategory,
      },
    });

    await createExpenseEntriesHandler(ctx, {
      date: "2026-06-07",
      items: [
        { categoryId: catFoodId, amountYen: 3000, title: "食料品" },
        { categoryId: catDailyId, amountYen: 2000, title: "日用品" },
      ],
    });

    expect(ctx.db.insert).toHaveBeenCalledTimes(2);
    expect(ctx.db.insert).toHaveBeenNthCalledWith(
      1,
      "expenseEntries",
      expect.objectContaining({ amount: 3000, categoryId: "cat-food", title: "食料品" }),
    );
    expect(ctx.db.insert).toHaveBeenNthCalledWith(
      2,
      "expenseEntries",
      expect.objectContaining({ amount: 2000, categoryId: "cat-daily", title: "日用品" }),
    );
  });

  it("手入力でも0円以下の支出項目は保存しない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": activeFoodCategory },
    });

    await expect(
      createExpenseEntriesHandler(ctx, {
        date: "2026-06-07",
        items: [{ categoryId: catFoodId, amountYen: 0, title: "不正な支出" }],
      }),
    ).rejects.toThrow("Amount must be a positive integer");
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("未認証の場合、ConvexError を投げる", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      createExpenseEntriesHandler(ctx, {
        date: "2026-06-07",
        items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品" }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("存在しないカテゴリIDの場合、ConvexError を投げる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": null },
    });

    await expect(
      createExpenseEntriesHandler(ctx, {
        date: "2026-06-07",
        items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品" }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("他のグループのカテゴリIDの場合、ConvexError を投げる", async () => {
    const otherGroupCategory: CategoryDoc = {
      ...activeFoodCategory,
      groupId: OTHER_GROUP_ID,
    };
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": otherGroupCategory },
    });

    await expect(
      createExpenseEntriesHandler(ctx, {
        date: "2026-06-07",
        items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品" }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("無効化されたカテゴリIDの場合、ConvexError を投げる", async () => {
    const inactiveCategory: CategoryDoc = { ...activeFoodCategory, isActive: false };
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": inactiveCategory },
    });

    await expect(
      createExpenseEntriesHandler(ctx, {
        date: "2026-06-07",
        items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品" }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("メモが指定された場合、memo フィールドに保存される", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": activeFoodCategory },
    });

    await createExpenseEntriesHandler(ctx, {
      date: "2026-06-07",
      items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品", memo: "特売日" }],
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({ memo: "特売日" }),
    );
  });

  it("sourceDocumentId が指定された場合、expenseEntries に紐付けて保存できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "cat-food": activeFoodCategory,
        "source-doc-1": {
          _id: "source-doc-1",
          _creationTime: 1000,
          groupId: GROUP_ID,
          sourceType: "manual",
          status: "finalized",
          createdAt: 1000,
          updatedAt: 1000,
        },
      },
    });

    await createExpenseEntriesHandler(ctx, {
      date: "2026-06-07",
      sourceDocumentId,
      items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品" }],
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({ sourceDocumentId: "source-doc-1" }),
    );
  });

  it("店舗名が指定された場合、手入力をsourceDocumentにまとめて保存する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "cat-food": activeFoodCategory,
        "cat-daily": activeDailyCategory,
      },
    });

    await createExpenseEntriesHandler(ctx, {
      date: "2026-06-07",
      shopName: "スーパー北浜",
      sourceAmountYen: 5000,
      items: [
        { categoryId: catFoodId, amountYen: 3000, title: "食料品" },
        { categoryId: catDailyId, amountYen: 2000, title: "洗剤" },
      ],
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "sourceDocuments",
      expect.objectContaining({
        sourceType: "manual",
        status: "finalized",
        shopName: "スーパー北浜",
        totalAmount: 5000,
      }),
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({ sourceDocumentId: "new-entry-id" }),
    );
  });

  it.each([-1, 1.5, Number.NaN])(
    "sourceAmountYen が正の整数でない場合は保存しない（%s）",
    async (sourceAmountYen) => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "cat-food": activeFoodCategory },
      });

      await expect(
        createExpenseEntriesHandler(ctx, {
          date: "2026-06-07",
          shopName: "スーパー北浜",
          sourceAmountYen,
          items: [{ categoryId: catFoodId, amountYen: 1000, title: "食料品" }],
        }),
      ).rejects.toThrow("Source amount must be a positive integer");
      expect(ctx.db.insert).not.toHaveBeenCalled();
    },
  );
});

describe("createIncomeEntryHandler", () => {
  it("カテゴリなしの収入を income として保存できる", async () => {
    const ctx = createMutationCtx(createIdentity());

    await createIncomeEntryHandler(ctx, {
      date: "2026-06-07",
      amountYen: 320000,
      title: "給与",
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({
        date: "2026-06-07",
        amount: 320000,
        title: "給与",
        entryType: "income",
        source: "manual",
      }),
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.not.objectContaining({ categoryId: expect.anything() }),
    );
  });

  it("未認証の場合は保存しない", async () => {
    const ctx = createMutationCtx(null);
    await expect(
      createIncomeEntryHandler(ctx, {
        date: "2026-06-07",
        amountYen: 320000,
        title: "給与",
      }),
    ).rejects.toThrow(ConvexError);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it.each([
    [{ date: "", amountYen: 1000, title: "給与" }, "Date must be a valid YYYY-MM-DD value"],
    [{ date: "2026-06-07", amountYen: 0, title: "給与" }, "Amount must be a positive integer"],
    [{ date: "2026-06-07", amountYen: 1000, title: "   " }, "Income description is required"],
  ])("不正な収入は保存しない", async (args, message) => {
    const ctx = createMutationCtx(createIdentity());
    await expect(createIncomeEntryHandler(ctx, args)).rejects.toThrow(message);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});

describe("registered expense entry mutations", () => {
  it("登録済みmutationの薄いhandlerを通して各業務handlerを呼び出す", async () => {
    const incomeCtx = createMutationCtx(createIdentity());
    await invokeRegisteredMutation(createIncomeEntry, incomeCtx, {
      date: "2026-06-07",
      amountYen: 320000,
      title: "給与",
    });

    const expenseCtx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": activeFoodCategory },
    });
    await invokeRegisteredMutation(createExpenseEntries, expenseCtx, {
      date: "2026-06-07",
      items: [{ categoryId: catFoodId, amountYen: 1000, title: "食料品" }],
    });

    const draftCtx = createMutationCtx(createIdentity(), {
      getDocById: { "draft-ready": readyDraft, "cat-food": activeFoodCategory },
    });
    await invokeRegisteredMutation(createExpenseEntriesFromDraft, draftCtx, {
      draftId: draftReadyId,
      items: [{ itemName: "食料品", amountYen: 1000, categoryId: catFoodId }],
    });

    const updateCtx = createMutationCtx(createIdentity(), {
      getDocById: { "entry-001": baseExpenseEntry },
    });
    await invokeRegisteredMutation(updateExpenseEntry, updateCtx, {
      expenseEntryId: entryId,
      title: "更新後",
    });

    const deleteCtx = createMutationCtx(createIdentity(), {
      getDocById: { "entry-001": baseExpenseEntry },
    });
    await invokeRegisteredMutation(deleteExpenseEntry, deleteCtx, { expenseEntryId: entryId });

    expect(incomeCtx.db.insert).toHaveBeenCalled();
    expect(expenseCtx.db.insert).toHaveBeenCalled();
    expect(draftCtx.db.insert).toHaveBeenCalled();
    expect(updateCtx.db.patch).toHaveBeenCalled();
    expect(deleteCtx.db.delete).toHaveBeenCalledWith("entry-001");
  });
});

// ---------------------------------------------------------------------------
// createExpenseEntriesFromDraft
// ---------------------------------------------------------------------------

const readyDraft: AiExpenseDraftDoc = {
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

describe("createExpenseEntriesFromDraftHandler", () => {
  it("AI下書きのitemsから複数のexpenseEntriesを作成できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": readyDraft,
        "cat-food": activeFoodCategory,
        "cat-daily": activeDailyCategory,
      },
    });

    const result = await createExpenseEntriesFromDraftHandler(ctx, {
      draftId: draftReadyId,
      items: [
        { itemName: "食料品", amountYen: 1000, categoryId: catFoodId },
        { itemName: "日用品", amountYen: 500, categoryId: catDailyId },
      ],
    });

    expect(ctx.db.insert).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(ctx.db.insert).toHaveBeenNthCalledWith(
      1,
      "expenseEntries",
      expect.objectContaining({
        date: "2026-06-01",
        amount: 1000,
        categoryId: "cat-food",
        title: "食料品",
        entryType: "expense",
        source: "ai_suggested",
      }),
    );
    expect(ctx.db.insert).toHaveBeenNthCalledWith(
      2,
      "expenseEntries",
      expect.objectContaining({
        date: "2026-06-01",
        amount: 500,
        categoryId: "cat-daily",
        title: "日用品",
        entryType: "expense",
        source: "ai_suggested",
      }),
    );
  });

  it("itemのcategoryIdがnullの場合、draftのcategoryIdをフォールバックする", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": readyDraft,
        "cat-food": activeFoodCategory,
      },
    });

    await createExpenseEntriesFromDraftHandler(ctx, {
      draftId: draftReadyId,
      items: [{ itemName: "不明な品目", amountYen: 1000, categoryId: undefined }],
    });

    expect(ctx.db.insert).toHaveBeenCalledTimes(1);
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({
        categoryId: "cat-food", // draftのcategoryIdが使用される
        title: "不明な品目",
      }),
    );
  });

  it("未認証の場合、ConvexErrorを投げる", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      createExpenseEntriesFromDraftHandler(ctx, {
        draftId: draftReadyId,
        items: [{ itemName: "テスト", amountYen: 1000, categoryId: catFoodId }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("他のグループの下書きの場合、ConvexErrorを投げる", async () => {
    const otherGroupDraft: AiExpenseDraftDoc = {
      ...readyDraft,
      groupId: OTHER_GROUP_ID,
    };
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "draft-ready": otherGroupDraft },
    });

    await expect(
      createExpenseEntriesFromDraftHandler(ctx, {
        draftId: draftReadyId,
        items: [{ itemName: "テスト", amountYen: 1000, categoryId: catFoodId }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("存在しない下書きIDの場合、ConvexErrorを投げる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "draft-ready": null },
    });

    await expect(
      createExpenseEntriesFromDraftHandler(ctx, {
        draftId: draftReadyId,
        items: [{ itemName: "テスト", amountYen: 1000, categoryId: catFoodId }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("ready 以外の下書きからは expenseEntries を作成できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": {
          ...readyDraft,
          status: "needs_review",
        },
      },
    });

    await expect(
      createExpenseEntriesFromDraftHandler(ctx, {
        draftId: draftReadyId,
        items: [{ itemName: "テスト", amountYen: 1000, categoryId: catFoodId }],
      }),
    ).rejects.toThrow("Only ready drafts can create expense entries");
  });

  it("日付が未確定の下書きからは expenseEntries を作成できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": {
          ...readyDraft,
          date: undefined,
        },
      },
    });

    await expect(
      createExpenseEntriesFromDraftHandler(ctx, {
        draftId: draftReadyId,
        items: [{ itemName: "テスト", amountYen: 1000, categoryId: catFoodId }],
      }),
    ).rejects.toThrow("Draft date is required");
  });
});

const baseExpenseEntry: ExpenseEntryDoc = {
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

describe("updateExpenseEntryHandler", () => {
  it("金額・カテゴリ・日付・タイトル・メモを更新できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "entry-001": baseExpenseEntry,
        "cat-daily": activeDailyCategory,
      },
    });

    await updateExpenseEntryHandler(ctx, {
      expenseEntryId: entryId,
      date: "2026-06-08",
      amountYen: 1500,
      categoryId: catDailyId,
      title: "スーパーB",
      memo: "朝食",
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "entry-001",
      expect.objectContaining({
        date: "2026-06-08",
        amount: 1500,
        categoryId: "cat-daily",
        title: "スーパーB",
        memo: "朝食",
      }),
    );
  });

  it("0以下の金額は拒否する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "entry-001": baseExpenseEntry },
    });

    await expect(
      updateExpenseEntryHandler(ctx, {
        expenseEntryId: entryId,
        amountYen: 0,
      }),
    ).rejects.toThrow("Amount must be a positive integer");
  });

  it("不正な日付は拒否する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "entry-001": baseExpenseEntry },
    });

    await expect(
      updateExpenseEntryHandler(ctx, {
        expenseEntryId: entryId,
        date: "",
      }),
    ).rejects.toThrow("Date must be a valid YYYY-MM-DD value");
  });

  it("他グループの記録は更新できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "entry-001": { ...baseExpenseEntry, groupId: OTHER_GROUP_ID },
      },
    });

    await expect(
      updateExpenseEntryHandler(ctx, {
        expenseEntryId: entryId,
        title: "変更",
      }),
    ).rejects.toThrow(ConvexError);
  });
});

describe("deleteExpenseEntryHandler", () => {
  it("自分のグループの記録を削除できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "entry-001": baseExpenseEntry },
    });

    await deleteExpenseEntryHandler(ctx, { expenseEntryId: entryId });

    expect(ctx.db.delete).toHaveBeenCalledWith("entry-001");
  });

  it("他グループの記録は削除できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "entry-001": { ...baseExpenseEntry, groupId: OTHER_GROUP_ID },
      },
    });

    await expect(deleteExpenseEntryHandler(ctx, { expenseEntryId: entryId })).rejects.toThrow(
      ConvexError,
    );
  });
});
