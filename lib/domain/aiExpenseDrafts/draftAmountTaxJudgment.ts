import {
  isDiscountLine,
  isValidSignedLineItemAmount,
  type ReceiptItemLineType,
} from "../receipt/discountItems";
import type { ExtractedTaxSummary, ReceiptTaxInterpretation } from "../receipt/tax/types";
import {
  deriveTaxReviewReasons,
  hasReceiptTaxMetadata,
  mapDraftItemToTaxFields,
} from "../receipt/tax/draftTaxMapping";
import { reinterpretDraftTax } from "../receipt/tax/reinterpretDraftTax";
import {
  resolveReceiptTotalSource,
  resolveReceiptTotalSupportingCandidates,
} from "./receiptTotalEvidence";
import { resolveReceiptTaxCorrections } from "./receiptDataContract";
import { buildReviewChecks, type ReviewChecks } from "./reviewChecks";
import { buildTaxContextFromReviewItem } from "./receiptItemTaxViewModel";
import { getReviewGuidance } from "./reviewGuidance";
import { mapDraftItemsToReviewItems, mapDraftToReviewForm } from "./reviewDraftMapping";
import { buildReviewTaxEvidence, buildReviewTaxPreview } from "./reviewItemsTaxPreview";
import { isUnrelatedToAmountTaxGuidanceId } from "./reviewJudgment";
import { validateReviewInput } from "./reviewValidation";
import { takeDraftJudgmentItems } from "./judgmentItemWindow";
import type { AiExpenseDraftJudgmentInput } from "./reviewTypes";

export type DraftAmountTaxJudgment = (
  | { status: "not_applicable"; reasons: [] }
  | { status: "resolved"; reasons: [] }
  | {
      status: "unresolved";
      reasons: Array<"amount_mismatch" | "user_confirmation_required">;
      amountError?: "invalid_item_amount" | "amount_mismatch" | "non_positive_category_total";
      taxRegistrationBlocked?: boolean;
    }
) & { checks: ReviewChecks; unresolvedTaxItemCount: number };

export function analyzeRegistrationAmounts(
  amountYen: number | undefined,
  items: readonly {
    itemName: string;
    lineType?: ReceiptItemLineType;
    amountYen: number;
    normalizedAmountYen?: number;
    categoryId?: string;
  }[],
) {
  const invalidItems = items.map(
    (item) =>
      !isValidSignedLineItemAmount(
        item.itemName,
        item.normalizedAmountYen ?? item.amountYen,
        item.lineType,
      ),
  );
  const totals = new Map<string, number>();
  let total = 0;
  for (const item of items) {
    const amount = item.normalizedAmountYen ?? item.amountYen;
    total += amount;
    if (item.categoryId !== undefined)
      totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + amount);
  }
  return {
    invalidItems,
    amountMismatch: amountYen === undefined || total !== amountYen,
    nonPositiveCategoryTotal: [...totals.values()].some((amount) => amount <= 0),
  };
}

