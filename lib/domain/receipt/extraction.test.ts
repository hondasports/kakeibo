import { describe, expect, it } from "vitest";
import { parseExtractionPayload } from "./extraction";
import { EXPENSE_ENTRY_AMOUNT_MAX } from "../expenseEntries/expenseEntryItem";

const trialExtraction = {
  documentType: "receipt",
  shopName: "TRIAL",
  paymentPlace: "",
  payeeName: "",
  paymentPurpose: "",
  date: "2026-07-03",
  amountYen: 1683,
  categoryName: "食費",
  items: [
    {
      itemName: "たまご",
      printedAmountYen: 298,
      amountBasis: "tax_excluded",
      taxRatePercent: 8,
      taxMarker: "*",
      quantity: 1,
      unitPriceYen: 298,
      categoryName: "食費",
      confidence: {
        itemName: 1,
        printedAmountYen: 1,
        amountBasis: 1,
        taxRatePercent: 1,
        categoryName: 1,
      },
      warnings: [],
    },
  ],
  taxSummaries: [
    {
      taxRatePercent: 8,
      taxMode: "external",
      taxableAmountYen: 1559,
      taxableAmountBasis: "tax_excluded",
      taxYen: 124,
      taxIncludedAmountYen: 1683,
      roundingMethod: "floor",
      confidence: {
        taxRatePercent: 1,
        taxMode: 1,
        taxableAmountYen: 1,
        taxableAmountBasis: 1,
        taxYen: 1,
      },
      warnings: [],
    },
  ],
  confidence: {
    documentType: 1,
    shopName: 1,
    paymentPlace: 1,
    payeeName: 1,
    paymentPurpose: 1,
    date: 1,
    amountYen: 1,
    categoryName: 1,
  },
  warnings: [],
};

function parse(payload: unknown) {
  return parseExtractionPayload(payload);
}

