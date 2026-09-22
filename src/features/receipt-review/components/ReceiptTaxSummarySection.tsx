import { Stack, Typography } from "@mui/material";
import type { AiExpenseDraft } from "../types/types";
import { ReceiptTaxSummaryEditor, type TaxSummaryChange } from "./ReceiptTaxSummaryEditor";
import { ReceiptTaxSummaryReadOnly } from "./ReceiptTaxSummaryReadOnly";

export function ReceiptTaxSummarySection({
  draft,
  updatingIndex,
  onSummaryChange,
}: {
  draft: AiExpenseDraft | null;
  updatingIndex?: number | null;
  onSummaryChange?: (index: number, change: TaxSummaryChange) => void;
}) {
  const summaries = draft?.taxSummaries ?? [];
  if (summaries.length === 0) {
    return null;
  }

  return (
    <Stack aria-label="税率別集計" spacing={1}>
      <Typography sx={{ fontWeight: 600 }} variant="subtitle2">
        税率別集計
      </Typography>
      {summaries.map((summary, index) => {
        const isEditable =
          summary.status === "ambiguous" ||
          summary.status === "contradictory" ||
          summary.status === "reconcilable" ||
          summary.status === "conflicting";
        const key = `${summary.taxRatePercent}-${summary.taxableAmountYen}-${summary.taxMode}-${index}`;

        return (
          <Stack
            key={key}
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
                isSaving={updatingIndex === index}
                summary={summary}
                summaryIndex={index}
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
