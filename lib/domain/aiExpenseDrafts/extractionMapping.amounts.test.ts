import { describe, expect, it } from "vitest";
import {
  conveniencePaymentFixture,
  trialExternal8Fixture,
} from "../../convex/receiptImageExtraction/fixtures/taxFixtures";
import { mapExtractionToDraftArgs } from "./extractionMapping";
import { foodCategory } from "./testHelpers";

describe("mapExtractionToDraftArgs tax normalization (amount handling)", () => {
  it("不確実な負額行だけを警告付きで保持し、他の抽出項目を失わない", () => {
    const source = structuredClone(trialExternal8Fixture);
    source.shopName = "マルアイ";
    source.date = "2026-08-16";
    source.amountYen = 7462;
    source.items = [
      {
        ...source.items![0],
        itemName: "通常商品",
        printedAmountYen: 7478,
        amountYen: 7478,
        lineType: "item",
      },
      {
        ...source.items![0],
        itemName: "M002 玉ねぎ3玉",
        printedAmountYen: -16,
        amountYen: -16,
        lineType: "unknown",
        warnings: ["negative_amount_line_type_uncertain"],
      },
    ];
    source.taxSummaries = [];

    const mapped = mapExtractionToDraftArgs(source, [foodCategory]);

    expect(mapped).toMatchObject({ shopName: "マルアイ", date: "2026-08-16", amountYen: 7462 });
    expect(mapped.items).toHaveLength(2);
    expect(mapped.items?.[1]).toMatchObject({
      itemName: "M002 玉ねぎ3玉",
      lineType: "unknown",
      printedAmountYen: -16,
      warnings: expect.arrayContaining(["negative_amount_line_type_uncertain"]),
    });
    expect(mapped.reviewReasons).toContain("user_confirmation_required");
  });

  it("金額不整合をwarningとamount_mismatchへ送る", () => {
    const mapped = mapExtractionToDraftArgs({ ...trialExternal8Fixture, amountYen: 9999 }, [
      foodCategory,
    ]);
    expect(mapped.warnings).toContain("normalized_amount_mismatch");
    expect(mapped.reviewReasons).toContain("amount_mismatch");
  });

  it("支払方法金額は明細から外し、袋代はfeeとして残す", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: 1005,
        items: [
          { ...product, itemName: "商品", amountYen: 1000, printedAmountYen: 1000 },
          { ...product, itemName: "レジ袋", amountYen: 5, printedAmountYen: 5 },
          { ...product, itemName: "VISA", amountYen: 1005, printedAmountYen: 1005 },
        ],
        taxSummaries: [],
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
            rawText: "レジ袋 5円",
            amountText: "5円",
            amountYen: 5,
            lineRoleCandidates: ["item"],
            roleConfidence: 0.95,
            explicitlyPrinted: true,
            sourceLineIndex: 2,
          },
          {
            rawText: "VISA 1,005円",
            amountText: "1,005円",
            amountYen: 1005,
            lineRoleCandidates: ["payment"],
            roleConfidence: 0.95,
            explicitlyPrinted: true,
            sourceLineIndex: 9,
          },
        ],
      },
      [foodCategory],
    );

    expect(mapped.items?.map((item) => item.itemName)).toEqual(["商品", "レジ袋"]);
    expect(mapped.receiptLineClassifications?.map((line) => line.candidates[0]?.role)).toEqual([
      "item",
      "fee",
      "paymentMethodAmount",
    ]);
  });

  it("分類不能な金額行をunknownのまま確認対象へ送る", () => {
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        items: [],
        taxSummaries: [],
        rawObservations: [
          {
            rawText: "読取不能",
            amountText: "777円",
            amountYen: 777,
            lineRoleCandidates: ["unknown"],
            roleConfidence: 0.2,
            explicitlyPrinted: true,
            sourceLineIndex: 4,
          },
        ],
      },
      [foodCategory],
    );

    expect(mapped.receiptLineClassifications?.[0]).toMatchObject({
      status: "ambiguous",
      candidates: [expect.objectContaining({ role: "unknown" })],
    });
    expect(mapped.reviewReasons).toContain("user_confirmation_required");
    expect(mapped.warnings).toContain("ambiguous_receipt_line:4");
  });

  it("明細のない払込票には金額不整合を付与しない", () => {
    const mapped = mapExtractionToDraftArgs(conveniencePaymentFixture, [foodCategory]);

    expect(mapped.items).toEqual([]);
    expect(mapped.warnings).not.toContain("normalized_amount_mismatch");
    expect(mapped.reviewReasons).toBeUndefined();
  });

  it("7,803円の支払総額を743円+60円の税算術候補で置換しない", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: 7803,
        items: [
          {
            ...product,
            itemName: "商品",
            amountYen: 743,
            printedAmountYen: 743,
            amountBasis: "unknown",
            taxRatePercent: null,
            markers: [],
          },
        ],
        taxSummaries: [
          {
            ...trialExternal8Fixture.taxSummaries![0],
            taxableAmountYen: 743,
            taxYen: 60,
            taxIncludedAmountYen: 803,
            taxMode: "external",
            taxableAmountBasis: "tax_excluded",
          },
        ],
      },
      [foodCategory],
    );

    expect(mapped.amountYen).toBe(7803);
    expect(mapped.receiptTotalResolution).toMatchObject({
      status: "ambiguous",
      protectedAmountYen: 7803,
      candidates: expect.arrayContaining([
        expect.objectContaining({
          amountYen: 7803,
          source: "explicit_label",
          evidence: "extraction.amountYen",
        }),
        expect.objectContaining({ amountYen: 803, source: "tax_arithmetic" }),
      ]),
    });
    expect(mapped.items?.[0]).toMatchObject({
      printedAmountYen: 743,
      normalizedAmountYen: 743,
      allocatedTaxYen: 0,
      taxResolutionStatus: "unresolved",
    });
    expect(mapped.warnings).toContain("ambiguous_receipt_total");
    expect(mapped.reviewReasons).toEqual(
      expect.arrayContaining(["amount_mismatch", "user_confirmation_required"]),
    );
  });

  it("明細0件でも支払総額と抽出根拠を下書きへ渡す", () => {
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: 7803,
        items: [],
        taxSummaries: [],
      },
      [foodCategory],
    );

    expect(mapped.amountYen).toBe(7803);
    expect(mapped.receiptTotalResolution).toEqual({
      status: "verified",
      protectedAmountYen: 7803,
      candidates: [
        {
          amountYen: 7803,
          source: "explicit_label",
          evidence: "extraction.amountYen",
        },
      ],
      reasons: [],
    });
  });

  it("支払総額不明の0円は金額を保存せず、確認待ちの根拠だけ保持する", () => {
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: 0,
        items: [],
        taxSummaries: [],
        confidence: { ...trialExternal8Fixture.confidence, amountYen: 0.1 },
      },
      [foodCategory],
    );

    expect(mapped.amountYen).toBeUndefined();
    expect(mapped.receiptTotalResolution).toMatchObject({
      status: "ambiguous",
      protectedAmountYen: 0,
      reasons: ["receipt_total_missing_or_invalid"],
    });
  });

  it("支払総額nullは0円候補を作らず、raw observationをそのまま渡す", () => {
    const rawObservations = [
      {
        rawText: "合計 読取不能",
        amountText: null,
        amountYen: null,
        lineRoleCandidates: ["total" as const, "unknown" as const],
        roleConfidence: 0.4,
        explicitlyPrinted: true,
        sourceLineIndex: 9,
      },
      {
        rawText: "消費税 0円",
        amountText: "0円",
        amountYen: 0,
        lineRoleCandidates: ["tax" as const],
        roleConfidence: 0.9,
        explicitlyPrinted: true,
        sourceLineIndex: 10,
      },
    ];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        amountYen: null,
        items: [],
        taxSummaries: [],
        rawObservations,
      },
      [foodCategory],
    );

    expect(mapped.amountYen).toBeUndefined();
    expect(mapped.receiptTotalResolution).toEqual({
      status: "ambiguous",
      protectedAmountYen: null,
      candidates: [],
      reasons: ["receipt_total_missing_or_invalid"],
    });
    expect(mapped.rawObservationLines).toEqual(rawObservations);
  });

  it("0円の非金銭ポイント行を除外し、負額割引は保持する", () => {
    const product = trialExternal8Fixture.items![0];
    const mapped = mapExtractionToDraftArgs(
      {
        ...trialExternal8Fixture,
        items: [
          product,
          { ...product, itemName: "ポイント10倍", amountYen: 0, printedAmountYen: 0 },
          { ...product, itemName: "クーポン値引", amountYen: -20, printedAmountYen: -20 },
        ],
      },
      [foodCategory],
    );
    expect(mapped.items?.map((item) => item.itemName)).not.toContain("ポイント10倍");
    expect(mapped.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemName: "クーポン値引", amountYen: -20 }),
      ]),
    );
  });
});
