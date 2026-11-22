/**
 * 月次インサイト: 集計値に基づく傾向コメントの生成・検証。
 * 外部に送信するのはカテゴリ別の集計値のみ。明細・店名・メモ・識別子は送らない。
 */

export type MonthlyInsightCategoryPoint = {
  /** 同名カテゴリが複数ある場合の比較用。無い集計では名前で比較する */
  categoryId?: string;
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

const FULL_WIDTH_DIGITS = "０１２３４５６７８９";
const YEN_PATTERN = /([0-9０-９][0-9０-９,.]*)(万|億)?円/g;

function toHalfWidth(value: string): string {
  return [...value]
    .map((ch) => {
      const index = FULL_WIDTH_DIGITS.indexOf(ch);
      return index >= 0 ? String(index) : ch;
    })
    .join("");
}

/** 生成文中の「◯◯円」「◯万円」金額を円単位で抽出する（全角数字も対象）。 */
export function extractYenAmounts(text: string): number[] {
  return [...text.matchAll(YEN_PATTERN)].map((m) => {
    const base = Number(toHalfWidth(m[1]).replace(/,/g, ""));
    const multiplier = m[2] === "万" ? 10_000 : m[2] === "億" ? 100_000_000 : 1;
    // 「1.13万円」= 11299.999… の浮動小数点誤差を円整数へ丸める
    return Math.round(base * multiplier);
  });
}

/** カテゴリIDが両方あるときはIDで、無い場合は名前で同一カテゴリを判定する。 */
function sameCategory(a: MonthlyInsightCategoryPoint, b: MonthlyInsightCategoryPoint): boolean {
  if (a.categoryId !== undefined && b.categoryId !== undefined) {
    return a.categoryId === b.categoryId;
  }
  return a.categoryName === b.categoryName;
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
    for (const c of input.current.byCategory) {
      const prev = input.previous.byCategory.find((p) => sameCategory(p, c));
      if (prev !== undefined) {
        amounts.add(c.amountYen - prev.amountYen);
        amounts.add(prev.amountYen - c.amountYen);
      }
    }
  }
  return amounts;
}

// 要因・理由を断定する語。生成文に含まれたら採用しない
const CAUSAL_PATTERN = /(ため|せい|原因|要因)/;
// 前月データが無いのに増減・前月比を述べる語。previous が無いとき拒否する
const COMPARISON_PATTERN = /(前月|増|減|%|％)/;

/**
 * 生成文の全ての円金額が入力集計値（またはその差額）と一致するか。
 * 比較元に無い数値を述べるコメント、要因を断定するコメント、
 * 前月データが無いのに増減・前月比に触れるコメントは採用しない。
 */
export function insightNumbersAreConsistent(text: string, input: MonthlyInsightInput): boolean {
  if (CAUSAL_PATTERN.test(text)) return false;
  if (input.previous === null && COMPARISON_PATTERN.test(text)) return false;
  const allowed = collectAllowedAmounts(input);
  return extractYenAmounts(text).every((n) => allowed.has(n));
}

function describeCategory(displayName: string, p: MonthlyInsightCategoryPoint): string {
  return `${displayName}: ${p.amountYen}円（${p.count}件）`;
}

/** カテゴリ記号の生成。26件までは カテゴリA〜Z、以降は カテゴリ27〜 */
function categorySymbolForIndex(index: number): string {
  return index < 26 ? `カテゴリ${String.fromCharCode(65 + index)}` : `カテゴリ${index + 1}`;
}

/**
 * 入力の各カテゴリに外部送信向けの記号（カテゴリA・B…）を割り当てる。
 * 当月・前月で同一カテゴリには同じ記号を割る（categoryId か名前で同一判定）。
 */
export function categorySymbolsForInput(
  input: MonthlyInsightInput,
): { point: MonthlyInsightCategoryPoint; symbol: string }[] {
  const result: { point: MonthlyInsightCategoryPoint; symbol: string }[] = [];
  const assign = (points: MonthlyInsightMonthPoint) => {
    for (const c of points.byCategory) {
      if (result.some((r) => sameCategory(r.point, c))) continue;
      result.push({ point: c, symbol: categorySymbolForIndex(result.length) });
    }
  };
  assign(input.current);
  if (input.previous) assign(input.previous);
  return result;
}

