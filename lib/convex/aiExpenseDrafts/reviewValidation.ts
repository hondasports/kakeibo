import type { DraftReviewItemInput } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import { applyRecordPatch, diffRecordPatch } from "../../domain/common/recordPatch";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  getReviewUpdateReadyErrorMessage,
  validateReviewUpdateCanBecomeReady,
} from "../../../lib/domain/aiExpenseDrafts/review";
import { type AiExpenseDraftDocumentType } from "../../../lib/domain/aiExpenseDrafts/constants";
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
import { DRAFT_JUDGMENT_ITEM_LIMIT } from "../../../lib/domain/aiExpenseDrafts/judgmentItemWindow";
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

export type UpdateForReviewItem = Omit<DraftReviewItemInput, "itemId" | "categoryId"> & {
  itemId?: Id<"aiExpenseDraftItems">;
  categoryId: Id<"categories">;
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

/**
 * レビュー入力で明細を差分更新する。
 * 変わった明細だけ patch・増えた明細は insert・消えた明細は delete し、
 * 置き換え後の明細一覧（ストレージ順）を返す。
 * existingDocs に既読の明細を渡せば DB 再取得を省略する。
 */
export async function replaceDraftItemsForReview(
  ctx: Pick<MutationCtx, "db">,
  draftId: Id<"aiExpenseDrafts">,
  groupId: Id<"groups">,
  items: NonNullable<UpdateForReviewArgs["items"]>,
  now: number,
  existingDocs?: Doc<"aiExpenseDraftItems">[],
): Promise<Doc<"aiExpenseDraftItems">[]> {
  const countResult = validateReviewItemCount(items);
  if (!countResult.success) {
    throw new ConvexError(getReviewItemReplaceErrorMessage(countResult.error));
  }
  const existingItems =
    existingDocs ??
    (await ctx.db
      .query("aiExpenseDraftItems")
      .withIndex("by_group_id_and_draft_id", (q) => q.eq("groupId", groupId).eq("draftId", draftId))
      .order("asc")
      .take(DRAFT_JUDGMENT_ITEM_LIMIT));
  const existingItemsById = new Map(existingItems.map((item) => [item._id, item]));
  const idsResult = validateReviewItemIds(items, new Set<string>(existingItemsById.keys()));
  if (!idsResult.success) {
    throw new ConvexError(getReviewItemReplaceErrorMessage(idsResult.error));
  }

  const submittedItemIds = new Set(
    items
      .map((item) => item.itemId)
      .filter((id): id is Id<"aiExpenseDraftItems"> => id !== undefined),
  );
  for (const existing of existingItems) {
    if (!submittedItemIds.has(existing._id)) {
      await ctx.db.delete(existing._id);
    }
  }

  const keptById = new Map<Id<"aiExpenseDraftItems">, Doc<"aiExpenseDraftItems">>();
  const insertedDocs: Doc<"aiExpenseDraftItems">[] = [];
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
      ...targetFields
    } = draftItemFieldsToDoc(built.fields);
    if (previous === undefined) {
      const newId = await ctx.db.insert("aiExpenseDraftItems", targetFields);
      insertedDocs.push({ _id: newId, _creationTime: now, ...targetFields });
      continue;
    }
    // previous にあって built.fields に無いキーはフィールド削除として扱う。
    const patch: Record<string, unknown> = { ...targetFields };
    for (const key of Object.keys(previous)) {
      if (key !== "_id" && key !== "_creationTime" && !(key in targetFields)) {
        patch[key] = undefined;
      }
    }
    const diff = diffRecordPatch(previous as unknown as Record<string, unknown>, patch, [
      "createdAt",
      "updatedAt",
    ]);
    if (diff === null) {
      keptById.set(previous._id, previous);
      continue;
    }
    await ctx.db.patch(previous._id, diff);
    keptById.set(
      previous._id,
      applyRecordPatch(
        previous as unknown as Record<string, unknown>,
        patch,
      ) as unknown as Doc<"aiExpenseDraftItems">,
    );
  }

  return [
    ...existingItems
      .filter((item) => submittedItemIds.has(item._id))
      .map((item) => keptById.get(item._id) ?? item),
    ...insertedDocs,
  ];
}
