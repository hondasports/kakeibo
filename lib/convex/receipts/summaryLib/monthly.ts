import type { QueryCtx } from "../../../../convex/_generated/server";
import { requireGroupMembership } from "../../../../convex/groups/membership";
import { ConvexError } from "convex/values";
import { normalizeMonth } from "../../../domain/common/month";
import {
  getMonthlyExpensesSummary,
  getMonthSummaryWithCategories,
  type MonthlySummaryWithCategoriesResult,
} from "../../../usecase/receipts/summaries";
import { createSummaryStore } from "./summaryStore";

export { type MonthlyExpensesSummary } from "../../../domain/receipt/monthlySummary";

type GetMonthlyExpensesSummaryArgs = {
  monthStartDate: string;
};

/** getMonthlyExpensesSummary query の handler ロジック（テスト用に export） */
export async function getMonthlyExpensesSummaryHandler(
  ctx: QueryCtx,
  args: GetMonthlyExpensesSummaryArgs,
) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return getMonthlyExpensesSummary(createSummaryStore(ctx), groupId, userId, args);
}

type GetMonthSummaryWithCategoriesArgs = {
  month: string;
};

export type MonthlySummaryWithCategories = MonthlySummaryWithCategoriesResult;

/** getMonthSummaryWithCategories query の handler ロジック（テスト用に export） */
export async function getMonthSummaryWithCategoriesHandler(
  ctx: QueryCtx,
  args: GetMonthSummaryWithCategoriesArgs,
): Promise<MonthlySummaryWithCategories> {
  const month = normalizeMonth(args.month);
  if (month === null) {
    throw new ConvexError("Invalid month");
  }

  const { groupId } = await requireGroupMembership(ctx);
  return getMonthSummaryWithCategories(createSummaryStore(ctx), groupId, { month });
}
