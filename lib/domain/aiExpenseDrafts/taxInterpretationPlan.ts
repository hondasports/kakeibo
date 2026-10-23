import {
  type ReceiptTotalSource,
  resolveReceiptTotalSource,
  resolveReceiptTotalSupportingCandidates,
} from "./receiptTotalEvidence";
export {
  type ReceiptTotalSource,
  resolveReceiptTotalSource,
  resolveReceiptTotalSupportingCandidates,
} from "./receiptTotalEvidence";
import {
  snapshotReceiptDraftValues,
  resolveReceiptTaxChoices,
  resolveReceiptTaxCorrections,
} from "./receiptDataContract";
/**
 * 税再解釈を下書き・明細へ永続化するための計画を算出する純粋ルール。
 * DB 取得・patch は infra に委ねる。
 */
import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import { classifyAiExpenseDraft } from "./classification";
import type { AiExpenseDraftReviewReason } from "./constants";
import {
  filterNonInterpretationWarnings,
  mergeReviewReasons,
  nonTaxReviewReasons,
} from "./reviewReasons";
import { deriveTaxReviewReasons, mapDraftItemToTaxFields } from "../receipt/tax/draftTaxMapping";
import {
  reinterpretDraftTax,
  type BulkUnresolvedTaxOverride,
  type DraftTaxOverride,
  type ReinterpretDraftTaxInput,
} from "../receipt/tax/reinterpretDraftTax";

export type TaxInterpretationEligibilityError =
  | "not_found"
  | "wrong_group"
  | "missing_amount_or_summaries";

const eligibilityErrorMessages: Record<TaxInterpretationEligibilityError, string> = {
  not_found: "AI expense draft not found",
  wrong_group: "AI expense draft does not belong to the current group",
  missing_amount_or_summaries: "Tax reinterpretation requires draft amount and tax summaries",
};

export function getTaxInterpretationEligibilityErrorMessage(
  error: TaxInterpretationEligibilityError,
): string {
  return eligibilityErrorMessages[error];
}

/**
 * 再解釈の適格性を判定する。不在 → 他グループ → 金額欠落の順。
 */
export function validateTaxInterpretationEligibility(
  draft: AiExpenseDraftFields | null,
  groupId: string,
  _overrides?: Pick<
    TaxInterpretationPlanArgs,
    "decisionOverride" | "override" | "bulkUnresolvedOverride"
  >,
):
  | { success: true; draft: AiExpenseDraftFields & { amountYen: number } }
  | { success: false; error: TaxInterpretationEligibilityError } {
  if (draft === null) return { success: false, error: "not_found" };
  if (draft.groupId !== groupId) return { success: false, error: "wrong_group" };
  if (draft.amountYen === undefined) {
    return { success: false, error: "missing_amount_or_summaries" };
  }
  return { success: true, draft: { ...draft, amountYen: draft.amountYen } };
}

export type TaxInterpretationPlanArgs = {
  preservedNonTaxReasons?: AiExpenseDraftReviewReason[];
  override?: DraftTaxOverride;
  bulkUnresolvedOverride?: BulkUnresolvedTaxOverride;
  receiptTotalSource?: ReceiptTotalSource;
  decisionOverride?: ReinterpretDraftTaxInput["decisionOverride"];
};

export type DraftItemTaxPatch = {
  printedAmountYen: number;
  amountYen: number;
  amountBasis?: AiExpenseDraftItemFields["amountBasis"];
  taxRatePercent?: AiExpenseDraftItemFields["taxRatePercent"];
  allocatedTaxYen?: number;
  taxAllocationStatus?: AiExpenseDraftItemFields["taxAllocationStatus"];
  normalizedAmountYen?: number;
  taxResolutionStatus?: AiExpenseDraftItemFields["taxResolutionStatus"];
  taxResolutionSource?: AiExpenseDraftItemFields["taxResolutionSource"];
  taxReviewReasons?: string[];
  taxConfirmedFields?: AiExpenseDraftItemFields["taxConfirmedFields"];
  warnings?: string[];
  updatedAt: number;
};

export type DraftTaxInterpretationPatch = {
  status: "ready" | "needs_review";
  receiptInterpretation: AiExpenseDraftFields["receiptInterpretation"];
  taxSummaries: AiExpenseDraftFields["taxSummaries"];
  receiptTotalResolution: AiExpenseDraftFields["receiptTotalResolution"];
  receiptTaxDecision: AiExpenseDraftFields["receiptTaxDecision"];
  warnings: string[];
  reviewReasons: AiExpenseDraftReviewReason[];
  updatedAt: number;
};

export type TaxInterpretationPlan = {
  itemPatches: Array<{ itemId: string; patch: DraftItemTaxPatch }>;
  draftPatch: DraftTaxInterpretationPatch;
};

