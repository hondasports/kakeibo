import type { QueryCtx } from "../../../../convex/_generated/server";
import { requireGroupMembership } from "../../../../convex/groups/membership";
import { ConvexError } from "convex/values";
import { normalizeYear } from "../../../domain/common/year";
import { getYearSummary } from "../../../usecase/receipts/summaries";
import { createSummaryStore } from "./summaryStore";

export type { YearlySummary } from "../../../domain/receipt/yearlySummary";

type GetYearSummaryArgs = {
  year: string;
};

export async function getYearSummaryHandler(ctx: QueryCtx, args: GetYearSummaryArgs) {
  const year = normalizeYear(args.year);
  if (year === null) {
    throw new ConvexError("Invalid year");
  }

  const { groupId } = await requireGroupMembership(ctx);
  return getYearSummary(createSummaryStore(ctx), groupId, { year });
}
