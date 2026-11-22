import { useId, useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Alert, Box, Button, Checkbox, Paper, Skeleton, Stack, Typography } from "@mui/material";
import { ReceiptGroupRow } from "./ReceiptGroupRow";
import type { CategoryPreview } from "./ReceiptRow";
import { groupReceiptItems, type ReceiptDateFormat, type ReceiptItem } from "../types/types";
import { getVisibleSelectableReceipts } from "../utils/bulkSelection";

export function ReceiptListCard({
  count,
  dateFormat = "monthDay",
  emptyMessage = "まだ支出がありません",
  heading,
  isLoading,
  listAriaLabel = "週次サマリーの支出一覧",
  maxVisibleGroups = 5,
  receipts,
  onDeleteReceipt,
  onCopyReceipt,
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
  weekSummaryPath,
  preserveOrder,
}: {
  count: number;
  dateFormat?: ReceiptDateFormat;
  emptyMessage?: string;
  heading?: string;
  isLoading: boolean;
  listAriaLabel?: string;
  maxVisibleGroups?: number;
  /** true のとき入力順をそのまま表示する。検索結果のようにサーバー側で並び順が決まっている場合に使う */
  preserveOrder?: boolean;
  receipts: ReceiptItem[];
  onDeleteReceipt?: (receipt: ReceiptItem) => void;
  onCopyReceipt?: (receipt: ReceiptItem) => void;
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
  weekSummaryPath?: (date: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hasRowActions = Boolean(
    onEditReceipt || onDeleteReceipt || onCopyReceipt || weekSummaryPath,
  );
  const receiptGroups = groupReceiptItems(receipts);
  const orderedReceiptGroups = preserveOrder
    ? receiptGroups
    : receiptGroups
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
            id={listId}
            className={`receipt-list${selectionEnabled ? " receipt-list--selectable" : ""}${hasRowActions ? "" : " receipt-list--no-actions"}${dateFormat === "yearMonthDay" ? " receipt-list--with-year" : ""}`}
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
                  {hasRowActions && <span role="columnheader">操作</span>}
                </Box>
                {visibleReceiptGroups.map((group) => (
                  <ReceiptGroupRow
                    key={group.id}
                    dateFormat={dateFormat}
                    group={group}
                    onCopy={onCopyReceipt}
                    onDelete={onDeleteReceipt}
                    onEdit={onEditReceipt}
                    isSelected={isSelected}
                    previewCategory={previewCategory}
                    selectionEnabled={selectionEnabled}
                    onToggleSelection={onToggleSelection}
                    weekSummaryPath={weekSummaryPath}
                  />
                ))}
              </>
            )}
          </Box>
          {!isLoading && count > 0 && (remainingCount > 0 || expanded) && (
            <Button
              aria-controls={listId}
              aria-expanded={expanded}
              endIcon={<ExpandMoreIcon />}
              onClick={() => setExpanded((current) => !current)}
              sx={{
                alignSelf: "center",
                minHeight: 44,
                minWidth: 204,
                ...(expanded && { "& .MuiButton-endIcon": { transform: "rotate(180deg)" } }),
              }}
              variant="outlined"
            >
              {expanded ? "閉じる" : `さらに${remainingCount}件を見る`}
            </Button>
          )}
        </Stack>
      </Box>
    </Paper>
  );
}
