/**
 * LINE読み取り専用サマリーのコマンド解釈。
 * 家計データへ触れず、テキストだけを意図へ変換する。
 */

import { lineRichMenuCells } from "./richMenu";

export type LineSummaryCommand =
  | { type: "week_summary" }
  | { type: "week_expense" }
  | { type: "week_income" }
  | { type: "week_categories" }
  | { type: "week_trend" }
  | { type: "help" }
  | { type: "receipt_guide" }
  | { type: "category_lookup"; name: string };

const WEEK_SUMMARY_COMMANDS = new Set(["今週", "サマリー", "家計簿", "合計", "今週の家計"]);
const WEEK_EXPENSE_COMMANDS = new Set(["今週の支出", "支出合計", "支出"]);
const WEEK_INCOME_COMMANDS = new Set(["今週の収入", "収入合計", "収入"]);
const WEEK_CATEGORY_COMMANDS = new Set(["カテゴリ別", "カテゴリー別", "内訳"]);
const WEEK_TREND_COMMANDS = new Set(["週別推移", "週次推移", "推移"]);
const HELP_COMMANDS = new Set(["ヘルプ", "使い方", "help", "?", "？"]);
const RECEIPT_GUIDE_COMMANDS = new Set(["レシートを送る", "レシート", "画像を送る"]);
const POSTBACK_HELP_COMMAND_TEXT = "使い方";
const WRITE_REQUEST_PATTERN = /登録|削除|更新|編集/;
const GREETING_OR_META_HELP_PATTERN = /^(こんにちは|こんばんは|おはよう|何ができる|なにができる)$/;
const TRAILING_CUE_PATTERN =
  /(してください|して下さい|ください|下さい|教えてくれ|見せてくれ|教えて|見せて|して|はいくら|いくら|どれくらい|どのくらい|どれぐらい|どのぐらい|ですか|なの|です)$/;
const LEADING_WEEK_PATTERN = /^(今月じゃなくて|今週の|今週)/;
const KNOWN_COMMAND_LEFTOVERS = new Set([
  ...WEEK_SUMMARY_COMMANDS,
  ...WEEK_EXPENSE_COMMANDS,
  ...WEEK_INCOME_COMMANDS,
  ...WEEK_CATEGORY_COMMANDS,
  ...WEEK_TREND_COMMANDS,
  ...HELP_COMMANDS,
  ...RECEIPT_GUIDE_COMMANDS,
]);

const RICH_MENU_POSTBACK_COMMAND_TEXT = new Map<string, string>([
  ...lineRichMenuCells.map((cell) => [cell.id, cell.messageText] as const),
  ...lineRichMenuCells.map((cell) => [cell.messageText, cell.messageText] as const),
]);

