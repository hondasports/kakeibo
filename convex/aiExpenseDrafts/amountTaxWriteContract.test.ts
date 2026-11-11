// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import { judgeDraftAmountAndTax } from "../../lib/domain/aiExpenseDrafts/draftAmountTaxJudgment";
import { buildDraftListSummary } from "../../lib/domain/aiExpenseDrafts/listSummary";
import {
  draftDocToFields,
  draftItemDocToFields,
} from "../../lib/convex/aiExpenseDrafts/draftRecordMapping";
import type { Id } from "../_generated/dataModel";

const identity = {
  tokenIdentifier: "contract-user",
  subject: "contract-user",
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
      color: "#000",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    return { groupId, categoryId };
  });
  return { t, ids };
}
const confidence = { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 };

describe("金額・税の書込契約", () => {
  it("作成・保存・税率上書き・税再取得・登録モード切替で保存結果と正本が一致する", async () => {
    const { t, ids } = await setup();
    const item = {
      itemName: "商品",
      amountYen: 100,
      printedAmountYen: 100,
      normalizedAmountYen: 100,
      amountBasis: "tax_included" as const,
      taxRatePercent: 10 as const,
      taxAllocationStatus: "allocated" as const,
      taxResolutionStatus: "resolved" as const,
      taxResolutionSource: "item_explicit" as const,
      categoryId: ids.categoryId,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    };
    const draft = await t
      .withIdentity(identity)
      .mutation(internal.aiExpenseDrafts.internal.createFromExtraction, {
        groupId: ids.groupId,
        documentType: "receipt",
        shopName: "店",
        date: "2026-11-01",
        amountYen: 100,
        categoryId: ids.categoryId,
        confidence,
        warnings: [],
        items: [item],
        taxSummaries: [
          {
            taxRatePercent: 10,
            taxMode: "included",
            taxableAmountYen: 100,
            taxableAmountBasis: "tax_included",
            taxYen: 9,
            roundingMethod: "unknown",
            status: "verified",
            confidence: {},
            warnings: [],
          },
        ],
      });
    const verify = async (id: Id<"aiExpenseDrafts">) => {
      const { saved, rows } = await t.run(async ({ db }) => ({
        saved: (await db.get(id))!,
        rows: await db
          .query("aiExpenseDraftItems")
          .withIndex("by_draft_id", (q) => q.eq("draftId", id))
          .collect(),
      }));
      const judgment = judgeDraftAmountAndTax({ ...saved, items: rows });
      expect(saved.reviewReasons.includes("amount_mismatch")).toBe(
        judgment.reasons.includes("amount_mismatch"),
      );
      if (judgment.reasons.includes("user_confirmation_required"))
        expect(saved.reviewReasons).toContain("user_confirmation_required");
      expect(saved.status).toBe(saved.reviewReasons.length ? "needs_review" : "ready");
      expect(saved.listSummary).toEqual(
        buildDraftListSummary(draftDocToFields(saved), rows.map(draftItemDocToFields)),
      );
      return rows;
    };
    let rows = await verify(draft._id);
    await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateForReview, {
      draftId: draft._id,
      documentType: "receipt",
      shopName: "店",
      date: "2026-11-01",
      amountYen: 100,
      categoryId: ids.categoryId,
      registrationMode: "detailed",
      items: [
        { itemId: rows[0]._id, itemName: "商品", amountYen: 100, categoryId: ids.categoryId },
      ],
    });
    rows = await verify(draft._id);
    await t
      .withIdentity(identity)
      .mutation(api.aiExpenseDrafts.mutations.updateDraftItemTaxOverrides, {
        draftId: draft._id,
        itemId: rows[0]._id,
        taxRatePercent: 10,
        amountBasis: "tax_included",
      });
    await verify(draft._id);
    await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.applyReceiptTaxSettings, {
      draftId: draft._id,
      taxRatePercent: 10,
      amountBasis: "tax_included",
    });
    await verify(draft._id);
    for (const registrationMode of ["totalOnly", "detailed"] as const) {
      await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateForReview, {
        draftId: draft._id,
        documentType: "receipt",
        shopName: "店",
        date: "2026-11-01",
        amountYen: 100,
        categoryId: ids.categoryId,
        registrationMode,
      });
      await verify(draft._id);
    }
  });
  it.each([
    [90, 100, false],
    [100, 90, true],
  ])(
    "再解析 AI合計%s / 引継ぎ合計%s: amount_mismatch=%s",
    async (aiAmount, userAmount, mismatch) => {
      const { t, ids } = await setup();
      const item = {
        itemName: "商品",
        amountYen: 100,
        categoryId: ids.categoryId,
        confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      };
      const snapshot = {
        status: "needs_review" as const,
        documentType: "receipt" as const,
        shopName: "店",
        date: "2026-11-01",
        amountYen: userAmount,
        categoryId: ids.categoryId,
        confidence,
        warnings: [],
        reviewReasons: [],
        items: [item],
      };
      const draft = await t
        .withIdentity(identity)
        .mutation(internal.aiExpenseDrafts.internal.createFromExtraction, {
          groupId: ids.groupId,
          documentType: "receipt",
          shopName: "AI",
          date: "2026-11-01",
          amountYen: aiAmount,
          categoryId: ids.categoryId,
          confidence,
          warnings: [],
          items: [item],
          preservedUserOverride: {
            source: "user",
            updatedAt: 1,
            fields: ["amountYen", "items"],
            values: snapshot,
          },
        });
      expect(draft.reviewReasons.includes("amount_mismatch")).toBe(mismatch);
      expect(draft.reviewReasons).toContain("user_confirmation_required");
      expect(draft.listSummary?.amountAndTaxResolved).toBe(!mismatch);
      expect(draft.receiptInterpretation?.values.amountYen).toBe(aiAmount);
    },
  );
  it.each([
    [100, ["user_confirmation_required", "amount_mismatch"], false],
    [90, [], true],
  ] as const)(
    "リセット合計%s 旧理由%j: amount_mismatch=%s",
    async (amount, oldReasons, mismatch) => {
      const { t, ids } = await setup();
      const item = {
        itemName: "商品",
        amountYen: 100,
        categoryId: ids.categoryId,
        confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      };
      const values = {
        status: "needs_review" as const,
        documentType: "receipt" as const,
        shopName: "店",
        date: "2026-11-01",
        amountYen: amount,
        categoryId: ids.categoryId,
        confidence,
        warnings: [],
        reviewReasons: [...oldReasons],
        items: [item],
      };
      const id = await t.run(({ db }) =>
        db.insert("aiExpenseDrafts", {
          groupId: ids.groupId,
          status: "needs_review",
          sourceType: "image_upload",
          documentType: "receipt",
          amountYen: 100,
          categoryId: ids.categoryId,
          confidence,
          reviewReasons: [],
          receiptInterpretation: { source: "ai", interpretedAt: 1, values },
          createdAt: 1,
          updatedAt: 1,
        }),
      );
      await t
        .withIdentity(identity)
        .mutation(api.aiExpenseDrafts.mutations.resetReceiptToAiInterpretation, { draftId: id });
      const draft = (await t.run(({ db }) => db.get(id)))!;
      expect(draft.reviewReasons.includes("amount_mismatch")).toBe(mismatch);
      expect(draft.listSummary?.amountAndTaxResolved).toBe(!mismatch);
      if (oldReasons.includes("user_confirmation_required"))
        expect(draft.reviewReasons).toContain("user_confirmation_required");
      expect(draft.status).toBe("needs_review");
      expect(draft.receiptInterpretation?.values).toEqual(values);
    },
  );
  it("移行後にリセットしても古い金額理由が復活しない", async () => {
    const { t, ids } = await setup();
    const item = {
      itemName: "商品",
      amountYen: 100,
      categoryId: ids.categoryId,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    };
    const values = {
      status: "needs_review" as const,
      documentType: "receipt" as const,
      shopName: "店",
      date: "2026-11-01",
      amountYen: 100,
      categoryId: ids.categoryId,
      confidence,
      warnings: [],
      reviewReasons: ["amount_mismatch" as const],
      items: [item],
    };
    const id = await t.run(async ({ db }) => {
      const draftId = await db.insert("aiExpenseDrafts", {
        groupId: ids.groupId,
        status: "needs_review",
        sourceType: "image_upload",
        documentType: "receipt",
        shopName: "店",
        date: "2026-11-01",
        amountYen: 100,
        categoryId: ids.categoryId,
        confidence,
        reviewReasons: ["amount_mismatch"],
        receiptInterpretation: { source: "ai", interpretedAt: 1, values },
        createdAt: 1,
        updatedAt: 1,
      });
      await db.insert("aiExpenseDraftItems", {
        ...item,
        groupId: ids.groupId,
        draftId,
        createdAt: 1,
        updatedAt: 1,
      });
      return draftId;
    });
    await t.mutation(
      makeFunctionReference<"mutation">("aiExpenseDraftAmountTaxMigration:executeBatch"),
      {},
    );
    expect((await t.run(({ db }) => db.get(id)))?.reviewReasons).not.toContain("amount_mismatch");
    await t
      .withIdentity(identity)
      .mutation(api.aiExpenseDrafts.mutations.resetReceiptToAiInterpretation, { draftId: id });
    expect((await t.run(({ db }) => db.get(id)))?.reviewReasons).not.toContain("amount_mismatch");
  });
});