/**
 * 再解釈を実行し、明細・下書きへ適用する patch を算出する。
 * registrationMode が totalOnly の下書きは税の詳細を無視して分類する。
 */
export function planDraftTaxInterpretation(
  draft: AiExpenseDraftFields & { amountYen: number },
  items: readonly (AiExpenseDraftItemFields & { id: string })[],
  args: TaxInterpretationPlanArgs,
  now: number,
): TaxInterpretationPlan {
  const { interpretation, itemFields } = reinterpretDraftTax({
    amountYen: draft.amountYen,
    receiptTotalSource: args.receiptTotalSource ?? resolveReceiptTotalSource(draft),
    receiptTotalConfidence: draft.confidence.amountYen,
    receiptTotalSupportingCandidates: resolveReceiptTotalSupportingCandidates(draft),
    taxSummaries: draft.taxSummaries ?? [],
    sourceTaxSummaries: draft.receiptInterpretation?.values.taxSummaries,
    correctedTaxSummaries: resolveReceiptTaxCorrections(
      draft.receiptUserOverride,
      draft.receiptInterpretation?.values.taxSummaries,
    ),
    markerDefinitions: draft.markerDefinitions,
    rawObservationLines:
      draft.rawObservation?.source === "ai_ocr" ? draft.rawObservation.lines : undefined,
    receiptLineClassifications: draft.receiptInterpretation?.values.receiptLineClassifications,
    items: items.map(mapDraftItemToTaxFields),
    override: args.override,
    bulkUnresolvedOverride: args.bulkUnresolvedOverride,
    decisionOverride:
      args.decisionOverride ??
      (args.override || args.bulkUnresolvedOverride ? undefined : resolveReceiptTaxChoices(draft)),
  });

  const ignoresTaxDetails = draft.registrationMode === "totalOnly";
  const taxReviewReasons = ignoresTaxDetails ? [] : deriveTaxReviewReasons(interpretation);
  const preservedReasons = args.preservedNonTaxReasons ?? nonTaxReviewReasons(draft.reviewReasons);
  const mergedTaxReasons = mergeReviewReasons(taxReviewReasons, preservedReasons);
  const classification = classifyAiExpenseDraft({
    documentType: draft.documentType,
    shopName: draft.shopName,
    paymentPlace: draft.paymentPlace,
    payeeName: draft.payeeName,
    paymentPurpose: draft.paymentPurpose,
    date: draft.date,
    amountYen: draft.amountYen,
    categoryId: draft.categoryId,
    confidence: draft.confidence,
    warnings: ignoresTaxDetails
      ? filterNonInterpretationWarnings(draft.warnings ?? [])
      : interpretation.warnings,
    multiCategoryConfirmed: true,
    items: ignoresTaxDetails
      ? undefined
      : items.map((item, index) => ({
          itemName: item.itemName,
          amountYen: itemFields[index]?.normalizedAmountYen ?? item.amountYen,
          categoryId: item.categoryId,
        })),
  });
  const reviewReasons = mergeReviewReasons(classification.reviewReasons, mergedTaxReasons);
  const status = reviewReasons.length === 0 ? "ready" : "needs_review";

  const itemPatches: TaxInterpretationPlan["itemPatches"] = [];
  for (const [index, item] of items.entries()) {
    const fields = itemFields[index];
    if (!fields) {
      continue;
    }
    itemPatches.push({
      itemId: item.id,
      patch: {
        printedAmountYen: item.printedAmountYen ?? fields.printedAmountYen ?? item.amountYen,
        amountYen: fields.normalizedAmountYen ?? item.amountYen,
        amountBasis: fields.amountBasis,
        taxRatePercent: fields.taxRatePercent,
        allocatedTaxYen: fields.allocatedTaxYen,
        taxAllocationStatus: fields.taxAllocationStatus,
        normalizedAmountYen: fields.normalizedAmountYen,
        taxResolutionStatus: fields.taxResolutionStatus,
        taxResolutionSource: fields.taxResolutionSource,
        taxReviewReasons: fields.taxReviewReasons,
        taxConfirmedFields: fields.taxConfirmedFields,
        warnings: fields.warnings,
        updatedAt: now,
      },
    });
  }

  const nonInterpretationWarnings = filterNonInterpretationWarnings(draft.warnings ?? []);

  return {
    itemPatches,
    draftPatch: {
      status,
      receiptInterpretation: draft.receiptInterpretation ?? {
        source: "legacy_projection",
        interpretedAt: now,
        values: snapshotReceiptDraftValues(draft, items),
      },
      taxSummaries: interpretation.taxSummaries,
      receiptTotalResolution: interpretation.receiptTotalResolution,
      receiptTaxDecision: interpretation.decision,
      warnings: [...new Set([...nonInterpretationWarnings, ...interpretation.warnings])],
      reviewReasons,
      updatedAt: now,
    },
  };
}
