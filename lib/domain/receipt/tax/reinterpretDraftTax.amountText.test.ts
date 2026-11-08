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
