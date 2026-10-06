import type { AiExpenseDraft } from "../types/types";
import {
  ReceiptTaxSummarySection,
  type EditableTaxSummaryTarget,
} from "./ReceiptTaxSummarySection";
import type { TaxSummaryChange } from "./ReceiptTaxSummaryEditor";

export type { TaxSummaryChange };

export function ReceiptTaxSummary({
  draft,
  updatingIndex,
  onSummaryChange,
  editableSummaries,
  registerSummary,
}: {
  draft: AiExpenseDraft | null;
  updatingIndex?: number | null;
  onSummaryChange?: (index: number, change: TaxSummaryChange) => void;
  editableSummaries?: EditableTaxSummaryTarget[];
  registerSummary?: (target: string) => (node: HTMLElement | null) => void;
}) {
  return (
    <ReceiptTaxSummarySection
      draft={draft}
      onSummaryChange={onSummaryChange}
      updatingIndex={updatingIndex}
      editableSummaries={editableSummaries}
      registerSummary={registerSummary}
    />
  );
}
