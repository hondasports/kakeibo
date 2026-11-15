import { describe, expect, it } from "vitest";
import { resolveReceiptShopNameFromDraft } from "./shopName";

describe("resolveReceiptShopNameFromDraft", () => {
  it("レシートは shopName を優先する", () => {
    expect(
      resolveReceiptShopNameFromDraft({ documentType: "receipt", shopName: "  ファミマ  " }),
    ).toBe("ファミマ");
  });

  it("レシートで shopName がなければ payeeName/paymentPlace を fallback する", () => {
    expect(
      resolveReceiptShopNameFromDraft({ documentType: "receipt", payeeName: "電力会社" }),
    ).toBe("電力会社");
    expect(
      resolveReceiptShopNameFromDraft({ documentType: "receipt", paymentPlace: "オンライン" }),
    ).toBe("オンライン");
  });

  it("convenience_payment は payeeName + paymentPurpose を優先する", () => {
    expect(
      resolveReceiptShopNameFromDraft({
        documentType: "convenience_payment",
        payeeName: "電力",
        paymentPurpose: "  6月分  ",
      }),
    ).toBe("電力 6月分");
  });

  it("不明なときは 不明 を返す", () => {
    expect(resolveReceiptShopNameFromDraft({ documentType: "unknown" })).toBe("不明");
  });
});

describe("shop name conversions", () => {
  it("レシート下書きは shopName を receipts.shopName に変換する", () => {
    expect(
      resolveReceiptShopNameFromDraft({
        documentType: "receipt",
        shopName: "スーパー青葉",
        paymentPlace: "支払場所",
        payeeName: "支払先",
        paymentPurpose: "支払内容",
      }),
    ).toBe("スーパー青葉");
  });

  it("コンビニ払込票下書きは支払先と支払内容を優先して receipts.shopName に変換する", () => {
    expect(
      resolveReceiptShopNameFromDraft({
        documentType: "convenience_payment",
        shopName: "セブンイレブン",
        paymentPlace: "セブンイレブン",
        payeeName: "東京都",
        paymentPurpose: "自動車税",
      }),
    ).toBe("東京都 自動車税");
  });

  it("コンビニ払込票で支払先がない場合は支払場所を receipts.shopName に変換する", () => {
    expect(
      resolveReceiptShopNameFromDraft({
        documentType: "convenience_payment",
        paymentPlace: "ローソン",
      }),
    ).toBe("ローソン");
  });
});
