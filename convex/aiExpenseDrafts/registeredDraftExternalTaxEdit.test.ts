// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import {
  receiptTaxBasisCases,
  receiptTaxBasisInput,
} from "../../lib/domain/receipt/tax/fixtures/receiptTaxBasisCases";

const identity = {
  tokenIdentifier: "external-tax-edit-user",
  subject: "external-tax-edit-user",
  issuer: "https://issuer.example",
};

/** 外税（明細は税抜印字・支払いは税込）の明細ごと登録を、AI下書きの確認画面と同じ経路で作る。 */
async function registerExternalTaxDraft() {
  const testCase = receiptTaxBasisCases[0];
  const input = receiptTaxBasisInput(testCase);
  const t = convexTest(schema, convexTestModules);
  const ids = await t.run(async ({ db }) => {
    const groupId = await db.insert("groups", {
      name: "group",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.insert("users", {
      userId: identity.tokenIdentifier,
      displayName: "user",
      activeGroupId: groupId,
      createdAt: 1,
      updatedAt: 1,
    });
    await db.insert("groupMembers", {
      groupId,
      userId: identity.tokenIdentifier,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    const categoryId = await db.insert("categories", {
      groupId,
      name: "food",
      color: "#000000",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    const draftId = await db.insert("aiExpenseDrafts", {
      groupId,
      createdByUserId: identity.tokenIdentifier,
      sourceType: "image_upload",
      status: "needs_review",
      documentType: "receipt",
      shopName: "store",
      date: "2026-10-04",
      amountYen: input.amountYen,
      categoryId,
      confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
      taxSummaries: [
        {
          ...input.taxSummaries[0],
          taxMode: "external",
          taxableAmountBasis: "tax_excluded",
          taxableAmountYen: 404,
        },
      ],
      warnings: [],
      reviewReasons: ["user_confirmation_required"],
      createdAt: 1,
      updatedAt: 1,
    });
    const itemIds = [];
    for (const item of input.items) {
      itemIds.push(
        await db.insert("aiExpenseDraftItems", {
          groupId,
          draftId,
          itemName: item.itemName,
          amountYen: item.printedAmountYen,
          printedAmountYen: item.printedAmountYen,
          taxRatePercent: 8,
          amountBasis: "tax_included",
          taxResolutionStatus: "resolved",
          taxResolutionSource: "item_explicit",
          taxAllocationStatus: "unallocated",
          allocatedTaxYen: 0,
          normalizedAmountYen: item.printedAmountYen,
          categoryId,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    }
    return { groupId, categoryId, draftId, itemIds };
  });
  const authed = t.withIdentity(identity);
  for (const itemId of ids.itemIds) {
    await authed.mutation(api.aiExpenseDrafts.mutations.updateDraftItemTaxOverrides, {
      draftId: ids.draftId,
      itemId,
      amountBasis: "tax_excluded",
    });
  }
  const printedItems = input.items.map((item, index) => ({
    itemId: ids.itemIds[index],
    itemName: item.itemName,
    amountYen: item.printedAmountYen,
    categoryId: ids.categoryId,
  }));
  await authed.mutation(api.aiExpenseDrafts.mutations.updateForReview, {
    draftId: ids.draftId,
    documentType: "receipt",
    shopName: "store",
    date: "2026-10-04",
    amountYen: testCase.paidYen,
    categoryId: ids.categoryId,
    items: printedItems,
  });
  await authed.mutation(api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries, {
    draftIds: [ids.draftId],
  });
  return { t, authed, ids, testCase, printedItems };
}

describe("外税の明細ごと登録の履歴編集（#1293）", () => {
  it("明細の合計が金額より少なくても、何も変えずに保存でき、支出の合計は支払額のまま", async () => {
    const { t, authed, ids, testCase, printedItems } = await registerExternalTaxDraft();
    const registered = await t.run(({ db }) => db.get(ids.draftId));
    expect(registered?.status).toBe("registered");
    const printedTotal = printedItems.reduce((sum, item) => sum + item.amountYen, 0);
    expect(printedTotal).toBeLessThan(testCase.paidYen);
    const readItems = () =>
      t.run(({ db }) =>
        db
          .query("aiExpenseDraftItems")
          .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
          .collect(),
      );
    const sum = (values: Array<number | undefined>) =>
      values.reduce<number>((total, value) => total + (value ?? 0), 0);
    expect(sum((await readItems()).map((item) => item.normalizedAmountYen))).toBe(testCase.paidYen);

    await authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
      draftId: ids.draftId,
      date: "2026-10-04",
      amountYen: testCase.paidYen,
      categoryId: ids.categoryId,
      shopName: "store",
      registrationMode: "detailed",
      items: printedItems,
    });

    const entries = await t.run(({ db }) =>
      db
        .query("expenseEntries")
        .withIndex("by_group_id_and_ai_expense_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("aiExpenseDraftId", ids.draftId),
        )
        .collect(),
    );
    expect(sum(entries.map((entry) => entry.amount))).toBe(testCase.paidYen);
    const saved = await readItems();
    expect(sum(saved.map((item) => item.printedAmountYen))).toBe(printedTotal);
    expect(sum(saved.map((item) => item.normalizedAmountYen))).toBe(testCase.paidYen);
    expect((await t.run(({ db }) => db.get(ids.draftId)))?.status).toBe("registered");
  });
});