export function judgeDraftAmountAndTax(
  draft: AiExpenseDraftJudgmentInput,
  options: {
    itemScope?: "judgment_window" | "all_items";
    inputKind?: "stored" | "form";
    interpretation?: ReceiptTaxInterpretation;
  } = {},
): DraftAmountTaxJudgment {
  const draftItems =
    options.itemScope === "all_items"
      ? (draft.items ?? [])
      : takeDraftJudgmentItems(draft.items ?? []);
  if (draft.registrationMode === "totalOnly" || draftItems.length === 0) {
    const checks = buildReviewChecks({
      items: mapDraftItemsToReviewItems(draftItems),
      paidTotalYen: draft.amountYen,
      taxSummaries: draft.taxSummaries,
      rawObservation: draft.rawObservation,
      receiptLineClassifications: draft.receiptInterpretation?.values.receiptLineClassifications,
    });
    const unresolvedTaxItemCount = mapDraftItemsToReviewItems(draftItems).filter(
      (item) => buildTaxContextFromReviewItem(item).status === "unresolved",
    ).length;
    if (draft.registrationMode === "totalOnly" || !hasReceiptTaxMetadata(draft, draftItems))
      return { status: "not_applicable", reasons: [], checks, unresolvedTaxItemCount };
    return { status: "unresolved", reasons: ["amount_mismatch"], checks, unresolvedTaxItemCount };
  }
  const form = mapDraftToReviewForm(draft);
  const sourceItems = mapDraftItemsToReviewItems(draftItems).map((item, index) => ({
    ...item,
    printedAmountYen: draftItems[index].printedAmountYen ?? draftItems[index].amountYen,
    discountTargetItemId:
      isDiscountLine(item.itemName, item.lineType) && !item.discountTargetItemId
        ? item.id
        : item.discountTargetItemId,
  }));
  const preview = buildReviewTaxPreview(sourceItems, {
    ...buildReviewTaxEvidence(draft),
    paidTotalYen: draft.amountYen,
  });
  const checks = buildReviewChecks({
    items: preview.items,
    paidTotalYen: draft.amountYen,
    taxSummaries: preview.taxSummaries,
    rawObservation: draft.rawObservation,
    receiptLineClassifications: draft.receiptInterpretation?.values.receiptLineClassifications,
  });
  const unresolvedTaxItemCount = preview.items.filter(
    (item) => buildTaxContextFromReviewItem(item).status === "unresolved",
  ).length;
  const validation = validateReviewInput(form, preview.items);
  const guidance = getReviewGuidance(form, preview.items, {
    ...draft,
    taxSummaries: preview.taxSummaries,
  });
  const arithmetic = analyzeRegistrationAmounts(
    draft.amountYen,
    options.inputKind === "form"
      ? preview.items.map((item) => ({
          ...item,
          amountYen: Number(item.amountYen),
          categoryId: item.categoryId || undefined,
        }))
      : draftItems,
  );
  const amountError =
    validation.some((issue) => issue.code === "itemName" || issue.code === "itemAmount") ||
    arithmetic.invalidItems.some(Boolean)
      ? ("invalid_item_amount" as const)
      : arithmetic.amountMismatch
        ? ("amount_mismatch" as const)
        : arithmetic.nonPositiveCategoryTotal
          ? ("non_positive_category_total" as const)
          : undefined;
  const amountProblem = amountError !== undefined;
  const hasTaxMetadata = hasReceiptTaxMetadata(draft, draftItems);
  const taxProblem =
    hasTaxMetadata &&
    (checks.amount.status === "uncomparable" ||
      checks.taxRate.status !== "matched" ||
      guidance.some(
        (issue) =>
          !isUnrelatedToAmountTaxGuidanceId(issue.id) &&
          !issue.id.startsWith("amount-") &&
          !issue.id.startsWith("name-") &&
          issue.id !== "aggregate",
      ));
  let storedTaxMismatch = false;
  let currentInterpretation = options.interpretation;
  if (hasTaxMetadata && draft.amountYen !== undefined) {
    const { interpretation, itemFields } = reinterpretDraftTax({
      amountYen: draft.amountYen,
      receiptTotalSource: resolveReceiptTotalSource(draft),
      receiptTotalSupportingCandidates: resolveReceiptTotalSupportingCandidates(draft),
      receiptLineClassifications: draft.receiptInterpretation?.values.receiptLineClassifications,
      items: draftItems.map(mapDraftItemToTaxFields),
      rawObservationLines:
        draft.rawObservation?.source === "ai_ocr" ? draft.rawObservation.lines : undefined,
      taxSummaries: (draft.taxSummaries ?? []).map((summary) => ({
        ...summary,
        confidence: (summary as Partial<ExtractedTaxSummary>).confidence ?? {},
      })),
      sourceTaxSummaries: draft.receiptInterpretation?.values.taxSummaries,
      correctedTaxSummaries: resolveReceiptTaxCorrections(
        draft.receiptUserOverride,
        draft.receiptInterpretation?.values.taxSummaries,
      ),
      markerDefinitions: draft.markerDefinitions,
    });
    currentInterpretation ??= interpretation;
    storedTaxMismatch =
      options.inputKind !== "form" &&
      (interpretation.taxSummaries.some((summary) => summary.status !== "verified") ||
        itemFields.some(
          (item, index) =>
            item.taxAllocationStatus !== "allocated" ||
            item.normalizedAmountYen !==
              (draftItems[index].normalizedAmountYen ?? draftItems[index].amountYen),
        ) ||
        itemFields.reduce((sum, item) => sum + item.normalizedAmountYen, 0) !== draft.amountYen);
  }
  const reasons: Array<"amount_mismatch" | "user_confirmation_required"> = [];
  const interpretedReasons = deriveTaxReviewReasons(currentInterpretation);
  if (taxProblem || storedTaxMismatch || interpretedReasons.includes("user_confirmation_required"))
    reasons.push("user_confirmation_required");
  if (amountProblem || interpretedReasons.includes("amount_mismatch"))
    reasons.push("amount_mismatch");
  return reasons.length
    ? {
        status: "unresolved",
        reasons,
        checks,
        unresolvedTaxItemCount,
        ...(amountError ? { amountError } : {}),
        ...(storedTaxMismatch ? { taxRegistrationBlocked: true } : {}),
      }
    : { status: "resolved", reasons: [], checks, unresolvedTaxItemCount };
}
