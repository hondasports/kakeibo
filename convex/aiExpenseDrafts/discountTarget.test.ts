import { draftItemDocToFields } from "../../lib/convex/aiExpenseDrafts/draftRecordMapping";
import { judgeReviewFormAmountAndTax } from "../../lib/domain/aiExpenseDrafts/reviewFormJudgment";
import { getReviewGuidance } from "../../lib/domain/aiExpenseDrafts/reviewGuidance";
import { buildDraftRegistrationItems } from "../../lib/domain/aiExpenseDrafts/registrationItems";
import { judgeDraftAmountAndTax } from "../../lib/domain/aiExpenseDrafts/draftAmountTaxJudgment";
/// <reference types="vite/client" />
import { act, renderHook } from "@testing-library/react";
import { useReviewFormState } from "../../src/features/receipt-review/hooks/useReviewFormState";
import {
  assignDiscountTarget,
  prepareReviewItemsForSubmit,
  getReviewDiscountTargetForSubmit,
} from "../../lib/domain/aiExpenseDrafts/reviewItemCategories";
import type { Id } from "../_generated/dataModel";
import { getReviewSubmitErrorMessage } from "../../lib/domain/aiExpenseDrafts/reviewValidation";
import { buildReviewChecks } from "../../lib/domain/aiExpenseDrafts/reviewChecks";
import { mapDraftItemsToReviewItems } from "../../lib/domain/aiExpenseDrafts/reviewDraftMapping";
import { initializeReviewCategoryState } from "../../lib/domain/aiExpenseDrafts/reviewItemCategories";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { FunctionArgs } from "convex/server";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const identity = {
  tokenIdentifier: "target-user",
  subject: "target-user",
  issuer: "https://issuer.example",
};
async function setup() {
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
    const draft = {
      groupId,
      createdByUserId: identity.tokenIdentifier,
      sourceType: "image_upload" as const,
      status: "needs_review" as const,
      documentType: "receipt" as const,
      shopName: "store",
      date: "2026-11-01",
      amountYen: 198,
      categoryId,
      confidence: {},
      reviewReasons: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const draftId = await db.insert("aiExpenseDrafts", draft);
    const otherDraftId = await db.insert("aiExpenseDrafts", draft);
    const item = {
      groupId,
      draftId,
      itemName: "商品",
      amountYen: 100,
      categoryId,
      confidence: {},
      createdAt: 1,
      updatedAt: 1,
    };
    const productId = await db.insert("aiExpenseDraftItems", item);
    const discountId = await db.insert("aiExpenseDraftItems", {
      ...item,
      itemName: "クーポン",
      lineType: "promotion_adjustment",
      amountYen: -10,
    });
    const otherId = await db.insert("aiExpenseDraftItems", { ...item, draftId: otherDraftId });
    const otherGroupId = await db.insert("groups", {
      name: "other",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherGroupDraftId = await db.insert("aiExpenseDrafts", {
      ...draft,
      groupId: otherGroupId,
    });
    const otherGroupItemId = await db.insert("aiExpenseDraftItems", {
      ...item,
      groupId: otherGroupId,
      draftId: otherGroupDraftId,
    });
    return { groupId, categoryId, draftId, productId, discountId, otherId, otherGroupItemId };
  });
  const save = (
    items: NonNullable<FunctionArgs<typeof api.aiExpenseDrafts.mutations.updateForReview>["items"]>,
  ) =>
    t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateForReview, {
      draftId: ids.draftId,
      documentType: "receipt",
      shopName: "store",
      date: "2026-11-01",
      amountYen: 198,
      categoryId: ids.categoryId,
      items,
    });
  const product = {
    itemId: ids.productId,
    itemName: "商品",
    amountYen: 100,
    categoryId: ids.categoryId,
  };
  const discount = {
    itemId: ids.discountId,
    itemName: "クーポン",
    lineType: "promotion_adjustment" as const,
    amountYen: -10,
    categoryId: ids.categoryId,
  };
  const added = { itemName: "商品C", amountYen: 108, categoryId: ids.categoryId };
  return { t, ids, save, product, discount, added };
}

