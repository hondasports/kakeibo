import { Alert, Button, Stack, Typography } from "@mui/material";
import type { ReviewItemValues } from "../types/types";
import { toReceiptItemTaxViewModel } from "../utils/receiptItemTaxViewModel";

export function ReceiptItemRow({
  item,
  onOpenDetail,
  isDetailOpen,
  detailPanelId,
}: {
  item: ReviewItemValues;
  onOpenDetail?: () => void;
  isDetailOpen?: boolean;
  detailPanelId?: string;
}) {
  const vm = toReceiptItemTaxViewModel(item);

  return (
    <Stack spacing={0.5}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "baseline", justifyContent: "space-between" }}
      >
        <Typography sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }} variant="body2">
          {vm.itemName || "（名称なし）"}
        </Typography>
        <Typography
          sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
          variant="body2"
        >
          {vm.normalizedAmountLabel}
        </Typography>
        <Typography color="text.secondary" sx={{ whiteSpace: "nowrap" }} variant="body2">
          {vm.taxRateLabel}
        </Typography>
      </Stack>

      {vm.status === "unresolved" && (
        <Alert severity="warning" sx={{ py: 0.25 }} variant="outlined">
          税率を判定できませんでした
        </Alert>
      )}

      {onOpenDetail && (
        <Button
          aria-controls={detailPanelId}
          aria-expanded={isDetailOpen ?? false}
          aria-label={`${vm.itemName || "明細"}の税詳細を表示`}
          onClick={onOpenDetail}
          size="small"
          variant="text"
        >
          詳細
        </Button>
      )}
    </Stack>
  );
}
