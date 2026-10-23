import { describe, expect, it } from "vitest";
import {
  receiptTaxBasisCases,
  receiptTaxBasisInput,
} from "../receipt/tax/fixtures/receiptTaxBasisCases";
import { reinterpretDraftTax } from "../receipt/tax/reinterpretDraftTax";
import type { TaxSummaryConsistencyStatus } from "../receipt/tax/types";
import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import { buildDraftListSummary } from "./listSummary";
import { buildDraftRegistrationItems } from "./registrationItems";
import { buildReviewChecks } from "./reviewChecks";
import { resolvedItem } from "./reviewChecksTestHelpers";
import { applyReviewItemsTaxPreview, buildReviewTaxPreview } from "./reviewItemsTaxPreview";
import { isAmountAndTaxResolved } from "./reviewJudgment";
import { buildTaxRateCheck } from "./reviewTaxChecks";

const unverifiedStatuses = ["ambiguous", "contradictory", "reconcilable", "conflicting"] as const;
const compatibleStatuses = ["verified", "coherent", undefined] as const;

function duplicatedExternalReceipt(
  status: TaxSummaryConsistencyStatus | undefined,
  reverse = false,
) {
  const input = receiptTaxBasisInput(receiptTaxBasisCases[0]);
  const withIncluded = {
    ...input.taxSummaries[0],
    taxMode: "external" as const,
    taxableAmountBasis: "tax_excluded" as const,
    taxableAmountYen: 404,
  };
  const withoutIncluded = { ...withIncluded };
  delete withoutIncluded.taxIncludedAmountYen;
  input.taxSummaries = [withoutIncluded, withIncluded];

  const { interpretation, itemFields } = reinterpretDraftTax(input);
  const items = applyReviewItemsTaxPreview(
    input.items.map((item, index) =>
      resolvedItem({
        ...item,
        ...itemFields[index],
        id: `item-${index}`,
        amountYen: String(item.printedAmountYen),
      }),
    ),
    {
      paidTotalYen: input.amountYen,
      taxSummaries: interpretation.taxSummaries,
      sourceTaxSummaries: input.taxSummaries,
    },
  );
  const taxSummaries = input.taxSummaries.map((summary, index) => ({
    ...summary,
    status: index === 1 ? status : ("verified" as const),
  }));
  if (reverse) taxSummaries.reverse();
  return { items, paidTotalYen: input.amountYen, taxSummaries };
}

const unverifiedCases = unverifiedStatuses.flatMap((status) =>
  [false, true].map((reverse) => ({ status, reverse })),
);

