import { describe, expect, it } from "vitest";
import {
  buildFallbackInsight,
  currentMonthInJapanTime,
  INSIGHT_CACHE_TTL_MS,
  INSIGHT_MAX_GENERATIONS,
  isValidMonthString,
  buildMonthlyInsightPrompt,
  extractYenAmounts,
  getPreviousMonth,
  insightNumbersAreConsistent,
  replaceCategorySymbols,
  type MonthlyInsightInput,
} from "./monthlyInsight";

const INPUT: MonthlyInsightInput = {
  month: "2025-02",
  current: {
    totalAmountYen: 80000,
    totalIncomeYen: 300000,
    count: 42,
    byCategory: [
      { categoryName: "食費", amountYen: 40000, count: 20 },
      { categoryName: "日用品", amountYen: 10000, count: 5 },
    ],
  },
  previous: {
    totalAmountYen: 70000,
    totalIncomeYen: 300000,
    count: 40,
    byCategory: [
      { categoryName: "食費", amountYen: 35000, count: 18 },
      { categoryName: "日用品", amountYen: 9000, count: 4 },
    ],
  },
};

describe("getPreviousMonth", () => {
  it("年またぎと通常月を返す", () => {
    expect(getPreviousMonth("2025-01")).toBe("2024-12");
    expect(getPreviousMonth("2025-11")).toBe("2025-10");
  });
});

