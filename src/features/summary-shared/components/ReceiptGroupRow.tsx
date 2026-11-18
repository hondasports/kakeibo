import { Box, Chip, Stack, Typography } from "@mui/material";
import { formatDateForDisplay } from "../../week";
import { formatDateWithYearForDisplay } from "../../../utils/date";
import { ReceiptRow, type CategoryPreview } from "./ReceiptRow";
import type { ReceiptDateFormat, ReceiptGroup, ReceiptItem } from "../types/types";
import { formatYen } from "../../../../lib/domain/common/currency";

export function ReceiptGroupRow({
  group,
  dateFormat = "monthDay",
  onDelete,
  onEdit,
  selectionEnabled = false,
  previewCategory = null,
  isSelected,
  onToggleSelection,
}: {
  group: ReceiptGroup;
  dateFormat?: ReceiptDateFormat;
  onDelete?: (receipt: ReceiptItem) => void;
  onEdit?: (receipt: ReceiptItem) => void;
  selectionEnabled?: boolean;
  previewCategory?: CategoryPreview | null;
  isSelected?: (receipt: ReceiptItem) => boolean;
  onToggleSelection?: (receipt: ReceiptItem, checked: boolean) => void;
}) {
  const formatDate =
    dateFormat === "yearMonthDay" ? formatDateWithYearForDisplay : formatDateForDisplay;
  const singleItem = group.items[0];
  const hasBreakdown =
    group.items.length > 1 || group.items.some((item) => item.itemName !== undefined);

  if (
    singleItem &&
    (!hasBreakdown || (group.items.length === 1 && singleItem.amountYen === group.amountYen))
  ) {
    return (
      <ReceiptRow
        receipt={singleItem}
        dateFormat={dateFormat}
        combinedShopName={hasBreakdown ? group.shopName : undefined}
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
          {formatDate(group.date)}
        </Typography>
        <Box className="receipt-row-name" role="cell">
          <Stack
            className="receipt-row-identity"
            direction="row"
            spacing={1}
            sx={{ alignItems: "center" }}
            useFlexGap
          >
            <Chip label="支出" size="small" variant="outlined" />
            {singleItem?.registrationMode === "totalOnly" ? (
              <Chip label="合計だけで保存" size="small" variant="outlined" />
            ) : null}
            <Typography sx={{ fontWeight: 700 }} noWrap>
              {group.shopName}
            </Typography>
          </Stack>
        </Box>
        <Typography className="receipt-row-amount" role="cell" sx={{ fontWeight: 700 }}>
          {formatYen(group.amountYen)}
        </Typography>
        <Box className="receipt-row-actions" role="cell" />
      </Box>

      <Box className="receipt-group-details">
        {group.items.map((item) => (
          <ReceiptRow
            key={item._id}
            dateFormat={dateFormat}
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
