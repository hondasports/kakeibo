import { createE2eUnallocatedTaxDraftForUserHandler } from "./e2eDraftFixtures";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  aiExpenseDraftConfidenceValidator,
  aiExpenseDraftDocumentTypeValidator,
  aiExpenseDraftItemConfidenceValidator,
  aiExpenseDraftReviewReasonValidator,
  amountBasisValidator,
  markerDefinitionsValidator,
  receiptItemTaxRatePercentValidator,
  receiptMarkersValidator,
  receiptRawObservationLineValidator,
  receiptLineClassificationValidator,
  receiptTotalResolutionValidator,
  receiptTaxDecisionValidator,
  receiptUserOverrideSnapshotValidator,
  taxResolutionSourceValidator,
  taxResolutionStatusValidator,
  taxSummaryValidator,
} from "./validators";
import {
  createFailedDraftFromImageAnalysisForUserHandler,
  createFailedDraftFromImageAnalysisHandler,
  createFromExtractionForUserHandler,
  createFromExtractionHandler,
  deleteOrphanedDraftHandler,
} from "../../lib/convex/aiExpenseDrafts/createFromExtraction";
import {
  createE2eReadyDraftForUserHandler,
  createE2eMixedTaxReviewDraftForUserHandler,
  createE2eTaxReviewDraftForUserHandler,
  createE2eTaxSummaryConflictDraftForUserHandler,
  deleteDraftsByUserBatchHandler,
} from "./e2eDraftFixtures";

export { deleteDraftAndItems } from "../../lib/convex/aiExpenseDrafts/draftRepository";
export {
  createFromExtractionHandler,
  createFromExtractionForUserHandler,
  createFailedDraftFromImageAnalysisHandler,
  createFailedDraftFromImageAnalysisForUserHandler,
  deleteOrphanedDraftHandler,
} from "../../lib/convex/aiExpenseDrafts/createFromExtraction";
export {
  deleteDraftsByUserBatchHandler,
  createE2eReadyDraftForUserHandler,
  createE2eMixedTaxReviewDraftForUserHandler,
  createE2eTaxReviewDraftForUserHandler,
  createE2eTaxSummaryConflictDraftForUserHandler,
} from "./e2eDraftFixtures";
export type {
  CreateFromExtractionArgs,
  CreateFromExtractionForUserArgs,
  CreateFailedDraftFromImageAnalysisArgs,
  CreateFailedDraftFromImageAnalysisForUserArgs,
} from "../../lib/convex/aiExpenseDrafts/createFromExtraction";
export type {
  DeleteDraftsByUserBatchArgs,
  CreateE2eReadyDraftForUserArgs,
} from "./e2eDraftFixtures";

export const createFailedDraftFromImageAnalysis = internalMutation({
  args: {
    warning: v.string(),
    imageFileName: v.optional(v.string()),
  },
  handler: createFailedDraftFromImageAnalysisHandler,
});

const extractedDraftItemValidator = v.object({
  itemName: v.string(),
  lineType: v.optional(
    v.union(
      v.literal("item"),
      v.literal("discount"),
      v.literal("promotion_adjustment"),
      v.literal("unknown"),
    ),
  ),
  amountYen: v.number(),
  printedAmountYen: v.optional(v.number()),
  amountBasis: v.optional(amountBasisValidator),
  taxRatePercent: v.optional(receiptItemTaxRatePercentValidator),
  markers: v.optional(receiptMarkersValidator),
  taxMarker: v.optional(v.string()),
  allocatedTaxYen: v.optional(v.number()),
  taxAllocationStatus: v.optional(v.union(v.literal("allocated"), v.literal("unallocated"))),
  normalizedAmountYen: v.optional(v.number()),
  taxResolutionStatus: v.optional(taxResolutionStatusValidator),
  taxResolutionSource: v.optional(taxResolutionSourceValidator),
  taxReviewReasons: v.optional(v.array(v.string())),
  quantity: v.optional(v.number()),
  unitPriceYen: v.optional(v.number()),
  categoryName: v.optional(v.string()),
  categoryId: v.optional(v.id("categories")),
  confidence: aiExpenseDraftItemConfidenceValidator,
  warnings: v.optional(v.array(v.string())),
});

