import type { ReceiptLineClassification, ReceiptRawObservation } from "../receipt/observations";
import type { AiExpenseDraft, ReviewItemValues } from "./reviewTypes";
import type { ReviewGuidanceItem } from "./reviewGuidance";
import type { ReviewAmountCheck } from "./reviewAmountChecks";
import type { ReviewTaxRateCheck } from "./reviewTaxChecks";
import { buildAmountCheck } from "./reviewAmountChecks";
import { buildTaxRateCheck } from "./reviewTaxChecks";
export type ReviewChecks = {
  amount: ReviewAmountCheck;
  taxRate: ReviewTaxRateCheck;
};

export function buildReviewChecks(args: {
  items: ReviewItemValues[];
  paidTotalYen?: number;
  taxSummaries?: AiExpenseDraft["taxSummaries"];
  rawObservation?: ReceiptRawObservation;
  receiptLineClassifications?: ReceiptLineClassification[];
}): ReviewChecks {
  return {
    amount: buildAmountCheck(args),
    taxRate: buildTaxRateCheck(args),
  };
}

/**
 * 確認推奨に数える比較不能の件数。
 * レシートに税内訳が無いだけの比較不能は、ユーザーが直せないため数えない。
 */
export function countActionableUncomparable(
  checks: ReviewChecks,
  guidance: ReviewGuidanceItem[] = [],
): number {
  const actionable = [checks.amount, checks.taxRate].filter(
    (check) => check.status === "uncomparable" && check.blockerCode !== "missing-tax-summary",
  );
  const summaryChecks = actionable.filter(
    (check) => check.blockerCode === "unverified-tax-summary",
  );
  const summaryGuidanceExists = guidance.some((issue) => issue.taxSummaryIndex !== undefined);
  return (
    actionable.length -
    summaryChecks.length +
    (summaryChecks.length > 0 && !summaryGuidanceExists ? 1 : 0)
  );
}
