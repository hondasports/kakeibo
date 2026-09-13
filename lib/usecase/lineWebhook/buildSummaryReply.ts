/**
 * LINE サマリ応答の組み立てユースケース。
 * コマンド解析→グループ解決→週次集計→応答文生成の分岐順序はベースと同一。
 */
import { MAX_CATEGORIES_PER_GROUP } from "../../domain/categories/defaults";
import { getTodayDateStringInJapan } from "../../domain/common/date";
import { isGroupDeleted } from "../../domain/groups/lifecycle";
import type { GroupReadRepository } from "../../domain/groups/groupRepository";
import type { UserSettingsRepository } from "../../domain/users/userSettingsRepository";
import type { LineActiveGroupResolver } from "../../domain/lineWebhook/activeGroupResolver";
import type { LineAccountLinkReader } from "../../domain/lineWebhook/accountLinkReader";
import type { LineSummaryDataReader } from "../../domain/lineWebhook/summaryDataReader";
import { LINE_UNLINKED_GUIDANCE_MESSAGE } from "../../domain/lineWebhook/reply";
import { parseLineSummaryCommand, resolveCategoryLookup } from "../../domain/lineSummary/commands";
import type { LineReplyKind } from "../../domain/lineSummary/quickReply";
import {
  LINE_HELP_MESSAGE,
  LINE_NO_GROUP_MESSAGE,
  LINE_RECEIPT_GUIDE_MESSAGE,
  LINE_UNRESOLVED_GROUP_MESSAGE,
  formatCategoryReply,
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
};

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
  args: { userId: string; messageText: string; nowMs: number },
): Promise<{ replyText: string; replyKind: LineReplyKind }> {
  const activeLinks = await deps.accountLinks.listActiveByUserId(args.userId, 2);
  if (activeLinks.length !== 1) {
    return reply("unlinked", LINE_UNLINKED_GUIDANCE_MESSAGE);
  }

  const command = parseLineSummaryCommand(args.messageText);
  if (command.type === "help") {
    return reply("help", LINE_HELP_MESSAGE);
  }
  if (command.type === "receipt_guide") {
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

  return reply("week_summary", formatWeekSummaryReply(weekSummary));
}
