import { Stack, Typography } from "@mui/material";
import type { ReviewItemValues } from "../types/types";
import { formatYen } from "../../../utils/currency";

const amountBasisLabels = {
  tax_included: "税込",
  tax_excluded: "税抜",
  unknown: "税込・税抜不明",
} as const;

export function ReviewItemTaxDetails({ item }: { item: ReviewItemValues }) {
  const showPrintedAmount =
    item.printedAmountYen !== undefined && item.printedAmountYen !== Number(item.amountYen);
  const showAmountBasis = item.amountBasis !== undefined && item.amountBasis !== "unknown";
  const showAllocatedTax = item.allocatedTaxYen !== undefined && item.allocatedTaxYen !== 0;
  const showQuantity =
    item.quantity !== undefined && item.quantity > 1 && item.unitPriceYen !== undefined;
  const hasDetails =
    showPrintedAmount ||
    showAmountBasis ||
    item.taxRatePercent !== undefined ||
    showAllocatedTax ||
    showQuantity;
  if (!hasDetails) return null;

  return (
    <Stack
      aria-label={`${item.itemName || "明細"}の税情報`}
      direction="row"
      spacing={1.5}
      sx={{ flexWrap: "wrap" }}
    >
      {showPrintedAmount && item.printedAmountYen !== undefined && (
        <Typography color="text.secondary" variant="body2">
          印字額 {formatYen(item.printedAmountYen)}
        </Typography>
      )}
      {showAmountBasis && item.amountBasis !== undefined && (
        <Typography color="text.secondary" variant="body2">
          {amountBasisLabels[item.amountBasis]}
        </Typography>
      )}
      {item.taxRatePercent !== undefined && (
        <Typography color="text.secondary" variant="body2">
          税率 {item.taxRatePercent === null ? "不明" : `${item.taxRatePercent}%`}
        </Typography>
      )}
      {showAllocatedTax && item.allocatedTaxYen !== undefined && (
        <Typography color="text.secondary" variant="body2">
          按分税 {formatYen(item.allocatedTaxYen)}
        </Typography>
      )}
      {showQuantity && item.quantity !== undefined && item.unitPriceYen !== undefined && (
        <Typography color="text.secondary" variant="body2">
          {item.quantity}点 × {formatYen(item.unitPriceYen)}
        </Typography>
      )}
    </Stack>
  );
}
