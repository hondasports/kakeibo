import { useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Alert, Box, Button, Checkbox, Paper, Skeleton, Stack, Typography } from "@mui/material";
import { ReceiptGroupRow } from "./ReceiptGroupRow";
import type { CategoryPreview } from "./ReceiptRow";
import { groupReceiptItems, type ReceiptItem } from "../types/types";
import { getVisibleSelectableReceipts } from "../utils/bulkSelection";

export function ReceiptListCard({
  count,
  emptyMessage = "まだレシートがありません",
  heading,
  isLoading,
  listAriaLabel = "週次サマリーの支出一覧",
  maxVisibleGroups = 5,
  receipts,
  onDeleteReceipt,
  onEditReceipt,
  selectionEnabled = false,
  selectedCount = 0,
  limitMessage = "",
  previewCategory = null,
  saving = false,
  isSelected,
  onToggleSelection,
  onSelectVisible,
  onDeselectVisible,
  onClearSelection,
  onBulkChangeCategory,
  onBulkDelete,
}: {
  count: number;
  emptyMessage?: string;
  heading?: string;
  isLoading: boolean;
  listAriaLabel?: string;
  maxVisibleGroups?: number;
  receipts: ReceiptItem[];
  onDeleteReceipt?: (receipt: ReceiptItem) => void;
  onEditReceipt?: (receipt: ReceiptItem) => void;
  selectionEnabled?: boolean;
  selectedCount?: number;
  limitMessage?: string;
  previewCategory?: CategoryPreview | null;
  saving?: boolean;
  isSelected?: (receipt: ReceiptItem) => boolean;
  onToggleSelection?: (receipt: ReceiptItem, checked: boolean) => void;
  onSelectVisible?: (receipts: ReceiptItem[]) => void;
  onDeselectVisible?: (receipts: ReceiptItem[]) => void;
  onClearSelection?: () => void;
  onBulkChangeCategory?: () => void;
  onBulkDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const orderedReceiptGroups = groupReceiptItems(receipts)
    .map((group, index) => ({ group, index }))
    .sort((a, b) => b.group.date.localeCompare(a.group.date) || b.index - a.index)
    .map(({ group }) => group);
  const visibleReceiptGroups =
    expanded || maxVisibleGroups === Number.POSITIVE_INFINITY
      ? orderedReceiptGroups
      : orderedReceiptGroups.slice(0, maxVisibleGroups);
  const remainingCount = Math.max(orderedReceiptGroups.length - visibleReceiptGroups.length, 0);
  const visibleItems = visibleReceiptGroups.flatMap((group) =>
    getVisibleSelectableReceipts(group.items),
  );
  const visibleSelectedCount = visibleItems.filter((item) => isSelected?.(item)).length;
  const allVisibleSelected =
    visibleItems.length > 0 && visibleSelectedCount === visibleItems.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  return (
    <Paper className="paper-panel weekly-receipt-panel" elevation={0}>
      <Box sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h6">
            {heading ?? `支出一覧（${orderedReceiptGroups.length}件）`}
          </Typography>
          {selectionEnabled && !isLoading && count > 0 && (
            <Stack
              className="receipt-bulk-actions"
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ alignItems: { sm: "center" } }}
            >
              <Typography aria-live="polite" variant="body2">
                {selectedCount > 0
                  ? `明細${selectedCount}件を選択中`
                  : "明細を選択して一括操作できます"}
              </Typography>
              {selectedCount > 0 && (
                <>
                  <Button
                    disabled={saving}
                    onClick={onBulkChangeCategory}
                    sx={{ minHeight: 44 }}
                    type="button"
                    variant="contained"
                  >
                    カテゴリを変更
                  </Button>
                  <Button
                    color="error"
                    disabled={saving}
                    onClick={onBulkDelete}
                    sx={{ minHeight: 44 }}
                    type="button"
                    variant="outlined"
                  >
                    削除
                  </Button>
                </>
              )}
              <Button
                disabled={saving || visibleItems.length === 0}
                onClick={() => onSelectVisible?.(visibleItems)}
                sx={{ minHeight: 44 }}
                type="button"
                variant="text"
              >
                表示中の明細をすべて選択
              </Button>
              {selectedCount > 0 && (
                <Button
                  disabled={saving}
                  onClick={onClearSelection}
                  sx={{ minHeight: 44 }}
                  type="button"
                  variant="text"
                >
                  選択を解除
                </Button>
              )}
            </Stack>
          )}
          {selectionEnabled && limitMessage && (
            <Alert severity="warning" variant="outlined">
              {limitMessage}
            </Alert>
          )}

          <Box
            aria-label={listAriaLabel}
            className={`receipt-list${selectionEnabled ? " receipt-list--selectable" : ""}`}
            role={!isLoading && count > 0 ? "table" : undefined}
          >
            {isLoading ? (
              <>
                <Skeleton variant="text" height={40} />
                <Skeleton variant="text" height={40} />
                <Skeleton variant="text" height={40} />
              </>
            ) : count === 0 ? (
              <Typography color="text.secondary" variant="body2">
                {emptyMessage}
              </Typography>
            ) : (
              <>
                <Box className="receipt-list-header" role="row">
                  {selectionEnabled && (
                    <span role="columnheader">
                      <Checkbox
                        checked={allVisibleSelected}
                        disabled={saving || visibleItems.length === 0}
                        indeterminate={someVisibleSelected}
                        onChange={(event) => {
                          if (event.target.checked) {
                            onSelectVisible?.(visibleItems);
                            return;
                          }
                          onDeselectVisible?.(visibleItems);
                        }}
                        size="small"
                        slotProps={{
                          input: { "aria-label": "表示中の明細をすべて選択" },
                        }}
                        sx={{ minHeight: 44, minWidth: 44 }}
                      />
                    </span>
                  )}
                  <span role="columnheader">日付</span>
                  <span role="columnheader">店名・内訳</span>
                  <span role="columnheader">金額（円）</span>
                  <span role="columnheader">メモ</span>
                  <span role="columnheader">操作</span>
                </Box>
                {visibleReceiptGroups.map((group) => (
                  <ReceiptGroupRow
                    key={group.id}
                    group={group}
                    onDelete={onDeleteReceipt}
                    onEdit={onEditReceipt}
                    isSelected={isSelected}
                    previewCategory={previewCategory}
                    selectionEnabled={selectionEnabled}
                    onToggleSelection={onToggleSelection}
                  />
                ))}
              </>
            )}
          </Box>
          {!isLoading && remainingCount > 0 && (
            <Button
              endIcon={<ExpandMoreIcon />}
              onClick={() => setExpanded(true)}
              sx={{ alignSelf: "center", minHeight: 44, minWidth: 204 }}
              variant="outlined"
            >
              さらに{remainingCount}件を見る
            </Button>
          )}
        </Stack>
      </Box>
    </Paper>
  );
}
