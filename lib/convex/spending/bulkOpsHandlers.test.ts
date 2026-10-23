import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import { MAX_BULK_SPENDING_SELECTION } from "../../domain/spending/bulkSpending";
import {
  bulkDeleteSpendingRecordsHandler,
  bulkUpdateSpendingCategoriesHandler,
} from "./bulkOpsHandlers";

const GROUP_ID = "group-001" as Id<"groups">;
const OTHER_GROUP_ID = "group-other" as Id<"groups">;

function createIdentity(): UserIdentity {
  return {
    tokenIdentifier: "https://issuer.example|user-001",
    subject: "user-001",
    issuer: "https://issuer.example",
  };
}

function createMutationCtx(
  docs: Record<string, Record<string, unknown> | null>,
  options: { identity?: UserIdentity | null } = {},
): MutationCtx {
  const identity = options.identity === undefined ? createIdentity() : options.identity;
  const groupMember =
    identity === null
      ? null
      : {
          _id: "member-001",
          groupId: GROUP_ID,
          userId: identity.tokenIdentifier,
          role: "member",
        };

  return {
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(identity),
    },
    db: {
      get: vi.fn().mockImplementation(async (id: string) => docs[id] ?? null),
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockResolvedValue("audit-001"),
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockImplementation((indexName: string) => {
          if (indexName === "by_user_id") {
            return {
              unique: vi.fn().mockResolvedValue(groupMember),
              collect: vi.fn().mockResolvedValue(groupMember ? [groupMember] : []),
            };
          }
          return {
            unique: vi.fn().mockResolvedValue(null),
            collect: vi.fn().mockResolvedValue([]),
            take: vi.fn().mockResolvedValue([]),
          };
        }),
      }),
    },
  } as unknown as MutationCtx;
}

const foodCategory = {
  _id: "cat-food",
  groupId: GROUP_ID,
  name: "食費",
  isActive: true,
};

const dailyCategory = {
  _id: "cat-daily",
  groupId: GROUP_ID,
  name: "日用品",
  isActive: true,
};

const inactiveCategory = {
  _id: "cat-old",
  groupId: GROUP_ID,
  name: "旧カテゴリ",
  isActive: false,
};

const expenseEntry = {
  _id: "entry-001",
  groupId: GROUP_ID,
  entryType: "expense",
  categoryId: "cat-daily",
  date: "2026-08-10",
};

const incomeEntry = {
  _id: "entry-income",
  groupId: GROUP_ID,
  entryType: "income",
};

const expenseReceipt = {
  _id: "receipt-001",
  groupId: GROUP_ID,
  type: "expense",
  categoryId: "cat-daily",
  date: "2026-08-10",
};

