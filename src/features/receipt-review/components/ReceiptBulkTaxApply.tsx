import { Button, Stack, Typography } from "@mui/material";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import { toReceiptTotalsViewModel } from "../utils/receiptTotalsViewModel";

export function ReceiptBulkTaxApply({
  reviewItems,
  taxSummaries,
  onApply,
  isApplying,
}: {
  reviewItems: ReviewItemValues[];
  taxSummaries?: AiExpenseDraft["taxSummaries"];
  onApply: () => void;
  isApplying?: boolean;
}) {
  const vm = toReceiptTotalsViewModel({
    reviewItems,
    taxSummaries,
  });

  if (!vm.canBulkApplyTax || !vm.bulkTaxLabel) {
    return null;
  }

  return (
    <Stack spacing={1} sx={{ pt: 0.5 }}>
      <Typography color="text.secondary" variant="body2">
        {vm.bulkTaxLabel}
      </Typography>
      <Button disabled={isApplying} onClick={onApply} size="small" type="button" variant="outlined">
        {isApplying ? "適用中…" : "税率を一括適用"}
      </Button>
    </Stack>
  );
}
