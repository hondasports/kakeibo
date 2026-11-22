import { describe, expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { splitCombinedSummaryLines } from "./combinedSummaryLines";
import { positionEvidence } from "./interpretTaxEvidence";
import { unprovenTargetReceipt } from "./fixtures/unprovenTargetReceipt";
import type { ReceiptLineClassification, ReceiptRawObservationLine } from "../observations";

type Role = ReceiptRawObservationLine["lineRoleCandidates"][number];

function line(
  index: number,
  rawText: string,
  amountYen: number | null,
  roles: Role[],
  amountText: string | null = amountYen === null ? null : `￥${amountYen}`,
): ReceiptRawObservationLine {
  return {
    sourceLineIndex: index,
    rawText,
    amountYen,
    amountText,
    lineRoleCandidates: roles,
    roleConfidence: 0.9,
    explicitlyPrinted: true,
  };
}

function classification(
  index: number,
  status: "classified" | "ambiguous",
  roles: [string, number][],
): ReceiptLineClassification {
  return {
    sourceLineIndex: index,
    status,
    candidates: roles.map(([role, score]) => ({ role, score, evidence: [] })),
  } as ReceiptLineClassification;
}

/**
 * Issue #1018 の本番観測を匿名化した形。AIは小計の金額を `amountYen: null` とし、
 * 原文の金額は `amountText` にだけ残していた。
 */
function subtotalWithAmountTextOnly(subtotal: Pick<ReceiptRawObservationLine, "amountText">) {
  return {
    ...unprovenTargetReceipt(),
    rawObservationLines: [
      line(0, "買上点数 4点", null, ["unknown"]),
      { ...line(1, "小計 ￥4,810", null, ["subtotal"]), ...subtotal },
      line(2, "合計 ￥4,810", 4810, ["total", "payment"]),
      line(3, "内消費税 10.00% ￥437", 437, ["tax"]),
      line(4, "支払い方法", null, ["unknown"]),
      line(5, "QUICPay ￥4,810", 4810, ["payment"]),
      line(6, "（内消費税 10.00% ￥437）", 437, ["tax"]),
    ],
    receiptLineClassifications: [
      classification(0, "ambiguous", [["unknown", 0.4]]),
      classification(1, "classified", [["subtotal", 1]]),
      classification(2, "classified", [
        ["totalCandidate", 1],
        ["paymentMethodAmount", 0.77],
      ]),
      classification(3, "classified", [["tax", 1]]),
      classification(5, "ambiguous", [["paymentMethodAmount", 0.75]]),
      classification(6, "classified", [["tax", 1]]),
    ],
  };
}

function allocated(input: ReturnType<typeof subtotalWithAmountTextOnly>) {
  return reinterpretDraftTax(input).itemFields.every(
    (item) => item.taxAllocationStatus === "allocated",
  );
}

describe("金額が amountText にだけ残る印字行（Issue #1018）", () => {
  it("小計の amountYen が null でも amountText が金額なら確認済み商品を配分できる", () => {
    const input = subtotalWithAmountTextOnly({ amountText: "￥4,810" });
    expect(allocated(input)).toBe(true);
    expect(reinterpretDraftTax(input).interpretation.taxSummaries[0]).toMatchObject({
      status: "verified",
      taxableAmountYen: 4810,
      taxYen: 437,
    });
  });

  it.each(["￥4,810", "¥4,810", "4,810円", "4810", " ￥ 4,810 "])(
    "金額の書式 %s を数値として読む",
    (amountText) => {
      expect(allocated(subtotalWithAmountTextOnly({ amountText }))).toBe(true);
    },
  );

  it("amountText が別の金額なら、数値化した値で従来どおり矛盾として止める", () => {
    expect(allocated(subtotalWithAmountTextOnly({ amountText: "￥4,000" }))).toBe(false);
  });

  it.each([null, "", "￥4,8?0", "小計 ￥4,810", "￥4,810 ￥437"])(
    "金額として読めない amountText %s は証拠不足のまま止める",
    (amountText) => {
      expect(allocated(subtotalWithAmountTextOnly({ amountText }))).toBe(false);
    },
  );
});

/**
 * Issue #1280 の本番観測を匿名化した形。対象額と消費税額が1行に並び、
 * AIは `amountYen: null`、`amountText` に2つの金額を残していた。
 */
function combinedTargetAndTaxReceipt(
  overrides: { rateLine?: string; rateAmountText?: string; totalLine?: string } = {},
) {
  const rateLine = overrides.rateLine ?? "10%税抜 ¥220 消費税等 ¥22";
  const totalLine = overrides.totalLine ?? "合計税抜 ¥220 消費税計 ¥22";
  return {
    amountYen: 242,
    items: [
      {
        itemName: "商品",
        lineType: "item" as const,
        printedAmountYen: 220,
        amountBasis: "tax_excluded" as const,
        taxRatePercent: 10 as const,
        markers: [],
        warnings: [],
        taxResolutionStatus: "resolved" as const,
        taxResolutionSource: "item_explicit" as const,
      },
    ],
    taxSummaries: [],
    rawObservationLines: [
      line(0, "商品 1コ ¥220", 220, ["item"]),
      line(1, rateLine, null, ["tax", "subtotal"], overrides.rateAmountText ?? "¥220 / ¥22"),
      line(2, totalLine, null, ["subtotal", "tax"], "¥220 / ¥22"),
      line(3, "合計 1点 ¥242", 242, ["total"]),
      line(4, "お預り ¥242", 242, ["payment"]),
    ],
    receiptLineClassifications: [
      classification(0, "classified", [["item", 0.75]]),
      classification(1, "ambiguous", [
        ["subtotal", 0.75],
        ["tax", 0.75],
      ]),
      classification(2, "classified", [
        ["tax", 0.94],
        ["totalCandidate", 0.94],
      ]),
      classification(3, "classified", [["totalCandidate", 1]]),
      classification(4, "classified", [["cashReceived", 1]]),
    ],
  };
}

describe("対象額と消費税額が1行に並ぶ印字行（Issue #1280）", () => {
  it("ラベルごとに金額を読み、税額を確定して配分する", () => {
    const result = reinterpretDraftTax(combinedTargetAndTaxReceipt());
    expect(result.interpretation.taxSummaries).toEqual([
      expect.objectContaining({
        taxRatePercent: 10,
        status: "verified",
        taxableAmountYen: 220,
        taxYen: 22,
      }),
    ]);
    expect(result.itemFields[0]).toMatchObject({
      taxAllocationStatus: "allocated",
      allocatedTaxYen: 22,
      normalizedAmountYen: 242,
    });
  });

  it.each([
    ["通貨記号と円を併用した金額", "10%税抜 ¥220円 消費税等 ¥22円", "¥220円 / ¥22円"],
    ["税率と%の間に空白がある", "10 %税抜 ¥220 消費税等 ¥22", "¥220 / ¥22"],
  ])("%sも読んで配分する", (_, rateLine, rateAmountText) => {
    const result = reinterpretDraftTax(combinedTargetAndTaxReceipt({ rateLine, rateAmountText }));
    expect(result.itemFields[0]).toMatchObject({
      taxAllocationStatus: "allocated",
      allocatedTaxYen: 22,
    });
  });

  it("税率の空白を除いて、後ろの税額の行にも税率を付ける", () => {
    const [, tax] = splitCombinedSummaryLines([
      line(1, "10 %税抜 ¥220 消費税等 ¥22", null, ["tax"], "¥220 / ¥22"),
    ])!;
    expect(tax).toMatchObject({ rawText: "10%消費税等 ¥22", amountYen: 22 });
  });

  it("分けた行の両方の文言を、位置による税率の根拠に使う", () => {
    const lines = splitCombinedSummaryLines([
      line(1, "標準税率対象 ¥220 消費税等 ¥22", null, ["tax"], "¥220 / ¥22"),
    ]);
    expect(lines).toHaveLength(2);
    const evidence = positionEvidence({
      amountYen: 242,
      items: [],
      taxSummaries: [],
      rawObservationLines: lines,
      receiptLineClassifications: [
        {
          sourceLineIndex: 1,
          status: "classified",
          candidates: [{ role: "tax", score: 1, evidence: ["position:receipt_footer"] }],
        },
      ],
    });
    expect(evidence?.composition).toBe("rate10");
  });

  it("印字された税額が税率の計算と合わなければ、従来どおり矛盾として止める", () => {
    const result = reinterpretDraftTax(
      combinedTargetAndTaxReceipt({
        rateLine: "10%税抜 ¥220 消費税等 ¥30",
        rateAmountText: "¥220 / ¥30",
      }),
    );
    expect(result.itemFields[0].taxAllocationStatus).toBe("unallocated");
    expect(result.interpretation.taxSummaries[0].status).not.toBe("verified");
  });

  it.each([
    ["ラベルの無い金額がある", "10%税抜 ¥220 ¥22", "¥220 / ¥22"],
    ["同じ種類のラベルが2つある", "10%消費税 ¥220 消費税等 ¥22", "¥220 / ¥22"],
    ["金額の後ろに文字が残る", "10%税抜 ¥220 消費税等 ¥22 他", "¥220 / ¥22"],
    ["金額が3つある", "10%税抜 ¥220 消費税等 ¥22 合計 ¥242", "¥220 / ¥22 / ¥242"],
    ["amountText と原文の金額が違う", "10%税抜 ¥220 消費税等 ¥22", "¥220 / ¥20"],
    ["負の金額がある", "10%税抜 220円 消費税等 -22円", "220円 / -22円"],
    ["▲付きの金額がある", "10%税抜 ¥220 消費税等 ▲¥22", "¥220 / ▲¥22"],
    ["判読できない桁がある", "10%税抜 ¥220? 消費税等 ¥22", "¥220? / ¥22"],
    ["判読できない先頭の桁がある", "10%税抜 220円 消費税等 ?22円", "220円 / ?22円"],
    ["対象額の先頭の桁が判読できない", "10%税抜 ?220円 消費税等 22円", "?220円 / 22円"],
    ["小数の金額がある", "10%税抜 ¥220.5 消費税等 ¥22", "¥220.5 / ¥22"],
  ])("%s行は読めない税の根拠のまま止める", (_, rateLine, rateAmountText) => {
    const result = reinterpretDraftTax(combinedTargetAndTaxReceipt({ rateLine, rateAmountText }));
    expect(result.itemFields[0].taxAllocationStatus).toBe("unallocated");
  });
});

/**
 * 本番観測を匿名化した形。内税のレシートで「(8%対象 ¥519 消費税 ¥41)」のように
 * 税抜の対象額と税額が括弧つきの1行に並び、AIは `amountYen` に先頭の金額を入れていた。
 */
function parenthesizedIncludedTaxReceipt(
  overrides: { rateLine?: string; rateAmountYen?: number | null; rateAmountText?: string } = {},
) {
  const rateLine = overrides.rateLine ?? "(8%対象 ¥519 消費税 ¥41)";
  const item = (itemName: string, printedAmountYen: number) => ({
    itemName,
    lineType: "item" as const,
    printedAmountYen,
    amountBasis: "tax_included" as const,
    taxRatePercent: 8 as const,
    markers: ["※"],
    warnings: [],
    taxResolutionStatus: "resolved" as const,
    taxResolutionSource: "item_explicit" as const,
  });
  return {
    amountYen: 560,
    receiptTotalSource: "explicit_label" as const,
    items: [item("商品1", 183), item("商品2", 183), item("商品3", 194)],
    taxSummaries: [],
    markerDefinitions: [{ marker: "※", description: "軽減税率対象商品を示す記号" }],
    rawObservationLines: [
      line(0, "商品1 1点※ ¥183", 183, ["item"]),
      line(1, "商品2 1点※ ¥183", 183, ["item"]),
      line(2, "商品3 1点※ ¥194", 194, ["item"]),
      line(3, "[10小計] 3点 ¥560", 560, ["subtotal"]),
      line(4, "合計 ¥560", 560, ["total"]),
      line(5, "(10%対象 ¥0 消費税 ¥0)", 0, ["tax"], "¥0"),
      line(
        6,
        rateLine,
        overrides.rateAmountYen === undefined ? 519 : overrides.rateAmountYen,
        ["tax"],
        overrides.rateAmountText ?? "¥519 / ¥41",
      ),
      line(7, "電子マネー ¥560", 560, ["payment"]),
    ],
    receiptLineClassifications: [
      classification(0, "classified", [["item", 0.75]]),
      classification(1, "classified", [["item", 0.75]]),
      classification(2, "classified", [["item", 0.75]]),
      classification(3, "classified", [["subtotal", 0.97]]),
      classification(4, "classified", [["totalCandidate", 0.98]]),
      classification(5, "classified", [["tax", 1]]),
      classification(6, "classified", [["tax", 1]]),
      classification(7, "classified", [["paymentMethodAmount", 0.98]]),
    ],
  };
}

describe("括弧つきの1行に税抜の対象額と税額が並ぶ内税レシート", () => {
  it("税込の商品に税額を配分し、税率別集計を確定する", () => {
    const result = reinterpretDraftTax(parenthesizedIncludedTaxReceipt());
    expect(result.interpretation.taxSummaries).toEqual([
      expect.objectContaining({
        taxRatePercent: 8,
        status: "verified",
        taxableAmountYen: 560,
        taxableAmountBasis: "tax_included",
        taxYen: 41,
      }),
    ]);
    expect(result.itemFields.map((item) => item.taxAllocationStatus)).toEqual([
      "allocated",
      "allocated",
      "allocated",
    ]);
    expect(result.itemFields.reduce((sum, item) => sum + (item.allocatedTaxYen ?? 0), 0)).toBe(41);
  });

  it("AIが amountYen を null にしても同じように配分する", () => {
    const result = reinterpretDraftTax(parenthesizedIncludedTaxReceipt({ rateAmountYen: null }));
    expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
  });

  it("括弧を外し、後ろの税額の行にも税率を付けて分ける", () => {
    const lines = splitCombinedSummaryLines([
      line(6, "(8%対象 ¥519 消費税 ¥41)", 519, ["tax"], "¥519 / ¥41"),
    ]);
    expect(lines).toEqual([
      expect.objectContaining({ rawText: "8%対象 ¥519", amountYen: 519 }),
      expect.objectContaining({ rawText: "8%消費税 ¥41", amountYen: 41 }),
    ]);
  });

  it.each([
    ["印字された税額が税率の計算と合わない", "(8%対象 ¥519 消費税 ¥40)", "¥519 / ¥40", 519],
    ["対象額が税込合計から税額を引いた額と合わない", "(8%対象 ¥520 消費税 ¥41)", "¥520 / ¥41", 520],
    ["amountYen が行内のどの金額とも違う", "(8%対象 ¥519 消費税 ¥41)", "¥519 / ¥41", 560],
  ])("%s行は配分せずに止める", (_, rateLine, rateAmountText, rateAmountYen) => {
    const result = reinterpretDraftTax(
      parenthesizedIncludedTaxReceipt({ rateLine, rateAmountText, rateAmountYen }),
    );
    expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });

  it("税額の印字が無ければ、税抜と読める対象額だけでは配分しない", () => {
    const result = reinterpretDraftTax(
      parenthesizedIncludedTaxReceipt({
        rateLine: "(8%対象 ¥519)",
        rateAmountText: "¥519",
      }),
    );
    expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });
});
