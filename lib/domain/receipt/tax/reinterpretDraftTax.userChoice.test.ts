import { describe, expect, it } from "vitest";
import { trialExternal8Fixture } from "../../receiptImageExtraction/fixtures/taxFixtures";
import { reinterpretDraftTax } from "./reinterpretDraftTax";

describe("reinterpretDraftTax (user choice and overrides)", () => {
  it("明細の税込と税率を編集しても全体判定に利用者の上書き根拠を付けない", () => {
    const result = reinterpretDraftTax({
      amountYen: 110,
      items: [
        {
          itemName: "商品",
          printedAmountYen: 110,
          amountBasis: "unknown",
          taxRatePercent: null,
          markers: [],
          warnings: [],
        },
      ],
      taxSummaries: [],
      override: { itemIndex: 0, amountBasis: "tax_included", taxRatePercent: 10 },
    });
    expect(
      result.interpretation.decision.evidence.filter((e) => e.startsWith("user_override:")),
    ).toEqual([]);
  });
  it("未確定明細の一括補正を適用して税額を計算する", () => {
    const result = reinterpretDraftTax({
      amountYen: 1100,
      items: [
        {
          itemName: "商品",
          printedAmountYen: 1000,
          amountBasis: "unknown",
          taxRatePercent: null,
          markers: [],
          warnings: [],
        },
      ],
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 1000,
          taxableAmountBasis: "tax_excluded",
          taxYen: 80,
          roundingMethod: "unknown",
          confidence: {},
          warnings: [],
          status: "verified",
        },
      ],
      bulkUnresolvedOverride: { amountBasis: "tax_excluded", taxRatePercent: 10 },
    });

    expect(result.interpretation.decision.evidence).not.toContain("user_override:treatment");
    expect(result.itemFields[0]).toMatchObject({
      amountBasis: "tax_excluded",
      taxRatePercent: 10,
      normalizedAmountYen: 1100,
    });
    expect(result.interpretation.taxSummaries[0]).toMatchObject({
      taxRatePercent: 10,
      taxYen: 100,
      taxIncludedAmountYen: 1100,
    });
  });

  it("税集計がなくても未確定明細の補正から税額と登録額を計算する", () => {
    const result = reinterpretDraftTax({
      amountYen: 1100,
      items: [
        {
          itemName: "商品",
          printedAmountYen: 1000,
          amountBasis: "unknown",
          taxRatePercent: null,
          markers: [],
          warnings: [],
        },
      ],
      taxSummaries: [],
      bulkUnresolvedOverride: { amountBasis: "tax_excluded", taxRatePercent: 10 },
    });

    expect(result.itemFields[0]).toMatchObject({
      amountBasis: "tax_excluded",
      taxRatePercent: 10,
      allocatedTaxYen: 100,
      normalizedAmountYen: 1100,
    });
    expect(result.interpretation.decision.evidence).not.toContain("user_override:treatment");
  });

  it("端数を明細へ配分し、明細税額の合計を丸め済み集計税額へ一致させる", () => {
    const result = reinterpretDraftTax({
      amountYen: 11,
      items: [
        {
          itemName: "商品A",
          printedAmountYen: 5,
          amountBasis: "unknown",
          taxRatePercent: null,
          markers: [],
          warnings: [],
        },
        {
          itemName: "商品B",
          printedAmountYen: 5,
          amountBasis: "unknown",
          taxRatePercent: null,
          markers: [],
          warnings: [],
        },
      ],
      taxSummaries: [],
      bulkUnresolvedOverride: { amountBasis: "tax_excluded", taxRatePercent: 10 },
    });

    expect(result.interpretation.taxSummaries[0]?.taxYen).toBe(1);
    expect(result.itemFields.map((item) => item.allocatedTaxYen)).toEqual([1, 0]);
    expect(result.itemFields.reduce((sum, item) => sum + (item.allocatedTaxYen ?? 0), 0)).toBe(1);
    expect(result.itemFields.reduce((sum, item) => sum + (item.normalizedAmountYen ?? 0), 0)).toBe(
      11,
    );
  });

  it("税内訳と明細から全体の判定を作る", () => {
    const result = reinterpretDraftTax({
      amountYen: 108,
      items: [
        {
          itemName: "商品",
          printedAmountYen: 100,
          amountBasis: "tax_excluded",
          taxRatePercent: 8,
          markers: [],
          warnings: [],
        },
      ],
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_excluded",
          taxYen: 8,
          roundingMethod: "unknown",
          confidence: {},
          warnings: [],
          status: "verified",
        },
      ],
    });

    expect(result.interpretation.decision).toMatchObject({
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate8",
      resolutionSource: "reconciliation",
      resolutionStatus: "ambiguous",
    });
  });

  it("reinterprets draft items without changing printed amounts", () => {
    const items = trialExternal8Fixture.items!.map((item) => ({
      itemName: item.itemName,
      printedAmountYen: item.printedAmountYen ?? item.amountYen,
      amountBasis: item.amountBasis ?? "unknown",
      taxRatePercent: item.taxRatePercent ?? null,
      markers: item.markers ?? [],
      taxMarker: item.taxMarker,
      warnings: item.warnings,
    }));

    const result = reinterpretDraftTax({
      amountYen: trialExternal8Fixture.amountYen,
      taxSummaries: trialExternal8Fixture.taxSummaries!,
      markerDefinitions: trialExternal8Fixture.markerDefinitions,
      items,
    });

    expect(result.itemFields.every((field) => field.taxResolutionStatus === "resolved")).toBe(true);
    expect(
      result.itemFields.reduce((sum, field) => sum + (field.normalizedAmountYen ?? 0), 0),
    ).toBe(1683);
    expect(
      items.every(
        (item, index) => item.printedAmountYen === result.itemFields[index]?.printedAmountYen,
      ),
    ).toBe(true);
  });

  it("applies user tax rate override and re-normalizes amounts", () => {
    const unresolvedItems = [
      {
        itemName: "A",
        printedAmountYen: 300,
        amountBasis: "unknown" as const,
        taxRatePercent: null,
        markers: [] as string[],
        warnings: [] as string[],
      },
      {
        itemName: "B",
        printedAmountYen: 300,
        amountBasis: "unknown" as const,
        taxRatePercent: null,
        markers: [] as string[],
        warnings: [] as string[],
      },
      {
        itemName: "C",
        printedAmountYen: 400,
        amountBasis: "unknown" as const,
        taxRatePercent: null,
        markers: [] as string[],
        warnings: [] as string[],
      },
    ];
    const taxSummaries = [
      {
        taxRatePercent: 8 as const,
        taxMode: "included" as const,
        taxableAmountYen: 500,
        taxableAmountBasis: "tax_included" as const,
        taxYen: 0,
        roundingMethod: "unknown" as const,
        confidence: {},
        warnings: [] as string[],
      },
      {
        taxRatePercent: 10 as const,
        taxMode: "included" as const,
        taxableAmountYen: 500,
        taxableAmountBasis: "tax_included" as const,
        taxYen: 0,
        roundingMethod: "unknown" as const,
        confidence: {},
        warnings: [] as string[],
      },
    ];

    const before = reinterpretDraftTax({
      amountYen: 1000,
      items: unresolvedItems,
      taxSummaries,
    });
    expect(before.itemFields.every((field) => field.taxResolutionStatus === "unresolved")).toBe(
      true,
    );

    const after = reinterpretDraftTax({
      amountYen: 1000,
      items: unresolvedItems,
      taxSummaries,
      override: { itemIndex: 0, taxRatePercent: 8, amountBasis: "tax_included" },
    });

    expect(after.itemFields[0]?.taxResolutionStatus).toBe("resolved");
    expect(after.itemFields[0]?.taxRatePercent).toBe(8);
    expect(after.itemFields[0]?.printedAmountYen).toBe(300);
    expect(after.itemFields[1]?.taxResolutionStatus).toBe("unresolved");
    expect(after.itemFields[2]?.taxResolutionStatus).toBe("unresolved");
    expect(after.interpretation.decision).toMatchObject({
      resolutionSource: "ai",
      resolutionStatus: "ambiguous",
    });
  });

  it("明細単位の補正は別の明細を上書きしない", () => {
    const result = reinterpretDraftTax({
      amountYen: 1000,
      items: [
        {
          itemName: "A",
          printedAmountYen: 500,
          amountBasis: "unknown",
          taxRatePercent: null,
          markers: [],
          warnings: [],
        },
        {
          itemName: "B",
          printedAmountYen: 500,
          amountBasis: "unknown",
          taxRatePercent: null,
          markers: [],
          warnings: [],
        },
      ],
      taxSummaries: [],
      override: { itemIndex: 0, taxRatePercent: 8, amountBasis: "tax_included" },
    });

    expect(result.itemFields[0]).toMatchObject({
      amountBasis: "tax_included",
      taxRatePercent: 8,
      printedAmountYen: 500,
    });
    expect(result.itemFields[1]).toMatchObject({
      amountBasis: "unknown",
      taxRatePercent: null,
      printedAmountYen: 500,
    });
  });

  it("税率だけの上書きでは明示された価格軸をuser根拠へ昇格しない", () => {
    const result = reinterpretDraftTax({
      amountYen: 1100,
      items: [
        {
          itemName: "商品",
          printedAmountYen: 1000,
          amountBasis: "tax_excluded",
          taxRatePercent: 10,
          markers: [],
          warnings: [],
        },
      ],
      taxSummaries: [
        {
          taxRatePercent: 10,
          taxMode: "included",
          taxableAmountYen: 1100,
          taxableAmountBasis: "tax_included",
          taxYen: 100,
          roundingMethod: "unknown",
          confidence: {},
          warnings: [],
          status: "ambiguous",
        },
      ],
      rawObservationLines: [
        {
          rawText: "税込",
          amountText: "1,100円",
          amountYen: 1100,
          lineRoleCandidates: ["item"],
          roleConfidence: 0.9,
          explicitlyPrinted: true,
          sourceLineIndex: 1,
        },
      ],
      override: { itemIndex: 0, taxRatePercent: 8 },
    });

    expect(result.interpretation.decision).toMatchObject({
      priceTaxTreatment: "included",
      taxRateComposition: "rate8",
      resolutionSource: "ai",
    });
    expect(result.interpretation.decision.evidence).not.toContain("user_override:composition");
    expect(result.interpretation.decision.evidence).not.toContain("user_override:treatment");
  });
});
