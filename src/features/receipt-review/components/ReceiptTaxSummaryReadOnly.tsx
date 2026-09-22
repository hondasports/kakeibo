import { Stack, Typography } from "@mui/material";
import type { AmountBasis, ExtractedTaxSummary } from "../../../../lib/receiptTax/types";
import { formatYenLabel, getTaxSummaryConflictLabel } from "../utils/receiptTaxLabels";
import { getTaxModeLabel } from "../utils/receiptItemTaxViewModel";
import { formatTaxWarnings } from "../utils/taxWarnings";

type ReadableTaxSummary = Pick<
  ExtractedTaxSummary,
  | "taxRatePercent"
  | "taxMode"
  | "taxableAmountYen"
  | "taxableAmountBasis"
  | "taxYen"
  | "taxIncludedAmountYen"
  | "reasons"
  | "warnings"
>;

export function ReceiptTaxSummaryReadOnly({ summary }: { summary: ReadableTaxSummary }) {
  const amountBasisLabel = getAmountBasisLabel(summary.taxableAmountBasis);

  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">
        {summary.taxRatePercent}% {getTaxModeLabel(summary.taxMode)}
      </Typography>
      <Typography color="text.secondary" variant="body2">
        対象額 {formatYenLabel(summary.taxableAmountYen)}
        {amountBasisLabel}
      </Typography>
      <Typography color="text.secondary" variant="body2">
        税額 {formatYenLabel(summary.taxYen)}
      </Typography>
      {summary.taxIncludedAmountYen !== undefined && (
        <Typography color="text.secondary" variant="body2">
          税込合計 {formatYenLabel(summary.taxIncludedAmountYen)}
        </Typography>
      )}
      {summary.reasons && summary.reasons.length > 0 && (
        <Typography color="warning.main" variant="body2">
          {summary.reasons.map(getTaxSummaryConflictLabel).join(" / ")}
        </Typography>
      )}
      {summary.warnings.length > 0 && (
        <Typography color="warning.main" variant="body2">
          {formatTaxWarnings(summary.warnings)}
        </Typography>
      )}
    </Stack>
  );
}

function getAmountBasisLabel(amountBasis: AmountBasis): string {
  if (amountBasis === "tax_included") return "（税込）";
  if (amountBasis === "tax_excluded") return "（税抜）";
  return "（種別不明）";
}
