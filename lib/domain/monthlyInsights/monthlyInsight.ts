/**
 * 月次インサイト: 集計値に基づく傾向コメントの生成・検証。
 * 外部に送信するのはカテゴリ別の集計値のみ。明細・店名・メモ・識別子は送らない。
 */

export type MonthlyInsightCategoryPoint = {
  categoryName: string;
  amountYen: number;
  count: number;
};

export type MonthlyInsightMonthPoint = {
  totalAmountYen: number;
  totalIncomeYen: number;
  count: number;
  byCategory: MonthlyInsightCategoryPoint[];
};

export type MonthlyInsightInput = {
  month: string; // "YYYY-MM"
  current: MonthlyInsightMonthPoint;
  /** 前月データが比較できる場合のみ。無い場合は増減を述べない */
  previous: MonthlyInsightMonthPoint | null;
};

export function getPreviousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}

const YEN_PATTERN = /([0-9][0-9,]*)円/g;

/** 生成文中の「◯◯円」金額を抽出する。 */
export function extractYenAmounts(text: string): number[] {
  return [...text.matchAll(YEN_PATTERN)].map((m) => Number(m[1].replace(/,/g, "")));
}

function collectAllowedAmounts(input: MonthlyInsightInput): Set<number> {
  const amounts = new Set<number>();
  const add = (p: MonthlyInsightMonthPoint) => {
    amounts.add(p.totalAmountYen);
    amounts.add(p.totalIncomeYen);
    for (const c of p.byCategory) amounts.add(c.amountYen);
  };
  add(input.current);
  if (input.previous) add(input.previous);
  if (input.previous) {
    // 差額も許容する（比較元2値から直接計算できる数値のみ）
    amounts.add(input.current.totalAmountYen - input.previous.totalAmountYen);
    amounts.add(input.previous.totalAmountYen - input.current.totalAmountYen);
    const prevByName = new Map(input.previous.byCategory.map((c) => [c.categoryName, c.amountYen]));
    for (const c of input.current.byCategory) {
      const prev = prevByName.get(c.categoryName);
      if (prev !== undefined) {
        amounts.add(c.amountYen - prev);
        amounts.add(prev - c.amountYen);
      }
    }
  }
  return amounts;
}

/**
 * 生成文の全ての円金額が入力集計値（またはその差額）と一致するか。
 * 比較元に無い数値を述べるコメントは採用しない。
 */
export function insightNumbersAreConsistent(text: string, input: MonthlyInsightInput): boolean {
  const allowed = collectAllowedAmounts(input);
  return extractYenAmounts(text).every((n) => allowed.has(n));
}

function describeCategory(p: MonthlyInsightCategoryPoint): string {
  return `${p.categoryName}: ${p.amountYen}円（${p.count}件）`;
}

/** OpenAI へ送るプロンプト。集計値のみを含め、要因断定・創作を禁止する。 */
export function buildMonthlyInsightPrompt(input: MonthlyInsightInput): string {
  const lines: string[] = [
    "あなたは家計簿アプリの月次振り返りコメントを書くアシスタントです。",
    "以下の集計値だけを根拠に、150字程度の日本語コメントを1つ書いてください。",
    "ルール:",
    "- 提示された数値（または当月と前月の差額）以外の金額を書かない",
    "- 明細・店名・商品名を推測して書かない（入力に含まれないため断定できない）",
    "- 増減の要因を断定しない（「◯◯が増えた」まで。理由は書かない）",
    "- 前月データが無い場合は増減・前月比に一切触れない",
    "- 家計への共感を添える簡潔な文体にする",
    "",
    `対象月: ${input.month}`,
    `当月: 支出合計 ${input.current.totalAmountYen}円（${input.current.count}件）・収入合計 ${input.current.totalIncomeYen}円`,
    "当月カテゴリ別支出:",
    ...input.current.byCategory.map((c) => `- ${describeCategory(c)}`),
  ];
  if (input.previous) {
    lines.push(
      "",
      `前月: 支出合計 ${input.previous.totalAmountYen}円（${input.previous.count}件）・収入合計 ${input.previous.totalIncomeYen}円`,
      "前月カテゴリ別支出:",
      ...input.previous.byCategory.map((c) => `- ${describeCategory(c)}`),
    );
  } else {
    lines.push("", "前月データ: なし（増減には触れない）");
  }
  return lines.join("\n");
}

function topCategory(p: MonthlyInsightMonthPoint): MonthlyInsightCategoryPoint | null {
  return p.byCategory.reduce<MonthlyInsightCategoryPoint | null>(
    (top, c) => (top === null || c.amountYen > top.amountYen ? c : top),
    null,
  );
}

/**
 * AI生成を使わない（または検証に落ちた）場合の定型コメント。
 * 入力集計値だけで組み立て、比較データが無ければ増減を述べない。
 */
const formatYen = (n: number) => n.toLocaleString("ja-JP");

export function buildFallbackInsight(input: MonthlyInsightInput): string {
  const parts: string[] = [
    `${input.month}の支出は合計${formatYen(input.current.totalAmountYen)}円（${input.current.count}件）でした。`,
  ];
  const top = topCategory(input.current);
  if (top && input.current.totalAmountYen > 0) {
    parts.push(`支出の中心は${top.categoryName}の${formatYen(top.amountYen)}円です。`);
  }
  if (input.previous) {
    const diff = input.current.totalAmountYen - input.previous.totalAmountYen;
    if (diff !== 0) {
      const direction = diff > 0 ? "増加" : "減少";
      parts.push(`支出合計は前月と比べて${formatYen(Math.abs(diff))}円${direction}しています。`);
    }
    if (top) {
      const prevTop = input.previous.byCategory.find((c) => c.categoryName === top.categoryName);
      if (prevTop) {
        const catDiff = top.amountYen - prevTop.amountYen;
        if (catDiff !== 0) {
          parts.push(
            `${top.categoryName}は前月と比べて${formatYen(Math.abs(catDiff))}円${catDiff > 0 ? "増" : "減"}です。`,
          );
        }
      }
    }
  }
  return parts.join("");
}
