import { Box, Stack } from "@mui/material";
import { WeeklyTrendChart } from "./WeeklyTrendChart";
import { ReceiptListCard } from "../../summary-shared/components/ReceiptListCard";
import { IncomeListCard } from "../../summary-shared/components/IncomeListCard";
import { SummaryMetricsPanel } from "./SummaryMetricsPanel";
import { WeeklyCategoryBreakdown } from "./WeeklyCategoryBreakdown";
import type { WeeklySummaryPanelProps } from "../types/types";
import {
  incomeItemToReceiptItem,
  type IncomeItem,
  type ReceiptItem,
} from "../../summary-shared/types/types";

function mapIncomeHandler(
  handler: ((receipt: ReceiptItem) => void) | undefined,
): ((income: IncomeItem) => void) | undefined {
  return handler ? (income) => handler(incomeItemToReceiptItem(income)) : undefined;
}

export function WeeklySummaryPanel({
  count,
  totalAmountYen,
  totalIncomeYen = 0,
  incomeCount = 0,
  byCategory,
  prevWeekTotalAmountYen,
  receipts,
  incomes = [],
  isLoading = false,
  weeklyExpenseTrend,
  onDeleteReceipt,
  onEditReceipt,
  weekStartDate,
  selectionEnabled = false,
  selectedCount,
  limitMessage,
  previewCategory,
  saving,
  isSelected,
  onToggleSelection,
  onSelectVisible,
  onDeselectVisible,
  onClearSelection,
  onBulkChangeCategory,
  onBulkDelete,
}: WeeklySummaryPanelProps) {
  const targetWeek = weeklyExpenseTrend?.items.at(-1);
  const previousDiff =
    targetWeek?.previousDiff ??
    (prevWeekTotalAmountYen === null ? null : totalAmountYen - prevWeekTotalAmountYen);

  return (
    <Stack spacing={2.5}>
      <SummaryMetricsPanel
        averageRate={targetWeek?.averageRate ?? null}
        isLoading={isLoading || weeklyExpenseTrend === undefined}
        previousDiff={previousDiff}
        totalAmountYen={totalAmountYen}
        totalIncomeYen={totalIncomeYen}
      />

      <Box className="weekly-summary-analysis-grid">
        {weeklyExpenseTrend !== null && (
          <WeeklyTrendChart
            chartData={weeklyExpenseTrend}
            isLoading={weeklyExpenseTrend === undefined}
          />
        )}
        <WeeklyCategoryBreakdown
          byCategory={byCategory}
          count={count}
          isLoading={isLoading}
          totalAmountYen={totalAmountYen}
        />
      </Box>

      <ReceiptListCard
        key={`expense-${weekStartDate}`}
        count={count}
        isLoading={isLoading}
        receipts={receipts}
        onDeleteReceipt={onDeleteReceipt}
        onEditReceipt={onEditReceipt}
        isSelected={isSelected}
        limitMessage={limitMessage}
        previewCategory={previewCategory}
        saving={saving}
        selectedCount={selectedCount}
        selectionEnabled={selectionEnabled}
        onBulkChangeCategory={onBulkChangeCategory}
        onBulkDelete={onBulkDelete}
        onClearSelection={onClearSelection}
        onDeselectVisible={onDeselectVisible}
        onSelectVisible={onSelectVisible}
        onToggleSelection={onToggleSelection}
      />

      <IncomeListCard
        key={`income-${weekStartDate}`}
        count={incomeCount}
        incomes={incomes}
        isLoading={isLoading}
        onDeleteIncome={mapIncomeHandler(onDeleteReceipt)}
        onEditIncome={mapIncomeHandler(onEditReceipt)}
      />
    </Stack>
  );
}
