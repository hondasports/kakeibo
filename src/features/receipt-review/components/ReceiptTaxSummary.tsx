import type { AiExpenseDraft } from "../types/types";
import { ReceiptTaxSummarySection } from "./ReceiptTaxSummarySection";
import type { TaxSummaryChange } from "./ReceiptTaxSummaryEditor";

export type { TaxSummaryChange };

export function ReceiptTaxSummary({
  draft,
  updatingIndex,
  onSummaryChange,
}: {
  draft: AiExpenseDraft | null;
  updatingIndex?: number | null;
  onSummaryChange?: (index: number, change: TaxSummaryChange) => void;
}) {
  return (
    <ReceiptTaxSummarySection
      draft={draft}
      onSummaryChange={onSummaryChange}
      updatingIndex={updatingIndex}
    />
  );
}
