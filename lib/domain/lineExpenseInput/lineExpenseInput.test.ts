import { describe, expect, it } from "vitest";
import { parseLineExpenseInput } from "./lineExpenseInput";

describe("parseLineExpenseInput", () => {
  it("内容＋金額を解析する", () => {
    expect(parseLineExpenseInput("コンビニ 500")).toEqual({ title: "コンビニ", amountYen: 500 });
    expect(parseLineExpenseInput("食費 1,200円")).toEqual({ title: "食費", amountYen: 1200 });
    expect(parseLineExpenseInput("500 コンビニ")).toEqual({ title: "コンビニ", amountYen: 500 });
    expect(parseLineExpenseInput("電車代４００円")).toEqual({ title: "電車代", amountYen: 400 });
    expect(parseLineExpenseInput("100均 500")).toEqual({ title: "100均", amountYen: 500 });
    expect(parseLineExpenseInput("Amazon 500")).toEqual({ title: "Amazon", amountYen: 500 });
  });
  it("全角カンマを含む金額を桁区切りとして解析する", () => {
    expect(parseLineExpenseInput("食費 １，２００円")).toEqual({ title: "食費", amountYen: 1200 });
    expect(parseLineExpenseInput("食費 1，200円")).toEqual({ title: "食費", amountYen: 1200 });
    expect(parseLineExpenseInput("食費 １２，３４５")).toEqual({ title: "食費", amountYen: 12345 });
  });
  it("内容の全角数字はそのまま保持する", () => {
    // カテゴリ名「１００均」のような全角数字を含む内容を半角へ潰さない
    expect(parseLineExpenseInput("１００均 500")).toEqual({ title: "１００均", amountYen: 500 });
    expect(parseLineExpenseInput("１００均 １，２００")).toEqual({
      title: "１００均",
      amountYen: 1200,
    });
  });
  it("金額のみ・内容のみ・コマンド語は受理しない", () => {
    expect(parseLineExpenseInput("500")).toBeNull();
    expect(parseLineExpenseInput("コンビニ")).toBeNull();
    expect(parseLineExpenseInput("今週の支出")).toBeNull();
    expect(parseLineExpenseInput("")).toBeNull();
  });
  it("範囲外の金額は受理しない", () => {
    expect(parseLineExpenseInput("何か 0円")).toBeNull();
    expect(parseLineExpenseInput("何か 10000000円")).toBeNull();
  });
});