describe("未検証の税内訳の確認結果", () => {
  it.each(unverifiedCases)(
    "外税の金額確認は同値の未検証行を隠さない（$status、逆順=$reverse）",
    ({ status, reverse }) => {
      const receipt = duplicatedExternalReceipt(status, reverse);
      const snapshot = structuredClone(receipt);
      const { amount } = buildReviewChecks(receipt);

      expect(amount).toMatchObject({
        variant: "external",
        status: "uncomparable",
        blockerCode: "unresolved-tax",
      });
      expect(amount.reason).toContain("税内訳が未検証");
      expect(amount.printedSubtotalYen).toBeUndefined();
      expect(amount.expectedPaidYen).toBeUndefined();
      expect(receipt).toEqual(snapshot);
    },
  );

  it.each(unverifiedCases)(
    "税率別確認は未検証行を残して比較不能にする（$status、逆順=$reverse）",
    ({ status, reverse }) => {
      const receipt = duplicatedExternalReceipt(status, reverse);
      const snapshot = structuredClone(receipt);
      const { taxRate } = buildReviewChecks(receipt);
      const unverifiedIndex = reverse ? 0 : 1;

      expect(taxRate).toMatchObject({ status: "uncomparable", blockerCode: "unresolved-tax" });
      expect(taxRate.rows).toHaveLength(2);
      expect(taxRate.rows[unverifiedIndex]).toMatchObject({
        printedYen: 404,
        status: "uncomparable",
        blockerCode: "unresolved-tax",
      });
      expect(taxRate.rows[unverifiedIndex].reason).toContain("税内訳が未検証");
      expect(taxRate.rows[1 - unverifiedIndex].status).toBe("matched");
      expect(receipt).toEqual(snapshot);
    },
  );

  it.each(
    compatibleStatuses.flatMap((status) => [false, true].map((reverse) => ({ status, reverse }))),
  )(
    "確定相当・status未設定の同値内訳は一度だけ集計する（$status、逆順=$reverse）",
    ({ status, reverse }) => {
      const receipt = duplicatedExternalReceipt(status, reverse);
      const snapshot = structuredClone(receipt);
      const checks = buildReviewChecks(receipt);

      expect(checks.amount).toMatchObject({
        status: "matched",
        printedSubtotalYen: 404,
        printedTaxYen: 32,
        expectedPaidYen: 436,
      });
      expect(checks.taxRate.status).toBe("matched");
      expect(checks.taxRate.rows).toHaveLength(2);
      expect(receipt).toEqual(snapshot);
    },
  );

  it.each(
    unverifiedStatuses.flatMap((status) =>
      [-1, 1].map((differenceYen) => ({ status, differenceYen })),
    ),
  )(
    "未検証行は1円の近似一致でも確定しない（$status、差額=$differenceYen）",
    ({ status, differenceYen }) => {
      const receipt = duplicatedExternalReceipt(status);
      const summary = {
        ...receipt.taxSummaries[0],
        status,
        taxableAmountYen: 404 - differenceYen,
      };
      const taxRate = buildTaxRateCheck({ items: receipt.items, taxSummaries: [summary] });

      expect(taxRate.status).toBe("uncomparable");
      expect(taxRate.rows[0]).toMatchObject({
        status: "uncomparable",
        blockerCode: "unresolved-tax",
      });
      expect(taxRate.rows[0].matchKind).toBeUndefined();
    },
  );

  it.each(unverifiedStatuses)(
    "税込明細の金額直接比較は内訳statusだけで拒否しない（%s）",
    (status) => {
      const receipt = duplicatedExternalReceipt(status);
      const items = receipt.items.map((item) => ({
        ...item,
        amountYen: String(item.normalizedAmountYen),
        printedAmountYen: item.normalizedAmountYen,
        amountBasis: "tax_included" as const,
      }));
      const taxSummaries = [
        {
          ...receipt.taxSummaries[1],
          taxMode: "included" as const,
          taxableAmountBasis: "tax_included" as const,
          taxableAmountYen: 436,
        },
      ];
      const checks = buildReviewChecks({ items, paidTotalYen: 436, taxSummaries });

      expect(checks.amount).toMatchObject({ variant: "direct", status: "matched" });
      expect(checks.taxRate.status).toBe("uncomparable");
    },
  );
});

describe("呼び出し元の再解釈後の挙動", () => {
  it.each(
    [...compatibleStatuses, ...unverifiedStatuses].flatMap((status) =>
      [false, true].map((reverse) => ({ status, reverse })),
    ),
  )(
    "プレビュー・一覧判定・登録用明細は同じ結果を維持する（$status、逆順=$reverse）",
    ({ status, reverse }) => {
      const receipt = duplicatedExternalReceipt(status, reverse);
      const snapshot = structuredClone(receipt);
      const preview = buildReviewTaxPreview(receipt.items, receipt);

      expect(preview.taxSummaries).toHaveLength(1);
      expect(preview.taxSummaries[0].status).toBe("verified");
      const checks = buildReviewChecks({ ...preview, paidTotalYen: receipt.paidTotalYen });
      expect(checks.amount.status).toBe("matched");
      expect(checks.taxRate.status).toBe("matched");
      expect(preview.items.map((item) => item.normalizedAmountYen)).toEqual([106, 149, 181]);

      const draft: AiExpenseDraftFields = {
        id: "draft-1",
        groupId: "group-1",
        sourceType: "image_upload",
        status: "ready",
        documentType: "receipt",
        shopName: "店",
        date: "2026-10-23",
        amountYen: 436,
        categoryId: "cat1",
        taxSummaries: receipt.taxSummaries,
        confidence: {},
        reviewReasons: [],
        createdAt: 0,
        updatedAt: 0,
      };
      const items: AiExpenseDraftItemFields[] = receipt.items.map(({ id, ...item }) => ({
        ...item,
        id,
        groupId: "group-1",
        draftId: "draft-1",
        amountYen: Number(item.amountYen),
        confidence: {},
        createdAt: 0,
        updatedAt: 0,
      }));

      expect(
        isAmountAndTaxResolved({
          ...draft,
          items: items.map(({ id, ...item }) => ({ ...item, _id: id! })),
        }),
      ).toBe(true);
      expect(buildDraftListSummary(draft, items).amountAndTaxResolved).toBe(true);
      expect(buildDraftRegistrationItems(draft, items)).toEqual([
        { itemName: "商品1、商品2、商品3", amountYen: 436, categoryId: "cat1" },
      ]);
      expect(receipt).toEqual(snapshot);
    },
  );
});
