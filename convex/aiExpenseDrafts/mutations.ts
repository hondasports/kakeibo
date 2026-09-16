import { v, type Infer } from "convex/values";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  aiExpenseDraftDocumentTypeValidator,
  aiExpenseDraftItemConfidenceValidator,
  aiExpenseRegistrationModeValidator,
  amountBasisValidator,
  receiptItemTaxRatePercentValidator,
  taxModeValidator,
  taxSummaryTaxRatePercentValidator,
} from "./model";
import { requireGroupMembership } from "../groups/membership";
import { deleteAiExpenseDraft } from "../../lib/usecase/aiExpenseDrafts/deleteDraft";
import { createAiExpenseDraftDeps } from "../../lib/convex/aiExpenseDrafts/draftUsecaseDeps";
import { updateDraftItemTaxOverridesHandler } from "../../lib/convex/aiExpenseDrafts/updateItemTaxOverrides";
import { updateSummaryTaxOverridesHandler } from "../../lib/convex/aiExpenseDrafts/updateSummaryTaxOverrides";
import { registerReadyDraftsHandler } from "../../lib/convex/aiExpenseDrafts/registerToReceipts";
import { registerReadyDraftsAsExpenseEntriesHandler } from "../../lib/convex/aiExpenseDrafts/registerToExpenseEntries";
import { applyReceiptTaxSettingsHandler } from "../../lib/convex/aiExpenseDrafts/applyReceiptTaxSettings";
import { updateForReviewHandler } from "../../lib/convex/aiExpenseDrafts/updateForReview";
import type { TaxMode, TaxRatePercent } from "../../lib/receiptTax/types";
import { priceTaxTreatmentValidator, taxRateCompositionValidator } from "./validators";
import { resetReceiptToAiInterpretationHandler } from "../../lib/convex/aiExpenseDrafts/receiptDataContract";
import { updateRegisteredDraftHandler } from "../../lib/convex/aiExpenseDrafts/updateRegisteredDraft";

type DeleteDraftArgs = {
  draftId: Id<"aiExpenseDrafts">;
};

export async function deleteDraftHandler(ctx: MutationCtx, args: DeleteDraftArgs) {
  const { groupId } = await requireGroupMembership(ctx);
  return await deleteAiExpenseDraft({ groupId }, createAiExpenseDraftDeps(ctx), args);
}

export async function updateDraftItemTaxOverridesMutationHandler(
  ctx: MutationCtx,
  args: {
    draftId: Id<"aiExpenseDrafts">;
    itemId: Id<"aiExpenseDraftItems">;
    taxRatePercent?: Infer<typeof receiptItemTaxRatePercentValidator>;
    amountBasis?: Infer<typeof amountBasisValidator>;
  },
) {
  const { groupId } = await requireGroupMembership(ctx);
  return await updateDraftItemTaxOverridesHandler(ctx, args, groupId);
}

export async function updateSummaryTaxOverridesMutationHandler(
  ctx: MutationCtx,
  args: {
    draftId: Id<"aiExpenseDrafts">;
    summaryIndex: number;
    taxRatePercent?: TaxRatePercent;
    taxMode?: TaxMode;
    taxableAmountYen?: number;
    taxableAmountBasis?: Infer<typeof amountBasisValidator>;
    taxYen?: number;
    taxIncludedAmountYen?: number;
  },
) {
  const { groupId } = await requireGroupMembership(ctx);
  return await updateSummaryTaxOverridesHandler(ctx, args, groupId);
}

export async function applyReceiptTaxSettingsMutationHandler(
  ctx: MutationCtx,
  args: {
    draftId: Id<"aiExpenseDrafts">;
    taxRatePercent?: Infer<typeof receiptItemTaxRatePercentValidator>;
    amountBasis?: Infer<typeof amountBasisValidator>;
  },
) {
  const { groupId } = await requireGroupMembership(ctx);
  return await applyReceiptTaxSettingsHandler(ctx, args, groupId);
}

export async function resetReceiptToAiInterpretationMutationHandler(
  ctx: MutationCtx,
  args: { draftId: Id<"aiExpenseDrafts"> },
) {
  const { groupId } = await requireGroupMembership(ctx);
  return await resetReceiptToAiInterpretationHandler(ctx, args, groupId);
}

