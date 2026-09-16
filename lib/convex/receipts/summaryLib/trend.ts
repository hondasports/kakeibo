import type { QueryCtx } from "../../../../convex/_generated/server";
import { requireGroupMembership } from "../../../../convex/groups/membership";
import {
  getDailySpendingTrend,
  type DailySpendingTrendResult,
} from "../../../usecase/receipts/summaries";
import { createSummaryStore } from "./summaryStore";

export type DailySpendingTrendData = DailySpendingTrendResult;

type GetDailySpendingTrendArgs = {
  weekStartDate: string;
};

/** getDailySpendingTrend query の handler ロジック（テスト用に export） */
export async function getDailySpendingTrendHandler(
  ctx: QueryCtx,
  args: GetDailySpendingTrendArgs,
): Promise<DailySpendingTrendData> {
  const { groupId } = await requireGroupMembership(ctx);
  return getDailySpendingTrend(createSummaryStore(ctx), groupId, args);
}
