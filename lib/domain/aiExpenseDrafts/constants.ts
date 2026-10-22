/** 一覧1回分の下書き件数の上限。明細の判定窓とは別概念。 */
export const AI_EXPENSE_DRAFT_LIST_LIMIT = 100;

export const AI_EXPENSE_DRAFT_STATUSES = [
  "queued",
  "analyzing",
  "ready",
  "needs_review",
  "failed",
  "registered",
] as const;

export type AiExpenseDraftStatus = (typeof AI_EXPENSE_DRAFT_STATUSES)[number];

export const AI_EXPENSE_DRAFT_SOURCE_TYPES = ["image_upload"] as const;

export type AiExpenseDraftSourceType = (typeof AI_EXPENSE_DRAFT_SOURCE_TYPES)[number];

export const AI_EXPENSE_DRAFT_DOCUMENT_TYPES = [
  "receipt",
  "convenience_payment",
  "unknown",
] as const;

export type AiExpenseDraftDocumentType = (typeof AI_EXPENSE_DRAFT_DOCUMENT_TYPES)[number];

export const AI_EXPENSE_DRAFT_REVIEW_REASONS = [
  "low_confidence",
  "missing_required_field",
  "ambiguous_document_type",
  "ambiguous_category",
  "multiple_categories",
  "user_confirmation_required",
  "amount_mismatch",
  "parse_failed",
] as const;

export type AiExpenseDraftReviewReason = (typeof AI_EXPENSE_DRAFT_REVIEW_REASONS)[number];

export const AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD = 0.8;

export type AiExpenseDraftConfidence = {
  documentType?: number;
  shopName?: number;
  paymentPlace?: number;
  payeeName?: number;
  paymentPurpose?: number;
  date?: number;
  amountYen?: number;
  categoryId?: number;
};