describe("月バリデーション・生成上限の定数", () => {
  it("YYYY-MM 形式のみ受理する", () => {
    expect(isValidMonthString("2026-11")).toBe(true);
    expect(isValidMonthString("2026-13")).toBe(false);
    expect(isValidMonthString("2026-00")).toBe(false);
    expect(isValidMonthString("2026/11")).toBe(false);
    expect(isValidMonthString("2026-1")).toBe(false);
  });
  it("JST で現在月を返す（月初・月末のUTCずれを含む）", () => {
    // 2026-11-01T00:30 JST = 2026-10-31T15:30 UTC
    expect(currentMonthInJapanTime(Date.UTC(2026, 9, 31, 15, 30))).toBe("2026-11");
    // 2026-10-31T23:30 JST = 2026-10-31T14:30 UTC
    expect(currentMonthInJapanTime(Date.UTC(2026, 9, 31, 14, 30))).toBe("2026-10");
  });
  it("キャッシュTTLは24時間・上限は3回", () => {
    expect(INSIGHT_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(INSIGHT_MAX_GENERATIONS).toBe(3);
  });
});

describe("extractYenAmounts", () => {
  it("円の金額を抽出しカンマを除去する", () => {
    expect(extractYenAmounts("食費は40,000円、日用品は10,000円でした。")).toEqual([40000, 10000]);
    expect(extractYenAmounts("コメントのみ")).toEqual([]);
  });
});

describe("insightNumbersAreConsistent", () => {
  it("入力集計値と差額のみを含む文は一致", () => {
    expect(insightNumbersAreConsistent("支出は80,000円。食費は前月比5,000円増です。", INPUT)).toBe(
      true,
    );
  });
  it("入力に無い金額を含む文は不一致", () => {
    expect(insightNumbersAreConsistent("支出は90,000円でした。", INPUT)).toBe(false);
  });
  it("円金額を含まない文は一致", () => {
    expect(insightNumbersAreConsistent("今月もおつかれさまでした。", INPUT)).toBe(true);
  });
  it("前月データが無いとき前月由来の金額を含む文は不一致", () => {
    const noPrev = { ...INPUT, previous: null };
    expect(insightNumbersAreConsistent("前月は70,000円でした。", noPrev)).toBe(false);
  });
  it("前月データが無いとき増減・前月比・割合に触れる文は不一致", () => {
    const noPrev = { ...INPUT, previous: null };
    for (const text of [
      "支出は前月より増えています。",
      "食費が減少しました。",
      "支出が30%増です。",
      "食費の割合が増えました。",
    ]) {
      expect(insightNumbersAreConsistent(text, noPrev)).toBe(false);
    }
  });
  it("要因・理由を断定する文は前月の有無に関わらず不一致", () => {
    for (const text of [
      "食費が増えたため支出が膨らみました。",
      "外食のせいで食費が増加しました。",
      "原因は日用品の買い増しです。",
      "要因は交際費の増加です。",
    ]) {
      expect(insightNumbersAreConsistent(text, INPUT)).toBe(false);
    }
  });
});

describe("buildMonthlyInsightPrompt", () => {
  it("カテゴリは記号に置き換え、実名を送らない", () => {
    const prompt = buildMonthlyInsightPrompt(INPUT);
    expect(prompt).toContain("カテゴリA: 40000円（20件）");
    expect(prompt).toContain("カテゴリB: 10000円（5件）");
    expect(prompt).not.toContain("食費");
    expect(prompt).not.toContain("日用品");
    expect(prompt).toContain("前月: 支出合計 70000円");
    expect(prompt).toContain("要因を断定しない");
  });
  it("前月なしなら増減禁止の指示を含む", () => {
    const prompt = buildMonthlyInsightPrompt({ ...INPUT, previous: null });
    expect(prompt).toContain("前月データ: なし");
    expect(prompt).not.toContain("前月: 支出合計");
  });
});

describe("replaceCategorySymbols", () => {
  it("生成文内の記号を実名に戻す", () => {
    const text = replaceCategorySymbols(
      "支出の中心はカテゴリAの40,000円です。カテゴリBは10,000円でした。",
      INPUT,
    );
    expect(text).toBe("支出の中心は食費の40,000円です。日用品は10,000円でした。");
  });
  it("実名に記号と同じ文字列が含まれても二重置換しない", () => {
    const input: MonthlyInsightInput = {
      ...INPUT,
      current: {
        ...INPUT.current,
        byCategory: [
          { categoryName: "カテゴリB", amountYen: 40000, count: 20 },
          { categoryName: "日用品", amountYen: 10000, count: 5 },
        ],
      },
    };
    expect(replaceCategorySymbols("カテゴリAの40,000円、カテゴリBの10,000円。", input)).toBe(
      "カテゴリBの40,000円、日用品の10,000円。",
    );
  });
  it("前月にしか無いカテゴリにも記号を割り当てる", () => {
    const input: MonthlyInsightInput = {
      ...INPUT,
      current: {
        ...INPUT.current,
        byCategory: [{ categoryName: "食費", amountYen: 40000, count: 20 }],
      },
    };
    expect(replaceCategorySymbols("カテゴリBが増えました。", input)).toBe("日用品が増えました。");
  });
});

describe("buildFallbackInsight", () => {
  it("合計・最多カテゴリ・前月差を含む", () => {
    const text = buildFallbackInsight(INPUT);
    expect(text).toContain("80,000円");
    expect(text).toContain("食費の40,000円");
    expect(text).toContain("10,000円増加");
    expect(insightNumbersAreConsistent(text, INPUT)).toBe(true);
  });
  it("前月なしなら増減を述べない", () => {
    const text = buildFallbackInsight({ ...INPUT, previous: null });
    expect(text).not.toContain("前月");
    expect(insightNumbersAreConsistent(text, { ...INPUT, previous: null })).toBe(true);
  });
});

describe("extractYenAmounts", () => {
  it("全角数字・万・億の金額も円で抽出する", () => {
    expect(extractYenAmounts("９万円と1,200円と1億円")).toEqual([90000, 1200, 100000000]);
    expect(extractYenAmounts("1.13万円")).toEqual([11300]);
  });
});

describe("insightNumbersAreConsistent: 単位表記の拒否", () => {
  it("入力に無い「9万円」は不一致として拒否する", () => {
    const input = {
      month: "2026-11",
      current: { totalAmountYen: 5000, totalIncomeYen: 0, count: 2, byCategory: [] },
      previous: null,
    };
    expect(insightNumbersAreConsistent("支出は9万円でした", input)).toBe(false);
  });
});

describe("buildFallbackInsight: 同名カテゴリ", () => {
  it("categoryIdで前月比較し、同名の別カテゴリは使わない", () => {
    const input = {
      month: "2026-11",
      current: {
        totalAmountYen: 5000,
        totalIncomeYen: 0,
        count: 2,
        byCategory: [
          { categoryId: "a", categoryName: "食費", amountYen: 3000, count: 1 },
          { categoryId: "b", categoryName: "食費", amountYen: 2000, count: 1 },
        ],
      },
      previous: {
        totalAmountYen: 4000,
        totalIncomeYen: 0,
        count: 1,
        byCategory: [
          { categoryId: "b", categoryName: "食費", amountYen: 2500, count: 1 },
          { categoryId: "a", categoryName: "食費", amountYen: 1500, count: 1 },
        ],
      },
    };
    // top は categoryId=a（3000円）→ 前月の a=1500 と比較し +1500円増
    const text = buildFallbackInsight(input);
    expect(text).toContain("食費は前月と比べて1,500円増");
  });
});