describe("割引対象の保存", () => {
  it("新規商品を対象に保存し、削除時に参照を外す", async () => {
    const { t, ids, save, product, discount, added } = await setup();
    await save([product, { ...discount, discountTarget: { itemIndex: 2 } }, added]);
    const saved = await t.run(({ db }) =>
      db
        .query("aiExpenseDraftItems")
        .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
        .collect(),
    );
    const target = saved.find((item) => item.itemName === "商品C")!;
    expect(saved.find((item) => item._id === ids.discountId)?.discountTargetItemId).toBe(
      target._id,
    );
    await save([product, discount]);
    expect((await t.run(({ db }) => db.get(ids.discountId)))?.discountTargetItemId).toBeUndefined();
  });
  it("別の下書きや割引行への参照と商品行からの参照を拒否する", async () => {
    const { ids, save, product, discount, added } = await setup();
    for (const items of [
      [product, { ...discount, discountTarget: { itemId: ids.otherId } }, added],
      [product, { ...discount, discountTarget: { itemId: ids.otherGroupItemId } }, added],
      [product, { ...discount, discountTarget: { itemId: ids.discountId } }, added],
      [{ ...product, discountTarget: { itemId: ids.productId } }, discount, added],
      [product, { ...discount, discountTarget: { itemIndex: 3 } }, added],
    ])
      await expect(save(items)).rejects.toThrow("Invalid discount target");
  });
  it("保存済み商品への対象参照を保存する", async () => {
    const { t, ids, save, product, discount, added } = await setup();
    await save([product, { ...discount, discountTarget: { itemId: ids.productId } }, added]);
    expect((await t.run(({ db }) => db.get(ids.discountId)))?.discountTargetItemId).toBe(
      ids.productId,
    );
  });
  it("再解析で新しい明細IDに対象を復元する", async () => {
    const { t, ids, save, product, discount, added } = await setup();
    await save([product, { ...discount, discountTarget: { itemIndex: 2 } }, added]);
    const original = await t.run(({ db }) => db.get(ids.draftId));
    expect(original?.receiptUserOverride?.values.items[1].discountTargetItemIndex).toBe(2);
    const recreated = await t
      .withIdentity(identity)
      .mutation(internal.aiExpenseDrafts.internal.createFromExtraction, {
        groupId: ids.groupId,
        documentType: "receipt",
        confidence: {},
        warnings: [],
        preservedUserOverride: original!.receiptUserOverride,
        items: [{ itemName: "AI", amountYen: 198, confidence: {} }],
      });
    const rows = await t.run(({ db }) =>
      db
        .query("aiExpenseDraftItems")
        .withIndex("by_draft_id", (q) => q.eq("draftId", recreated._id))
        .collect(),
    );
    expect(rows.find((row) => row.itemName === "クーポン")?.discountTargetItemId).toBe(
      rows.find((row) => row.itemName === "商品C")?._id,
    );
    expect(rows.find((row) => row.itemName === "商品C")?._id).not.toBe(ids.productId);
    const judgment = judgeDraftAmountAndTax({ ...recreated, items: rows });
    expect(recreated.reviewReasons.includes("amount_mismatch")).toBe(
      judgment.reasons.includes("amount_mismatch"),
    );
    expect(recreated.listSummary?.amountAndTaxResolved).toBe(judgment.status === "resolved");
    expect(
      recreated.receiptInterpretation?.values.items[0].discountTargetItemIndex,
    ).toBeUndefined();
  });
  it("履歴編集で対象を送らなくても保存値を維持する", async () => {
    const { t, ids, save, product, discount, added } = await setup();
    await save([product, { ...discount, discountTarget: { itemId: ids.productId } }, added]);
    await t.run(({ db }) => db.patch(ids.draftId, { status: "registered" }));
    const target = await t.run(({ db }) =>
      db
        .query("aiExpenseDraftItems")
        .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
        .collect(),
    );
    const third = target.find((item) => item.itemName === "商品C")!;
    await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
      draftId: ids.draftId,
      date: "2026-11-01",
      shopName: "store",
      amountYen: 198,
      categoryId: ids.categoryId,
      registrationMode: "detailed",
      items: [product, discount, { ...added, itemId: third._id }],
    });
    expect((await t.run(({ db }) => db.get(ids.discountId)))?.discountTargetItemId).toBe(
      ids.productId,
    );
    const saved = (await t.run(({ db }) => db.get(ids.draftId)))!;
    const rows = await t.run(({ db }) =>
      db
        .query("aiExpenseDraftItems")
        .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
        .collect(),
    );
    expect(saved.status).toBe("registered");
    expect(saved.listSummary?.amountAndTaxResolved).toBe(
      judgeDraftAmountAndTax({ ...saved, items: rows }).status === "resolved",
    );
  });
  it("選択した対象の保存後も税率別照合と一覧判定が一致する", async () => {
    const { t, ids, save, product, discount, added } = await setup();
    const taxSummaries = [
      {
        taxRatePercent: 8 as const,
        taxMode: "included" as const,
        taxableAmountYen: 100,
        taxableAmountBasis: "tax_included" as const,
        taxYen: 7,
        roundingMethod: "unknown" as const,
        status: "verified" as const,
        confidence: {},
        warnings: [],
      },
      {
        taxRatePercent: 10 as const,
        taxMode: "included" as const,
        taxableAmountYen: 98,
        taxableAmountBasis: "tax_included" as const,
        taxYen: 9,
        roundingMethod: "unknown" as const,
        status: "verified" as const,
        confidence: {},
        warnings: [],
      },
    ];
    const thirdId = await t.run(async ({ db }) => {
      await db.patch(ids.draftId, { taxSummaries });
      const common = {
        amountBasis: "tax_included" as const,
        taxAllocationStatus: "allocated" as const,
        taxResolutionStatus: "resolved" as const,
        taxResolutionSource: "item_explicit" as const,
      };
      await db.patch(ids.productId, {
        ...common,
        printedAmountYen: 100,
        normalizedAmountYen: 100,
        taxRatePercent: 8,
      });
      await db.patch(ids.discountId, {
        ...common,
        printedAmountYen: -10,
        normalizedAmountYen: -10,
        taxRatePercent: 10,
      });
      return db.insert("aiExpenseDraftItems", {
        ...common,
        groupId: ids.groupId,
        draftId: ids.draftId,
        itemName: added.itemName,
        amountYen: 108,
        printedAmountYen: 108,
        normalizedAmountYen: 108,
        taxRatePercent: 10,
        categoryId: ids.categoryId,
        confidence: {},
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const initialRows = await t.run(({ db }) =>
      db
        .query("aiExpenseDraftItems")
        .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
        .collect(),
    );
    const initializedBeforeSave = initializeReviewCategoryState(
      mapDraftItemsToReviewItems(initialRows),
      ids.categoryId,
    );
    const selected = assignDiscountTarget(initializedBeforeSave.items, ids.discountId, thirdId);
    const prepared = prepareReviewItemsForSubmit(selected, ids.categoryId);
    const form = {
      documentType: "receipt" as const,
      shopName: "store",
      date: "2026-11-01",
      amountYen: "198",
      categoryId: ids.categoryId,
      registrationMode: "detailed" as const,
    };
    const formJudgment = judgeReviewFormAmountAndTax(
      { documentType: "receipt", reviewReasons: [], taxSummaries },
      form,
      selected,
    );
    expect(formJudgment.status).toBe("resolved");
    expect(formJudgment.unresolvedTaxItemCount).toBe(0);
    expect(
      getReviewGuidance(form, selected, {
        documentType: "receipt",
        reviewReasons: [],
        taxSummaries,
      }).filter((issue) => issue.required),
    ).toHaveLength(0);
    expect(formJudgment.checks).toMatchObject({
      amount: { status: "matched" },
      taxRate: { status: "matched" },
    });
    expect(buildReviewChecks({ items: prepared, paidTotalYen: 198, taxSummaries })).toMatchObject({
      amount: { status: "matched" },
      taxRate: { status: "matched" },
    });
    expect(
      getReviewSubmitErrorMessage(
        {
          documentType: "receipt",
          shopName: "store",
          date: "2026-11-01",
          amountYen: "198",
          categoryId: ids.categoryId,
          registrationMode: "detailed",
        },
        prepared,
      ),
    ).toBeNull();
    const discountForm = prepared.find((item) => item.id === ids.discountId)!;
    expect(getReviewDiscountTargetForSubmit(prepared, discountForm)).toEqual({ itemId: thirdId });
    await save([
      product,
      { ...discount, discountTarget: getReviewDiscountTargetForSubmit(prepared, discountForm) },
      { ...added, itemId: thirdId },
    ]);
    const { draft, rows } = await t.run(async ({ db }) => ({
      draft: (await db.get(ids.draftId))!,
      rows: await db
        .query("aiExpenseDraftItems")
        .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
        .collect(),
    }));
    const initialized = initializeReviewCategoryState(
      mapDraftItemsToReviewItems(rows),
      ids.categoryId,
    );
    expect(initialized.items.find((item) => item.id === ids.discountId)?.discountTargetItemId).toBe(
      thirdId,
    );
    expect(
      buildReviewChecks({ items: initialized.items, paidTotalYen: 198, taxSummaries }).taxRate
        .status,
    ).toBe("matched");
    expect(isResolvedForTest({ ...draft, items: rows })).toBe(true);
    expect(draft.reviewReasons).not.toContain("amount_mismatch");
    expect(draft.reviewReasons).not.toContain("user_confirmation_required");
    expect(draft.status).toBe("ready");
    expect(draft.listSummary?.amountAndTaxResolved).toBe(true);
    expect(
      buildDraftRegistrationItems(draft, rows.map(draftItemDocToFields)).reduce(
        (sum, item) => sum + item.amountYen,
        0,
      ),
    ).toBe(198);
  });
  it("対象商品を割引へ変えたら選択を解除し、選び直して保存できる", async () => {
    const { t, ids, save, product, discount, added } = await setup();
    const thirdId = await t.run(({ db }) =>
      db.insert("aiExpenseDraftItems", {
        groupId: ids.groupId,
        draftId: ids.draftId,
        ...added,
        confidence: {},
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const { result } = renderHook(() =>
      useReviewFormState({
        selectedReviewDraftId: null,
        selectedReviewDraft: null,
        localReviewItems: undefined,
        selectedReviewDraftDetails: null,
      }),
    );
    act(() => {
      result.current.setReviewForm((f) => ({
        ...f,
        documentType: "receipt",
        shopName: "store",
        date: "2026-11-01",
        amountYen: "198",
        categoryId: ids.categoryId,
      }));
      result.current.setReviewItems([
        {
          id: ids.productId,
          persistedItemId: ids.productId,
          itemName: product.itemName,
          amountYen: "100",
          categoryId: ids.categoryId,
        },
        {
          id: ids.discountId,
          persistedItemId: ids.discountId,
          itemName: discount.itemName,
          lineType: "promotion_adjustment",
          amountYen: "-10",
          categoryId: ids.categoryId,
          discountTargetItemId: ids.productId,
        },
        {
          id: thirdId,
          persistedItemId: thirdId,
          itemName: added.itemName,
          amountYen: "108",
          categoryId: ids.categoryId,
        },
      ]);
    });
    act(() => result.current.handleReviewItemChange(ids.productId, "lineType", "discount"));
    expect(result.current.reviewItems[1]).toMatchObject({
      categoryId: "",
      discountTargetItemId: undefined,
    });
    act(() => {
      result.current.handleDiscountTargetChange(ids.discountId, thirdId);
      result.current.handleDiscountTargetChange(ids.productId, thirdId);
    });
    const items = result.current.reviewItems;
    expect(getReviewSubmitErrorMessage(result.current.reviewForm, items)).toBeNull();
    await save(
      items.map((item) => ({
        itemId: item.persistedItemId as Id<"aiExpenseDraftItems">,
        itemName: item.itemName,
        lineType: item.lineType,
        amountYen: Number(item.amountYen),
        categoryId: item.categoryId as Id<"categories">,
        discountTarget: getReviewDiscountTargetForSubmit(items, item) as
          | { itemId: Id<"aiExpenseDraftItems"> }
          | { itemIndex: number }
          | null,
      })),
    );
    expect((await t.run(({ db }) => db.get(ids.discountId)))?.discountTargetItemId).toBe(thirdId);
  });
  it.each([-1, 0.5, 3])("不正な対象位置 %s を拒否し保存済み明細を変更しない", async (index) => {
    const { t, ids, save, product, discount, added } = await setup();
    await save([product, { ...discount, discountTarget: { itemId: ids.productId } }, added]);
    const rows = () =>
      t.run(({ db }) =>
        db
          .query("aiExpenseDraftItems")
          .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
          .collect(),
      );
    const before = await rows();
    const third = before.find((item) => item.itemName === added.itemName)!;
    await expect(
      save([
        { ...product, itemName: "変更" },
        { ...discount, discountTarget: { itemIndex: index } },
        { ...added, itemId: third._id },
      ]),
    ).rejects.toThrow("Invalid discount target");
    expect(await rows()).toEqual(before);
  });
  it("税率上書き後も割引対象を維持する", async () => {
    const { t, ids, save, product, discount, added } = await setup();
    await save([product, { ...discount, discountTarget: { itemId: ids.productId } }, added]);
    await t
      .withIdentity(identity)
      .mutation(api.aiExpenseDrafts.mutations.updateDraftItemTaxOverrides, {
        draftId: ids.draftId,
        itemId: ids.productId,
        taxRatePercent: 8,
      });
    expect((await t.run(({ db }) => db.get(ids.discountId)))?.discountTargetItemId).toBe(
      ids.productId,
    );
  });
  it("AI解釈へのリセットで対象とsnapshot専用位置を明細に残さない", async () => {
    const { t, ids, save, product, discount, added } = await setup();
    await save([product, { ...discount, discountTarget: { itemId: ids.productId } }, added]);
    await t.run(async ({ db }) => {
      const draft = (await db.get(ids.draftId))!;
      const snapshot = draft.receiptUserOverride!.values;
      await db.patch(ids.draftId, {
        receiptInterpretation: {
          source: "ai",
          interpretedAt: 1,
          values: {
            ...snapshot,
            items: snapshot.items.map((item, index) =>
              index === 1 ? { ...item, discountTargetItemIndex: 0 } : item,
            ),
          },
        },
      });
    });
    await t
      .withIdentity(identity)
      .mutation(api.aiExpenseDrafts.mutations.resetReceiptToAiInterpretation, {
        draftId: ids.draftId,
      });
    const rows = await t.run(({ db }) =>
      db
        .query("aiExpenseDraftItems")
        .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
        .collect(),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.discountTargetItemId).toBeUndefined();
      expect(row).not.toHaveProperty("discountTargetItemIndex");
    }
  });
});

function isResolvedForTest(draft: Parameters<typeof judgeDraftAmountAndTax>[0]) {
  return judgeDraftAmountAndTax(draft).status === "resolved";
}
