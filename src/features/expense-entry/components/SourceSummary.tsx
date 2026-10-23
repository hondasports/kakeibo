import { Box, Stack, Typography } from "@mui/material";
import { currencyFormatter } from "../../../../lib/domain/common/currency";

export function SourceSummary({
  sourceAmount,
  shopName,
}: {
  sourceAmount: number;
  shopName: string;
}) {
  return (
    <Box
      sx={{
        bgcolor: "action.hover",
        borderRadius: 1,
        p: 1.5,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Stack spacing={0}>
          <Typography variant="caption" color="text.secondary">
            入力元合計
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>
            {currencyFormatter.format(sourceAmount)}
            <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
              円
            </Typography>
          </Typography>
        </Stack>
        {shopName && (
          <Typography variant="body2" color="text.secondary">
            {shopName}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
