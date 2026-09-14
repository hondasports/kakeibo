import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { type ReceiptItemLineType } from "../../../lib/domain/receipt/discountItems";
import {
  getReviewUpdateReadyErrorMessage,
  validateReviewUpdateCanBecomeReady,
} from "../../../lib/domain/aiExpenseDrafts/review";
import { type AiExpenseDraftDocumentType } from "./validators";
import type { AiExpenseRegistrationMode } from "../../../lib/domain/aiExpenseDrafts/receiptDataContract";
import type { PriceTaxTreatment, TaxRateComposition } from "../../receiptTax/types";
import {
  getReviewCategoryErrorMessage,
  validateReviewCategory,
} from "../../../lib/domain/aiExpenseDrafts/reviewCategory";
import {
  buildReplacementDraftItemFields,
  getReviewItemReplaceErrorMessage,
  validateReviewItemCount,
  validateReviewItemIds,
} from "../../../lib/domain/aiExpenseDrafts/reviewItemReplace";
import { draftItemDocToFields, draftItemFieldsToDoc } from "./draftRecordMapping";
import {
  aggregateDraftItemsByCategory as aggregateDraftItemsByCategoryDomain,
  getDraftItemAggregationErrorMessage,
  validatePositiveCategoryTotals,
} from "../../../lib/domain/aiExpenseDrafts/reviewItems";

export { resolveReviewItemAmountsForReplace } from "../../../lib/domain/aiExpenseDrafts/reviewItemAmounts";
export {
  hasLowConfidenceItem,
  summarizeItems,
} from "../../../lib/domain/aiExpenseDrafts/reviewItems";

export type UpdateForReviewItem = {
  itemId?: Id<"aiExpenseDraftItems">;
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: number;
  categoryId: Id<"categories">;
  confidence?: {
    itemName?: number;
    amountYen?: number;
    categoryName?: number;
    categoryId?: number;
  };
  warnings?: string[];
};

export type UpdateForReviewArgs = {
  draftId: Id<"aiExpenseDrafts">;
  documentType: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date: string;
  amountYen: number;
  registrationMode?: AiExpenseRegistrationMode;
  priceTaxTreatment?: PriceTaxTreatment;
  taxRateComposition?: TaxRateComposition;
  categoryId: Id<"categories">;
  items?: UpdateForReviewItem[];
};

export function assertReviewUpdateCanBecomeReady(args: UpdateForReviewArgs) {
  const result = validateReviewUpdateCanBecomeReady(args);
  if (result.success) return;

  throw new ConvexError(getReviewUpdateReadyErrorMessage(result.error, args.documentType));
}

export async function assertActiveCategoryBelongsToGroup(
  ctx: Pick<MutationCtx, "db">,
  categoryId: Id<"categories">,
  groupId: Id<"groups">,
) {
  const category = await ctx.db.get(categoryId);
  const result = validateReviewCategory(category, groupId);
  if (!result.success) {
    throw new ConvexError(getReviewCategoryErrorMessage(result.error));
  }
}

export function assertPositiveCategoryTotals(items: NonNullable<UpdateForReviewArgs["items"]>) {
  if (!validatePositiveCategoryTotals(items)) {
    throw new ConvexError("Draft category total must be greater than zero");
  }
}

export function aggregateDraftItemsByCategory(
  draft: Doc<"aiExpenseDrafts">,
  items: Doc<"aiExpenseDraftItems">[],
): Array<{ itemName: string; amountYen: number; categoryId: Id<"categories"> }> {
  const result = aggregateDraftItemsByCategoryDomain(
    {
      amountYen: draft.amountYen!,
      categoryId: draft.categoryId!,
      documentType: draft.documentType,
      shopName: draft.shopName,
      paymentPlace: draft.paymentPlace,
      payeeName: draft.payeeName,
      paymentPurpose: draft.paymentPurpose,
    },
    items,
  );
  if (!result.success) {
    throw new ConvexError(getDraftItemAggregationErrorMessage(result.error));
  }
  return result.items as Array<{
    itemName: string;
    amountYen: number;
    categoryId: Id<"categories">;
  }>;
}

export async function replaceDraftItemsForReview(
  ctx: Pick<MutationCtx, "db">,
  draftId: Id<"aiExpenseDrafts">,
  groupId: Id<"groups">,
  items: NonNullable<UpdateForReviewArgs["items"]>,
  now: number,
) {
  const countResult = validateReviewItemCount(items);
  if (!countResult.success) {
    throw new ConvexError(getReviewItemReplaceErrorMessage(countResult.error));
  }
  const existingItems = await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) => q.eq("groupId", groupId).eq("draftId", draftId))
    .order("asc")
    .take(100);
  const existingItemsById = new Map(existingItems.map((item) => [item._id, item]));
  const idsResult = validateReviewItemIds(items, new Set<string>(existingItemsById.keys()));
  if (!idsResult.success) {
    throw new ConvexError(getReviewItemReplaceErrorMessage(idsResult.error));
  }
  for (const item of existingItems) {
    await ctx.db.delete(item._id);
  }
  for (const item of items) {
    const previous = item.itemId === undefined ? undefined : existingItemsById.get(item.itemId);
    const built = buildReplacementDraftItemFields({
      groupId,
      draftId,
      item,
      previous: previous === undefined ? undefined : draftItemDocToFields(previous),
      now,
    });
    if (!built.success) {
      throw new ConvexError(getReviewItemReplaceErrorMessage(built.error));
    }
    await assertActiveCategoryBelongsToGroup(ctx, item.categoryId, groupId);
    const {
      _id: _ignoredId,
      _creationTime: _ignoredCreationTime,
      ...insertFields
    } = draftItemFieldsToDoc(built.fields);
    await ctx.db.insert("aiExpenseDraftItems", insertFields);
  }
}
