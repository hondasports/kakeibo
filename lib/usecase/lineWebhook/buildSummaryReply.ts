import { resolveActiveLink } from "../../domain/lineLink/activeLink";
/**
 * LINE サマリ応答の組み立てユースケース。
 * コマンド解析→グループ解決→週次集計→応答文生成の分岐順序はベースと同一。
 */
import { MAX_CATEGORIES_PER_GROUP } from "../../domain/categories/defaults";
import { getTodayDateStringInJapan, startOfDayInJapanMs } from "../../domain/common/date";
import { isGroupDeleted } from "../../domain/groups/lifecycle";
import type { GroupReadRepository } from "../../domain/groups/groupRepository";
import type { UserSettingsRepository } from "../../domain/users/userSettingsRepository";
import type { LineActiveGroupResolver } from "../../domain/lineWebhook/activeGroupResolver";
import type { LineAccountLinkReader } from "../../domain/lineLink/accountLinkStore";
import type { LineSummaryDataReader } from "../../domain/lineWebhook/summaryDataReader";
import {
  LINE_TEXT_DRAFT_DAILY_LIMIT,
  type LineExpenseDraftReader,
} from "../../domain/lineWebhook/lineExpenseDraftStore";
import type { SummaryReplyJobArgs } from "../../domain/lineWebhook/scheduler";
import { LINE_UNLINKED_GUIDANCE_MESSAGE } from "../../domain/lineWebhook/reply";
import { parseLineSummaryCommand, resolveCategoryLookup } from "../../domain/lineSummary/commands";
import { parseLineExpenseInput } from "../../domain/lineExpenseInput/lineExpenseInput";
import type { LineReplyKind } from "../../domain/lineSummary/quickReply";
import {
  LINE_HELP_MESSAGE,
  LINE_NO_GROUP_MESSAGE,
  LINE_RECEIPT_GUIDE_MESSAGE,
  LINE_TEXT_DRAFT_DAILY_LIMIT_MESSAGE,
  LINE_UNRESOLVED_GROUP_MESSAGE,
  formatCategoryReply,
  formatExpenseDraftReply,
  formatWeekCategoriesReply,
  formatWeekExpenseReply,
  formatWeekIncomeReply,
  formatWeekSummaryReply,
  formatWeekTrendReply,
} from "../../domain/lineSummary/reply";
import {
  calculateRelativeWeekStartDate,
  calculateWeekStartDate,
} from "../../domain/week/weekDates";
import { summarizeByCategory, summarizeReceipts } from "../../domain/receipt/summary";

export type BuildSummaryReplyDeps = {
  accountLinks: LineAccountLinkReader;
  activeGroup: LineActiveGroupResolver;
  groups: GroupReadRepository;
  userSettings: UserSettingsRepository;
  summaryData: LineSummaryDataReader;
  expenseDrafts: LineExpenseDraftReader;
};

/**
 * テキスト支出入力の返信を決める。
 * claim 側の日次上限（JST・LINE_TEXT_DRAFT_DAILY_LIMIT）で作成を弾かれた
 * 入力には「作れない」旨を返す。作成済みかどうかは「このイベント時刻以降の
 * line_text 下書きがあるか」で判定する（eventTimestamp 欠落時は claim 時刻
 * が nowMs に入るため、作成直後の下書きは必ず一致する）。
 */
async function resolveExpenseDraftReply(
  deps: BuildSummaryReplyDeps,
  args: Omit<SummaryReplyJobArgs, "replyToken">,
  expenseInput: NonNullable<ReturnType<typeof parseLineExpenseInput>>,
): Promise<{ replyText: string; replyKind: LineReplyKind } | null> {
  // claim がjob引数で渡した作成結果をそのまま使う（時刻推測はしない）。
  if (args.expenseDraftStatus === "limit") {
    return reply("expense_draft_limit", LINE_TEXT_DRAFT_DAILY_LIMIT_MESSAGE);
  }
  if (args.expenseDraftStatus === "created") {
    return reply("expense_draft", formatExpenseDraftReply(expenseInput));
  }
  // "none" = claim 時点で支出入力だが下書きを作れなかった。作成済みとは
  // 返さず、呼び出し元の通常分岐（週次集計・使い方等）へ戻す。
  if (args.expenseDraftStatus === "none") return null;
  // 引数を持たない在庫job向けのフォールバック: 「このイベント時刻以降の
  // line_text 下書きがあるか」で判定する（createdAt は claim 時刻）。
  const createdAts = await deps.expenseDrafts.lineTextDraftCreatedAtsSince(
    args.userId,
    startOfDayInJapanMs(args.nowMs),
  );
  const createdNow = createdAts.some((at) => at >= args.nowMs);
  if (createdNow) return reply("expense_draft", formatExpenseDraftReply(expenseInput));
  if (createdAts.length >= LINE_TEXT_DRAFT_DAILY_LIMIT) {
    return reply("expense_draft_limit", LINE_TEXT_DRAFT_DAILY_LIMIT_MESSAGE);
  }
  return null;
}

async function loadWeekSummary(
  deps: BuildSummaryReplyDeps,
  groupId: string,
  weekStartDate: string,
) {
  const receipts = await deps.summaryData.getWeekSpendingEntries(groupId, weekStartDate);
  const categoryIds = Array.from(new Set(receipts.map((receipt) => receipt.categoryId)));
  const categoryInfoMap = await deps.summaryData.buildCategoryInfoMap(groupId, categoryIds);
  const { count, totalAmountYen } = summarizeReceipts(receipts);
  const incomeEntries = await deps.summaryData.getWeekIncomeEntries(groupId, weekStartDate);
  return {
    weekStartDate,
    expenseCount: count,
    expenseTotalYen: totalAmountYen,
    incomeCount: incomeEntries.length,
    incomeTotalYen: incomeEntries.reduce((sum, entry) => sum + entry.amountYen, 0),
    byCategory: summarizeByCategory(receipts, categoryInfoMap),
  };
}