function symbolFor(
  entries: { point: MonthlyInsightCategoryPoint; symbol: string }[],
  p: MonthlyInsightCategoryPoint,
): string {
  return entries.find((r) => sameCategory(r.point, p))?.symbol ?? "カテゴリ不明";
}

/**
 * 生成文内のカテゴリ記号を実名に戻す（サーバー側でのみ実行）。
 * 記号は外部APIへ送ったプロンプトのものと対応している。
 */
export function replaceCategorySymbols(text: string, input: MonthlyInsightInput): string {
  const entries = categorySymbolsForInput(input);
  if (entries.length === 0) return text;
  // 置換は元テキストを一括走査する。実名に記号と同じ文字列（例:「カテゴリB」
  // というカテゴリ）が含まれても、戻した名前を再置換しない。
  const pattern = new RegExp(
    entries
      .map((e) => e.symbol)
      .sort((a, b) => b.length - a.length)
      .join("|"),
    "g",
  );
  const nameBySymbol = new Map(entries.map((e) => [e.symbol, e.point.categoryName]));
  return text.replace(pattern, (matched) => nameBySymbol.get(matched) ?? matched);
}

/**
 * OpenAI へ送るプロンプト。金額・件数の集計値とカテゴリ記号のみを含め、
 * カテゴリ名・明細・店名は送らない。要因断定・創作を禁止する。
 */
export function buildMonthlyInsightPrompt(input: MonthlyInsightInput): string {
  const symbols = categorySymbolsForInput(input);
  const lines: string[] = [
    "あなたは家計簿アプリの月次振り返りコメントを書くアシスタントです。",
    "以下の集計値だけを根拠に、150字程度の日本語コメントを1つ書いてください。",
    "ルール:",
    "- 提示された数値（または当月と前月の差額）以外の金額を書かない",
    "- 明細・店名・商品名を推測して書かない（入力に含まれないため断定できない）",
    "- 増減の要因を断定しない（「◯◯が増えた」まで。理由は書かない）",
    "- 前月データが無い場合は増減・前月比に一切触れない",
    "- カテゴリには「カテゴリA」のような記号で言及し、その記号をそのまま使う",
    "- 家計への共感を添える簡潔な文体にする",
    "",
    `対象月: ${input.month}`,
    `当月: 支出合計 ${input.current.totalAmountYen}円（${input.current.count}件）・収入合計 ${input.current.totalIncomeYen}円`,
    "当月カテゴリ別支出:",
    ...input.current.byCategory.map((c) => `- ${describeCategory(symbolFor(symbols, c), c)}`),
  ];
  if (input.previous) {
    lines.push(
      "",
      `前月: 支出合計 ${input.previous.totalAmountYen}円（${input.previous.count}件）・収入合計 ${input.previous.totalIncomeYen}円`,
      "前月カテゴリ別支出:",
      ...input.previous.byCategory.map((c) => `- ${describeCategory(symbolFor(symbols, c), c)}`),
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

/** 保存済みコメントを再生成せず再利用する期間（有料API呼出しの節約） */
export const INSIGHT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** グループ×月あたりの再生成回数上限（初回の生成は含まない。有料API呼出しの上限） */
export const INSIGHT_MAX_REGENERATIONS = 3;
/** 生成枠の予約が失効するまでの時間。予約してからこの時間内に保存されなければ別の生成を許可する */
export const INSIGHT_RESERVATION_TTL_MS = 60 * 1000;

/** "YYYY-MM" 形式か（存在する月か）。 */
export function isValidMonthString(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/** JST で現在の月を "YYYY-MM" で返す（未来月の拒否に使う）。 */
export function currentMonthInJapanTime(nowMs: number): string {
  return new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

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
      const prevTop = input.previous.byCategory.find((c) => sameCategory(c, top));
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
