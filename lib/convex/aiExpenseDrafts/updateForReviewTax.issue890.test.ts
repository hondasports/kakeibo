import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  updateForReviewHandler,
  updateDraftItemTaxOverridesMutationHandler,
} from "../../../convex/aiExpenseDrafts/mutations";
import { buildDraftRegistrationItems } from "./reconcileExpenseEntries";
import {
  receiptTaxBasisCases,
  receiptTaxBasisInput,
} from "../../domain/receipt/tax/fixtures/receiptTaxBasisCases";
import { GROUP_ID, DRAFT_ID, CAT_ID, createInMemoryMutationCtx } from "./testHelpers";
import {
  mapDraftToReviewForm,
  mapDraftItemsToReviewItems,
} from "../../../src/features/receipt-review/utils/mappers";
import type {
  AiExpenseDraft,
  AiExpenseDraftWithItems,
} from "../../../src/features/receipt-review/types/types";
import { updateSummaryTaxOverridesHandler } from "./updateSummaryTaxOverrides";
import { RECEIPT_TAX_CHOICE_FIELDS } from "../../domain/aiExpenseDrafts/receiptDataContract";
import { buildReviewChecks } from "../../../src/features/receipt-review/utils/reviewChecks";
import { toReceiptTotalsViewModel } from "../../../src/features/receipt-review/utils/receiptTotalsViewModel";

function setup(testCase: (typeof receiptTaxBasisCases)[number]) {
  const input = receiptTaxBasisInput(testCase);
  return createInMemoryMutationCtx({
    draft: {
      _id: DRAFT_ID,
      groupId: GROUP_ID,
      status: "needs_review",
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-04",
      amountYen: input.amountYen,
      categoryId: CAT_ID,
      confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
      taxSummaries: input.taxSummaries,
      warnings: [],
      reviewReasons: ["user_confirmation_required"],
      createdAt: 1,
      updatedAt: 1,
    },
    items: input.items.map((item, index) => ({
      ...item,
      _id: `item-${index}`,
      groupId: GROUP_ID,
      draftId: DRAFT_ID,
      amountYen: item.printedAmountYen,
      amountBasis: "tax_included",
      taxResolutionStatus: "resolved",
      taxResolutionSource: "item_explicit",
      taxAllocationStatus: "unallocated",
      allocatedTaxYen: 0,
      normalizedAmountYen: item.printedAmountYen,
      categoryId: CAT_ID,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: 1,
      updatedAt: 1,
    })),
  });
}

async function correctItems(env: ReturnType<typeof setup>) {
  for (const item of env.getItems()) {
    await updateDraftItemTaxOverridesMutationHandler(env.ctx, {
      draftId: DRAFT_ID,
      itemId: item._id as Id<"aiExpenseDraftItems">,
      amountBasis: "tax_excluded",
    });
  }
}

function save(
  env: ReturnType<typeof setup>,
  testCase: (typeof receiptTaxBasisCases)[number],
  form: Pick<
    ReturnType<typeof mapDraftToReviewForm>,
    "priceTaxTreatment" | "taxRateComposition"
  > = {},
) {
  return updateForReviewHandler(env.ctx, {
    draftId: DRAFT_ID,
    documentType: "receipt",
    shopName: "テスト店",
    date: "2026-10-04",
    amountYen: testCase.paidYen,
    categoryId: CAT_ID,
    priceTaxTreatment: form.priceTaxTreatment,
    taxRateComposition: form.taxRateComposition,
    items: env.getItems().map((item) => ({
      itemId: item._id as Id<"aiExpenseDraftItems">,
      itemName: String(item.itemName),
      amountYen: Number(item.printedAmountYen),
      categoryId: CAT_ID,
    })),
  });
}

function reopen(env: ReturnType<typeof setup>) {
  return mapDraftToReviewForm(env.getDraft() as unknown as AiExpenseDraft);
}

function registrationItems(env: ReturnType<typeof setup>) {
  return buildDraftRegistrationItems(
    env.getDraft() as unknown as Doc<"aiExpenseDrafts">,
    env.getItems() as unknown as Doc<"aiExpenseDraftItems">[],
  );
}

