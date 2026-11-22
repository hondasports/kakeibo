import { describe, expect, it } from "vitest";
import {
  diffExpenseSearchFormState,
  EMPTY_EXPENSE_SEARCH_FORM,
  expenseSearchPath,
  parseExpenseSearchFormState,
  readExpenseSearchFormState,
  toExpenseSearchQueryArgs,
  validateExpenseSearchForm,
} from "./searchParams";

describe("expense search params", () => {
  it("URLから検索条件を読み取る", () => {
    const params = new URLSearchParams(
      "q=北浜&categoryId=cat-1&min=100&max=2000&from=2026-07-01&to=2026-07-31",
    );
    expect(readExpenseSearchFormState(params)).toEqual({
      entryType: "all",
      shopQuery: "北浜",
      categoryId: "cat-1",
      minAmountYen: "100",
      maxAmountYen: "2000",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
  });

  it("空の条件は /search になる", () => {
    expect(
      expenseSearchPath({
        entryType: "all",
        shopQuery: "  ",
        categoryId: "",
        minAmountYen: "",
        maxAmountYen: "",
        startDate: "",
        endDate: "",
      }),
    ).toBe("/search");
  });

  it("すべての条件をクエリへ載せる", () => {
    expect(
      expenseSearchPath({
        entryType: "expense",
        shopQuery: "北浜",
        categoryId: "cat-1",
        minAmountYen: "100",
        maxAmountYen: "2000",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      }),
    ).toBe(
      "/search?type=expense&q=%E5%8C%97%E6%B5%9C&categoryId=cat-1&min=100&max=2000&from=2026-07-01&to=2026-07-31",
    );
  });

  it("収入検索ではカテゴリ条件を持ち込まない", () => {
    expect(readExpenseSearchFormState(new URLSearchParams("type=income&categoryId=cat-1"))).toEqual(
      expect.objectContaining({ entryType: "income", categoryId: "" }),
    );
    expect(
      expenseSearchPath({
        ...EMPTY_EXPENSE_SEARCH_FORM,
        entryType: "income",
        categoryId: "cat-1",
      }),
    ).toBe("/search?type=income");
  });

  it("金額の下限が上限より大きい場合はエラーにする", () => {
    expect(
      parseExpenseSearchFormState({
        entryType: "all",
        shopQuery: "",
        categoryId: "",
        minAmountYen: "200",
        maxAmountYen: "100",
        startDate: "",
        endDate: "",
      }),
    ).toEqual({ ok: false, error: "金額の下限は上限以下にしてください" });
  });

  it("数字以外の金額を拒否する", () => {
    expect(
      parseExpenseSearchFormState({
        ...EMPTY_EXPENSE_SEARCH_FORM,
        minAmountYen: "12.5",
      }),
    ).toEqual({ ok: false, error: "金額は0以上の整数で指定してください" });
    expect(
      parseExpenseSearchFormState({
        ...EMPTY_EXPENSE_SEARCH_FORM,
        maxAmountYen: "abc",
      }),
    ).toEqual({ ok: false, error: "金額は0以上の整数で指定してください" });
  });

  it("不正な条件はConvex引数へ変換しない", () => {
    expect(
      toExpenseSearchQueryArgs({
        ...EMPTY_EXPENSE_SEARCH_FORM,
        minAmountYen: "200",
        maxAmountYen: "100",
      }),
    ).toEqual({ ok: false, error: "金額の下限は上限以下にしてください" });
  });

  it("検証エラーをフィールドごとに割り当てる", () => {
    const result = validateExpenseSearchForm({
      ...EMPTY_EXPENSE_SEARCH_FORM,
      minAmountYen: "200",
      maxAmountYen: "100",
      startDate: "2026-08-01",
      endDate: "2026-07-01",
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toEqual({
      minAmountYen: "金額の下限は上限以下にしてください",
      startDate: "開始日は終了日以前にしてください",
    });
    expect(result.formError).toBeNull();
  });

  it("数値でない金額はそのフィールドのエラーになる", () => {
    const result = validateExpenseSearchForm({
      ...EMPTY_EXPENSE_SEARCH_FORM,
      maxAmountYen: "abc",
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors.maxAmountYen).toBe("金額は0以上の整数で指定してください");
  });

  it("80文字を超えるキーワードはキーワード欄のエラーになる", () => {
    const result = validateExpenseSearchForm({
      ...EMPTY_EXPENSE_SEARCH_FORM,
      shopQuery: "あ".repeat(81),
    });

    expect(result.fieldErrors.shopQuery).toBe("検索語は80文字以内で指定してください");
  });

  it("不正な日付形式は日付フィールドのエラーになる", () => {
    const result = validateExpenseSearchForm({
      ...EMPTY_EXPENSE_SEARCH_FORM,
      endDate: "2026-13-99",
    });

    expect(result.fieldErrors.endDate).toBe("日付はYYYY-MM-DD形式で指定してください");
  });

  it("長大な期間は日付フィールドのエラーになる", () => {
    const result = validateExpenseSearchForm({
      ...EMPTY_EXPENSE_SEARCH_FORM,
      startDate: "1900-01-01",
      endDate: "2200-12-31",
    });

    expect(result.fieldErrors.startDate).toContain("か月以内で指定してください");
  });

  it("正常な条件はエラーなし", () => {
    const result = validateExpenseSearchForm(EMPTY_EXPENSE_SEARCH_FORM);
    expect(result).toEqual({ ok: true, fieldErrors: {}, formError: null });
  });

  it("変わった項目だけを差分として返す", () => {
    expect(
      diffExpenseSearchFormState(
        { ...EMPTY_EXPENSE_SEARCH_FORM, shopQuery: "店", minAmountYen: "100" },
        { ...EMPTY_EXPENSE_SEARCH_FORM, minAmountYen: "100", endDate: "2026-08-01" },
      ),
    ).toEqual({ shopQuery: "", endDate: "2026-08-01" });
  });

  it("正規化した条件をConvex引数へ変換する", () => {
    expect(
      toExpenseSearchQueryArgs({
        entryType: "all",
        shopQuery: " 北浜 ",
        categoryId: "cat-1",
        minAmountYen: "100",
        maxAmountYen: "",
        startDate: "2026-07-01",
        endDate: "",
      }),
    ).toEqual({
      ok: true,
      args: {
        entryType: "all",
        shopQuery: "北浜",
        categoryId: "cat-1",
        minAmountYen: 100,
        maxAmountYen: undefined,
        startDate: "2026-07-01",
        endDate: undefined,
      },
    });
  });
});
