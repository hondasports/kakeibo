import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type AiExpenseDraftConfidence,
  type AiExpenseDraftDocumentType,
  type AiExpenseDraftReviewReason,
} from "../../../lib/domain/aiExpenseDrafts/constants";
import {
  classifyCreatedDraft,
  type CreatedDraftClassificationInput,
} from "../../../lib/domain/aiExpenseDrafts/classification";
import {
  requireGroupMembership,
  resolveActiveGroupForUserId,
} from "../../../convex/groups/membership";
import { deleteDraftAndItems } from "./draftRepository";
import type {
  AmountBasis,
  ExtractedTaxSummary,
  ReceiptItemLineType,
  ReceiptItemTaxRatePercent,
} from "../receiptImageExtraction/types";
import type {
  ReceiptMarkerDefinition,
  ReceiptTaxDecision,
  ReceiptTotalResolution,
} from "../../receiptTax/types";
import type { TaxResolutionSource } from "../../receiptTax/types";
import type {
  ReceiptLineClassification,
  ReceiptRawObservationLine,
} from "../../domain/receipt/observations";
import type {
  ReceiptDraftValueSnapshot,
  ReceiptUserOverrideSnapshot,
} from "../../domain/aiExpenseDrafts/receiptDataContract";
import { applyReceiptUserOverride } from "../../domain/aiExpenseDrafts/receiptDataContract";

type AiExpenseDraftItemInput = {
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: number;
  printedAmountYen?: number;
  amountBasis?: AmountBasis;
  taxRatePercent?: ReceiptItemTaxRatePercent;
  markers?: string[];
  taxMarker?: string;
  allocatedTaxYen?: number;
  taxAllocationStatus?: "allocated" | "unallocated";
  normalizedAmountYen?: number;
  taxResolutionStatus?: "resolved" | "unresolved";
  taxResolutionSource?: TaxResolutionSource;
  taxReviewReasons?: string[];
  quantity?: number;
  unitPriceYen?: number;
  categoryName?: string;
  categoryId?: Id<"categories">;
  confidence: {
    itemName?: number;
    amountYen?: number;
    categoryName?: number;
    categoryId?: number;
  };
  warnings?: string[];
};

export type CreateFromExtractionArgs = {
  documentType: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date?: string;
  amountYen?: number;
  taxSummaries?: ExtractedTaxSummary[];
  receiptTotalResolution?: ReceiptTotalResolution;
  receiptTaxDecision?: ReceiptTaxDecision;
  rawObservationLines?: ReceiptRawObservationLine[];
  receiptLineClassifications?: ReceiptLineClassification[];
  preservedUserOverride?: ReceiptUserOverrideSnapshot<Id<"categories">>;
  markerDefinitions?: ReceiptMarkerDefinition[];
  categoryId?: Id<"categories">;
  imageFileName?: string;
  confidence: AiExpenseDraftConfidence;
  warnings: string[];
  reviewReasons?: AiExpenseDraftReviewReason[];
  items?: AiExpenseDraftItemInput[];
};

export type CreateFailedDraftFromImageAnalysisArgs = {
  warning: string;
  imageFileName?: string;
};

export type CreateFromExtractionForUserArgs = CreateFromExtractionArgs & {
  userId: string;
};

export type CreateFailedDraftFromImageAnalysisForUserArgs =
  CreateFailedDraftFromImageAnalysisArgs & {
    userId: string;
  };

type ResolvedActor = {
  userId: string;
  groupId: Id<"groups">;
};

async function assertCategoryBelongsToGroup(
  ctx: Pick<MutationCtx, "db">,
  categoryId: Id<"categories"> | undefined,
  groupId: Id<"groups">,
) {
  if (categoryId === undefined) {
    return;
  }
  const category = await ctx.db.get(categoryId);
  if (category === null || category.groupId !== groupId) {
    throw new ConvexError("Category does not belong to the current group");
  }
}

