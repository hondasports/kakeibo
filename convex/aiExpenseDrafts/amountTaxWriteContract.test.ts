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
  it("窓外の未確定税は税上書き後も確認待ちに残る", async () => {
    const { t, ids } = await setup();
    const { draftId, firstId } = await t.run(async ({ db }) => {
      const draftId = await db.insert("aiExpenseDrafts", {
        groupId: ids.groupId,
        sourceType: "image_upload",
        status: "needs_review",
        documentType: "receipt",
        shopName: "店",
        date: "2026-11-01",
        amountYen: 100,
        categoryId: ids.categoryId,
        confidence,
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        createdAt: 1,
        updatedAt: 1,
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
      let firstId: Id<"aiExpenseDraftItems"> | undefined;
      for (let i = 0; i < 102; i++) {
        const unresolved = i === 100;
        const discount = i === 101;
        const amountYen = discount ? -1 : 1;
        const id = await db.insert("aiExpenseDraftItems", {
          groupId: ids.groupId,
          draftId,
          itemName: discount ? "値引" : "商品",
          ...(discount ? { lineType: "discount" as const } : {}),
          amountYen,
          printedAmountYen: amountYen,
          normalizedAmountYen: amountYen,
          amountBasis: unresolved ? "unknown" : "tax_included",
          taxRatePercent: unresolved ? null : 10,
          taxResolutionStatus: unresolved ? "unresolved" : "resolved",
          ...(unresolved ? {} : { taxResolutionSource: "item_explicit" as const }),
          taxAllocationStatus: unresolved ? "unallocated" : "allocated",
          categoryId: ids.categoryId,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        });
        firstId ??= id;
      }
      return { draftId, firstId: firstId! };
    });
    await t
      .withIdentity(identity)
      .mutation(api.aiExpenseDrafts.mutations.updateDraftItemTaxOverrides, {
        draftId,
        itemId: firstId,
        taxRatePercent: 10,
        amountBasis: "tax_included",
      });
    const saved = (await t.run(({ db }) => db.get(draftId)))!;
    expect(saved.status).toBe("needs_review");
    expect(saved.reviewReasons).toContain("user_confirmation_required");
    await expect(
      t
        .withIdentity(identity)
        .mutation(api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries, {
          draftIds: [draftId],
        }),
    ).rejects.toThrow();
  });
  it.each(["updateRegisteredDraft", "updateForReview"] as const)(
    "登録済みの %s は status と一覧判定を保つ",
    async (operation) => {
      const { t, ids } = await setup();
      const draftId = await t.run(async ({ db }) => {
        const id = await db.insert("aiExpenseDrafts", {
          groupId: ids.groupId,
          status: "registered",
          sourceType: "image_upload",
          documentType: "receipt",
          shopName: "店",
          date: "2026-11-01",
          amountYen: 100,
          categoryId: ids.categoryId,
          confidence,
          reviewReasons: [],
          createdAt: 1,
          updatedAt: 1,
        });
        await db.insert("aiExpenseDraftItems", {
          groupId: ids.groupId,
          draftId: id,
          itemName: "商品",
          amountYen: 100,
          categoryId: ids.categoryId,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        });
        return id;
      });
      const input = {
        draftId,
        shopName: "店",
        date: "2026-11-01",
        amountYen: 100,
        categoryId: ids.categoryId,
      };
      if (operation === "updateRegisteredDraft")
        await t
          .withIdentity(identity)
          .mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
            ...input,
            registrationMode: "detailed",
          });
      else
        await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.updateForReview, {
          ...input,
          documentType: "receipt",
        });
      const { saved, rows } = await t.run(async ({ db }) => ({
        saved: (await db.get(draftId))!,
        rows: await db
          .query("aiExpenseDraftItems")
          .withIndex("by_draft_id", (q) => q.eq("draftId", draftId))
          .collect(),
      }));
      expect(saved.status).toBe("registered");
      expect(saved.listSummary).toEqual(
        buildDraftListSummary(draftDocToFields(saved), rows.map(draftItemDocToFields)),
      );
      expect(saved.listSummary?.amountAndTaxResolved).toBe(
        judgeDraftAmountAndTax({ ...saved, items: rows }).status === "resolved",
      );
    },
  );
  it.each([100, 90])(
    "利用者修正なしの再解析 合計%s はAIの値を判定して保存する",
    async (amountYen) => {
      const { t, ids } = await setup();
      const draft = await t
        .withIdentity(identity)
        .mutation(internal.aiExpenseDrafts.internal.createFromExtraction, {
          groupId: ids.groupId,
          documentType: "receipt",
          shopName: "店",
          date: "2026-11-01",
          amountYen,
          categoryId: ids.categoryId,
          confidence,
          warnings: [],
          items: [
            {
              itemName: "商品",
              amountYen: 100,
              categoryId: ids.categoryId,
              confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
            },
          ],
        });
      const rows = await t.run(({ db }) =>
        db
          .query("aiExpenseDraftItems")
          .withIndex("by_draft_id", (q) => q.eq("draftId", draft._id))
          .collect(),
      );
      const judgment = judgeDraftAmountAndTax({ ...draft, items: rows });
      expect(draft.reviewReasons.includes("amount_mismatch")).toBe(
        judgment.reasons.includes("amount_mismatch"),
      );
      expect(draft.reviewReasons).toContain("user_confirmation_required");
      expect(draft.status).toBe("needs_review");
      expect(draft.listSummary).toEqual(
        buildDraftListSummary(draftDocToFields(draft), rows.map(draftItemDocToFields)),
      );
    },
  );
  it("101件の再解析とリセットは窓外の不一致理由を消さない", async () => {
    const { t, ids } = await setup();
    const item = {
      itemName: "商品",
      amountYen: 1,
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
        items: Array.from({ length: 101 }, () => item),
      });
    expect(draft.reviewReasons).toContain("amount_mismatch");
    const values = {
      ...draft.receiptInterpretation!.values,
      reviewReasons: ["amount_mismatch" as const],
    };
    await t.run(({ db }) =>
      db.patch(draft._id, { receiptInterpretation: { source: "ai", interpretedAt: 1, values } }),
    );
    await t
      .withIdentity(identity)
      .mutation(api.aiExpenseDrafts.mutations.resetReceiptToAiInterpretation, {
        draftId: draft._id,
      });
    expect((await t.run(({ db }) => db.get(draft._id)))?.reviewReasons).toContain(
      "amount_mismatch",
    );
  });
  it("101件の税上書きと税再取得でも窓外の不一致理由を消さない", async () => {
    const { t, ids } = await setup();
    const item = {
      itemName: "商品",
      amountYen: 1,
      printedAmountYen: 1,
      amountBasis: "tax_included" as const,
      taxRatePercent: 10 as const,
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
        items: Array.from({ length: 101 }, () => item),
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
    const row = (await t.run(({ db }) =>
      db
        .query("aiExpenseDraftItems")
        .withIndex("by_draft_id", (q) => q.eq("draftId", draft._id))
        .first(),
    ))!;
    await t
      .withIdentity(identity)
      .mutation(api.aiExpenseDrafts.mutations.updateDraftItemTaxOverrides, {
        draftId: draft._id,
        itemId: row._id,
        taxRatePercent: 10,
        amountBasis: "tax_included",
      });
    expect((await t.run(({ db }) => db.get(draft._id)))?.reviewReasons).toContain(
      "amount_mismatch",
    );
    await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.applyReceiptTaxSettings, {
      draftId: draft._id,
      taxRatePercent: 10,
      amountBasis: "tax_included",
    });
    expect((await t.run(({ db }) => db.get(draft._id)))?.reviewReasons).toContain(
      "amount_mismatch",
    );
  });
  it("移行は101件目がある場合に理由を残し、100件なら理由を外して登録できる", async () => {
    const { t, ids } = await setup();
    const drafts = await t.run(async ({ db }) => {
      const result: Id<"aiExpenseDrafts">[] = [];
      for (const count of [100, 101]) {
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
          createdAt: 1,
          updatedAt: 1,
        });
        for (let i = 0; i < count; i++)
          await db.insert("aiExpenseDraftItems", {
            groupId: ids.groupId,
            draftId,
            itemName: `商品${i}`,
            amountYen: 1,
            categoryId: ids.categoryId,
            confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
            createdAt: 1,
            updatedAt: 1,
          });
        result.push(draftId);
      }
      return result;
    });
    const dryRun = makeFunctionReference<"query">("aiExpenseDraftAmountTaxMigration:dryRun");
    const execute = makeFunctionReference<"mutation">(
      "aiExpenseDraftAmountTaxMigration:executeBatch",
    );
    expect(await t.query(dryRun, {})).toMatchObject({
      needsReasonRemoval: 1,
      reasonRemovalSkippedOverLimit: 1,
    });
    await t.mutation(execute, {});
    const [within, over] = await t.run(({ db }) => Promise.all(drafts.map((id) => db.get(id))));
    expect(within).toMatchObject({ status: "ready", reviewReasons: [] });
    expect(over).toMatchObject({
      status: "needs_review",
      reviewReasons: ["amount_mismatch"],
      listSummary: { amountAndTaxResolved: true },
    });
    expect(await t.query(dryRun, {})).toMatchObject({
      needsUpdate: 0,
      reasonRemovalSkippedOverLimit: 1,
    });
    await expect(
      t
        .withIdentity(identity)
        .mutation(api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries, {
          draftIds: [drafts[1]],
        }),
    ).rejects.toThrow();
    await t.run(({ db }) => db.patch(drafts[1], { status: "ready", reviewReasons: [] }));
    await expect(
      t
        .withIdentity(identity)
        .mutation(api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries, {
          draftIds: [drafts[1]],
        }),
    ).rejects.toThrow();
    expect(
      await t
        .withIdentity(identity)
        .mutation(api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries, {
          draftIds: [drafts[0]],
        }),
    ).toMatchObject({ registeredDraftIds: [drafts[0]] });
  });
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
