import type { AmountBasis, TaxResolutionStatus } from "../receipt/tax/types";

export type ReviewItemForDisplay = {
  amountYen: number;
  printedAmountYen?: number;
  normalizedAmountYen?: number;
  taxResolutionStatus?: TaxResolutionStatus;
  amountBasis?: AmountBasis;
};

export type ReviewReplacePreviousItem = {
  amountYen: number;
  printedAmountYen?: number;
  normalizedAmountYen?: number;
  taxResolutionStatus?: TaxResolutionStatus;
  amountBasis?: AmountBasis;
};

export function resolveReviewItemAmountsForReplace(
  submittedAmountYen: number,
  previous: ReviewReplacePreviousItem | undefined,
): {
  amountYen: number;
  printedAmountYen: number;
  normalizedAmountYen?: number;
} {
  if (previous?.taxResolutionStatus === "resolved" && previous.printedAmountYen !== undefined) {
    if (previous.amountBasis === "tax_included") {
      const previousDisplay = previous.normalizedAmountYen ?? previous.amountYen;
      if (submittedAmountYen === previousDisplay) {
        return {
          amountYen: previousDisplay,
          printedAmountYen: previous.printedAmountYen,
          normalizedAmountYen: previous.normalizedAmountYen ?? previousDisplay,
        };
      }
      return {
        amountYen: submittedAmountYen,
        printedAmountYen: submittedAmountYen,
        normalizedAmountYen: submittedAmountYen,
      };
    }

    const previousPrinted = previous.printedAmountYen;
    if (submittedAmountYen === previousPrinted) {
      return {
        amountYen: previous.normalizedAmountYen ?? submittedAmountYen,
        printedAmountYen: previousPrinted,
        normalizedAmountYen: previous.normalizedAmountYen,
      };
    }
    return {
      amountYen: submittedAmountYen,
      printedAmountYen: submittedAmountYen,
      normalizedAmountYen: undefined,
    };
  }

  return {
    amountYen: submittedAmountYen,
    printedAmountYen: submittedAmountYen,
  };
}

/**
 * レビュー画面に表示する編集用金額を解決する。
 * 内税確定済みで normalizedAmountYen があれば優先し、
 * それ以外は印字金額 → 登録用金額の順で fallback する。
 */
export function resolveReviewItemDisplayAmountYen(item: ReviewItemForDisplay): number {
  if (
    item.taxResolutionStatus === "resolved" &&
    item.amountBasis === "tax_included" &&
    item.normalizedAmountYen != null
  ) {
    return item.normalizedAmountYen;
  }
  return item.printedAmountYen ?? item.normalizedAmountYen ?? item.amountYen;
}
