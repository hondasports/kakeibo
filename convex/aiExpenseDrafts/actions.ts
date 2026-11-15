import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  assertReceiptImageConsent,
  ReceiptImageExtractionDomainError,
} from "../../lib/domain/receiptImageExtraction/rules";
import {
  analyzeReceiptImageToDraftCore,
  readReceiptImageConsent,
} from "../../lib/convex/receiptImageExtraction/analyzeReceiptImageCore";

type AnalyzeReceiptImageToDraftArgs = {
  imageDataUrl: string;
};

export async function analyzeReceiptImageToDraftHandler(
  ctx: ActionCtx,
  args: AnalyzeReceiptImageToDraftArgs,
): Promise<Doc<"aiExpenseDrafts">> {
  const consent = await readReceiptImageConsent(ctx);
  try {
    assertReceiptImageConsent(consent);
  } catch (error) {
    if (error instanceof ReceiptImageExtractionDomainError) throw new ConvexError(error.message);
    throw error;
  }
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