async function loadTrendWeeks(deps: BuildSummaryReplyDeps, groupId: string, weekStartDate: string) {
  const weeks = [];
  for (let i = 3; i >= 0; i -= 1) {
    const targetWeekStartDate = calculateRelativeWeekStartDate(weekStartDate, -i);
    const receipts = await deps.summaryData.getWeekSpendingEntries(groupId, targetWeekStartDate);
    const { totalAmountYen } = summarizeReceipts(receipts);
    weeks.push({ weekStartDate: targetWeekStartDate, totalAmountYen });
  }
  return weeks;
}

function reply(replyKind: LineReplyKind, replyText: string) {
  return { replyKind, replyText };
}

export async function buildSummaryReply(
  deps: BuildSummaryReplyDeps,
  args: Omit<SummaryReplyJobArgs, "replyToken">,
): Promise<{ replyText: string; replyKind: LineReplyKind }> {
  const activeLinks = await deps.accountLinks.listActiveByUserId(args.userId, 2);
  const resolution = resolveActiveLink(activeLinks);
  if (
    resolution.kind !== "single" ||
    resolution.link.id !== args.linkId ||
    resolution.link.userId !== args.userId ||
    resolution.link.lineUserId !== args.lineUserId
  ) {
    return reply("unlinked", LINE_UNLINKED_GUIDANCE_MESSAGE);
  }

  const command = parseLineSummaryCommand(args.messageText);
  // 「Amazon 500」のような日本語を含まない支出入力はhelpに分類される。
  // 支出入力として解析できるなら早期リターンせず、グループ解決後の
  // expense_draft分岐へ進ませる。
  const expenseInput = parseLineExpenseInput(args.messageText);
  if (command.type === "help" && expenseInput === null) {
    return reply("help", LINE_HELP_MESSAGE);
  }
  if (command.type === "receipt_guide" && expenseInput === null) {
    return reply("receipt_guide", LINE_RECEIPT_GUIDE_MESSAGE);
  }

  const groupResolution = await deps.activeGroup.resolve(args.userId);
  if (groupResolution.status === "no_group") {
    return reply("no_group", LINE_NO_GROUP_MESSAGE);
  }
  if (groupResolution.status === "unresolved") {
    return reply("unresolved", LINE_UNRESOLVED_GROUP_MESSAGE);
  }

  const groupId = groupResolution.groupId;
  const group = await deps.groups.get(groupId);
  if (group === null || isGroupDeleted(group)) {
    return reply("no_group", LINE_NO_GROUP_MESSAGE);
  }

  const weekStartDay = await deps.userSettings.resolveWeeklyStartDay(args.userId);
  const today = getTodayDateStringInJapan(args.nowMs);
  const weekStartDate = calculateWeekStartDate(today, weekStartDay);
  const weekSummary = await loadWeekSummary(deps, groupId, weekStartDate);

  if (command.type === "week_expense") {
    return reply("week_expense", formatWeekExpenseReply(weekSummary));
  }
  if (command.type === "week_income") {
    return reply("week_income", formatWeekIncomeReply(weekSummary));
  }
  if (command.type === "week_categories") {
    return reply("week_categories", formatWeekCategoriesReply(weekSummary));
  }
  if (command.type === "week_trend") {
    const weeks = await loadTrendWeeks(deps, groupId, weekStartDate);
    return reply("week_trend", formatWeekTrendReply({ weeks }));
  }
  if (command.type === "category_lookup") {
    // 「食費 1,200円」のような金額を含む入力は支出入力を優先する。
    // category_lookup として返信するのは金額を含まない入力に限る
    // （claim 側も金額つき入力は下書きを作る）。
    if (expenseInput !== null) {
      const expenseDraftReply = await resolveExpenseDraftReply(deps, args, expenseInput);
      if (expenseDraftReply !== null) return expenseDraftReply;
    }
    const categories = await deps.summaryData.listActiveCategories(
      groupId,
      MAX_CATEGORIES_PER_GROUP,
    );
    const category = resolveCategoryLookup(command.name, categories);
    if (category === undefined) {
      return reply("help", LINE_HELP_MESSAGE);
    }
    const matched = weekSummary.byCategory.find((entry) => entry.categoryId === category.id);
    return reply("category_lookup", formatCategoryReply(weekSummary, category.name, matched));
  }

  // 既定の週サマリーへ落とす前に「内容＋金額」の支出入力か判定する。
  // 下書き自体は claim 時の mutation で作成済み（作成できた場合のみこの応答に辿り着く）。
  // expense_draft 分岐は claim 側 maybeCreateExpenseDraft の対象コマンド
  // （week_summary・category_lookup・help）に限定する。category_lookup は
  // 上のブロックで既に処理済み。receipt_guide のような
  // 他分類では下書きが作られないため、作成済みと返信してはいけない。
  if (expenseInput !== null && (command.type === "week_summary" || command.type === "help")) {
    const expenseDraftReply = await resolveExpenseDraftReply(deps, args, expenseInput);
    if (expenseDraftReply !== null) return expenseDraftReply;
  }
  if (command.type === "help") {
    return reply("help", LINE_HELP_MESSAGE);
  }
  if (command.type === "receipt_guide") {
    return reply("receipt_guide", LINE_RECEIPT_GUIDE_MESSAGE);
  }

  return reply("week_summary", formatWeekSummaryReply(weekSummary));
}
