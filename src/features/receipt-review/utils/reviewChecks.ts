import type { ReceiptRawObservation } from "../../../../lib/domain/receipt/observations";
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
}): ReviewChecks {
  return {
    amount: buildAmountCheck(args),
    taxRate: buildTaxRateCheck(args),
  };
}
