import { useId, useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Button, Paper, Skeleton, Stack, Typography } from "@mui/material";
import { ReceiptRow } from "./ReceiptRow";
import type { IncomeItem, ReceiptDateFormat } from "../types/types";
import { incomeItemToReceiptItem } from "../types/types";

export function IncomeListCard({
  count,
  dateFormat = "monthDay",
  emptyMessage = "まだ収入がありません",
  isLoading,
  incomes,
  listAriaLabel = "週次サマリーの収入一覧",
  onDeleteIncome,
  onEditIncome,
  weekSummaryPath,
}: {
  count: number;
  dateFormat?: ReceiptDateFormat;
  emptyMessage?: string;
  isLoading: boolean;
  incomes: IncomeItem[];
  listAriaLabel?: string;
  onDeleteIncome?: (income: IncomeItem) => void;
  onEditIncome?: (income: IncomeItem) => void;
  weekSummaryPath?: (date: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hasRowActions = Boolean(onEditIncome || onDeleteIncome || weekSummaryPath);
  const orderedIncomes = incomes
    .map((income, index) => ({ income, index }))
    .sort((a, b) => b.income.date.localeCompare(a.income.date) || b.index - a.index)
    .map(({ income }) => income);
  const visibleIncomes = expanded ? orderedIncomes : orderedIncomes.slice(0, 5);
  const remainingCount = Math.max(incomes.length - visibleIncomes.length, 0);

  return (
    <Paper className="paper-panel weekly-income-panel" elevation={0}>
      <Box sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h6">
            収入一覧（{count}件）
          </Typography>

          <Box
            aria-label={listAriaLabel}
            id={listId}
            className={`receipt-list receipt-list--income${hasRowActions ? "" : " receipt-list--no-actions"}${dateFormat === "yearMonthDay" ? " receipt-list--with-year" : ""}`}
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
                <Box className="receipt-list-header receipt-list-header--income" role="row">
                  <span role="columnheader">日付</span>
                  <span role="columnheader">内容</span>
                  <span role="columnheader">金額（円）</span>
                  <span role="columnheader">メモ</span>
                  {hasRowActions && <span role="columnheader">操作</span>}
                </Box>
                {visibleIncomes.map((income) => {
                  const receipt = incomeItemToReceiptItem(income);
                  return (
                    <ReceiptRow
                      key={income._id}
                      dateFormat={dateFormat}
                      receipt={receipt}
                      showCategory={false}
                      onDelete={onDeleteIncome ? () => onDeleteIncome(income) : undefined}
                      onEdit={onEditIncome ? () => onEditIncome(income) : undefined}
                      weekSummaryPath={weekSummaryPath}
                    />
                  );
                })}
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