function normalizeLineCommandText(messageText: string): string {
  return messageText
    .replaceAll("\u3000", " ")
    .replace(/[？?！!。．.、，,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactLineCommandText(normalized: string): string {
  return normalized.replace(/\s+/g, "");
}

function parseExactCommand(normalized: string): LineSummaryCommand | undefined {
  const lowered = normalized.toLowerCase();
  if (normalized.length === 0 || HELP_COMMANDS.has(lowered)) {
    return { type: "help" };
  }
  if (RECEIPT_GUIDE_COMMANDS.has(normalized)) {
    return { type: "receipt_guide" };
  }
  if (WEEK_TREND_COMMANDS.has(normalized)) {
    return { type: "week_trend" };
  }
  if (WEEK_INCOME_COMMANDS.has(normalized)) {
    return { type: "week_income" };
  }
  if (WEEK_EXPENSE_COMMANDS.has(normalized)) {
    return { type: "week_expense" };
  }
  if (WEEK_CATEGORY_COMMANDS.has(normalized)) {
    return { type: "week_categories" };
  }
  if (WEEK_SUMMARY_COMMANDS.has(normalized)) {
    return { type: "week_summary" };
  }
  return undefined;
}

function stripIntentCues(compact: string): string {
  let text = compact;
  for (let i = 0; i < 4; i += 1) {
    const next = text.replace(TRAILING_CUE_PATTERN, "");
    if (next === text) break;
    text = next;
  }
  text = text.replace(LEADING_WEEK_PATTERN, "");
  if (text.startsWith("の")) text = text.slice(1);
  return text;
}

function looksLikeCategoryName(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

function extractCategoryCandidate(compact: string): string | undefined {
  const leftover = stripIntentCues(compact);
  if (leftover.length === 0 || leftover.length > 20) return undefined;
  if (!looksLikeCategoryName(leftover)) return undefined;
  if (WRITE_REQUEST_PATTERN.test(leftover)) return undefined;
  if (KNOWN_COMMAND_LEFTOVERS.has(leftover) || HELP_COMMANDS.has(leftover.toLowerCase())) {
    return undefined;
  }
  if (/(推移|内訳|カテゴリ|カテゴリー|サマリー|家計簿|合計)/.test(leftover)) {
    return undefined;
  }
  return leftover;
}

function parsePatternCommand(compact: string): LineSummaryCommand {
  if (GREETING_OR_META_HELP_PATTERN.test(compact) || compact === "help") {
    return { type: "help" };
  }
  if (WRITE_REQUEST_PATTERN.test(compact)) {
    return { type: "help" };
  }
  if (/レシート|画像を送/.test(compact)) {
    return { type: "receipt_guide" };
  }

  const categoryCandidate = extractCategoryCandidate(compact);
  const asksCategoryAmount =
    categoryCandidate !== undefined &&
    /(どれくらい|どのくらい|どれぐらい|どのぐらい|はいくら|いくら)/.test(compact) &&
    !/(推移|内訳|カテゴリ別|カテゴリー別)/.test(compact) &&
    !/(収入)/.test(compact);

  if (/(週別推移|週次推移|推移)/.test(compact)) {
    return { type: "week_trend" };
  }
  if (/(カテゴリ別|カテゴリー別|内訳)/.test(compact)) {
    return { type: "week_categories" };
  }
  if (/収入/.test(compact) && !/支出|使った/.test(compact)) {
    return { type: "week_income" };
  }
  if (/支出|使った/.test(compact)) {
    return { type: "week_expense" };
  }
  if (/収入/.test(compact)) {
    return { type: "week_income" };
  }
  if (asksCategoryAmount) {
    return { type: "category_lookup", name: categoryCandidate };
  }
  if (categoryCandidate !== undefined) {
    return { type: "category_lookup", name: categoryCandidate };
  }
  if (/(今週|サマリー|家計簿|合計|今週の家計)/.test(compact)) {
    return { type: "week_summary" };
  }
  return { type: "help" };
}

export function parseLineSummaryCommand(messageText: string): LineSummaryCommand {
  const normalized = normalizeLineCommandText(messageText);
  const exact = parseExactCommand(normalized);
  if (exact !== undefined) return exact;
  return parsePatternCommand(compactLineCommandText(normalized));
}

export function resolveCategoryLookup<T extends { name: string }>(
  candidate: string,
  categories: readonly T[],
): T | undefined {
  const exactMatches = categories.filter((category) => category.name === candidate);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return undefined;

  const contained = categories.filter(
    (category) => category.name.length > 0 && candidate.includes(category.name),
  );
  if (contained.length === 0) return undefined;
  const longestLength = Math.max(...contained.map((category) => category.name.length));
  const longest = contained.filter((category) => category.name.length === longestLength);
  if (longest.length !== 1) return undefined;
  const uniqueLongest = longest[0];
  if (uniqueLongest === undefined) return undefined;
  const othersAreNestedNames = contained.every(
    (category) =>
      category.name === uniqueLongest.name || uniqueLongest.name.includes(category.name),
  );
  if (!othersAreNestedNames) return undefined;
  return uniqueLongest;
}

function isAllowlistedPostbackCommand(messageText: string): boolean {
  return parseExactCommand(normalizeLineCommandText(messageText)) !== undefined;
}

/**
 * inbound postback を既存テキストコマンドへ正規化する。
 * 未知 data は category_lookup に流さず使い方へ落とす。
 */
export function resolveLinePostbackToCommandText(postbackData: string): string {
  const normalized = normalizeLineCommandText(postbackData);
  if (normalized.length === 0) return POSTBACK_HELP_COMMAND_TEXT;
  const fromRichMenu = RICH_MENU_POSTBACK_COMMAND_TEXT.get(normalized);
  if (fromRichMenu !== undefined) return fromRichMenu;
  if (isAllowlistedPostbackCommand(normalized)) return normalized;
  return POSTBACK_HELP_COMMAND_TEXT;
}

export function resolveLineEventCommandText(event: {
  eventType: string;
  messageText?: string;
  postbackData?: string;
}): string | undefined {
  if (event.eventType === "text") {
    return event.messageText ?? "";
  }
  if (event.eventType === "postback") {
    return resolveLinePostbackToCommandText(event.postbackData ?? "");
  }
  return undefined;
}
