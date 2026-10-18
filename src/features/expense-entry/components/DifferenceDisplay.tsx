import { Chip, Stack, Typography } from "@mui/material";
import { currencyFormatter, formatYen, formatYenAbs } from "../../../../lib/domain/common/currency";

export function DifferenceDisplay({
  difference,
  sourceAmount,
}: {
  difference: number | null;
  sourceAmount: number;
}) {
  if (difference === null || sourceAmount <= 0) return null;

  const isZero = difference === 0;
  const isNegative = difference < 0;
  const color = isZero ? "success.main" : isNegative ? "error.main" : "warning.main";
  const label = isZero
    ? "配分完了"
    : isNegative
      ? `超過: ${formatYenAbs(difference)}`
      : `未配分: ${formatYen(difference)}`;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        差額
      </Typography>
      <Typography aria-label="差額" variant="body2" sx={{ color, fontWeight: 700 }}>
        {isZero
          ? "0"
          : isNegative
            ? `-${currencyFormatter.format(Math.abs(difference))}`
            : `+${currencyFormatter.format(difference)}`}
      </Typography>
      <Chip
        label={label}
        size="small"
        color={isZero ? "success" : isNegative ? "error" : "warning"}
        variant="outlined"
      />
    </Stack>
  );
}
