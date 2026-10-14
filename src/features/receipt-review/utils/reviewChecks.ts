import type {
  ReceiptLineClassification,
  ReceiptRawObservation,
} from "../../../../lib/domain/receipt/observations";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
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
export function countActionableUncomparable(checks: ReviewChecks): number {
  return [checks.amount, checks.taxRate].filter(
    (check) => check.status === "uncomparable" && check.blockerCode !== "missing-tax-summary",
  ).length;
}
