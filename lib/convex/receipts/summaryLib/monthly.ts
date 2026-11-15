import type { QueryCtx } from "../../../../convex/_generated/server";
import { requireGroupMembership } from "../../../../convex/groups/membership";
import { ConvexError } from "convex/values";
import { normalizeMonth } from "../../../domain/common/month";
import {
  getMonthSummaryWithCategories,
  type MonthlySummaryWithCategoriesResult,
} from "../../../usecase/receipts/summaries";
import { createSummaryStore } from "./summaryStore";

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
