import type { ExtractReceiptFieldsResult, ExtractReceiptItemResult } from "../extractionResult";

function item(
  itemName: string,
  printedAmountYen: number,
  taxRatePercent: 0 | 8 | 10 | null,
  amountBasis: "tax_included" | "tax_excluded" | "unknown",
  extra: Partial<ExtractReceiptItemResult> = {},
): ExtractReceiptItemResult {
  return {
    itemName,
    amountYen: printedAmountYen,
    printedAmountYen,
    amountBasis,
    taxRatePercent,
    markers: taxRatePercent === 8 ? ["*"] : taxRatePercent === 10 ? ["#"] : [],
    taxMarker: taxRatePercent === 8 ? "*" : taxRatePercent === 10 ? "#" : "",
    categoryName: "食費",
    confidence: {
      itemName: 1,
      amountYen: 1,
      printedAmountYen: 1,
      amountBasis: 1,
      taxRatePercent: 1,
      categoryName: 1,
    },
    warnings: [],
    ...extra,
  };
}

const confidence = { shopName: 1, date: 1, amountYen: 1, documentType: 1, categoryName: 1 };

export const trialExternal8Fixture: ExtractReceiptFieldsResult = {
  documentType: "receipt",
  shopName: "TRIAL",
  date: "2026-07-03",
  amountYen: 1683,
  categoryName: "食費",
  items: [
    item("カンペッティたまごはち", 298, 8, "tax_excluded"),
    item("超熟", 198, 8, "tax_excluded"),
    item("超熟ロールレーズン", 376, 8, "tax_excluded", { quantity: 2, unitPriceYen: 188 }),
    item("クレームブリュレフラン", 78, 8, "tax_excluded"),
    item("牛乳仕込みのミルクチュ", 99, 8, "tax_excluded"),
    item("限界までクリームつめち", 98, 8, "tax_excluded"),
    item("大きなデニッシュなめら", 98, 8, "tax_excluded"),
    item("厚切りフレンチトースト", 118, 8, "tax_excluded"),
    item("黒コッペ", 98, 8, "tax_excluded"),
    item("なめらかプリン", 98, 8, "tax_excluded"),
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
      confidence: {},
      warnings: [],
    },
  ],
  confidence,
  warnings: [],
};

export const mixedTaxFixture: ExtractReceiptFieldsResult = {
  ...trialExternal8Fixture,
  amountYen: 328,
  items: [item("food", 100, 8, "tax_excluded"), item("goods", 200, 10, "tax_excluded")],
  taxSummaries: [
    {
      taxRatePercent: 8,
      taxMode: "external",
      taxableAmountYen: 100,
      taxableAmountBasis: "tax_excluded",
      taxYen: 8,
      roundingMethod: "floor",
      confidence: {},
      warnings: [],
    },
    {
      taxRatePercent: 10,
      taxMode: "external",
      taxableAmountYen: 200,
      taxableAmountBasis: "tax_excluded",
      taxYen: 20,
      roundingMethod: "floor",
      confidence: {},
      warnings: [],
    },
  ],
};

export const includedTaxFixture: ExtractReceiptFieldsResult = {
  ...trialExternal8Fixture,
  amountYen: 110,
  items: [item("included", 110, 10, "tax_included")],
  taxSummaries: [
    {
      taxRatePercent: 10,
      taxMode: "included",
      taxableAmountYen: 110,
      taxableAmountBasis: "tax_included",
      taxYen: 10,
      taxIncludedAmountYen: 110,
      roundingMethod: "floor",
      confidence: {},
      warnings: [],
    },
  ],
};

export const discountFixture: ExtractReceiptFieldsResult = {
  ...includedTaxFixture,
  amountYen: 90,
  items: [item("商品", 100, 10, "tax_included"), item("クーポン割引", -10, 10, "tax_included")],
  taxSummaries: [
    {
      taxRatePercent: 10,
      taxMode: "included",
      taxableAmountYen: 90,
      taxableAmountBasis: "tax_included",
      taxYen: 8,
      taxIncludedAmountYen: 90,
      roundingMethod: "floor",
      confidence: {},
      warnings: [],
    },
  ],
};

export const unknownTaxFixture: ExtractReceiptFieldsResult = {
  ...includedTaxFixture,
  amountYen: 100,
  items: [item("unknown", 100, null, "unknown")],
  taxSummaries: [],
};

export const conveniencePaymentFixture: ExtractReceiptFieldsResult = {
  documentType: "convenience_payment",
  shopName: "",
  paymentPlace: "コンビニ",
  payeeName: "電力会社",
  paymentPurpose: "電気料金",
  date: "2026-07-03",
  amountYen: 5000,
  categoryName: "光熱費",
  items: [],
  taxSummaries: [],
  confidence,
  warnings: [],
};

/** OCR が内税と誤判定した外税レシート（フレッシュ石守相当・簡略 fixture） */
export const ishimoriExternalMisreadFixture: ExtractReceiptFieldsResult = {
  documentType: "receipt",
  shopName: "フレッシュ石守",
  date: "2026-07-03",
  amountYen: 8562,
  categoryName: "食費",
  items: [
    item("商品A", 4000, null, "unknown", { markers: ["※"], taxMarker: "※" }),
    item("商品B", 3966, null, "unknown", { markers: ["※"], taxMarker: "※" }),
    item("値引", -8, null, "unknown"),
  ],
  taxSummaries: [
    {
      taxRatePercent: 8,
      taxMode: "included",
      taxableAmountYen: 7928,
      taxableAmountBasis: "tax_included",
      taxYen: 634,
      taxIncludedAmountYen: 8562,
      roundingMethod: "unknown",
      confidence: {},
      warnings: [],
    },
  ],
  markerDefinitions: [{ marker: "※", description: "軽減税率8%適応商品" }],
  confidence,
  warnings: [],
};
