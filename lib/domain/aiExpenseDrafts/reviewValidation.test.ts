import { describe, expect, it } from "vitest";
import {
  getReviewCategoryAggregateErrorMessage,
  getReviewDocumentTypeErrorMessage,
  getReviewFormErrorMessage,
  getReviewItemsErrorMessage,
  getReviewSubmitErrorMessage,
  type ReviewFormInput,
  type ReviewItemInput,
} from "./reviewValidation";

const baseForm: ReviewFormInput = {
  documentType: "receipt",
  shopName: "スーパー青葉",
  date: "2026-06-01",
  amountYen: "9120",
  categoryId: "cat-daily",
};

const validItem: ReviewItemInput = { itemName: "牛乳", amountYen: "200", categoryId: "cat-daily" };
const discountItem: ReviewItemInput = {
  itemName: "クーポン割引",
  amountYen: "-110",
  categoryId: "cat-daily",
};

describe("getReviewDocumentTypeErrorMessage", () => {
  it("unknown は書類種別未選択エラー", () => {
    expect(getReviewDocumentTypeErrorMessage("unknown")).toBe("書類種別を選択してください。");
  });

  it("receipt / convenience_payment はエラーなし", () => {
    expect(getReviewDocumentTypeErrorMessage("receipt")).toBeNull();
    expect(getReviewDocumentTypeErrorMessage("convenience_payment")).toBeNull();
  });
});

describe("getReviewFormErrorMessage", () => {
  it("店名が空の場合はエラー", () => {
    expect(
      getReviewFormErrorMessage({
        ...baseForm,
        shopName: "   ",
      }),
    ).toBe("店名・内容、支出日、金額、カテゴリを確認してください。");
  });

  it("実在しない支出日を拒否する", () => {
    expect(getReviewFormErrorMessage({ ...baseForm, date: "2026-02-30" })).not.toBeNull();
  });

  it("YYYY-MM-DD 以外の日付を拒否する", () => {
    expect(getReviewFormErrorMessage({ ...baseForm, date: "2026/06/01" })).not.toBeNull();
  });

  it("有効な入力はエラーなし", () => {
    expect(getReviewFormErrorMessage(baseForm)).toBeNull();
  });
});

describe("getReviewItemsErrorMessage", () => {
  it("割引対象の商品が未選択でも明細入力エラーにはしない（確認項目として残す）", () => {
    expect(getReviewItemsErrorMessage([discountItem])).toBeNull();
  });

  it("割引対象が選択済みならカテゴリ不足を通常の明細エラーとして扱う", () => {
    expect(
      getReviewItemsErrorMessage([
        {
          ...discountItem,
          categoryId: "",
          discountTargetItemId: "product",
        },
      ]),
    ).toBe("明細名、明細金額、カテゴリを確認してください。");
  });

  it("明細名が空の場合はエラー", () => {
    expect(
      getReviewItemsErrorMessage([
        {
          itemName: "  ",
          amountYen: "110",
          categoryId: "cat-daily",
        },
      ]),
    ).toBe("明細名、明細金額、カテゴリを確認してください。");
  });

  it("有効な明細はエラーなし", () => {
    expect(getReviewItemsErrorMessage([validItem])).toBeNull();
  });

  it("明示した販促調整は品名に値引き語がなくても負額を保存できる", () => {
    expect(
      getReviewItemsErrorMessage([
        {
          itemName: "M002 玉ねぎ3玉",
          lineType: "promotion_adjustment",
          amountYen: "-16",
          categoryId: "cat-food",
          discountTargetItemId: "product",
        },
      ]),
    ).toBeNull();
  });

  it("通常商品として指定した負額は保存させない", () => {
    expect(
      getReviewItemsErrorMessage([
        { itemName: "商品", lineType: "item", amountYen: "-16", categoryId: "cat-food" },
      ]),
    ).toBe("明細名、明細金額、カテゴリを確認してください。");
  });
});

describe("getReviewCategoryAggregateErrorMessage", () => {
  it("カテゴリ合計が 0 以下ならエラー", () => {
    expect(
      getReviewCategoryAggregateErrorMessage([
        { itemName: "商品", amountYen: "200", categoryId: "cat-daily" },
        { itemName: "クーポン割引", amountYen: "-200", categoryId: "cat-daily" },
      ]),
    ).toBe("割引後のカテゴリ金額は1円以上にしてください。");
  });

  it("カテゴリ合計が正ならエラーなし", () => {
    expect(getReviewCategoryAggregateErrorMessage([validItem])).toBeNull();
  });
});

describe("getReviewSubmitErrorMessage", () => {
  it("ドキュメント種別エラーを優先する", () => {
    expect(getReviewSubmitErrorMessage({ ...baseForm, documentType: "unknown" }, [validItem])).toBe(
      "書類種別を選択してください。",
    );
  });

  it("フォームエラーを優先する", () => {
    expect(getReviewSubmitErrorMessage({ ...baseForm, shopName: "" }, [validItem])).toBe(
      "店名・内容、支出日、金額、カテゴリを確認してください。",
    );
  });

  it("割引対象が未確定でも他の明細が有効なら保存を妨げない", () => {
    expect(getReviewSubmitErrorMessage(baseForm, [validItem, discountItem])).toBeNull();
  });

  it("明細エラーを優先する", () => {
    expect(
      getReviewSubmitErrorMessage(baseForm, [
        { itemName: "", amountYen: "110", categoryId: "cat-daily" },
      ]),
    ).toBe("明細名、明細金額、カテゴリを確認してください。");
  });

  it("カテゴリ集計エラーを最後に判定する", () => {
    expect(
      getReviewSubmitErrorMessage(baseForm, [
        { itemName: "商品", amountYen: "200", categoryId: "cat-daily" },
        {
          itemName: "クーポン割引",
          amountYen: "-200",
          categoryId: "cat-daily",
          discountTargetItemId: "product",
        },
      ]),
    ).toBe("割引後のカテゴリ金額は1円以上にしてください。");
  });

  it("有効な入力はエラーなし", () => {
    expect(getReviewSubmitErrorMessage(baseForm, [validItem])).toBeNull();
  });

  it("totalOnlyはOCR明細が不完全でも合計フォームだけで保存できる", () => {
    expect(
      getReviewSubmitErrorMessage({ ...baseForm, registrationMode: "totalOnly" }, [
        { itemName: "", amountYen: "", categoryId: "" },
      ]),
    ).toBeNull();
  });
});
