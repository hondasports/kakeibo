import { Stack, Typography } from "@mui/material";
import { useMemo } from "react";
import type { ReviewItemValues } from "../types/types";
import {
  buildTaxContextFromReviewItem,
  toReceiptItemTaxViewModel,
} from "../utils/receiptItemTaxViewModel";

export function ReceiptItemTaxDetail({
  item,
  draft,
}: {
  item: ReviewItemValues;
  draft?: { markerDefinitions?: Array<{ marker: string; description: string }> } | null;
}) {
  const vm = toReceiptItemTaxViewModel(item);
  const context = buildTaxContextFromReviewItem(item);
  const markerDefinitionByMarker = useMemo(() => {
    const map = new Map<string, { marker: string; description: string }>();
    for (const entry of draft?.markerDefinitions ?? []) {
      map.set(entry.marker, entry);
    }
    return map;
  }, [draft?.markerDefinitions]);

  const reviewNote =
    context.status === "unresolved" && vm.reviewReasonLabels.length > 0
      ? vm.reviewReasonLabels[0]
      : context.status === "resolved"
        ? vm.resolutionReasonLabel
        : undefined;

  return (
    <Stack aria-label={`${vm.itemName || "明細"}の税詳細`} spacing={0.75}>
      <Typography sx={{ fontWeight: 600 }} variant="subtitle2">
        レシートの記載
      </Typography>
      <Typography variant="body2">金額 {vm.printedAmountLabel}</Typography>
      {vm.markerLabels.length > 0 && (
        <Typography variant="body2">記号 {vm.markerLabels.join(", ")}</Typography>
      )}
      {vm.markerLabels.map((marker) => {
        const definition = markerDefinitionByMarker.get(marker);
        if (!definition) {
          return null;
        }
        return (
          <Typography color="text.secondary" key={marker} variant="body2">
            {definition.description}
          </Typography>
        );
      })}
      {context.status === "resolved" && (
        <Typography variant="body2">税率 {vm.taxRateLabel}</Typography>
      )}
      {reviewNote && (
        <Typography color="text.secondary" variant="body2">
          {reviewNote}
        </Typography>
      )}
    </Stack>
  );
}
