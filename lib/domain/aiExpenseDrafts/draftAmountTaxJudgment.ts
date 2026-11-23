import {
  isDiscountLine,
  isValidSignedLineItemAmount,
  type ReceiptItemLineType,
} from "../receipt/discountItems";
import { hasReceiptTaxMetadata } from "../receipt/tax/draftTaxMapping";
import { buildReviewChecks, type ReviewChecks } from "./reviewChecks";
import { buildAmountCheck } from "./reviewAmountChecks";
import { buildTaxContextFromReviewItem } from "./receiptItemTaxViewModel";
import { mapDraftItemsToReviewItems, mapDraftToReviewForm } from "./reviewDraftMapping";
import { buildReviewTaxEvidence, buildReviewTaxPreview } from "./reviewItemsTaxPreview";
import { validateReviewInput } from "./reviewValidation";
import { takeDraftJudgmentItems } from "./judgmentItemWindow";
import type { AiExpenseDraftJudgmentInput, ReviewItemValues } from "./reviewTypes";

type DraftAmountTaxJudgment = (
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

function hasUnresolvedDiscountTarget(
  items: ReviewItemValues[],
  originalItems: ReviewItemValues[],
): boolean {
  const products = items.filter((item) => !isDiscountLine(item.itemName, item.lineType));
  const productsById = new Map(products.map((item) => [item.id, item]));
  const productCategories = new Set(products.map((item) => item.categoryId));
  return items.some((item, index) => {
    if (!isDiscountLine(item.itemName, item.lineType) || Number(item.amountYen) >= 0) return false;
    const targetId = originalItems[index].discountTargetItemId;
    if (targetId === undefined) {
      return !item.categoryId || !productCategories.has(item.categoryId);
    }
    const target = productsById.get(targetId);
    return !target || item.taxRatePercent !== target.taxRatePercent;
  });
}

export function judgeDraftAmountAndTax(
  draft: AiExpenseDraftJudgmentInput,
  options: {
    itemScope?: "judgment_window" | "all_items";
    inputKind?: "stored" | "form";
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
  const originalItems = mapDraftItemsToReviewItems(draftItems);
  const sourceItems = originalItems.map((item, index) => ({
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
  const hasTaxMetadata = hasReceiptTaxMetadata(draft, draftItems);
  const allocated = preview.items.every((item) => item.taxAllocationStatus === "allocated");
  if (preview.receiptTotalConflict) {
    checks.amount = {
      status: "uncomparable",
      variant: "direct",
      blockerCode: "missing-paid-total",
      reason: "支払合計の読み取りが一致していません。レシートの支払額を確認してください",
      focusTarget: "amountYen",
      paidTotalYen: draft.amountYen,
    };
  } else if (hasTaxMetadata && allocated && checks.amount.status !== "matched") {
    checks.amount = buildAmountCheck({ items: preview.items, paidTotalYen: draft.amountYen });
  }

  const validation = validateReviewInput(form, preview.items);
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
  const storedTaxMismatch =
    hasTaxMetadata &&
    allocated &&
    options.inputKind !== "form" &&
    preview.items.some(
      (item, index) =>
        item.normalizedAmountYen !==
        (draftItems[index].normalizedAmountYen ?? draftItems[index].amountYen),
    );
  const taxProblem =
    hasTaxMetadata && (!allocated || unresolvedTaxItemCount > 0 || preview.receiptTotalConflict);
  const reasons: Array<"amount_mismatch" | "user_confirmation_required"> = [];
  if (
    taxProblem ||
    storedTaxMismatch ||
    (!amountError && hasUnresolvedDiscountTarget(preview.items, originalItems))
  ) {
    reasons.push("user_confirmation_required");
  }
  if (amountError) reasons.push("amount_mismatch");
  return reasons.length
    ? {
        status: "unresolved",
        reasons,
        checks,
        unresolvedTaxItemCount,
        ...(amountError ? { amountError } : {}),
        ...(storedTaxMismatch || taxProblem ? { taxRegistrationBlocked: true } : {}),
      }
    : { status: "resolved", reasons: [], checks, unresolvedTaxItemCount };
}
