import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { Link } from "react-router-dom";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { formatDateForDisplay } from "../../week";
import { formatDateWithYearForDisplay } from "../../../utils/date";
import { ReceiptRow, type CategoryPreview } from "./ReceiptRow";
import type { ReceiptDateFormat, ReceiptGroup, ReceiptItem } from "../types/types";
import { formatYen } from "../../../../lib/domain/common/currency";

export function ReceiptGroupRow({
  group,
  dateFormat = "monthDay",
  onCopy,
  onDelete,
  onEdit,
  selectionEnabled = false,
  previewCategory = null,
  isSelected,
  onToggleSelection,
  weekSummaryPath,
}: {
  group: ReceiptGroup;
  dateFormat?: ReceiptDateFormat;
  onCopy?: (receipt: ReceiptItem) => void;
  onDelete?: (receipt: ReceiptItem) => void;
  onEdit?: (receipt: ReceiptItem) => void;
  selectionEnabled?: boolean;
  previewCategory?: CategoryPreview | null;
  isSelected?: (receipt: ReceiptItem) => boolean;
  onToggleSelection?: (receipt: ReceiptItem, checked: boolean) => void;
  weekSummaryPath?: (date: string) => string;
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
        onCopy={onCopy}
        onDelete={onDelete}
        onEdit={onEdit}
        previewCategory={previewCategory}
        selected={isSelected?.(singleItem) ?? false}
        selectionEnabled={selectionEnabled}
        onToggleSelection={onToggleSelection}
        weekSummaryPath={weekSummaryPath}
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
        <Box className="receipt-row-actions" role="cell">
          {weekSummaryPath && (
            <Button
              aria-label={`${group.shopName}（${formatDate(group.date)}）が属する週のサマリーを見る`}
              component={Link}
              size="small"
              startIcon={<CalendarMonthIcon fontSize="small" />}
              sx={{ minHeight: 44 }}
              to={weekSummaryPath(group.date)}
              type="button"
              variant="text"
            >
              <span className="receipt-row-action-label">この週を見る</span>
            </Button>
          )}
        </Box>
      </Box>

      <Box className="receipt-group-details">
        {group.items.map((item) => (
          <ReceiptRow
            key={item._id}
            dateFormat={dateFormat}
            isDetail
            receipt={item}
            showCategory={item.itemName !== undefined}
            onCopy={onCopy}
            onDelete={onDelete}
            onEdit={onEdit}
            previewCategory={previewCategory}
            selected={isSelected?.(item) ?? false}
            selectionEnabled={selectionEnabled}
            onToggleSelection={onToggleSelection}
            weekSummaryPath={weekSummaryPath}
          />
        ))}
      </Box>
    </Box>
  );
}
