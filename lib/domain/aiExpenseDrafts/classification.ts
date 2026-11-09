import { isValidSignedLineItemAmount, type ReceiptItemLineType } from "../receipt/discountItems";
import {
  AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD,
  AI_EXPENSE_DRAFT_REVIEW_REASONS,
  type AiExpenseDraftConfidence,
  type AiExpenseDraftDocumentType,
  type AiExpenseDraftReviewReason,
} from "./constants";
import { mergeReviewReasons } from "./reviewReasons";

export type AiExpenseDraftClassificationInput = {
  documentType: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date?: string;
  amountYen?: number;
  categoryId?: unknown;
  confidence: AiExpenseDraftConfidence;
  warnings: string[];
  multiCategoryConfirmed?: boolean;
  items?: Array<{
    itemName?: string;
    amountYen: number;
    // 省略可能（`lineType?:`）にはしない。渡し忘れると品名だけで割引行を推定し、
    // 割引の語を含まない割引行を不正な金額として扱ってしまう（#1229）。
    lineType: ReceiptItemLineType | undefined;
    categoryId?: unknown;
  }>;
};

function hasText(value: string | undefined) {
  return value !== undefined && value.trim().length > 0;
}

function hasLowConfidence(
  confidence: AiExpenseDraftConfidence,
  fields: Array<keyof AiExpenseDraftConfidence>,
) {
  return fields.some((field) => {
    const score = confidence[field];
    return typeof score !== "number" || score < AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD;
  });
}

function getMajorConfidenceFields(input: AiExpenseDraftClassificationInput) {
  const fields: Array<keyof AiExpenseDraftConfidence> = [];

  if (hasText(input.date)) {
    fields.push("date");
  }

  if (input.amountYen !== undefined && input.amountYen >= 1) {
    fields.push("amountYen");
  }

  if (input.categoryId !== undefined) {
    fields.push("categoryId");
  }

  if (input.documentType === "convenience_payment") {
    if (hasText(input.paymentPlace)) {
      fields.push("paymentPlace");
    }
    if (hasText(input.payeeName)) {
      fields.push("payeeName");
    }
    if (hasText(input.paymentPurpose)) {
      fields.push("paymentPurpose");
    }
    return fields;
  }

  if (input.documentType === "receipt") {
    if (hasText(input.shopName)) {
      fields.push("shopName");
    } else if (hasText(input.payeeName)) {
      fields.push("payeeName");
    } else if (hasText(input.paymentPlace)) {
      fields.push("paymentPlace");
    }
    return fields;
  }

  return fields;
}

function hasRequiredCounterparty(input: AiExpenseDraftClassificationInput) {
  if (input.documentType === "convenience_payment") {
    return hasText(input.payeeName) && hasText(input.paymentPurpose);
  }

  return hasText(input.shopName) || hasText(input.payeeName) || hasText(input.paymentPlace);
}

function hasAmountMismatch(input: AiExpenseDraftClassificationInput) {
  if (input.amountYen === undefined || input.items === undefined || input.items.length === 0) {
    return false;
  }

  const itemTotal = input.items.reduce((sum, item) => sum + item.amountYen, 0);
  return itemTotal !== input.amountYen;
}

function hasAmbiguousItemCategory(input: AiExpenseDraftClassificationInput) {
  return input.items?.some((item) => item.categoryId === undefined) ?? false;
}

function hasNonPositiveCategoryTotal(input: AiExpenseDraftClassificationInput) {
  if (!input.items || input.items.length === 0) {
    return false;
  }
  const totals = new Map<unknown, number>();
  for (const item of input.items) {
    if (item.categoryId === undefined) {
      continue;
    }
    totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + item.amountYen);
  }
  return [...totals.values()].some((amountYen) => amountYen <= 0);
}

function hasMultipleItemCategories(input: AiExpenseDraftClassificationInput) {
  const categoryIds = new Set(
    input.items?.flatMap((item) => (item.categoryId === undefined ? [] : [item.categoryId])) ?? [],
  );
  return categoryIds.size > 1;
}

function hasInvalidItemAmount(input: AiExpenseDraftClassificationInput) {
  return (
    input.items?.some(
      (item) =>
        !item.itemName ||
        !isValidSignedLineItemAmount(item.itemName, item.amountYen, item.lineType),
    ) ?? false
  );
}

function addReason(reasons: Set<AiExpenseDraftReviewReason>, reason: AiExpenseDraftReviewReason) {
  if (AI_EXPENSE_DRAFT_REVIEW_REASONS.includes(reason)) {
    reasons.add(reason);
  }
}

export function classifyAiExpenseDraft(input: AiExpenseDraftClassificationInput): {
  status: "ready" | "needs_review";
  reviewReasons: AiExpenseDraftReviewReason[];
} {
  const reasons = new Set<AiExpenseDraftReviewReason>();

  if (
    !hasText(input.date) ||
    input.amountYen === undefined ||
    input.amountYen < 1 ||
    !hasRequiredCounterparty(input)
  ) {
    addReason(reasons, "missing_required_field");
  }

  if (input.documentType === "unknown") {
    addReason(reasons, "ambiguous_document_type");
  }

  if (input.categoryId === undefined || hasAmbiguousItemCategory(input)) {
    addReason(reasons, "ambiguous_category");
  }

  if (!input.multiCategoryConfirmed && hasMultipleItemCategories(input)) {
    addReason(reasons, "multiple_categories");
  }

  if (
    hasLowConfidence(input.confidence, getMajorConfidenceFields(input)) ||
    input.warnings.length > 0
  ) {
    addReason(reasons, "low_confidence");
  }

  if (
    hasAmountMismatch(input) ||
    hasNonPositiveCategoryTotal(input) ||
    hasInvalidItemAmount(input)
  ) {
    addReason(reasons, "amount_mismatch");
  }

  const reviewReasons = AI_EXPENSE_DRAFT_REVIEW_REASONS.filter((reason) => reasons.has(reason));
  return {
    status: reviewReasons.length === 0 ? "ready" : "needs_review",
    reviewReasons,
  };
}

export type CreatedDraftClassificationInput = AiExpenseDraftClassificationInput & {
  reviewReasons?: AiExpenseDraftReviewReason[];
};

/**
 * 抽出直後の下書きを分類する。
 * 技術設計に従い、画像解析直後は `user_confirmation_required` を付与して
 * 常に `needs_review` とする（それ以外の理由があればマージする）。
 */
export function classifyCreatedDraft(input: CreatedDraftClassificationInput): {
  status: "ready" | "needs_review";
  reviewReasons: AiExpenseDraftReviewReason[];
} {
  const computed = classifyAiExpenseDraft(input);
  const reviewReasons = mergeReviewReasons(computed.reviewReasons, [
    ...(input.reviewReasons ?? []),
    "user_confirmation_required",
  ]);
  return {
    status: reviewReasons.length === 0 ? "ready" : "needs_review",
    reviewReasons,
  };
}
