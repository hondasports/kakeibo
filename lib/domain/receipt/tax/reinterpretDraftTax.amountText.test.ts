import { describe, expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
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
  ])("%s行は読めない税の根拠のまま止める", (_, rateLine, rateAmountText) => {
    const result = reinterpretDraftTax(combinedTargetAndTaxReceipt({ rateLine, rateAmountText }));
    expect(result.itemFields[0].taxAllocationStatus).toBe("unallocated");
  });
});