const extractedDraftArgs = {
  documentType: aiExpenseDraftDocumentTypeValidator,
  shopName: v.optional(v.string()),
  paymentPlace: v.optional(v.string()),
  payeeName: v.optional(v.string()),
  paymentPurpose: v.optional(v.string()),
  date: v.optional(v.string()),
  amountYen: v.optional(v.number()),
  taxSummaries: v.optional(v.array(taxSummaryValidator)),
  receiptTotalResolution: v.optional(receiptTotalResolutionValidator),
  receiptTaxDecision: v.optional(receiptTaxDecisionValidator),
  rawObservationLines: v.optional(v.array(receiptRawObservationLineValidator)),
  receiptLineClassifications: v.optional(v.array(receiptLineClassificationValidator)),
  preservedUserOverride: v.optional(receiptUserOverrideSnapshotValidator),
  markerDefinitions: v.optional(markerDefinitionsValidator),
  categoryId: v.optional(v.id("categories")),
  imageFileName: v.optional(v.string()),
  confidence: aiExpenseDraftConfidenceValidator,
  warnings: v.array(v.string()),
  reviewReasons: v.optional(v.array(aiExpenseDraftReviewReasonValidator)),
  items: v.optional(v.array(extractedDraftItemValidator)),
};

export const createFromExtraction = internalMutation({
  args: extractedDraftArgs,
  handler: createFromExtractionHandler,
});

export const createFromExtractionForUser = internalMutation({
  args: {
    userId: v.string(),
    ...extractedDraftArgs,
  },
  handler: createFromExtractionForUserHandler,
});

export const createFailedDraftFromImageAnalysisForUser = internalMutation({
  args: {
    userId: v.string(),
    warning: v.string(),
    imageFileName: v.optional(v.string()),
  },
  handler: createFailedDraftFromImageAnalysisForUserHandler,
});

export const deleteOrphanedDraft = internalMutation({
  args: {
    draftId: v.id("aiExpenseDrafts"),
  },
  handler: deleteOrphanedDraftHandler,
});

export const getForReanalysis = internalQuery({
  args: {
    draftId: v.id("aiExpenseDrafts"),
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (draft?.groupId !== args.groupId) {
      return null;
    }
    const items = await ctx.db
      .query("aiExpenseDraftItems")
      .withIndex("by_group_id_and_draft_id", (q) =>
        q.eq("groupId", args.groupId).eq("draftId", args.draftId),
      )
      .order("asc")
      .take(100);
    return { draft, items };
  },
});

export const deleteDraftsByUserBatch = internalMutation({
  args: {
    groupId: v.id("groups"),
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: deleteDraftsByUserBatchHandler,
});

export const createE2eReadyDraftForUser = internalMutation({
  args: {
    groupId: v.id("groups"),
    createdByUserId: v.string(),
    categoryId: v.id("categories"),
    secondaryCategoryId: v.optional(v.id("categories")),
  },
  handler: createE2eReadyDraftForUserHandler,
});

export const createE2eTaxReviewDraftForUser = internalMutation({
  args: {
    groupId: v.id("groups"),
    createdByUserId: v.string(),
    categoryId: v.id("categories"),
    secondaryCategoryId: v.optional(v.id("categories")),
    savedAsTotalOnly: v.optional(v.boolean()),
  },
  handler: createE2eTaxReviewDraftForUserHandler,
});

export const createE2eMixedTaxReviewDraftForUser = internalMutation({
  args: {
    groupId: v.id("groups"),
    createdByUserId: v.string(),
    categoryId: v.id("categories"),
    secondaryCategoryId: v.optional(v.id("categories")),
  },
  handler: createE2eMixedTaxReviewDraftForUserHandler,
});

export const createE2eTaxSummaryConflictDraftForUser = internalMutation({
  args: {
    groupId: v.id("groups"),
    createdByUserId: v.string(),
    categoryId: v.id("categories"),
    secondaryCategoryId: v.optional(v.id("categories")),
  },
  handler: createE2eTaxSummaryConflictDraftForUserHandler,
});

export const createE2eUnallocatedTaxDraftForUser = internalMutation({
  args: { groupId: v.id("groups"), createdByUserId: v.string(), categoryId: v.id("categories") },
  handler: createE2eUnallocatedTaxDraftForUserHandler,
});
