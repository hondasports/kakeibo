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
  type DraftSummaryOverride,
  type DraftTaxOverride,
  type ReinterpretDraftTaxInput,
} from "../receipt/tax/reinterpretDraftTax";

export type ReceiptTotalSource = "explicit_label" | "user_confirmed" | "ai_estimate";

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

export const UPDATED_DRAFT_NOT_FOUND_MESSAGE = "Failed to retrieve updated AI expense draft";

/**
 * 再解釈の適格性を判定する。不在 → 他グループ → 金額/税サマリ欠落の順。
 * 税サマリが無い下書きでも、ユーザーが新しい税情報を供給するオーバーライド
 * （decisionOverride・明細単位 override・未解決一括 override）があれば許可する。
 * summaryOverride は既存サマリの編集なので適格性の根拠にはしない。
 */
export function validateTaxInterpretationEligibility(
  draft: AiExpenseDraftFields | null,
  groupId: string,
  overrides?: Pick<
    TaxInterpretationPlanArgs,
    "decisionOverride" | "override" | "bulkUnresolvedOverride"
  >,
):
  | { success: true; draft: AiExpenseDraftFields & { amountYen: number } }
  | { success: false; error: TaxInterpretationEligibilityError } {
  if (draft === null) return { success: false, error: "not_found" };
  if (draft.groupId !== groupId) return { success: false, error: "wrong_group" };
  const hasOverride =
    overrides?.decisionOverride !== undefined ||
    overrides?.override !== undefined ||
    overrides?.bulkUnresolvedOverride !== undefined;
  if (
    draft.amountYen === undefined ||
    ((!draft.taxSummaries || draft.taxSummaries.length === 0) && !hasOverride)
  ) {
    return { success: false, error: "missing_amount_or_summaries" };
  }
  return { success: true, draft: { ...draft, amountYen: draft.amountYen } };
}

/** 保存済み合計候補から現在の amountYen に一致する source を採用する。3値以外は ai_estimate。 */
export function resolveReceiptTotalSource(
  draft: Pick<AiExpenseDraftFields, "amountYen" | "receiptTotalResolution">,
): ReceiptTotalSource {
  const persisted = draft.receiptTotalResolution?.candidates.find(
    (candidate) => candidate.amountYen === draft.amountYen,
  )?.source;
  return persisted === "explicit_label" ||
    persisted === "user_confirmed" ||
    persisted === "ai_estimate"
    ? persisted
    : "ai_estimate";
}

/** 税サマリ由来・税計算由来の候補は再解釈の裏付けから除外する。 */
export function resolveReceiptTotalSupportingCandidates(
  draft: Pick<AiExpenseDraftFields, "receiptTotalResolution">,
) {
  return draft.receiptTotalResolution?.candidates.filter(
    (candidate) =>
      candidate.source !== "tax_summary_total" && candidate.source !== "tax_arithmetic",
  );
}

export type TaxInterpretationPlanArgs = {
  preservedNonTaxReasons?: AiExpenseDraftReviewReason[];
  override?: DraftTaxOverride;
  bulkUnresolvedOverride?: BulkUnresolvedTaxOverride;
  summaryOverride?: DraftSummaryOverride;
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
  warnings?: string[];
  updatedAt: number;
};

export type DraftTaxInterpretationPatch = {
  status: "ready" | "needs_review";
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
    markerDefinitions: draft.markerDefinitions,
    rawObservationLines: draft.rawObservation?.lines,
    receiptLineClassifications: draft.receiptInterpretation?.values.receiptLineClassifications,
    items: items.map(mapDraftItemToTaxFields),
    override: args.override,
    bulkUnresolvedOverride: args.bulkUnresolvedOverride,
    summaryOverride: args.summaryOverride,
    decisionOverride: args.decisionOverride,
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
      taxSummaries: interpretation.taxSummaries,
      receiptTotalResolution: interpretation.receiptTotalResolution,
      receiptTaxDecision: interpretation.decision,
      warnings: [...new Set([...nonInterpretationWarnings, ...interpretation.warnings])],
      reviewReasons,
      updatedAt: now,
    },
  };
}