describe("Issue #890: 補正・保存・再表示・登録境界", () => {
  it.each([false, true])(
    "同値の外税内訳2行を再保存しても画面確認と436円登録が一致する（逆順=%s）",
    async (reverse) => {
      const testCase = receiptTaxBasisCases[0];
      const env = setup(testCase);
      const withIncluded = {
        ...env.getDraft().taxSummaries![0],
        taxMode: "external" as const,
        taxableAmountBasis: "tax_excluded" as const,
        taxableAmountYen: 404,
      };
      const withoutIncluded = { ...withIncluded };
      delete withoutIncluded.taxIncludedAmountYen;
      const printedSummaries = reverse
        ? [withIncluded, withoutIncluded]
        : [withoutIncluded, withIncluded];
      await env.ctx.db.patch(DRAFT_ID, { taxSummaries: printedSummaries });
      await correctItems(env);

      for (let cycle = 0; cycle < 2; cycle += 1) {
        await save(env, testCase, reopen(env));
        const draft = env.getDraft() as unknown as AiExpenseDraft;
        const items = mapDraftItemsToReviewItems(
          env.getItems() as unknown as AiExpenseDraftWithItems["items"],
        );

        expect(draft.status).toBe("ready");
        expect(draft.taxSummaries).toHaveLength(2);
        expect(draft.taxSummaries).toMatchObject(printedSummaries);
        expect(items.map((item) => item.allocatedTaxYen)).toEqual([8, 11, 13]);
        expect(registrationItems(env).reduce((sum, item) => sum + item.amountYen, 0)).toBe(436);
        expect(
          buildReviewChecks({ items, paidTotalYen: 436, taxSummaries: draft.taxSummaries }),
        ).toMatchObject({ amount: { status: "matched" }, taxRate: { status: "matched" } });
        expect(
          toReceiptTotalsViewModel({
            reviewItems: items,
            paidTotalYen: 436,
            taxSummaries: draft.taxSummaries,
          }),
        ).toMatchObject({ status: "matched", receiptSubtotalYen: 404 });
      }
    },
  );

  it.each(
    receiptTaxBasisCases.flatMap((testCase) =>
      [{ priceTaxTreatment: "excluded" as const }, { taxRateComposition: "rate8" as const }].map(
        (choice) => ({ paidYen: testCase.paidYen, testCase, choice }),
      ),
    ),
  )(
    "$paidYen 円の片軸の全体設定を再保存しても印字税額・丸めを維持する ($choice)",
    async ({ testCase, choice }) => {
      const env = setup(testCase);
      const printedSummary = structuredClone(env.getDraft().taxSummaries);
      await correctItems(env);
      await save(env, testCase, choice);
      const form = reopen(env);
      expect(form.priceTaxTreatment).toBe(
        "priceTaxTreatment" in choice ? choice.priceTaxTreatment : undefined,
      );
      expect(form.taxRateComposition).toBe(
        "taxRateComposition" in choice ? choice.taxRateComposition : undefined,
      );
      await save(env, testCase, form);
      await save(env, testCase, reopen(env));
      expect(env.getDraft().status).toBe("ready");
      expect(env.getDraft().taxSummaries).toMatchObject(printedSummary!);
      expect(env.getItems().map((item) => item.allocatedTaxYen)).toEqual(testCase.allocations);
      expect(registrationItems(env).reduce((sum, item) => sum + item.amountYen, 0)).toBe(
        testCase.paidYen,
      );
    },
  );

  it.each(receiptTaxBasisCases)(
    "$paidYen 円の税内訳を補正しても全体設定として再送しない",
    async (testCase) => {
      const env = setup(testCase);
      const printedSummary = structuredClone(env.getDraft().taxSummaries);
      await env.ctx.db.patch(DRAFT_ID, {
        taxSummaries: printedSummary!.map((summary) => ({
          ...summary,
          taxYen: testCase.taxYen - 1,
        })),
      });
      await correctItems(env);
      await save(env, testCase, { taxRateComposition: "rate8" });
      await updateSummaryTaxOverridesHandler(
        env.ctx,
        { draftId: DRAFT_ID, summaryIndex: 0, taxYen: testCase.taxYen },
        GROUP_ID,
      );
      expect(reopen(env)).toMatchObject({
        priceTaxTreatment: undefined,
        taxRateComposition: undefined,
      });
      await save(env, testCase, reopen(env));
      await save(env, testCase, reopen(env));
      expect(env.getDraft().status).toBe("ready");
      expect(env.getDraft().taxSummaries).toMatchObject(printedSummary!);
      expect(env.getItems().map((item) => item.allocatedTaxYen)).toEqual(testCase.allocations);
      expect(registrationItems(env).reduce((sum, item) => sum + item.amountYen, 0)).toBe(
        testCase.paidYen,
      );
    },
  );

  it("商品の不明補正では全体の不明選択へ昇格せず、未配分の明細登録を拒否する", async () => {
    const testCase = receiptTaxBasisCases[0];
    const env = setup(testCase);
    const summary = env.getDraft().taxSummaries![0];
    await env.ctx.db.patch(DRAFT_ID, {
      taxSummaries: [
        summary,
        {
          ...summary,
          taxMode: "external",
          taxableAmountBasis: "tax_excluded",
          taxableAmountYen: 404,
        },
      ],
    });
    for (const item of env.getItems()) {
      await updateDraftItemTaxOverridesMutationHandler(env.ctx, {
        draftId: DRAFT_ID,
        itemId: item._id as Id<"aiExpenseDraftItems">,
        amountBasis: "unknown",
      });
    }
    await save(env, testCase);
    expect(reopen(env)).toMatchObject({
      priceTaxTreatment: undefined,
      taxRateComposition: undefined,
    });
    await save(env, testCase, reopen(env));
    expect(env.getDraft()).toMatchObject({ registrationMode: "detailed", status: "needs_review" });
    expect(
      env
        .getItems()
        .every(
          (item) => item.amountBasis === "unknown" && item.taxAllocationStatus === "unallocated",
        ),
    ).toBe(true);
    expect(() => registrationItems(env)).toThrow("税込登録額が未確定");
  });

  it.each([
    { priceTaxTreatment: "unknown" as const },
    { taxRateComposition: "unknown" as const },
    { priceTaxTreatment: "unknown" as const, taxRateComposition: "unknown" as const },
  ])(
    "全体の不明を明示した場合は合計だけ保存の選択を維持する ($priceTaxTreatment/$taxRateComposition)",
    async (choice) => {
      const testCase = receiptTaxBasisCases[2];
      const env = setup(testCase);
      await correctItems(env);
      await save(env, testCase, choice);
      const form = reopen(env);
      expect(form.priceTaxTreatment).toBe(
        "priceTaxTreatment" in choice ? choice.priceTaxTreatment : undefined,
      );
      expect(form.taxRateComposition).toBe(
        "taxRateComposition" in choice ? choice.taxRateComposition : undefined,
      );
      await save(env, testCase, form);
      expect(env.getDraft()).toMatchObject({ registrationMode: "totalOnly", status: "ready" });
      expect(registrationItems(env)).toEqual([
        expect.objectContaining({ amountYen: testCase.paidYen }),
      ]);
    },
  );

  it("両軸の全体設定を明示した場合は再表示・再保存でも維持する", async () => {
    const testCase = receiptTaxBasisCases[0];
    const env = setup(testCase);
    await save(env, testCase, { priceTaxTreatment: "excluded", taxRateComposition: "rate8" });
    const summary = structuredClone(env.getDraft().taxSummaries);
    expect(reopen(env)).toMatchObject({
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate8",
    });
    await save(env, testCase, reopen(env));
    expect(env.getDraft().taxSummaries).toEqual(summary);
    expect(registrationItems(env).reduce((sum, item) => sum + item.amountYen, 0)).toBe(
      testCase.paidYen,
    );
  });

  it.each([
    { priceTaxTreatment: "unknown" as const },
    { taxRateComposition: "unknown" as const },
    { priceTaxTreatment: "unknown" as const, taxRateComposition: "unknown" as const },
  ])(
    "旧形式で保存したtotalOnlyの明示的な不明を再保存でも保持する ($priceTaxTreatment/$taxRateComposition)",
    async (choice) => {
      const testCase = receiptTaxBasisCases[2];
      const env = setup(testCase);
      await correctItems(env);
      await save(env, testCase, choice);
      const override = env.getDraft().receiptUserOverride!;
      const choiceFields: readonly string[] = Object.values(RECEIPT_TAX_CHOICE_FIELDS);
      await env.ctx.db.patch(DRAFT_ID, {
        receiptUserOverride: {
          ...override,
          fields: override.fields.filter((field: string) => !choiceFields.includes(field)),
        },
      });
      expect(env.getDraft().receiptUserOverride!.fields).toEqual(
        expect.arrayContaining(["items", "receiptTaxDecision", "taxSummaries"]),
      );
      const printedSummary = structuredClone(env.getDraft().taxSummaries);
      const form = reopen(env);
      expect(form.priceTaxTreatment).toBe(
        "priceTaxTreatment" in choice ? choice.priceTaxTreatment : undefined,
      );
      expect(form.taxRateComposition).toBe(
        "taxRateComposition" in choice ? choice.taxRateComposition : undefined,
      );
      await save(env, testCase, form);
      await save(env, testCase, reopen(env));
      expect(env.getDraft()).toMatchObject({
        registrationMode: "totalOnly",
        status: "ready",
        receiptTaxDecision: choice,
      });
      expect(env.getDraft().taxSummaries).toEqual(printedSummary);
      expect(registrationItems(env)).toEqual([
        expect.objectContaining({ amountYen: testCase.paidYen }),
      ]);
    },
  );

  it.each(receiptTaxBasisCases)(
    "税込対象額$paidYen 円を保持したまま保存・登録できる",
    async (testCase) => {
      const { ctx, getDraft, getItems } = setup(testCase);
      const printedSummary = structuredClone(getDraft().taxSummaries);
      for (const item of getItems()) {
        await updateDraftItemTaxOverridesMutationHandler(ctx, {
          draftId: DRAFT_ID,
          itemId: item._id as Id<"aiExpenseDraftItems">,
          amountBasis: "tax_excluded",
        });
      }
      const save = (reopenedForm?: ReturnType<typeof mapDraftToReviewForm>) =>
        updateForReviewHandler(ctx, {
          draftId: DRAFT_ID,
          documentType: "receipt",
          shopName: "テスト店",
          date: "2026-10-04",
          amountYen: testCase.paidYen,
          categoryId: CAT_ID,
          priceTaxTreatment: reopenedForm?.priceTaxTreatment,
          taxRateComposition: reopenedForm?.taxRateComposition,
          items: getItems().map((item) => ({
            itemId: item._id as Id<"aiExpenseDraftItems">,
            itemName: String(item.itemName),
            amountYen: Number(item.printedAmountYen),
            categoryId: CAT_ID,
          })),
        });
      await save();
      const reopenedForm = mapDraftToReviewForm(getDraft() as unknown as AiExpenseDraft);
      await save(reopenedForm);
      expect(getDraft().status).toBe("ready");
      expect(getItems().map((item) => item.printedAmountYen)).toEqual(testCase.amounts);
      expect(getItems().map((item) => item.allocatedTaxYen)).toEqual(testCase.allocations);
      expect(
        getItems().every(
          (item) => item.amountBasis === "tax_excluded" && item.taxAllocationStatus === "allocated",
        ),
      ).toBe(true);
      expect(getDraft().taxSummaries).toMatchObject(printedSummary!);
      const entries = buildDraftRegistrationItems(
        getDraft() as unknown as Doc<"aiExpenseDrafts">,
        getItems() as unknown as Doc<"aiExpenseDraftItems">[],
      );
      expect(entries.reduce((sum, item) => sum + item.amountYen, 0)).toBe(testCase.paidYen);
      expect(() =>
        buildDraftRegistrationItems(
          getDraft() as unknown as Doc<"aiExpenseDrafts">,
          getItems().map((item) => ({
            ...item,
            normalizedAmountYen: Number(item.normalizedAmountYen) + 1,
          })) as unknown as Doc<"aiExpenseDraftItems">[],
        ),
      ).toThrow("税込登録額が未確定");
    },
  );

  it("同値内訳が併記されてもユーザー指定10%と未確定の価格区分を保存して登録を拒否する", async () => {
    const { ctx, getDraft, getItems } = setup(receiptTaxBasisCases[0]);
    const summaries = receiptTaxBasisInput(receiptTaxBasisCases[0]).taxSummaries;
    await ctx.db.patch(DRAFT_ID, {
      taxSummaries: [
        ...summaries,
        {
          ...summaries[0],
          taxMode: "external",
          taxableAmountBasis: "tax_excluded",
          taxableAmountYen: 404,
        },
      ],
    });
    for (const [index, item] of getItems().entries()) {
      await ctx.db.patch(item._id as Id<"aiExpenseDraftItems">, {
        amountBasis: index === 0 ? "unknown" : "tax_excluded",
      });
    }
    const firstId = getItems()[0]._id as Id<"aiExpenseDraftItems">;
    await updateDraftItemTaxOverridesMutationHandler(ctx, {
      draftId: DRAFT_ID,
      itemId: firstId,
      taxRatePercent: 10,
    });
    expect(getItems()[0]).toMatchObject({
      taxRatePercent: 10,
      amountBasis: "unknown",
      taxResolutionStatus: "unresolved",
      taxAllocationStatus: "unallocated",
    });
    expect(getDraft().status).toBe("needs_review");
    expect(() =>
      buildDraftRegistrationItems(
        getDraft() as unknown as Doc<"aiExpenseDrafts">,
        getItems() as unknown as Doc<"aiExpenseDraftItems">[],
      ),
    ).toThrow("税込登録額が未確定");
  });
});
