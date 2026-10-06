import { Stack, Typography } from "@mui/material";
import type { AiExpenseDraft } from "../types/types";
import { ReceiptTaxSummaryEditor, type TaxSummaryChange } from "./ReceiptTaxSummaryEditor";
import { ReceiptTaxSummaryReadOnly } from "./ReceiptTaxSummaryReadOnly";

export type EditableTaxSummaryTarget = {
  summaryIndex: number;
  sourceIndex: number;
  message?: string;
};

export function ReceiptTaxSummarySection({
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
  const summaries = draft?.taxSummaries ?? [];
  const visibleSummaries: EditableTaxSummaryTarget[] =
    editableSummaries ?? summaries.map((_, index) => ({ summaryIndex: index, sourceIndex: index }));
  if (summaries.length === 0 || visibleSummaries.length === 0) {
    return null;
  }

  return (
    <Stack aria-label="税率別集計" spacing={1}>
      <Typography sx={{ fontWeight: 600 }} variant="subtitle2">
        税率別集計
      </Typography>
      {visibleSummaries.map(({ summaryIndex: index, sourceIndex, message }) => {
        const summary = summaries[index];
        if (!summary) return null;
        const isEditable =
          editableSummaries !== undefined ||
          summary.status === "ambiguous" ||
          summary.status === "contradictory" ||
          summary.status === "reconcilable" ||
          summary.status === "conflicting";
        const key = `${summary.taxRatePercent}-${summary.taxableAmountYen}-${summary.taxMode}-${index}`;

        return (
          <Stack
            component="section"
            key={key}
            ref={registerSummary?.(`tax-summary-${sourceIndex}`)}
            tabIndex={-1}
            aria-label={`${summary.taxRatePercent}%の税内訳を${isEditable ? "修正" : "確認"}`}
            spacing={0.25}
            sx={{
              border: "1px solid",
              borderColor: isEditable ? "warning.main" : "divider",
              borderRadius: 1,
              p: 1,
            }}
          >
            {isEditable ? (
              <ReceiptTaxSummaryEditor
                isSaving={updatingIndex === sourceIndex}
                summary={summary}
                summaryIndex={sourceIndex}
                reviewMessage={message}
                onChange={onSummaryChange ?? (() => {})}
              />
            ) : (
              <ReceiptTaxSummaryReadOnly summary={summary} />
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