async function insertDraftItems(
  ctx: Pick<MutationCtx, "db">,
  groupId: Id<"groups">,
  draftId: Id<"aiExpenseDrafts">,
  items: AiExpenseDraftItemInput[],
  now: number,
) {
  for (const item of items) {
    await assertCategoryBelongsToGroup(ctx, item.categoryId, groupId);
    await ctx.db.insert("aiExpenseDraftItems", {
      groupId,
      draftId,
      itemName: item.itemName,
      lineType: item.lineType,
      amountYen: item.amountYen,
      printedAmountYen: item.printedAmountYen,
      amountBasis: item.amountBasis,
      taxRatePercent: item.taxRatePercent,
      markers: item.markers,
      taxMarker: item.taxMarker,
      allocatedTaxYen: item.allocatedTaxYen,
      taxAllocationStatus: item.taxAllocationStatus,
      normalizedAmountYen: item.normalizedAmountYen,
      taxResolutionStatus: item.taxResolutionStatus,
      taxResolutionSource: item.taxResolutionSource,
      taxReviewReasons: item.taxReviewReasons,
      quantity: item.quantity,
      unitPriceYen: item.unitPriceYen,
      categoryName: item.categoryName,
      categoryId: item.categoryId,
      confidence: item.confidence,
      warnings: item.warnings,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function persistExtractedDraft(
  ctx: MutationCtx,
  actor: ResolvedActor,
  args: CreateFromExtractionArgs,
) {
  await assertCategoryBelongsToGroup(ctx, args.categoryId, actor.groupId);

  const now = Date.now();
  const classification = classifyCreatedDraft(args as CreatedDraftClassificationInput);
  const aiValues: ReceiptDraftValueSnapshot<Id<"categories">> = {
    status: classification.status,
    documentType: args.documentType,
    shopName: args.shopName,
    paymentPlace: args.paymentPlace,
    payeeName: args.payeeName,
    paymentPurpose: args.paymentPurpose,
    date: args.date,
    amountYen: args.amountYen,
    taxSummaries: args.taxSummaries,
    receiptTotalResolution: args.receiptTotalResolution,
    receiptTaxDecision: args.receiptTaxDecision,
    receiptLineClassifications: args.receiptLineClassifications,
    markerDefinitions: args.markerDefinitions,
    categoryId: args.categoryId,
    confidence: args.confidence,
    warnings: args.warnings,
    reviewReasons: classification.reviewReasons,
    items: args.items ?? [],
  };
  const values = applyReceiptUserOverride(aiValues, args.preservedUserOverride);
  await assertCategoryBelongsToGroup(ctx, values.categoryId, actor.groupId);
  const draftId = await ctx.db.insert("aiExpenseDrafts", {
    groupId: actor.groupId,
    createdByUserId: actor.userId,
    sourceType: "image_upload",
    status: values.status,
    documentType: values.documentType,
    imageFileName: args.imageFileName,
    shopName: values.shopName,
    paymentPlace: values.paymentPlace,
    payeeName: values.payeeName,
    paymentPurpose: values.paymentPurpose,
    date: values.date,
    amountYen: values.amountYen,
    taxSummaries: values.taxSummaries,
    receiptTotalResolution: values.receiptTotalResolution,
    receiptTaxDecision: values.receiptTaxDecision,
    receiptDataContractVersion: 1,
    markerDefinitions: values.markerDefinitions,
    categoryId: values.categoryId,
    confidence: values.confidence,
    warnings: values.warnings,
    reviewReasons: values.reviewReasons,
    rawObservation:
      args.rawObservationLines === undefined
        ? undefined
        : { source: "ai_ocr", observedAt: now, lines: args.rawObservationLines },
    receiptInterpretation: { source: "ai", interpretedAt: now, values: aiValues },
    receiptUserOverride: args.preservedUserOverride,
    createdAt: now,
    updatedAt: now,
  });

  await insertDraftItems(ctx, actor.groupId, draftId, values.items, now);

  const draft = await ctx.db.get(draftId);
  if (draft === null) {
    throw new ConvexError("AI expense draft was not found after creation");
  }
  return draft;
}

async function persistFailedDraft(
  ctx: MutationCtx,
  actor: ResolvedActor,
  args: CreateFailedDraftFromImageAnalysisArgs,
) {
  const now = Date.now();
  const draftId = await ctx.db.insert("aiExpenseDrafts", {
    groupId: actor.groupId,
    createdByUserId: actor.userId,
    sourceType: "image_upload",
    status: "failed",
    documentType: "unknown",
    imageFileName: args.imageFileName,
    confidence: {},
    warnings: [args.warning],
    reviewReasons: ["parse_failed"],
    createdAt: now,
    updatedAt: now,
  });

  const draft = await ctx.db.get(draftId);
  if (draft === null) {
    throw new ConvexError("AI expense draft was not found after creation");
  }
  return draft;
}

async function requireResolvedActorForUser(
  ctx: MutationCtx,
  userId: string,
): Promise<ResolvedActor> {
  const resolved = await resolveActiveGroupForUserId(ctx, userId);
  if (resolved.status !== "resolved") {
    throw new ConvexError("Active group is required");
  }
  return { userId, groupId: resolved.membership.groupId };
}

export async function createFromExtractionHandler(
  ctx: MutationCtx,
  args: CreateFromExtractionArgs,
) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return persistExtractedDraft(ctx, { userId, groupId }, args);
}

export async function createFromExtractionForUserHandler(
  ctx: MutationCtx,
  args: CreateFromExtractionForUserArgs,
) {
  const actor = await requireResolvedActorForUser(ctx, args.userId);
  return persistExtractedDraft(ctx, actor, args);
}

export async function createFailedDraftFromImageAnalysisHandler(
  ctx: MutationCtx,
  args: CreateFailedDraftFromImageAnalysisArgs,
) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return persistFailedDraft(ctx, { userId, groupId }, args);
}

export async function createFailedDraftFromImageAnalysisForUserHandler(
  ctx: MutationCtx,
  args: CreateFailedDraftFromImageAnalysisForUserArgs,
) {
  const actor = await requireResolvedActorForUser(ctx, args.userId);
  return persistFailedDraft(ctx, actor, args);
}

export async function deleteOrphanedDraftHandler(
  ctx: MutationCtx,
  args: { draftId: Id<"aiExpenseDrafts"> },
) {
  const { groupId } = await requireGroupMembership(ctx);
  await deleteDraftAndItems(ctx, args.draftId, groupId);
}