describe("parseExtractionPayload domain", () => {
  it.each([EXPENSE_ENTRY_AMOUNT_MAX, -EXPENSE_ENTRY_AMOUNT_MAX])(
    "範囲内の符号付き明細金額 %s 円は保持する",
    (amount) => {
      const payload = structuredClone(trialExtraction);
      payload.items[0].printedAmountYen = amount;
      const result = parse(payload);
      expect(result.success).toBe(true);
      if (result.success) expect(result.extracted.items?.[0].printedAmountYen).toBe(amount);
    },
  );

  it.each([EXPENSE_ENTRY_AMOUNT_MAX + 1, -EXPENSE_ENTRY_AMOUNT_MAX - 1, 1e100])(
    "範囲外の明細金額 %s 円はエラー結果を返す",
    (amount) => {
      const payload = structuredClone(trialExtraction);
      payload.items[0].printedAmountYen = amount;
      expect(parse(payload).success).toBe(false);
    },
  );

  it.each(["taxableAmountYen", "taxYen", "taxIncludedAmountYen"] as const)(
    "範囲外の税サマリ金額 %s はエラー結果を返す",
    (field) => {
      const payload = structuredClone(trialExtraction);
      payload.taxSummaries[0][field] = EXPENSE_ENTRY_AMOUNT_MAX + 1;
      expect(parse(payload).success).toBe(false);
    },
  );

  it.each(["taxableAmountYen", "taxYen", "taxIncludedAmountYen"] as const)(
    "上限内の税サマリ金額 %s は保持する",
    (field) => {
      const payload = structuredClone(trialExtraction);
      payload.taxSummaries[0][field] = EXPENSE_ENTRY_AMOUNT_MAX;
      const result = parse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.extracted.taxSummaries?.[0][field]).toBe(EXPENSE_ENTRY_AMOUNT_MAX);
      }
    },
  );

  it.each([
    { rows: [{ rawText: "26年07月24日 10:08", explicitlyPrinted: false }] },
    {
      rows: [
        { rawText: "26年07月24日 10:08", explicitlyPrinted: true },
        { rawText: "26年07月25日 10:08", explicitlyPrinted: true },
      ],
    },
    { rows: [{ rawText: "ポイント有効期限26年07月24日 10:08", explicitlyPrinted: true }] },
  ])(
    "conflicting, inferred or expiry observations do not override a valid structured date",
    ({ rows }) => {
      const result = parse({
        ...trialExtraction,
        rawObservations: rows.map((row, sourceLineIndex) => ({
          ...row,
          sourceLineIndex,
          amountText: null,
          amountYen: null,
          lineRoleCandidates: ["unknown"],
          roleConfidence: 0.9,
          boundingBox: null,
        })),
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.extracted.date).toBe(trialExtraction.date);
    },
  );
  it("正常系: TRIAL 外税をパースする", () => {
    const result = parse(trialExtraction);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.extracted.amountYen).toBe(1683);
    expect(result.extracted.items?.[0]).toMatchObject({
      printedAmountYen: 298,
      amountBasis: "tax_excluded",
      taxRatePercent: 8,
    });
    expect(result.extracted.taxSummaries?.[0]).toMatchObject({
      taxRatePercent: 8,
      taxMode: "external",
      taxableAmountYen: 1559,
      taxYen: 124,
    });
  });

  it("不正な税率はエラー結果を返す", () => {
    const payload = structuredClone(trialExtraction);
    payload.items[0].taxRatePercent = 0.08;
    const result = parse(payload);
    expect(result.success).toBe(false);
  });

  it("不正な shopName はエラー結果を返す", () => {
    const payload = structuredClone(trialExtraction);
    payload.shopName = "";
    const result = parse(payload);
    expect(result.success).toBe(false);
  });

  it.each(["2674-07-24", "2014-07-24"])("構造化年 %s を2桁年の生観測から復元する", (date) => {
    const payload = structuredClone(trialExtraction) as typeof trialExtraction & {
      rawObservations: Array<Record<string, unknown>>;
    };
    payload.date = date;
    payload.rawObservations = [
      {
        rawText: "26年07月24日 10:08",
        amountText: null,
        amountYen: null,
        lineRoleCandidates: ["unknown"],
        roleConfidence: 0.8,
        explicitlyPrinted: true,
        sourceLineIndex: 0,
        boundingBox: null,
      },
    ];
    const result = parse(payload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.extracted.date).toBe("2026-07-24");
    expect(result.extracted.warnings).toContain("date_recovered_from_raw_observations");
  });

  it("構造化された2桁和暦風年をraw観測なしで正規化する", () => {
    const payload = structuredClone(trialExtraction);
    payload.date = "26年07月24日";
    const result = parse(payload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.extracted.date).toBe("2026-07-24");
    expect(result.extracted.warnings).toContain("date_normalized_from_structured_value");
  });

  it("期限日の生観測を購入日として復元しない", () => {
    const payload = structuredClone(trialExtraction) as typeof trialExtraction & {
      rawObservations: Array<Record<string, unknown>>;
    };
    payload.date = "2674-07-24";
    payload.rawObservations = [
      {
        rawText: "ポイント有効期限 2026年09月30日",
        amountText: null,
        amountYen: null,
        lineRoleCandidates: ["unknown"],
        roleConfidence: 0.8,
        explicitlyPrinted: true,
        sourceLineIndex: 0,
        boundingBox: null,
      },
    ];
    expect(parse(payload).success).toBe(false);
  });

  it("構造化日付が空でも一意な購入日時の生観測から復元する", () => {
    const payload = structuredClone(trialExtraction) as typeof trialExtraction & {
      rawObservations: Array<Record<string, unknown>>;
    };
    payload.date = "";
    payload.rawObservations = [
      {
        rawText: "2026年07月24日 10:08",
        amountText: null,
        amountYen: null,
        lineRoleCandidates: ["unknown"],
        roleConfidence: 0.8,
        explicitlyPrinted: true,
        sourceLineIndex: 0,
        boundingBox: null,
      },
    ];
    const result = parse(payload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.extracted.date).toBe("2026-07-24");
    expect(result.extracted.warnings).toContain("date_recovered_from_raw_observations");
  });
});
