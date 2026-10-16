import { describe, expect, it } from "vitest";
import type { ReceiptRawObservationLine } from "./observations";
import { classifyReceiptLines, isReceiptTotalLabel } from "./lineClassification";

function line(
  rawText: string,
  amountYen: number | null,
  sourceLineIndex: number,
  lineRoleCandidates: ReceiptRawObservationLine["lineRoleCandidates"] = ["unknown"],
): ReceiptRawObservationLine {
  return {
    rawText,
    amountText: amountYen === null ? null : `${amountYen}円`,
    amountYen,
    lineRoleCandidates,
    roleConfidence: 0.5,
    explicitlyPrinted: true,
    sourceLineIndex,
  };
}

describe("classifyReceiptLines", () => {
  it("SUBTOTALの文字列だけから支払合計候補を作らない", () => {
    const [result] = classifyReceiptLines([line("SUBTOTAL 4,810円", 4810, 0)]);
    expect(result.candidates.some((candidate) => candidate.role === "totalCandidate")).toBe(false);
  });

  it("OCRで税額が誤読されても内税ラベルをtaxとして扱う", () => {
    const [result] = classifyReceiptLines([line("内税 58円", 56, 8, ["item", "unknown"])], {
      taxAmountsYen: [58],
    });

    expect(result).toMatchObject({ status: "classified" });
    expect(result.candidates[0]).toMatchObject({
      role: "tax",
      evidence: expect.arrayContaining(["explicit_or_partial_label:tax"]),
    });
  });

  it("小計・税・合計・現金・釣銭を同額でもラベルで区別する", () => {
    const results = classifyReceiptLines([
      line("小計", 1000, 10, ["subtotal"]),
      line("消費税", 1000, 11, ["tax"]),
      line("合計", 1000, 12, ["total"]),
      line("現金", 1000, 13, ["payment"]),
      line("お釣り", 1000, 14, ["change"]),
    ]);

    expect(results.map((result) => result.candidates[0]?.role)).toEqual([
      "subtotal",
      "tax",
      "totalCandidate",
      "paymentMethodAmount",
      "change",
    ]);
  });

  it("値引き・クーポン・ポイント・袋代を個別の役割にする", () => {
    const results = classifyReceiptLines([
      line("商品値引", -20, 1, ["discount"]),
      line("合計値引", -30, 2, ["discount"]),
      line("クーポン", -40, 3, ["discount"]),
      line("ポイント利用", -50, 4, ["discount"]),
      line("レジ袋", 5, 5, ["item"]),
    ]);

    expect(results.map((result) => result.candidates[0]?.role)).toEqual([
      "itemDiscount",
      "receiptDiscount",
      "coupon",
      "pointsUsed",
      "fee",
    ]);
  });

  it("支払方法ラベルの次行にある金額をpaymentMethodAmountにする", () => {
    const results = classifyReceiptLines([
      line("VISA", null, 20, ["payment"]),
      line("1,200円", 1200, 21, ["unknown"]),
    ]);

    expect(results[1]).toMatchObject({
      status: "classified",
      candidates: [
        expect.objectContaining({
          role: "paymentMethodAmount",
          evidence: expect.arrayContaining(["surrounding_line:payment_method_label"]),
        }),
        expect.anything(),
      ],
    });
  });

  it("支払額-釣銭=合計は合計ラベルの補助根拠にだけ使う", () => {
    const results = classifyReceiptLines([
      line("合計", 800, 10, ["total"]),
      line("お預り", 1000, 11, ["payment"]),
      line("お釣り", 200, 12, ["change"]),
    ]);

    expect(results[0]?.candidates[0]).toMatchObject({
      role: "totalCandidate",
      evidence: expect.arrayContaining(["amount_relation:payment_minus_change"]),
    });
    expect(results[1]?.candidates[0]?.role).toBe("cashReceived");
  });

  it("同額の合計候補は下部位置の根拠で順位付けし、明示税ラベルを上書きしない", () => {
    const results = classifyReceiptLines(
      [
        line("合計", 800, 2, ["total"]),
        line("内悦 800円", 800, 8, ["item", "unknown"]),
        line("お支払合計", 800, 9, ["total"]),
      ],
      { receiptTotalYen: 800 },
    );

    expect(results[0]?.candidates[0]).toMatchObject({
      role: "totalCandidate",
      score: 0.9,
      evidence: expect.arrayContaining(["cross_line_rank:2"]),
    });
    expect(results[0]?.status).toBe("ambiguous");
    expect(results[1]?.candidates[0]?.role).toBe("tax");
    expect(results[2]?.candidates[0]).toMatchObject({
      role: "totalCandidate",
      score: 1,
      evidence: expect.arrayContaining(["position:receipt_footer", "cross_line_rank:1"]),
    });
    expect(results[2]?.status).toBe("classified");
  });

  it("同ラベル・同額・同位置の合計候補は両方ambiguousにする", () => {
    const first = {
      ...line("合計", 800, 8, ["total"]),
      boundingBox: { left: 0, top: 0.8, width: 1, height: 0.05 },
    };
    const second = {
      ...line("合計", 800, 9, ["total"]),
      boundingBox: { left: 0, top: 0.8, width: 1, height: 0.05 },
    };
    const results = classifyReceiptLines([first, second], { receiptTotalYen: 800 });

    expect(results.map((result) => result.status)).toEqual(["ambiguous", "ambiguous"]);
  });

  it("税集計の構造ラベルとfooter税額一致をitem確定にしない", () => {
    const results = classifyReceiptLines(
      [
        line("商品", 1000, 1, ["item"]),
        line("8%対象 927円", 927, 8, ["item"]),
        line("読取不能 73円", 73, 9, ["item"]),
      ],
      { taxAmountsYen: [927, 73] },
    );

    expect(results[1]?.candidates[0]?.role).toBe("tax");
    expect(results[2]).toMatchObject({ status: "ambiguous" });
    expect(results[2]?.candidates.map((candidate) => candidate.role)).toEqual(
      expect.arrayContaining(["item", "unknown"]),
    );
  });

  it("内税という文字を含む商品名は税行にしない", () => {
    const [result] = classifyReceiptLines([line("内税対応商品 96円", 96, 1, ["item"])]);

    expect(result.candidates[0]?.role).toBe("item");
  });

  it("根拠の弱い金額行はunknown候補を残してambiguousにする", () => {
    const [result] = classifyReceiptLines([line("読取不能", 777, 3, ["unknown"])]);

    expect(result).toMatchObject({ status: "ambiguous" });
    expect(result.candidates[0]?.role).toBe("unknown");
  });
});

describe("isReceiptTotalLabel", () => {
  it.each([
    "合計 ¥2,508",
    "お買上計 ¥2,508",
    "お支払合計 ¥2,508",
    "今回支払額 ¥2,508",
    "ポイント利用後合計 ¥2,408",
    "Total ¥2,508",
  ])("%s を支払合計ラベルにする", (rawText) => {
    expect(isReceiptTotalLabel(rawText)).toBe(true);
  });

  it.each([
    "今回お買上げポイント 9P",
    "今回合計付与ポイント 9P",
    "ご利用ポイント合計 100pt",
    "累計ポイント 29P",
    "今月購入金額合計 12,345円（税抜）",
    "累計お買上金額 ¥30,000",
    "年間お買上合計 ¥30,000",
    "小計 ¥2,508",
    "合計 4点",
  ])("%s を支払合計ラベルにしない", (rawText) => {
    expect(isReceiptTotalLabel(rawText)).toBe(false);
  });

  it("ポイント行は合計候補に分類しない", () => {
    const [result] = classifyReceiptLines([line("今回お買上げポイント 9P", null, 16)]);

    expect(result.candidates.map((candidate) => candidate.role)).not.toContain("totalCandidate");
  });
});