describe("bulkUpdateSpendingCategoriesHandler", () => {
  it("expenseEntry と receipt を同一カテゴリへ一括更新する", async () => {
    const ctx = createMutationCtx({
      "cat-food": foodCategory,
      "cat-daily": dailyCategory,
      "entry-001": expenseEntry,
      "receipt-001": expenseReceipt,
    });

    await expect(
      bulkUpdateSpendingCategoriesHandler(ctx, {
        expenseEntryIds: ["entry-001" as Id<"expenseEntries">],
        receiptIds: ["receipt-001" as Id<"receipts">],
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).resolves.toEqual({ updatedCount: 2 });

    expect(ctx.db.patch).toHaveBeenCalledTimes(2);
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "entry-001",
      expect.objectContaining({ categoryId: "cat-food" }),
    );
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "receipt-001",
      expect.objectContaining({ categoryId: "cat-food" }),
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "managementAuditLogs",
      expect.objectContaining({
        groupId: GROUP_ID,
        actorUserId: "https://issuer.example|user-001",
        action: "spending_bulk_category_changed",
        targetKind: "group",
        targetLabel: "支出明細2件: 日用品 → 食費",
      }),
    );
    const auditInsert = vi.mocked(ctx.db.insert).mock.calls[0]?.[1] as {
      afterValue?: string;
    };
    expect(auditInsert.afterValue).toContain("entry-001");
    expect(auditInsert.afterValue).not.toMatch(/amount|shopName|title|memo/i);
  });

  it("重複IDは1件として数え、検証後にだけ書き込む", async () => {
    const ctx = createMutationCtx({
      "cat-food": foodCategory,
      "cat-daily": dailyCategory,
      "entry-001": expenseEntry,
    });

    await expect(
      bulkUpdateSpendingCategoriesHandler(ctx, {
        expenseEntryIds: ["entry-001" as Id<"expenseEntries">, "entry-001" as Id<"expenseEntries">],
        receiptIds: [],
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).resolves.toEqual({ updatedCount: 1 });
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
  });

  it("他グループ・収入・非存在・無効カテゴリは書き込み前に失敗する", async () => {
    const otherGroupCtx = createMutationCtx({
      "cat-food": foodCategory,
      "entry-001": { ...expenseEntry, groupId: OTHER_GROUP_ID },
    });
    await expect(
      bulkUpdateSpendingCategoriesHandler(otherGroupCtx, {
        expenseEntryIds: ["entry-001" as Id<"expenseEntries">],
        receiptIds: [],
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).rejects.toThrow(ConvexError);
    expect(otherGroupCtx.db.patch).not.toHaveBeenCalled();
    expect(otherGroupCtx.db.insert).not.toHaveBeenCalled();

    const incomeCtx = createMutationCtx({
      "cat-food": foodCategory,
      "entry-income": incomeEntry,
    });
    await expect(
      bulkUpdateSpendingCategoriesHandler(incomeCtx, {
        expenseEntryIds: ["entry-income" as Id<"expenseEntries">],
        receiptIds: [],
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).rejects.toThrow("Income records cannot be included in bulk spending operations");
    expect(incomeCtx.db.patch).not.toHaveBeenCalled();
    expect(incomeCtx.db.insert).not.toHaveBeenCalled();

    const missingCtx = createMutationCtx({ "cat-food": foodCategory });
    await expect(
      bulkUpdateSpendingCategoriesHandler(missingCtx, {
        expenseEntryIds: ["entry-missing" as Id<"expenseEntries">],
        receiptIds: [],
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).rejects.toThrow("Expense entry not found");
    expect(missingCtx.db.patch).not.toHaveBeenCalled();
    expect(missingCtx.db.insert).not.toHaveBeenCalled();

    const inactiveCtx = createMutationCtx({
      "cat-old": inactiveCategory,
      "entry-001": expenseEntry,
    });
    await expect(
      bulkUpdateSpendingCategoriesHandler(inactiveCtx, {
        expenseEntryIds: ["entry-001" as Id<"expenseEntries">],
        receiptIds: [],
        categoryId: "cat-old" as Id<"categories">,
      }),
    ).rejects.toThrow("Inactive category cannot be used for expense entries");
    expect(inactiveCtx.db.patch).not.toHaveBeenCalled();
    expect(inactiveCtx.db.insert).not.toHaveBeenCalled();
  });

  it("空配列と101件超は拒否する", async () => {
    const ctx = createMutationCtx({ "cat-food": foodCategory });
    await expect(
      bulkUpdateSpendingCategoriesHandler(ctx, {
        expenseEntryIds: [],
        receiptIds: [],
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).rejects.toThrow("At least one spending record id is required");

    const tooMany = Array.from(
      { length: MAX_BULK_SPENDING_SELECTION + 1 },
      (_, index) => `entry-${index}` as Id<"expenseEntries">,
    );
    await expect(
      bulkUpdateSpendingCategoriesHandler(ctx, {
        expenseEntryIds: tooMany,
        receiptIds: [],
        categoryId: "cat-food" as Id<"categories">,
      }),
    ).rejects.toThrow(
      `At most ${MAX_BULK_SPENDING_SELECTION} spending records can be updated at once`,
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});

describe("bulkDeleteSpendingRecordsHandler", () => {
  it("検証後に expenseEntry と receipt をまとめて削除する", async () => {
    const ctx = createMutationCtx({
      "cat-daily": dailyCategory,
      "entry-001": expenseEntry,
      "receipt-001": expenseReceipt,
    });

    await expect(
      bulkDeleteSpendingRecordsHandler(ctx, {
        expenseEntryIds: ["entry-001" as Id<"expenseEntries">],
        receiptIds: ["receipt-001" as Id<"receipts">],
      }),
    ).resolves.toEqual({ deletedCount: 2 });
    expect(ctx.db.delete).toHaveBeenCalledWith("entry-001");
    expect(ctx.db.delete).toHaveBeenCalledWith("receipt-001");
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "managementAuditLogs",
      expect.objectContaining({
        action: "spending_bulk_deleted",
        targetLabel: "支出明細2件",
      }),
    );
  });

  it("1件でも不正なら削除しない", async () => {
    const ctx = createMutationCtx({
      "entry-001": expenseEntry,
      "receipt-001": { ...expenseReceipt, type: "income" },
    });

    await expect(
      bulkDeleteSpendingRecordsHandler(ctx, {
        expenseEntryIds: ["entry-001" as Id<"expenseEntries">],
        receiptIds: ["receipt-001" as Id<"receipts">],
      }),
    ).rejects.toThrow("Income records cannot be included in bulk spending operations");
    expect(ctx.db.delete).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});
