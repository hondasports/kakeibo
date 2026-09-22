import { describe, expect, it } from "vitest";
import { trialExternal8Fixture } from "../../../convex/receiptImageExtraction/fixtures/taxFixtures";
import { reinterpretDraftTax } from "./reinterpretDraftTax";

describe("reinterpretDraftTax (user choice and overrides)", () => {
  it("初心者向けの2軸選択を全明細へ適用し、ユーザー判断を最優先にする", () => {
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
      decisionOverride: { priceTaxTreatment: "excluded", taxRateComposition: "rate10" },
    });

    expect(result.interpretation.decision).toMatchObject({
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate10",
      resolutionSource: "user",
    });
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

  it("税集計がなくても2軸選択から税額と登録額を計算する", () => {
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
      decisionOverride: { priceTaxTreatment: "excluded", taxRateComposition: "rate10" },
    });

    expect(result.itemFields[0]).toMatchObject({
      amountBasis: "tax_excluded",
      taxRatePercent: 10,
      allocatedTaxYen: 100,
      normalizedAmountYen: 1100,
    });
    expect(result.interpretation.decision).toMatchObject({ resolutionSource: "user" });
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
      decisionOverride: { priceTaxTreatment: "excluded", taxRateComposition: "rate10" },
    });

    expect(result.interpretation.taxSummaries[0]?.taxYen).toBe(1);
    expect(result.itemFields.map((item) => item.allocatedTaxYen)).toEqual([1, 0]);
    expect(result.itemFields.reduce((sum, item) => sum + (item.allocatedTaxYen ?? 0), 0)).toBe(1);
    expect(result.itemFields.reduce((sum, item) => sum + (item.normalizedAmountYen ?? 0), 0)).toBe(
      11,
    );
  });

  it("分からないというユーザー判断をAI推測で上書きしない", () => {
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
      decisionOverride: { priceTaxTreatment: "unknown", taxRateComposition: "unknown" },
    });

    expect(result.interpretation.decision).toMatchObject({
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionSource: "user",
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
      resolutionSource: "user",
      resolutionStatus: "ambiguous",
    });
  });

  it("部分的な全体判断の後も明細単位の補正を優先する", () => {
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
      decisionOverride: { priceTaxTreatment: "excluded", taxRateComposition: "mixed" },
      override: { itemIndex: 0, taxRatePercent: 8, amountBasis: "tax_included" },
    });

    expect(result.itemFields[0]).toMatchObject({
      amountBasis: "tax_included",
      taxRatePercent: 8,
      printedAmountYen: 500,
    });
    expect(result.itemFields[1]).toMatchObject({
      amountBasis: "tax_excluded",
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
      taxRateComposition: "mixed",
      resolutionSource: "explicitLabel",
    });
    expect(result.interpretation.decision.evidence).toContain("user_override:composition");
    expect(result.interpretation.decision.evidence).not.toContain("user_override:treatment");
  });

  it("summaryだけの価格上書きはsummaryの値をuser根拠にする", () => {
    const result = reinterpretDraftTax({
      amountYen: 1100,
      items: [
        {
          itemName: "商品",
          printedAmountYen: 1100,
          amountBasis: "tax_included",
          taxRatePercent: 10,
          markers: [],
          warnings: [],
        },
      ],
      taxSummaries: [
        {
          taxRatePercent: 10,
          taxMode: "included",
          taxableAmountYen: 1000,
          taxableAmountBasis: "tax_included",
          taxYen: 100,
          roundingMethod: "round",
          confidence: {},
          warnings: [],
          status: "ambiguous",
        },
      ],
      summaryOverride: {
        index: 0,
        summary: { taxMode: "external", taxableAmountBasis: "tax_excluded" },
      },
    });

    expect(result.interpretation.decision).toMatchObject({
      priceTaxTreatment: "excluded",
      resolutionSource: "ai",
    });
    expect(result.interpretation.decision.evidence).toContain("user_override:treatment");
  });
});
