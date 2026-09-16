import type { QueryCtx } from "../../../../convex/_generated/server";
import { requireGroupMembership } from "../../../../convex/groups/membership";
import {
  getFourWeeksSummary,
  getWeekSummary,
  getWeekSummaryWithCategories,
  type FourWeeksSummaryResult,
  type WeekSummaryResult,
  type WeekSummaryWithCategoriesResult,
} from "../../../usecase/receipts/summaries";
import { createSummaryStore } from "./summaryStore";

type GetWeekSummaryArgs = {
  weekStartDate: string;
};

export type WeekSummary = WeekSummaryResult;

/** getWeekSummary query の handler ロジック（テスト用に export） */
export async function getWeekSummaryHandler(ctx: QueryCtx, args: GetWeekSummaryArgs) {
  const { groupId } = await requireGroupMembership(ctx);
  return getWeekSummary(createSummaryStore(ctx), groupId, args);
}

type GetWeekSummaryWithCategoriesArgs = {
  weekStartDate: string;
};

export type WeekSummaryWithCategories = WeekSummaryWithCategoriesResult;

/** getWeekSummaryWithCategories query の handler ロジック（テスト用に export） */
export async function getWeekSummaryWithCategoriesHandler(
  ctx: QueryCtx,
  args: GetWeekSummaryWithCategoriesArgs,
): Promise<WeekSummaryWithCategories> {
  const { groupId } = await requireGroupMembership(ctx);
  return getWeekSummaryWithCategories(createSummaryStore(ctx), groupId, args);
}

export type FourWeeksSummaryData = FourWeeksSummaryResult;

type GetFourWeeksSummaryArgs = {
  weekStartDate: string;
};

/** getFourWeeksSummary query の handler ロジック（テスト用に export） */
export async function getFourWeeksSummaryHandler(
  ctx: QueryCtx,
  args: GetFourWeeksSummaryArgs,
): Promise<FourWeeksSummaryData> {
  const { groupId } = await requireGroupMembership(ctx);
  return getFourWeeksSummary(createSummaryStore(ctx), groupId, args);
}
