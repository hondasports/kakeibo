import { formatYen } from "../common/currency";
import { addDays } from "../common/date";
import { MAX_LINE_TEXT_LENGTH } from "../lineMessaging/limits";
import type { CategorySummary } from "../receipt/summary";

export const LINE_HELP_MESSAGE = [
  "家計簿の読み取り専用サマリーです。次から選ぶか、メッセージを送ってください。",
  "・今週 / サマリー",
  "・今週の支出",
  "・今週の収入",
  "・カテゴリ別",
  "・週別推移",
  "・カテゴリ名（例: 食費）",
  "・レシート画像をこのトークに送る",
  "・Webの入力画面で確認する",
].join("\n");

export const LINE_RECEIPT_GUIDE_MESSAGE = [
  "レシート画像をこのトークに送ってください。",
  "確認と登録はWebの入力画面で行います。LINE上では登録・編集・削除できません。",
].join("\n");

export const LINE_NO_GROUP_MESSAGE =
  "グループが未設定です。kakeiboのWebでグループを作成または参加してください。";

export const LINE_UNRESOLVED_GROUP_MESSAGE =
  "表示するグループが決まっていません。kakeiboのWebでグループを選択してください。";

export const LINE_SUMMARY_UNAVAILABLE_MESSAGE =
  "家計データを取得できませんでした。しばらくしてから、もう一度お試しください。";

export function formatLineYen(amount: number): string {
  return formatYen(amount);
}

export function formatWeekRange(weekStartDate: string): string {
  return `${weekStartDate}〜${addDays(weekStartDate, 6)}`;
}

export type WeekSummaryReplyInput = {
  weekStartDate: string;
  expenseCount: number;
  expenseTotalYen: number;
  incomeCount: number;
  incomeTotalYen: number;
  byCategory: CategorySummary[];
};

export type WeekTrendReplyInput = {
  weeks: Array<{
    weekStartDate: string;
    totalAmountYen: number;
  }>;
};

function clipReply(text: string): string {
  if (text.length <= MAX_LINE_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_LINE_TEXT_LENGTH - 1)}…`;
}

function formatAmountOrMissing(count: number, amountYen: number): string {
  if (count === 0) return "データなし";
  return formatLineYen(amountYen);
}

function formatCategoryLines(byCategory: CategorySummary[]): string[] {
  if (byCategory.length === 0) return ["内訳: データなし"];
  return [
    "内訳:",
    ...byCategory.map((entry) => `・${entry.categoryName} ${formatLineYen(entry.totalAmountYen)}`),
  ];
}

export function formatNoDataReply(
  kind: "summary" | "expense" | "income" | "categories" | "trend" | "category",
  weekStartDate?: string,
  categoryName?: string,
): string {
  if (kind === "trend") {
    return "直近3週間の支出データはありません。";
  }
  if (kind === "category") {
    return `今週の「${categoryName ?? "指定カテゴリ"}」の支出データはありません。`;
  }
  const range = weekStartDate ? `（${formatWeekRange(weekStartDate)}）` : "";
  if (kind === "expense") return `今週${range}の支出データはありません。`;
  if (kind === "income") return `今週${range}の収入データはありません。`;
  if (kind === "categories") return `今週${range}のカテゴリ別支出データはありません。`;
  return `今週${range}の家計データはありません。`;
}

export function formatWeekSummaryReply(input: WeekSummaryReplyInput): string {
  if (input.expenseCount === 0 && input.incomeCount === 0) {
    return formatNoDataReply("summary", input.weekStartDate);
  }
  return clipReply(
    [
      `今週（${formatWeekRange(input.weekStartDate)}）`,
      `支出: ${formatAmountOrMissing(input.expenseCount, input.expenseTotalYen)}`,
      `収入: ${formatAmountOrMissing(input.incomeCount, input.incomeTotalYen)}`,
      ...formatCategoryLines(input.byCategory),
    ].join("\n"),
  );
}

export function formatWeekExpenseReply(input: WeekSummaryReplyInput): string {
  if (input.expenseCount === 0) {
    return formatNoDataReply("expense", input.weekStartDate);
  }
  return `今週（${formatWeekRange(input.weekStartDate)}）の支出: ${formatLineYen(input.expenseTotalYen)}（${input.expenseCount}件）`;
}

export function formatWeekIncomeReply(input: WeekSummaryReplyInput): string {
  if (input.incomeCount === 0) {
    return formatNoDataReply("income", input.weekStartDate);
  }
  return `今週（${formatWeekRange(input.weekStartDate)}）の収入: ${formatLineYen(input.incomeTotalYen)}（${input.incomeCount}件）`;
}

export function formatWeekCategoriesReply(input: WeekSummaryReplyInput): string {
  if (input.expenseCount === 0) {
    return formatNoDataReply("categories", input.weekStartDate);
  }
  return clipReply(
    [
      `今週（${formatWeekRange(input.weekStartDate)}）`,
      ...formatCategoryLines(input.byCategory),
    ].join("\n"),
  );
}

export function formatCategoryReply(
  input: WeekSummaryReplyInput,
  categoryName: string,
  category: CategorySummary | undefined,
): string {
  if (category === undefined || category.totalAmountYen === 0) {
    return formatNoDataReply("category", input.weekStartDate, categoryName);
  }
  return `今週（${formatWeekRange(input.weekStartDate)}）の${category.categoryName}: ${formatLineYen(category.totalAmountYen)}（${category.count}件）`;
}

export function formatWeekTrendReply(input: WeekTrendReplyInput): string {
  const displayWeeks = input.weeks.slice(-3);
  const hasData = displayWeeks.some((week) => week.totalAmountYen > 0);
  if (!hasData) {
    return formatNoDataReply("trend");
  }

  const labels = ["2週前", "先週", "今週"];
  const startIndex = labels.length - displayWeeks.length;
  const lines = displayWeeks.map((week, index) => {
    const label = labels[startIndex + index] ?? week.weekStartDate;
    return `・${label}（${formatWeekRange(week.weekStartDate)}） ${formatLineYen(week.totalAmountYen)}`;
  });
  return clipReply(["直近3週間の支出", ...lines].join("\n"));
}
