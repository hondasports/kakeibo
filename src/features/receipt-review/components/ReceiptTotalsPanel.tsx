import type { ReactNode } from "react";
import { Alert, Box, Button, Collapse, Stack, Typography } from "@mui/material";
import { useState } from "react";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import { toReceiptTotalsViewModel } from "../utils/receiptTotalsViewModel";

function TotalsRow({
  label,
  amountLabel,
  note,
}: {
  label: string;
  amountLabel: string;
  note?: string;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "baseline", flexWrap: "wrap", justifyContent: "space-between" }}
    >
      <Typography variant="body2">{label}</Typography>
      <Box sx={{ textAlign: "right" }}>
        <Typography variant="body2">{amountLabel}</Typography>
        {note && (
          <Typography color="warning.main" variant="caption">
            {note}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

export function ReceiptTotalsPanel({
  reviewItems,
  paidTotalYen,
  taxSummaries,
  bulkTaxAction,
}: {
  reviewItems: ReviewItemValues[];
  paidTotalYen?: number;
  taxSummaries?: AiExpenseDraft["taxSummaries"];
  bulkTaxAction?: ReactNode;
}) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const vm = toReceiptTotalsViewModel({ reviewItems, paidTotalYen, taxSummaries });

  if (!vm.showPanel) {
    return null;
  }

  const severity = vm.status === "matched" ? ("success" as const) : ("warning" as const);

  if (vm.status === "matched") {
    return (
      <Alert aria-label="金額の照合" severity="success" variant="outlined">
        <Typography variant="body2">金額一致　{vm.paidTotalLabel}</Typography>
      </Alert>
    );
  }

  const headline =
    vm.unresolvedCount > 0
      ? "税率を確認してください"
      : vm.gapPaidVsItems !== undefined && vm.gapPaidVsItems !== 0
        ? `金額差額　${Math.abs(vm.gapPaidVsItems).toLocaleString("ja-JP")}円`
        : "レシート内訳を確認してください";

  const subtotalLabel = vm.receiptSubtotalYen
    ? `レシートの小計${vm.subtotalRateLabel ? `（${vm.subtotalRateLabel}）` : ""}`
    : "レシートの小計";

  return (
    <Alert aria-label="金額の照合" severity={severity} variant="outlined">
      <Stack spacing={1}>
        <Typography variant="body2">{headline}</Typography>
        <Button
          onClick={() => setDetailsExpanded((current) => !current)}
          size="small"
          type="button"
          variant="text"
          sx={{ alignSelf: "flex-start" }}
        >
          {detailsExpanded ? "内訳を閉じる" : "内訳を表示"}
        </Button>
        <Collapse in={detailsExpanded}>
          <Stack spacing={1}>
            <TotalsRow label="お支払い（レシート合計）" amountLabel={vm.paidTotalLabel} />
            <TotalsRow
              amountLabel={vm.itemsNormalizedTotalLabel}
              label="登録合計（税込）"
              note={vm.gapPaidVsItemsNote}
            />
            <TotalsRow
              amountLabel={vm.itemsPrintedTotalLabel}
              label={vm.printedTotalLabel}
              note={vm.gapItemsVsSubtotalNote}
            />
            <TotalsRow amountLabel={vm.receiptSubtotalLabel} label={subtotalLabel} />
            {vm.guidanceLines.map((line) => (
              <Typography key={line} variant="body2">
                {line}
              </Typography>
            ))}
          </Stack>
        </Collapse>
        {bulkTaxAction}
      </Stack>
    </Alert>
  );
}
