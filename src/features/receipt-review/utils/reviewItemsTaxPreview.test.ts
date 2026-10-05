import { describe, expect, it } from "vitest";
import type { ReviewItemValues } from "../types/types";
import { applyReviewItemsTaxPreview, buildReviewTaxPreview } from "./reviewItemsTaxPreview";
import { mixedTaxReviewFixture } from "./reviewTaxPreviewTestHelpers";
import { getReviewGuidance } from "./reviewGuidance";
import { buildReviewChecks } from "./reviewChecks";
import { buildDraftRegistrationItems } from "../../../../lib/domain/aiExpenseDrafts/registrationItems";

function externalTaxItem(overrides: Partial<ReviewItemValues> = {}): ReviewItemValues {
  return {
    id: "item-1",
    itemName: "たまご",
    amountYen: "298",
    categoryId: "cat1",
    printedAmountYen: 298,
    normalizedAmountYen: 322,
    allocatedTaxYen: 24,
    taxResolutionStatus: "resolved",
    taxRatePercent: 8,
    amountBasis: "tax_excluded",
    taxResolutionSource: "single_summary",
    ...overrides,
  };
}

describe("applyReviewItemsTaxPreview", () => {
  const taxSummaries = [
    {
      taxRatePercent: 8 as const,
      taxMode: "external" as const,
      taxableAmountYen: 298,
      taxableAmountBasis: "tax_excluded" as const,
      taxYen: 24,
      roundingMethod: "unknown" as const,
      warnings: [],
    },
  ];

  it("外税明細の手修正が税サマリーと不一致なら差額から税額を推定しない", () => {
    const items = [externalTaxItem({ amountYen: "300", printedAmountYen: 300 })];
    const previewed = applyReviewItemsTaxPreview(items, {
      paidTotalYen: 324,
      taxSummaries,
    });

    expect(previewed[0]?.normalizedAmountYen).toBe(300);
    expect(previewed[0]?.allocatedTaxYen).toBe(0);
  });

  it("税サマリが無い課税明細は保存済み金額を確定扱いにしない", () => {
    const items = [externalTaxItem()];
    expect(applyReviewItemsTaxPreview(items, { paidTotalYen: 322 })[0]).toMatchObject({
      taxAllocationStatus: "unallocated",
      normalizedAmountYen: 298,
    });
  });

  it("2段階のユーザー選択がAI税サマリーより優先される", () => {
    const previewed = applyReviewItemsTaxPreview(
      [externalTaxItem({ amountYen: "99", printedAmountYen: 99 })],
      {
        paidTotalYen: 108,
        taxSummaries,
        priceTaxTreatment: "excluded",
        taxRateComposition: "rate8",
      },
    );

    expect(previewed[0]).toMatchObject({ normalizedAmountYen: 107, allocatedTaxYen: 8 });
  });
  it("配分状態のない旧API応答も内訳から再評価し、不一致の内訳は確定しない", () => {
    const legacy = [externalTaxItem()];
    expect(
      applyReviewItemsTaxPreview(legacy, { paidTotalYen: 322, taxSummaries })[0],
    ).toMatchObject({
      taxAllocationStatus: "allocated",
      normalizedAmountYen: 322,
      allocatedTaxYen: 24,
    });
    expect(
      applyReviewItemsTaxPreview(legacy, {
        paidTotalYen: 322,
        taxSummaries: taxSummaries.map((s) => ({ ...s, taxableAmountYen: 299 })),
      })[0],
    ).toMatchObject({ taxAllocationStatus: "unallocated" });
  });
});

