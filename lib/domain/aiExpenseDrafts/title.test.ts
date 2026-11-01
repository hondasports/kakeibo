import { describe, expect, it } from "vitest";
import { getDraftTitle } from "./title";
import { resolveReceiptShopNameFromDraft } from "./shopName";

describe("getDraftTitle", () => {
  it("レシートは店名を優先する", () => {
    expect(getDraftTitle({ documentType: "receipt", shopName: "ドラッグストアA" })).toBe(
      "ドラッグストアA",
    );
  });

  it("払込票は支払先と目的を結合して優先する", () => {
    expect(
      getDraftTitle({
        documentType: "convenience_payment",
        payeeName: "大阪市水道局",
        paymentPurpose: "水道料金",
      }),
    ).toBe("大阪市水道局 水道料金");
  });

  it("払込票で支払先・目的が空の場合は店名を fallback にする", () => {
    expect(
      getDraftTitle({
        documentType: "convenience_payment",
        shopName: "コンビニ払込",
      }),
    ).toBe("コンビニ払込");
  });

  it.each([
    [
      {
        payeeName: "電力会社",
        paymentPurpose: "電気代",
        paymentPlace: "ファミマ",
        shopName: "ローソン",
      },
      "電力会社 電気代",
    ],
    [{ payeeName: "電力会社" }, "電力会社"],
    [{ paymentPurpose: "電気代" }, "電気代"],
    [
      { payeeName: "  ", paymentPurpose: " ", paymentPlace: "ファミマ", shopName: "ローソン" },
      "ファミマ",
    ],
    [{ shopName: "ローソン" }, "ローソン"],
    [{}, "不明"],
  ])("払込票の表示と登録店名が一致する", (fields, expected) => {
    const draft = { documentType: "convenience_payment" as const, ...fields };
    expect(getDraftTitle(draft, "不明")).toBe(expected);
    expect(resolveReceiptShopNameFromDraft(draft)).toBe(expected);
  });

  it("店名の前後空白は除去される", () => {
    expect(getDraftTitle({ shopName: "  ドラッグストアA  " })).toBe("ドラッグストアA");
  });

  it("店名が空の場合は payeeName / paymentPlace の順で fallback する", () => {
    expect(getDraftTitle({ payeeName: "電力会社" })).toBe("電力会社");
    expect(getDraftTitle({ paymentPlace: "郵便局" })).toBe("郵便局");
  });

  it("何もない場合は既定の fallback を返す", () => {
    expect(getDraftTitle({})).toBe("AI支出下書き");
  });

  it("fallback をカスタムできる", () => {
    expect(getDraftTitle({}, "不明")).toBe("不明");
  });

  it("払込票で支払情報の空白は無視される", () => {
    expect(
      getDraftTitle({
        documentType: "convenience_payment",
        payeeName: "  ",
        paymentPurpose: "  ",
        shopName: "店名",
      }),
    ).toBe("店名");
  });
});
