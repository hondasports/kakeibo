import { describe, expect, it } from "vitest";
import {
  ishimoriExternalMisreadFixture,
  trialExternal8Fixture,
} from "../../convex/receiptImageExtraction/fixtures/taxFixtures";
import { mapExtractionToDraftArgs } from "./extractionMapping";
import { foodCategory } from "./testHelpers";

describe("mapExtractionToDraftArgs tax normalization (tax resolution)", () => {
  it("8%内税と10%外税の混在を率別に解決して支払総額へ一致させる", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: 320,
        items: [
          {
            ...product,
            itemName: "食品",
            amountYen: 100,
            printedAmountYen: 100,
            amountBasis: "tax_included",
            taxRatePercent: 8,
          },
          {
            ...product,
            itemName: "日用品",
            amountYen: 200,
            printedAmountYen: 200,
            amountBasis: "tax_excluded",
            taxRatePercent: 10,
          },
        ],
        taxSummaries: [
          {
            ...trialExternal8Fixture.taxSummaries![0],
            taxRatePercent: 8,
            taxMode: "included",
            taxableAmountYen: 100,
            taxableAmountBasis: "tax_included",
            taxYen: 7,
            taxIncludedAmountYen: 100,
          },
          {
            ...trialExternal8Fixture.taxSummaries![0],
            taxRatePercent: 10,
            taxMode: "external",
            taxableAmountYen: 200,
            taxableAmountBasis: "unknown",
            taxYen: 20,
            taxIncludedAmountYen: 220,
          },
        ],
      },
      [foodCategory],
    );
    expect(mapped.items?.map((item) => item.normalizedAmountYen)).toEqual([100, 220]);
    expect(mapped.items?.reduce((sum, item) => sum + (item.normalizedAmountYen ?? 0), 0)).toBe(320);
    expect(mapped.taxSummaries?.[1]).toMatchObject({
      taxMode: "external",
      taxableAmountBasis: "tax_excluded",
      status: "verified",
    });
  });

  it("TRIAL外税を正規化し、印字額・按分税・登録額を分離する", () => {
    const mapped = mapExtractionToDraftArgs(trialExternal8Fixture, [foodCategory]);

    expect(mapped.amountYen).toBe(1683);
    expect(mapped.taxSummaries?.[0]).toMatchObject({ taxRatePercent: 8, taxYen: 124 });
    expect(mapped.items?.reduce((sum, item) => sum + (item.printedAmountYen ?? 0), 0)).toBe(1559);
    expect(mapped.items?.reduce((sum, item) => sum + (item.allocatedTaxYen ?? 0), 0)).toBe(124);
    expect(mapped.items?.reduce((sum, item) => sum + (item.normalizedAmountYen ?? 0), 0)).toBe(
      1683,
    );
    expect(mapped.items?.every((item) => item.categoryId === foodCategory._id)).toBe(true);
    expect(mapped.items?.every((item) => item.taxResolutionStatus === "resolved")).toBe(true);
    expect(mapped.items?.every((item) => item.taxResolutionSource !== undefined)).toBe(true);
    expect(mapped.receiptTaxDecision).toMatchObject({
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate8",
      candidates: expect.any(Array),
    });
    expect(mapped.reviewReasons).toBeUndefined();
  });

  it("TRIAL内税レシートの税額行96円を商品明細へ二重計上しない", () => {
    const product = trialExternal8Fixture.items![0];
    const source = {
      ...trialExternal8Fixture,
      amountYen: 1060,
      items: [
        {
          ...product,
          itemName: "内ヒキャメル・メンソール",
          amountYen: 1060,
          printedAmountYen: 1060,
          amountBasis: "tax_included" as const,
          taxRatePercent: 10 as const,
          markers: [],
          taxMarker: "",
          quantity: 2,
          unitPriceYen: 530,
        },
        {
          ...product,
          itemName: "(10%内税 タイショウ)",
          amountYen: 1060,
          printedAmountYen: 1060,
          amountBasis: "tax_included" as const,
          taxRatePercent: 10 as const,
          markers: [],
          taxMarker: "",
        },
        {
          ...product,
          itemName: "(10%内税)",
          amountYen: 96,
          printedAmountYen: 96,
          amountBasis: "tax_included" as const,
          taxRatePercent: 10 as const,
          markers: [],
          taxMarker: "",
        },
      ],
      taxSummaries: [
        {
          ...trialExternal8Fixture.taxSummaries![0],
          taxRatePercent: 10 as const,
          taxMode: "included" as const,
          taxableAmountYen: 1060,
          taxableAmountBasis: "tax_included" as const,
          taxYen: 96,
          taxIncludedAmountYen: 1060,
        },
      ],
    };

    const mapped = mapExtractionToDraftArgs(source, [foodCategory]);

    expect(mapped.items).toHaveLength(1);
    expect(mapped.items?.[0]).toMatchObject({
      itemName: "内ヒキャメル・メンソール",
      printedAmountYen: 1060,
      normalizedAmountYen: 1060,
    });
    expect(mapped.warnings).not.toContain("normalized_amount_mismatch");
    expect(mapped.reviewReasons).toBeUndefined();
  });

  it("税関連語を含む商品名だけでは明細から除外しない", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: 96,
        items: [
          {
            ...product,
            itemName: "内税対応商品",
            amountYen: 96,
            printedAmountYen: 96,
            amountBasis: "tax_included",
            taxRatePercent: 10,
            markers: [],
            taxMarker: "",
          },
        ],
        taxSummaries: [
          {
            ...trialExternal8Fixture.taxSummaries![0],
            taxRatePercent: 10,
            taxMode: "included",
            taxableAmountYen: 96,
            taxableAmountBasis: "tax_included",
            taxYen: 96,
            taxIncludedAmountYen: 96,
          },
        ],
      },
      [foodCategory],
    );

    expect(mapped.items).toHaveLength(1);
    expect(mapped.items?.[0]?.itemName).toBe("内税対応商品");
  });

  it("内税額のOCR誤読を金額一致なしで明細から除外する", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: 1080,
        items: [
          { ...product, itemName: "商品", amountYen: 1080, printedAmountYen: 1080 },
          { ...product, itemName: "内税", amountYen: 56, printedAmountYen: 56 },
        ],
        taxSummaries: [
          {
            ...trialExternal8Fixture.taxSummaries![0],
            taxableAmountYen: 1080,
            taxYen: 58,
            taxIncludedAmountYen: 1080,
            taxMode: "included",
            taxableAmountBasis: "tax_included",
          },
        ],
        rawObservations: [
          {
            rawText: "商品 1,080円",
            amountText: "1,080円",
            amountYen: 1080,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.95,
            explicitlyPrinted: true,
            sourceLineIndex: 1,
          },
          {
            rawText: "内税 58円",
            amountText: "56円",
            amountYen: 56,
            lineRoleCandidates: ["item", "unknown"],
            roleConfidence: 0.45,
            explicitlyPrinted: true,
            sourceLineIndex: 8,
          },
        ],
      },
      [foodCategory],
    );

    expect(mapped.items?.map((item) => item.itemName)).toEqual(["商品"]);
    expect(mapped.receiptLineClassifications?.[1]?.candidates[0]).toMatchObject({ role: "tax" });
  });

  it("税率別対象額がAI item候補でも構造ラベルで明細から除外する", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        items: [
          { ...product, itemName: "商品", amountYen: 1000, printedAmountYen: 1000 },
          { ...product, itemName: "8%対象", amountYen: 927, printedAmountYen: 927 },
        ],
        rawObservations: [
          {
            rawText: "商品 1,000円",
            amountText: "1,000円",
            amountYen: 1000,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.95,
            explicitlyPrinted: true,
            sourceLineIndex: 1,
          },
          {
            rawText: "8%対象 927円",
            amountText: "927円",
            amountYen: 927,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.95,
            explicitlyPrinted: true,
            sourceLineIndex: 8,
          },
        ],
      },
      [foodCategory],
    );

    expect(mapped.items?.map((item) => item.itemName)).toEqual(["商品"]);
    expect(mapped.receiptLineClassifications?.[1]?.candidates[0]?.role).toBe("tax");
  });

  it("税率を一意に解決できない明細を確認対象へ送る", () => {
    const source = {
      ...trialExternal8Fixture,
      amountYen: 1000,
      items: [
        ...trialExternal8Fixture.items!.slice(0, 3).map((item, index) => ({
          ...item,
          amountYen: [300, 300, 400][index],
          printedAmountYen: [300, 300, 400][index],
          amountBasis: "unknown" as const,
          taxRatePercent: null,
          markers: [],
          taxMarker: "",
        })),
      ],
      taxSummaries: [
        {
          ...trialExternal8Fixture.taxSummaries![0],
          taxableAmountYen: 500,
          taxYen: 0,
          taxMode: "included" as const,
          taxableAmountBasis: "tax_included" as const,
        },
        {
          ...trialExternal8Fixture.taxSummaries![0],
          taxRatePercent: 10 as const,
          taxableAmountYen: 500,
          taxYen: 0,
          taxMode: "included" as const,
          taxableAmountBasis: "tax_included" as const,
        },
      ],
    };
    const mapped = mapExtractionToDraftArgs(source, [foodCategory]);
    expect(mapped.reviewReasons).toContain("user_confirmation_required");
    expect(mapped.items?.every((item) => item.taxResolutionStatus === "unresolved")).toBe(true);
    expect(mapped.items?.every((item) => item.taxRatePercent === null)).toBe(true);
    expect(mapped.warnings).toContain("unresolved_tax_rate:items[0]");
  });

  it("フレッシュ石守相当のOCR内税誤判定を算術一致だけで外税化しない", () => {
    const mapped = mapExtractionToDraftArgs(ishimoriExternalMisreadFixture, [foodCategory]);

    expect(mapped.amountYen).toBe(8562);
    expect(mapped.taxSummaries?.[0]).toMatchObject({
      taxRatePercent: 8,
      taxMode: "included",
      taxableAmountBasis: "tax_included",
      status: "contradictory",
    });
    expect(mapped.items?.reduce((sum, item) => sum + (item.printedAmountYen ?? 0), 0)).toBe(7958);
    expect(mapped.items?.reduce((sum, item) => sum + (item.allocatedTaxYen ?? 0), 0)).toBe(0);
    expect(mapped.items?.reduce((sum, item) => sum + (item.normalizedAmountYen ?? 0), 0)).toBe(
      7958,
    );
    expect(
      mapped.items
        ?.filter((item) => item.printedAmountYen !== undefined && item.printedAmountYen >= 0)
        .every((item) => item.taxResolutionStatus === "unresolved"),
    ).toBe(true);
    expect(mapped.warnings).toContain("ambiguous_receipt_total");
    expect(mapped.reviewReasons).toContain("amount_mismatch");
    expect(mapped.reviewReasons).toContain("user_confirmation_required");
    expect(mapped.items?.[2]?.taxResolutionStatus).toBe("unresolved");
    expect(mapped.items?.[2]?.taxRatePercent).toBeNull();
  });

  it("構造化税summary欠落時に明示税行から復元する", () => {
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: 530,
        taxSummaries: [],
        rawObservations: [
          {
            rawText: "(10%内税 対象) 530円",
            amountText: "530円",
            amountYen: 530,
            lineRoleCandidates: ["tax"],
            roleConfidence: 0.95,
            explicitlyPrinted: true,
            sourceLineIndex: 10,
          },
          {
            rawText: "(10%内税額) 48円",
            amountText: "48円",
            amountYen: 48,
            lineRoleCandidates: ["tax"],
            roleConfidence: 0.95,
            explicitlyPrinted: true,
            sourceLineIndex: 11,
          },
        ],
      },
      [foodCategory],
    );
    expect(mapped.taxSummaries).toEqual([
      expect.objectContaining({ taxRatePercent: 10, taxMode: "included", taxYen: 48 }),
    ]);
  });
});