describe("共有再解釈後の明細と税内訳", () => {
  it.each(["external", "included"] as const)(
    "%sとして算術一致しても両方unknownの宣言は確認対象に残す",
    (mode) => {
      const taxYen = mode === "external" ? 8 : 7;
      const total = mode === "external" ? 108 : 100;
      const source = {
        taxRatePercent: 8 as const,
        taxMode: "unknown" as const,
        taxableAmountYen: 100,
        taxableAmountBasis: "unknown" as const,
        taxYen,
        roundingMethod: "floor" as const,
        warnings: [],
        status: "ambiguous" as const,
      };
      const item = externalTaxItem({
        amountYen: "100",
        printedAmountYen: 100,
        amountBasis: mode === "external" ? "tax_excluded" : "tax_included",
      });
      const preview = buildReviewTaxPreview([item], {
        paidTotalYen: total,
        taxSummaries: [source],
      });
      expect(preview.items[0].normalizedAmountYen).toBe(total);
      expect(preview.taxSummaries[0]).toMatchObject({
        taxMode: "unknown",
        taxableAmountBasis: "unknown",
        status: "ambiguous",
      });
      const { draft, form } = mixedTaxReviewFixture();
      expect(
        getReviewGuidance(
          { ...form, amountYen: String(total) },
          preview.items,
          { ...draft, taxSummaries: preview.taxSummaries },
          preview.summarySourceIndexes,
        ),
      ).toContainEqual(
        expect.objectContaining({
          target: "tax-summary-0",
          message: expect.stringContaining("税モードまたは対象額の税込／税抜が未確定"),
        }),
      );
      expect(source.taxMode).toBe("unknown");
    },
  );

  it("明示した全体税設定では両方unknownの元サマリだけを理由に確認を残さない", () => {
    const preview = buildReviewTaxPreview(
      [externalTaxItem({ amountYen: "100", printedAmountYen: 100 })],
      {
        paidTotalYen: 108,
        priceTaxTreatment: "excluded",
        taxRateComposition: "rate8",
        taxSummaries: [
          {
            taxRatePercent: 8,
            taxMode: "unknown",
            taxableAmountYen: 100,
            taxableAmountBasis: "unknown",
            taxYen: 8,
            roundingMethod: "floor",
            warnings: [],
          },
        ],
      },
    );
    expect(preview.taxSummaries[0]).toMatchObject({
      taxMode: "external",
      taxableAmountBasis: "tax_excluded",
      status: "verified",
    });
    expect(preview.summarySourceIndexes).toEqual([-1]);
    expect(preview.items[0].normalizedAmountYen).toBe(108);
  });

  it.each(["mode", "basis"])("%sだけ宣言された混在税の補完は1782円と確認0件を維持する", (side) => {
    const { draft, items, form } = mixedTaxReviewFixture();
    const summaries = draft.taxSummaries!.map((summary, index) =>
      index === 0 && side === "basis"
        ? { ...summary, taxMode: "unknown" as const, taxableAmountBasis: "tax_excluded" as const }
        : summary,
    );
    const preview = buildReviewTaxPreview(items, { paidTotalYen: 1782, taxSummaries: summaries });
    expect(preview.taxSummaries[0]).toMatchObject({
      taxMode: "external",
      taxableAmountBasis: "tax_excluded",
      status: "verified",
      reasons: [],
    });
    expect(preview.items.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
    expect(preview.items.reduce((sum, item) => sum + item.normalizedAmountYen!, 0)).toBe(1782);
    expect(
      buildReviewChecks({
        items: preview.items,
        paidTotalYen: 1782,
        taxSummaries: preview.taxSummaries.map((summary) => ({ ...summary, confidence: {} })),
      }),
    ).toMatchObject({ amount: { status: "matched" }, taxRate: { status: "matched" } });
    expect(
      getReviewGuidance(form, preview.items, { ...draft, taxSummaries: preview.taxSummaries }),
    ).toEqual([]);
    expect(preview.summarySourceIndexes).toEqual([0, 1]);
    // OCR由来のサマリは書き換えない。
    expect(draft.taxSummaries![0].taxableAmountBasis).toBe("unknown");
    const registered = buildDraftRegistrationItems(
      {
        amountYen: 1782,
        documentType: "receipt",
        shopName: form.shopName,
        categoryId: "food",
        taxSummaries: preview.taxSummaries.map((summary) => ({ ...summary, confidence: {} })),
      },
      preview.items.map((item) => ({
        ...item,
        amountYen: Number(item.amountYen),
        groupId: "group",
        draftId: draft._id,
        confidence: {},
        createdAt: 1,
        updatedAt: 1,
      })),
    );
    expect(registered.reduce((sum, item) => sum + item.amountYen, 0)).toBe(1782);
  });

  it.each(["unknown", "contradictory", "amount-mismatch"])(
    "%sは警告・未配分・登録ガードを保持する",
    (problem) => {
      const { draft, items, form } = mixedTaxReviewFixture();
      const summaries = draft.taxSummaries!.map((summary, index) =>
        index === 0
          ? {
              ...summary,
              ...(problem === "unknown" ? { taxMode: "unknown" as const } : {}),
              ...(problem === "contradictory"
                ? { taxableAmountBasis: "tax_included" as const }
                : {}),
              ...(problem === "amount-mismatch" ? { taxableAmountYen: 670 } : {}),
            }
          : summary,
      );
      const preview = buildReviewTaxPreview(items, { paidTotalYen: 1782, taxSummaries: summaries });
      const guidance = getReviewGuidance(form, preview.items, {
        ...draft,
        taxSummaries: preview.taxSummaries,
      });
      expect(guidance).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "summary-0", target: "tax-summary-0", required: false }),
        ]),
      );
      expect(preview.items.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
      expect(() =>
        buildDraftRegistrationItems(
          {
            amountYen: 1782,
            documentType: "receipt",
            shopName: form.shopName,
            categoryId: "food",
            taxSummaries: preview.taxSummaries.map((summary) => ({ ...summary, confidence: {} })),
          },
          preview.items.map((item) => ({
            ...item,
            amountYen: Number(item.amountYen),
            groupId: "group",
            draftId: draft._id,
            confidence: {},
            createdAt: 1,
            updatedAt: 1,
          })),
        ),
      ).toThrow("税額または税込登録額が未確定");
    },
  );

  it("重複除去後も元の税サマリ番号を維持する", () => {
    const { draft, items } = mixedTaxReviewFixture();
    const summaries = [
      draft.taxSummaries![0],
      draft.taxSummaries![0],
      {
        ...draft.taxSummaries![1],
        taxableAmountBasis: "tax_excluded" as const,
      },
    ];
    const preview = buildReviewTaxPreview(items, { paidTotalYen: 1782, taxSummaries: summaries });
    expect(preview.taxSummaries).toHaveLength(2);
    expect(preview.summarySourceIndexes).toEqual([0, 2]);
    expect(preview.taxSummaries[1].status).toBe("contradictory");
  });
});
