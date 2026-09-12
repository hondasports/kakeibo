import { trimOptional } from "../common/string";
import { validateExpenseAmount } from "../expenseEntries/expenseEntryItem";
import { isValidIsoDateString } from "../week/weekDates";
import type { PriceTaxTreatment, TaxRateComposition } from "../receipt/tax/types";
import type { AiExpenseDraftConfidence, AiExpenseDraftDocumentType } from "./constants";
import type { AiExpenseRegistrationMode } from "./receiptDataContract";

export type HasCounterpartyArgs = {
  documentType: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
};

/** 下書きに対して相手方情報（店舗名・支払先・支払目的等）が存在するか判定する */
export function hasCounterparty(args: HasCounterpartyArgs): boolean {
  if (args.documentType === "convenience_payment") {
    return (
      !!trimOptional(args.shopName) ||
      (!!trimOptional(args.payeeName) && !!trimOptional(args.paymentPurpose))
    );
  }
  return (
    !!trimOptional(args.shopName) ||
    !!trimOptional(args.payeeName) ||
    !!trimOptional(args.paymentPlace)
  );
}

export type ReviewUpdateReadyArgs = HasCounterpartyArgs & {
  date: string;
  amountYen: number;
};

export type ReviewUpdateReadyError =
  | "unknown_document_type"
  | "missing_date"
  | "invalid_date"
  | "invalid_amount"
  | "missing_counterparty";

/** レビュー更新で下書きを ready にできるか検証する */
export function validateReviewUpdateCanBecomeReady(
  args: ReviewUpdateReadyArgs,
): { success: true } | { success: false; error: ReviewUpdateReadyError } {
  if (args.documentType === "unknown") {
    return { success: false, error: "unknown_document_type" };
  }

  const date = trimOptional(args.date);
  if (!date) {
    return { success: false, error: "missing_date" };
  }
  if (!isValidIsoDateString(date)) {
    return { success: false, error: "invalid_date" };
  }

  if (!validateExpenseAmount(args.amountYen).success) {
    return { success: false, error: "invalid_amount" };
  }

  if (!hasCounterparty(args)) {
    return { success: false, error: "missing_counterparty" };
  }

  return { success: true };
}

export type ReviewConfidenceInput = {
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
};

/**
 * レビュー更新時に信頼度スコアを更新する。
 * 確定したフィールドは 1 とし、相手方情報は入力値があれば 1 とする。
 * payeeName / paymentPurpose が空の場合は shopName をフォールバックとして使う。
 */
export function buildReviewConfidence(
  draftConfidence: AiExpenseDraftConfidence,
  input: ReviewConfidenceInput,
): AiExpenseDraftConfidence {
  const hasShopName = !!trimOptional(input.shopName);
  const hasPayeeName = !!trimOptional(input.payeeName);
  const hasPaymentPlace = !!trimOptional(input.paymentPlace);
  const hasPaymentPurpose = !!trimOptional(input.paymentPurpose);

  return {
    ...draftConfidence,
    documentType: 1,
    shopName: hasShopName ? 1 : draftConfidence.shopName,
    paymentPlace: hasPaymentPlace ? 1 : draftConfidence.paymentPlace,
    payeeName: hasPayeeName || hasShopName ? 1 : draftConfidence.payeeName,
    paymentPurpose: hasPaymentPurpose || hasShopName ? 1 : draftConfidence.paymentPurpose,
    date: 1,
    amountYen: 1,
    categoryId: 1,
  };
}

const reviewUpdateReadyErrorMessages: Record<
  Exclude<ReviewUpdateReadyError, "missing_counterparty">,
  string
> = {
  unknown_document_type: "Draft document type must be selected to mark ready",
  missing_date: "Draft date is required to mark ready",
  invalid_date: "Draft date must be a valid YYYY-MM-DD date",
  invalid_amount: "Draft amount is required to mark ready",
};

/** レビュー更新で ready にできない理由をユーザー向けメッセージに変換する */
export function getReviewUpdateReadyErrorMessage(
  error: ReviewUpdateReadyError,
  documentType?: AiExpenseDraftDocumentType,
): string {
  if (error === "missing_counterparty") {
    return documentType === "convenience_payment"
      ? "Draft shop name or payment details are required to mark ready"
      : "Draft shop, payment place, or payee is required to mark ready";
  }
  return reviewUpdateReadyErrorMessages[error];
}

/**
 * レビュー更新時の登録モードを解決する。
 * 税判定が unknown に更新された場合は税内訳を扱えないため totalOnly に強制する。
 * 税判定が明示された場合（detailed 化）は指定がなければ detailed へ切り替える。
 */
export function resolveReviewRegistrationMode(
  args: {
    registrationMode?: AiExpenseRegistrationMode;
    priceTaxTreatment?: PriceTaxTreatment;
    taxRateComposition?: TaxRateComposition;
  },
  draft: { registrationMode?: AiExpenseRegistrationMode },
): AiExpenseRegistrationMode {
  if (args.priceTaxTreatment === "unknown" || args.taxRateComposition === "unknown") {
    return "totalOnly";
  }
  const hasTaxDecisionUpdate =
    args.priceTaxTreatment !== undefined || args.taxRateComposition !== undefined;
  return (
    args.registrationMode ??
    (hasTaxDecisionUpdate ? "detailed" : (draft.registrationMode ?? "detailed"))
  );
}
