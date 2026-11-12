// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { makeFunctionReference, type FunctionArgs } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import {
  draftDocToFields,
  draftItemDocToFields,
} from "../../lib/convex/aiExpenseDrafts/draftRecordMapping";
import { judgeReviewFormAmountAndTax } from "../../lib/domain/aiExpenseDrafts/reviewFormJudgment";
import { buildDraftRegistrationItems } from "../../lib/domain/aiExpenseDrafts/registrationItems";
import { judgeDraftAmountAndTax } from "../../lib/domain/aiExpenseDrafts/draftAmountTaxJudgment";
import {
  assignDiscountTarget,
  assignCategoryToItems,
  prepareReviewItemsForSubmit,
  getReviewDiscountTargetForSubmit,
  initializeReviewCategoryState,
} from "../../lib/domain/aiExpenseDrafts/reviewItemCategories";
import { mapDraftItemsToReviewItems } from "../../lib/domain/aiExpenseDrafts/reviewDraftMapping";

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

describe("金額・税の保存とフォーム契約", () => {
  it.each([
    ["割引語のない割引行", "resolved", "resolved", "resolved"],
    ["品名に割引語がある割引行", "resolved", "resolved", "resolved"],
    ["販促調整行", "resolved", "resolved", "resolved"],
    ["混在税率", "unresolved", "unresolved", "unresolved"],
    ["税内訳未確定", "unresolved", "unresolved", "unresolved"],
    ["明細なし税あり", "unresolved", "unresolved", "unresolved"],
    ["明細なし税なし", "not_applicable", "not_applicable", "not_applicable"],
    ["合計のみ", "not_applicable", "not_applicable", "not_applicable"],
    ["カテゴリ別合計0以下", "unresolved", "resolved", "resolved"],
    ["合計不一致", "unresolved", "unresolved", "unresolved"],
    ["保存額と再計算額の相違", "unresolved", "resolved", "resolved"],
    ["印字額欠落の税抜", "unresolved", "unresolved", "unresolved"],
    ["割引対象保存あり", "resolved", "resolved", "resolved"],
    ["割引対象保存なし", "resolved", "resolved", "resolved"],
  ])(
    "同じ下書きの保存・一覧・フォーム・登録・移行: %s",
    async (scenario, expectedStored, expectedForm, expectedSaved) => {
      const { t, ids } = await setup();
      const prepared = await t.run(async ({ db }) => {
        const other = await db.insert("categories", {
          groupId: ids.groupId,
          name: "other",
          color: "#fff",
          isActive: true,
          sortOrder: 1,
          createdAt: 1,
          updatedAt: 1,
        });
        const noItems = scenario.startsWith("明細なし");
        const tax = scenario !== "明細なし税なし";
        const total = scenario === "合計不一致" ? 91 : 90;
        await db.patch(ids.draftId, {
          amountYen: total,
          ...(scenario === "合計のみ" ? { registrationMode: "totalOnly" as const } : {}),
          taxSummaries: tax
            ? [
                {
                  taxRatePercent: 10,
                  taxMode: "included",
                  taxableAmountYen: 90,
                  taxableAmountBasis: "tax_included",
                  taxYen: 8,
                  roundingMethod: "unknown",
                  status: "verified",
                  confidence: {},
                  warnings: [],
                },
              ]
            : undefined,
        });
        if (noItems) {
          await db.delete(ids.productId);
          await db.delete(ids.discountId);
        } else {
          const common = {
            amountBasis:
              scenario === "税内訳未確定" ? ("unknown" as const) : ("tax_included" as const),
            taxRatePercent: scenario === "税内訳未確定" ? null : (10 as const),
            taxResolutionStatus:
              scenario === "税内訳未確定" ? ("unresolved" as const) : ("resolved" as const),
            taxAllocationStatus: "allocated" as const,
          };
          await db.patch(ids.productId, {
            ...common,
            printedAmountYen: scenario === "印字額欠落の税抜" ? undefined : 100,
            normalizedAmountYen: scenario === "保存額と再計算額の相違" ? 99 : 100,
            ...(scenario === "印字額欠落の税抜" ? { amountBasis: "tax_excluded" as const } : {}),
            ...(scenario === "混在税率" ? { taxRatePercent: 8 as const } : {}),
          });
          await db.patch(ids.discountId, {
            ...common,
            itemName:
              scenario === "割引語のない割引行"
                ? "特売"
                : scenario === "品名に割引語がある割引行"
                  ? "値引"
                  : scenario === "販促調整行"
                    ? "まとめ割"
                    : "クーポン",
            lineType:
              scenario === "割引語のない割引行" || scenario === "品名に割引語がある割引行"
                ? "discount"
                : "promotion_adjustment",
            printedAmountYen: -10,
            normalizedAmountYen: -10,
            categoryId: scenario === "カテゴリ別合計0以下" ? other : ids.categoryId,
            ...(scenario === "割引対象保存あり" ? { discountTargetItemId: ids.productId } : {}),
          });
        }
        return {
          draft: (await db.get(ids.draftId))!,
          items: await db
            .query("aiExpenseDraftItems")
            .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
            .collect(),
        };
      });
      const domainItems = prepared.items.map(draftItemDocToFields);
      const domainDraft = draftDocToFields(prepared.draft);
      const j = judgeDraftAmountAndTax({ ...domainDraft, items: prepared.items });
      expect(j.status).toBe(expectedStored);
      expect(
        judgeDraftAmountAndTax(
          { ...domainDraft, items: prepared.items },
          { itemScope: "all_items" },
        ),
      ).toEqual(j);
      const summary = (
        await import("../../lib/domain/aiExpenseDrafts/listSummary")
      ).buildDraftListSummary(domainDraft, domainItems);
      expect(summary.amountAndTaxResolved).toBe(j.status === "resolved");
      if (j.status === "resolved") expect(summary.itemSummary?.itemDifferenceYen).toBe(0);
      const form = {
        documentType: "receipt" as const,
        shopName: "store",
        date: "2026-11-01",
        amountYen: String(domainDraft.amountYen),
        categoryId: ids.categoryId,
        registrationMode: domainDraft.registrationMode ?? "detailed",
      };
      const initial = initializeReviewCategoryState(
        mapDraftItemsToReviewItems(prepared.items),
        ids.categoryId,
      ).items;
      const formResult = judgeReviewFormAmountAndTax(
        { ...prepared.draft, items: prepared.items },
        form,
        initial,
      );
      expect(formResult.status).toBe(expectedForm);
      let registered = true;
      try {
        buildDraftRegistrationItems(domainDraft, domainItems);
      } catch {
        registered = false;
      }
      if (j.status === "unresolved" && domainDraft.registrationMode !== "totalOnly")
        expect(registered).toBe(false);
      if (j.status === "resolved") expect(registered).toBe(true);
      await t.run(({ db }) =>
        db.patch(ids.draftId, { status: "needs_review", reviewReasons: ["amount_mismatch"] }),
      );
      const migration = makeFunctionReference<"mutation">(
        "aiExpenseDraftAmountTaxMigration:executeBatch",
      );
      await t.mutation(migration, {});
      const migrated = (await t.run(({ db }) => db.get(ids.draftId)))!;
      expect(migrated.reviewReasons.includes("amount_mismatch")).toBe(j.status !== "resolved");
      if (j.status === "resolved")
        expect(migrated.listSummary?.itemSummary?.itemDifferenceYen).toBe(0);
      const submitItems = initial.map((item) => ({
        ...(item.persistedItemId
          ? { itemId: item.persistedItemId as Id<"aiExpenseDraftItems"> }
          : {}),
        itemName: item.itemName,
        lineType: item.lineType,
        amountYen: Number(item.amountYen),
        categoryId: item.categoryId as Id<"categories">,
        discountTarget: getReviewDiscountTargetForSubmit(initial, item) as
          | { itemId: Id<"aiExpenseDraftItems"> }
          | { itemIndex: number }
          | null,
      }));
      await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateForReview, {
        draftId: ids.draftId,
        documentType: "receipt",
        shopName: "store",
        date: "2026-11-01",
        amountYen: domainDraft.amountYen!,
        categoryId: ids.categoryId,
        registrationMode: form.registrationMode,
        items: submitItems,
      });
      const saved = (await t.run(({ db }) => db.get(ids.draftId)))!;
      const rows = await t.run(({ db }) =>
        db
          .query("aiExpenseDraftItems")
          .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
          .collect(),
      );
      const savedJudgment = judgeDraftAmountAndTax({ ...saved, items: rows });
      expect(savedJudgment.status).toBe(expectedSaved);
      expect(saved.listSummary?.amountAndTaxResolved).toBe(savedJudgment.status === "resolved");
      if (savedJudgment.status === "resolved") {
        const registrationItems = buildDraftRegistrationItems(
          draftDocToFields(saved),
          rows.map(draftItemDocToFields),
        );
        const expectedTotals = new Map<string, number>();
        for (const row of rows)
          if (row.categoryId)
            expectedTotals.set(
              row.categoryId,
              (expectedTotals.get(row.categoryId) ?? 0) +
                (row.normalizedAmountYen ?? row.amountYen),
            );
        expect(registrationItems.reduce((sum, item) => sum + item.amountYen, 0)).toBe(
          saved.amountYen,
        );
        expect(
          registrationItems.map(({ categoryId, amountYen }) => [categoryId, amountYen]).sort(),
        ).toEqual([...expectedTotals.entries()].sort());
        expect(saved.listSummary?.itemSummary?.itemDifferenceYen).toBe(0);
      }
      if (savedJudgment.reasons.includes("amount_mismatch"))
        expect(saved.reviewReasons).toContain("amount_mismatch");
      if (savedJudgment.reasons.includes("user_confirmation_required"))
        expect(saved.reviewReasons).toContain("user_confirmation_required");
      if (formResult.status === "resolved") {
        expect(savedJudgment.status).toBe("resolved");
        expect(saved.reviewReasons).not.toContain("amount_mismatch");
        expect(saved.reviewReasons).not.toContain("user_confirmation_required");
      }
      expect(saved.status).toBe(saved.reviewReasons.length ? "needs_review" : "ready");
    },
  );
  it.each(["金額変更", "明細追加", "明細削除", "カテゴリ割当", "割引対象選択"])(
    "フォームから実 mutation の往復: %s",
    async (scenario) => {
      const { t, ids } = await setup();
      const otherCategory = await t.run(({ db }) =>
        db.insert("categories", {
          groupId: ids.groupId,
          name: "other",
          color: "#fff",
          isActive: true,
          sortOrder: 1,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
      const before = await t.run(async ({ db }) => ({
        draft: (await db.get(ids.draftId))!,
        items: await db
          .query("aiExpenseDraftItems")
          .withIndex("by_draft_id", (q) => q.eq("draftId", ids.draftId))
          .collect(),
      }));
      let rows = initializeReviewCategoryState(
        mapDraftItemsToReviewItems(before.items),
        ids.categoryId,
      ).items;
      if (scenario === "金額変更")
        rows = rows.map((row) => (row.id === ids.productId ? { ...row, amountYen: "120" } : row));
      if (scenario === "明細追加" || scenario === "カテゴリ割当" || scenario === "割引対象選択")
        rows = [
          ...rows,
          {
            id: "new",
            itemName: "追加商品",
            amountYen: "40",
            categoryId: scenario === "カテゴリ割当" ? otherCategory : ids.categoryId,
          },
        ];
      if (scenario === "明細削除") rows = rows.filter((row) => row.id !== ids.discountId);
      if (scenario === "カテゴリ割当") rows = assignCategoryToItems(rows, ["new"], otherCategory);
      if (scenario === "割引対象選択") rows = assignDiscountTarget(rows, ids.discountId, "new");
      const amountYen = rows.reduce((sum, item) => sum + Number(item.amountYen), 0);
      const form = {
        documentType: "receipt" as const,
        shopName: "store",
        date: "2026-11-01",
        amountYen: String(amountYen),
        categoryId: ids.categoryId,
        registrationMode: "detailed" as const,
      };
      const judgment = judgeReviewFormAmountAndTax(
        { ...before.draft, items: before.items },
        form,
        rows,
      );
      expect(judgment.status).toBe("resolved");
      const prepared = prepareReviewItemsForSubmit(rows, ids.categoryId);
      const submitted: NonNullable<
        FunctionArgs<typeof api.aiExpenseDrafts.mutations.updateForReview>["items"]
      > = prepared.map((item) => ({
        ...(item.persistedItemId
          ? { itemId: item.persistedItemId as Id<"aiExpenseDraftItems"> }
          : {}),
        itemName: item.itemName,
        lineType: item.lineType,
        amountYen: Number(item.amountYen),
        categoryId: item.categoryId as Id<"categories">,
        discountTarget: getReviewDiscountTargetForSubmit(prepared, item) as
          | { itemId: Id<"aiExpenseDraftItems"> }
          | { itemIndex: number }
          | null,
      }));
      await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateForReview, {
        draftId: ids.draftId,
        documentType: "receipt",
        shopName: form.shopName,
        date: form.date,
        amountYen,
        categoryId: ids.categoryId,
        registrationMode: "detailed",
        items: submitted,
      });
      const after = await t.run(({ db }) => db.get(ids.draftId));
      expect(after?.status).toBe("ready");
      expect(after?.reviewReasons).not.toContain("amount_mismatch");
      expect(after?.reviewReasons).not.toContain("user_confirmation_required");
    },
  );
});