export const deleteDraft = mutation({
  args: {
    draftId: v.id("aiExpenseDrafts"),
  },
  handler: deleteDraftHandler,
});

export const updateForReview = mutation({
  args: {
    draftId: v.id("aiExpenseDrafts"),
    documentType: aiExpenseDraftDocumentTypeValidator,
    shopName: v.optional(v.string()),
    paymentPlace: v.optional(v.string()),
    payeeName: v.optional(v.string()),
    paymentPurpose: v.optional(v.string()),
    date: v.string(),
    amountYen: v.number(),
    registrationMode: v.optional(aiExpenseRegistrationModeValidator),
    priceTaxTreatment: v.optional(priceTaxTreatmentValidator),
    taxRateComposition: v.optional(taxRateCompositionValidator),
    categoryId: v.id("categories"),
    items: v.optional(
      v.array(
        v.object({
          itemId: v.optional(v.id("aiExpenseDraftItems")),
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
          categoryId: v.id("categories"),
          confidence: v.optional(aiExpenseDraftItemConfidenceValidator),
          warnings: v.optional(v.array(v.string())),
        }),
      ),
    ),
  },
  handler: updateForReviewHandler,
});

export const updateDraftItemTaxOverrides = mutation({
  args: {
    draftId: v.id("aiExpenseDrafts"),
    itemId: v.id("aiExpenseDraftItems"),
    taxRatePercent: v.optional(receiptItemTaxRatePercentValidator),
    amountBasis: v.optional(amountBasisValidator),
  },
  handler: updateDraftItemTaxOverridesMutationHandler,
});

export const updateSummaryTaxOverrides = mutation({
  args: {
    draftId: v.id("aiExpenseDrafts"),
    summaryIndex: v.number(),
    taxRatePercent: v.optional(taxSummaryTaxRatePercentValidator),
    taxMode: v.optional(taxModeValidator),
    taxableAmountYen: v.optional(v.number()),
    taxableAmountBasis: v.optional(amountBasisValidator),
    taxYen: v.optional(v.number()),
    taxIncludedAmountYen: v.optional(v.number()),
  },
  handler: updateSummaryTaxOverridesMutationHandler,
});

export const applyReceiptTaxSettings = mutation({
  args: {
    draftId: v.id("aiExpenseDrafts"),
    taxRatePercent: v.optional(receiptItemTaxRatePercentValidator),
    amountBasis: v.optional(amountBasisValidator),
  },
  handler: applyReceiptTaxSettingsMutationHandler,
});

export const resetReceiptToAiInterpretation = mutation({
  args: {
    draftId: v.id("aiExpenseDrafts"),
  },
  handler: resetReceiptToAiInterpretationMutationHandler,
});

export const registerReadyDrafts = mutation({
  args: {
    draftIds: v.array(v.id("aiExpenseDrafts")),
  },
  handler: registerReadyDraftsHandler,
});

export const registerReadyDraftsAsExpenseEntries = mutation({
  args: {
    draftIds: v.array(v.id("aiExpenseDrafts")),
  },
  handler: registerReadyDraftsAsExpenseEntriesHandler,
});

export const updateRegisteredDraft = mutation({
  args: {
    draftId: v.id("aiExpenseDrafts"),
    date: v.string(),
    amountYen: v.number(),
    categoryId: v.id("categories"),
    shopName: v.string(),
    memo: v.optional(v.string()),
    registrationMode: aiExpenseRegistrationModeValidator,
    items: v.optional(
      v.array(
        v.object({
          itemId: v.optional(v.id("aiExpenseDraftItems")),
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
          categoryId: v.id("categories"),
          confidence: v.optional(aiExpenseDraftItemConfidenceValidator),
          warnings: v.optional(v.array(v.string())),
        }),
      ),
    ),
  },
  handler: updateRegisteredDraftHandler,
});

export {
  registerReadyDraftsAsExpenseEntriesHandler,
  registerReadyDraftsHandler,
  updateForReviewHandler,
  updateRegisteredDraftHandler,
};
