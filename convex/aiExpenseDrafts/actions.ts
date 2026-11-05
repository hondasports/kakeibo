import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  analyzeReceiptImageToDraftCore,
  assertReceiptImageConsent,
} from "../../lib/convex/receiptImageExtraction/analyzeReceiptImageCore";

type AnalyzeReceiptImageToDraftArgs = {
  imageDataUrl: string;
};

export async function analyzeReceiptImageToDraftHandler(
  ctx: ActionCtx,
  args: AnalyzeReceiptImageToDraftArgs,
): Promise<Doc<"aiExpenseDrafts">> {
  await assertReceiptImageConsent(ctx);
  const group: { _id: Id<"groups"> } | null = await ctx.runQuery(api.groups.queries.getMyGroup, {});
  if (group === null) {
    throw new ConvexError("グループに所属していません");
  }
  return await analyzeReceiptImageToDraftCore(ctx, { groupId: group._id, ...args });
}

export const analyzeReceiptImageToDraft = action({
  args: {
    imageDataUrl: v.string(),
  },
  handler: analyzeReceiptImageToDraftHandler,
});
