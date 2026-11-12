// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import {
  mapConvexDraftToAiExpenseDraft,
  mapDraftToQueueItem,
} from "../../src/features/receipt-review/utils/mappers";
import { judgeDraftAmountAndTax } from "../../lib/domain/aiExpenseDrafts/draftAmountTaxJudgment";
import { judgeReviewFormAmountAndTax } from "../../lib/domain/aiExpenseDrafts/reviewFormJudgment";
import {
  mapDraftItemsToReviewItems,
  mapDraftToReviewForm,
} from "../../lib/domain/aiExpenseDrafts/reviewDraftMapping";
import { initializeReviewCategoryState } from "../../lib/domain/aiExpenseDrafts/reviewItemCategories";
import {
  applyReviewItemsTaxPreview,
  buildReviewTaxEvidence,
} from "../../lib/domain/aiExpenseDrafts/reviewItemsTaxPreview";
import {
  getPrimaryReviewReason,
  getReviewReasonLabel,
} from "../../lib/domain/aiExpenseDrafts/reviewFeedback";

const identity = {
  tokenIdentifier: "legacy-flow-user",
  subject: "legacy-flow-user",
  issuer: "https://issuer.example",
};

describe("旧形式税内訳の保存・登録", () => {
  it.each([
    "summary892",
    "summary892_unknown",
    "summary892_tax52",
    "summary892_conflict10",
    "summary892_conflictBoth",
    "unproven1003",
  ] as const)("%s の保存理由と保存値の判定を一覧へ渡す", async (receiptCase) => {
    const t = convexTest(schema, convexTestModules);
    const { groupId, categoryId } = await t.run(async ({ db }) => {
      const groupId = await db.insert("groups", {
        name: "group",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const categoryId = await db.insert("categories", {
        groupId,
        name: "food",
        color: "#000",
        isActive: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      return { groupId, categoryId };
    });
    const draftId = await t.mutation(
      internal.aiExpenseDrafts.internal.createE2eTaxReviewDraftForUser,
      { groupId, categoryId, createdByUserId: identity.tokenIdentifier, receiptCase },
    );
    const { draft, items } = await t.run(async ({ db }) => ({
      draft: (await db.get(draftId))!,
      items: await db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", groupId).eq("draftId", draftId),
        )
        .take(100),
    }));
    expect(judgeDraftAmountAndTax({ ...draft, items }).status).toBe("unresolved");
    expect(draft.reviewReasons).toContain("amount_mismatch");
    expect(draft.reviewReasons).toContain("user_confirmation_required");
    const reasons = mapDraftToQueueItem(mapConvexDraftToAiExpenseDraft(draft), {}).reviewReasons;
    expect(reasons).toContain("amount_mismatch");
    expect(getReviewReasonLabel(getPrimaryReviewReason(reasons)!)).toBe("金額・税内訳の確認が必要");
  });
  it("一覧の保存理由とフォームの解決状態を保ち、保存・再表示・登録で1782円になる", async () => {
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
        color: "#000",
        isActive: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      return { groupId, categoryId };
    });
    const draftId = await t.mutation(
      internal.aiExpenseDrafts.internal.createE2eTaxReviewDraftForUser,
      { ...ids, createdByUserId: identity.tokenIdentifier, receiptCase: "summary892" },
    );
    const load = () =>
      t.run(async ({ db }) => ({
        draft: (await db.get(draftId))!,
        items: await db
          .query("aiExpenseDraftItems")
          .withIndex("by_group_id_and_draft_id", (q) =>
            q.eq("groupId", ids.groupId).eq("draftId", draftId),
          )
          .take(100),
      }));
    const initial = await load();
    expect(initial.items.reduce((sum, item) => sum + item.amountYen, 0)).toBe(1729);
    expect(judgeDraftAmountAndTax({ ...initial.draft, items: initial.items }).status).toBe(
      "unresolved",
    );
    const queue = mapDraftToQueueItem(mapConvexDraftToAiExpenseDraft(initial.draft), {});
    expect(queue.reviewReasons).toContain("amount_mismatch");
    expect(queue.reviewReasons.map(getReviewReasonLabel)).toContain("金額・税内訳の確認が必要");
    const form = mapDraftToReviewForm(initial.draft);
    const categoryState = initializeReviewCategoryState(
      mapDraftItemsToReviewItems(initial.items),
      form.categoryId,
    );
    const reviewItems = applyReviewItemsTaxPreview(categoryState.items, {
      ...buildReviewTaxEvidence(initial.draft),
      paidTotalYen: Number(form.amountYen),
    });
    expect(
      judgeReviewFormAmountAndTax({ ...initial.draft, items: initial.items }, form, reviewItems)
        .status,
    ).toBe("resolved");
    const submit = () =>
      t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateForReview, {
        draftId,
        documentType: form.documentType,
        shopName: form.shopName,
        date: form.date,
        amountYen: Number(form.amountYen),
        categoryId: ids.categoryId,
        registrationMode: "detailed",
        items: reviewItems.map((item) => ({
          itemId: item.persistedItemId as (typeof initial.items)[number]["_id"],
          itemName: item.itemName,
          amountYen: Number(item.amountYen),
          categoryId: ids.categoryId,
        })),
      });
    await submit();
    const saved = await load();
    expect(saved.draft.status).toBe("ready");
    expect(saved.draft.reviewReasons).toEqual([]);
    expect(saved.draft.reviewReasons).not.toContain("amount_mismatch");
    expect(saved.draft.amountYen).toBe(1782);
    expect(
      mapDraftToQueueItem(mapConvexDraftToAiExpenseDraft(saved.draft), {}).reviewReasons,
    ).not.toContain("amount_mismatch");
    const reopenedForm = mapDraftToReviewForm(saved.draft);
    const reopenedItems = initializeReviewCategoryState(
      mapDraftItemsToReviewItems(saved.items),
      reopenedForm.categoryId,
    ).items;
    expect(
      judgeReviewFormAmountAndTax(
        { ...saved.draft, items: saved.items },
        reopenedForm,
        reopenedItems,
      ).status,
    ).toBe("resolved");
    await submit();
    const result = await t
      .withIdentity(identity)
      .mutation(api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries, {
        draftIds: [draftId],
      });
    expect(result.registeredDraftIds).toEqual([draftId]);
    const entries = await t.run(async ({ db }) =>
      Promise.all(result.createdExpenseEntryIds.map((id) => db.get(id))),
    );
    expect(entries.reduce((sum, entry) => sum + (entry?.amount ?? 0), 0)).toBe(1782);
  });
});
