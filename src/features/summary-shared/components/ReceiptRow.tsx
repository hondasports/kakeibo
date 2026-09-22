import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { Box, Button, Checkbox, Chip, Stack, Typography } from "@mui/material";
import { formatDateForDisplay } from "../../week";
import { MemoExpandableText } from "./MemoExpandableText";
import type { ReceiptItem } from "../types/types";

export type CategoryPreview = {
  _id: string;
  name: string;
  color?: string;
};

export function ReceiptRow({
  receipt,
  onDelete,
  onEdit,
  showCategory = true,
  isDetail = false,
  selectionEnabled = false,
  selected = false,
  previewCategory = null,
  onToggleSelection,
}: {
  receipt: ReceiptItem;
  onDelete?: (receipt: ReceiptItem) => void;
  onEdit?: (receipt: ReceiptItem) => void;
  showCategory?: boolean;
  isDetail?: boolean;
  selectionEnabled?: boolean;
  selected?: boolean;
  previewCategory?: CategoryPreview | null;
  onToggleSelection?: (receipt: ReceiptItem, checked: boolean) => void;
}) {
  const displayName =
    receipt.type === "income" ? (receipt.bankName ?? "不明") : (receipt.shopName ?? "不明");
  const actionLabelSuffix = `${displayName}（${formatDateForDisplay(receipt.date)}）`;
  const categoryName = selected && previewCategory ? previewCategory.name : receipt.categoryName;
  const categoryColor =
    selected && previewCategory?.color ? previewCategory.color : receipt.categoryColor;

  return (
    <Box
      className={`receipt-row${isDetail ? " receipt-row--detail" : ""}`}
      data-testid="receipt-row"
      key={receipt._id}
      role="row"
    >
      {selectionEnabled && (
        <Box className="receipt-row-select" role="cell">
          <Checkbox
            checked={selected}
            disabled={!onToggleSelection}
            onChange={(event) => onToggleSelection?.(receipt, event.target.checked)}
            size="small"
            slotProps={{
              input: { "aria-label": `${actionLabelSuffix}を選択` },
            }}
            sx={{ minHeight: 44, minWidth: 44 }}
          />
        </Box>
      )}
      <Typography className="receipt-row-date" color="text.secondary" role="cell" variant="body2">
        {isDetail ? "" : formatDateForDisplay(receipt.date)}
      </Typography>
      <Box className="receipt-row-name" role="cell">
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {!isDetail && receipt.type && (
            <Chip
              label={receipt.type === "income" ? "収入" : "支出"}
              size="small"
              color={receipt.type === "income" ? "warning" : "default"}
              variant="outlined"
            />
          )}
          {!isDetail && receipt.registrationMode === "totalOnly" ? (
            <Chip label="合計だけで保存" size="small" variant="outlined" />
          ) : null}
          <Typography sx={{ fontWeight: 700 }} noWrap>
            {isDetail ? (receipt.itemName ?? "内訳情報なし") : displayName}
          </Typography>
        </Stack>
        {showCategory && receipt.type !== "income" && (
          <Stack
            className="receipt-row-category"
            direction="row"
            role="group"
            spacing={0.75}
            sx={{ alignItems: "center", mt: 0.5 }}
          >
            <Box
              aria-hidden
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: categoryColor,
                flexShrink: 0,
              }}
            />
            <Typography color="text.secondary" variant="body2">
              {categoryName}
            </Typography>
          </Stack>
        )}
      </Box>
      <Typography className="receipt-row-amount" role="cell" sx={{ fontWeight: 700 }}>
        {receipt.amountYen.toLocaleString()}円
      </Typography>
      <Box className="receipt-row-memo" role="cell">
        {receipt.memo ? (
          <MemoExpandableText memo={receipt.memo} />
        ) : (
          <Typography color="text.secondary" variant="caption">
            —
          </Typography>
        )}
      </Box>
      <Box className="receipt-row-actions" role="cell">
        {(onEdit || onDelete) && (
          <Stack direction="row" spacing={0.5}>
            {onEdit && (
              <Button
                aria-label={`${actionLabelSuffix}を編集`}
                onClick={() => onEdit(receipt)}
                size="small"
                startIcon={<EditIcon fontSize="small" />}
                sx={{ minHeight: 44 }}
                type="button"
                variant="text"
              >
                編集
              </Button>
            )}
            {onDelete && (
              <Button
                aria-label={`${actionLabelSuffix}を削除`}
                color="error"
                onClick={() => onDelete(receipt)}
                size="small"
                startIcon={<DeleteIcon fontSize="small" />}
                sx={{ minHeight: 44 }}
                type="button"
                variant="text"
              >
                削除
              </Button>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
