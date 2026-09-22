import { Box, Chip, Stack, Typography } from "@mui/material";
import { formatDateForDisplay } from "../../week";
import { ReceiptRow, type CategoryPreview } from "./ReceiptRow";
import type { ReceiptGroup, ReceiptItem } from "../types/types";

export function ReceiptGroupRow({
  group,
  onDelete,
  onEdit,
  selectionEnabled = false,
  previewCategory = null,
  isSelected,
  onToggleSelection,
}: {
  group: ReceiptGroup;
  onDelete?: (receipt: ReceiptItem) => void;
  onEdit?: (receipt: ReceiptItem) => void;
  selectionEnabled?: boolean;
  previewCategory?: CategoryPreview | null;
  isSelected?: (receipt: ReceiptItem) => boolean;
  onToggleSelection?: (receipt: ReceiptItem, checked: boolean) => void;
}) {
  const singleItem = group.items[0];
  const hasBreakdown =
    group.items.length > 1 || group.items.some((item) => item.itemName !== undefined);
  const itemNames = group.items
    .map((item) => item.itemName?.trim())
    .filter((itemName): itemName is string => Boolean(itemName));

  if (singleItem && !hasBreakdown) {
    return (
      <ReceiptRow
        receipt={singleItem}
        onDelete={onDelete}
        onEdit={onEdit}
        previewCategory={previewCategory}
        selected={isSelected?.(singleItem) ?? false}
        selectionEnabled={selectionEnabled}
        onToggleSelection={onToggleSelection}
      />
    );
  }

  return (
    <Box
      aria-label={`${group.shopName}の支出`}
      className="receipt-group"
      data-testid="receipt-group"
      role="rowgroup"
    >
      <Box className="receipt-row receipt-group-header" role="row">
        {selectionEnabled && <Box aria-hidden className="receipt-row-select" role="cell" />}
        <Typography className="receipt-row-date" color="text.secondary" role="cell" variant="body2">
          {formatDateForDisplay(group.date)}
        </Typography>
        <Box className="receipt-row-name" role="cell">
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Chip label="支出" size="small" variant="outlined" />
            {singleItem?.registrationMode === "totalOnly" ? (
              <Chip label="合計だけで保存" size="small" variant="outlined" />
            ) : null}
            <Typography sx={{ fontWeight: 700 }} noWrap>
              {group.shopName}
            </Typography>
          </Stack>
          <Typography
            color="text.secondary"
            noWrap
            title={itemNames.length > 0 ? `内訳: ${itemNames.join("、")}` : "内訳情報なし"}
            variant="caption"
          >
            {itemNames.length > 0 ? `内訳: ${itemNames.join("、")}` : "内訳情報なし"}
          </Typography>
        </Box>
        <Typography className="receipt-row-amount" role="cell" sx={{ fontWeight: 700 }}>
          {group.amountYen.toLocaleString()}円
        </Typography>
        <Box className="receipt-row-memo" role="cell" />
        <Box className="receipt-row-actions" role="cell" />
      </Box>

      <Box className="receipt-group-details">
        {group.items.map((item) => (
          <ReceiptRow
            key={item._id}
            isDetail
            receipt={item}
            showCategory={item.itemName !== undefined}
            onDelete={onDelete}
            onEdit={onEdit}
            previewCategory={previewCategory}
            selected={isSelected?.(item) ?? false}
            selectionEnabled={selectionEnabled}
            onToggleSelection={onToggleSelection}
          />
        ))}
      </Box>
    </Box>
  );
}
