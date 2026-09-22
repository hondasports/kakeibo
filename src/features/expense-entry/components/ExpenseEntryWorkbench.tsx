import type { Id } from "../../../../convex/_generated/dataModel";
import { Alert, Box, Snackbar, Stack } from "@mui/material";
import {
  AiExpenseQueuePanelProvider,
  QueuePanelActive,
  QueuePanelDialogs,
  QueuePanelHeader,
  QueuePanelRegistered,
} from "../../ai-expense-queue";
import { ConfirmDifferenceDialog } from "./ConfirmDifferenceDialog";
import { ExpenseFormActions } from "./ExpenseFormActions";
import { ExpenseFormHeading } from "./ExpenseFormHeading";
import { MultiEntryFields } from "./MultiEntryFields";
import { SingleEntryFields } from "./SingleEntryFields";
import { SourceSummary } from "./SourceSummary";
import { WeekDaySelector } from "./WeekDaySelector";
import type { useExpenseEntryForm } from "../hooks/useExpenseEntryForm";

type ExpenseEntryWorkbenchProps = {
  weekStartDate: string;
  weekEndDate: string;
  categories: Array<{ _id: Id<"categories">; name: string; color: string }>;
} & ReturnType<typeof useExpenseEntryForm>;

export function ExpenseEntryWorkbench({
  weekStartDate,
  weekEndDate,
  categories,
  shopName,
  sourceAmount,
  date,
  isMultiMode,
  items,
  shopNameError,
  sourceAmountError,
  itemErrors,
  difference,
  status,
  apiError,
  snackbar,
  showConfirmDialog,
  pendingDifference,
  setShopName,
  setSourceAmount,
  setDate,
  handleEnterMultiMode,
  handleAddItem,
  handleRemoveItem,
  handleItemChange,
  handleSubmit,
  handleConfirmSave,
  handleCancelConfirm,
  handleSnackbarClose,
}: ExpenseEntryWorkbenchProps) {
  const sourceAmountNum = parseInt(sourceAmount || "0", 10) || 0;
  const isOverExceeded = difference !== null && difference < 0;

  return (
    <AiExpenseQueuePanelProvider categories={categories}>
      <Box className="input-workbench input-workbench--expense">
        <QueuePanelHeader
          className="input-workbench-queue-header ai-expense-queue"
          component="section"
        />
        <QueuePanelActive className="input-workbench-queue-active input-workbench-queue-block" />

        <form className="input-workbench-form" noValidate onSubmit={handleSubmit}>
          <Stack spacing={2.5} sx={{ maxWidth: "100%", minWidth: 0 }}>
            <ExpenseFormHeading isMultiMode={isMultiMode} />

            {apiError && (
              <Alert severity="error" variant="outlined">
                {apiError}
              </Alert>
            )}

            <WeekDaySelector
              selectedDate={date}
              weekEndDate={weekEndDate}
              weekStartDate={weekStartDate}
              onSelectDate={setDate}
            />

            {isMultiMode ? (
              <SourceSummary shopName={shopName} sourceAmount={sourceAmountNum} />
            ) : (
              <SingleEntryFields
                categories={categories}
                categoryError={itemErrors[0]?.categoryId}
                itemCategoryId={items[0]?.categoryId}
                memo={items[0]?.memo ?? ""}
                shopName={shopName}
                shopNameError={shopNameError}
                sourceAmount={sourceAmount}
                sourceAmountError={sourceAmountError}
                onItemChange={(field, value) => handleItemChange(0, field, value)}
                onShopNameChange={setShopName}
                onSourceAmountChange={setSourceAmount}
              />
            )}

            {isMultiMode && (
              <MultiEntryFields
                categories={categories}
                difference={difference}
                itemErrors={itemErrors}
                items={items}
                sourceAmount={sourceAmountNum}
                onAddItem={handleAddItem}
                onItemChange={handleItemChange}
                onRemoveItem={handleRemoveItem}
              />
            )}

            <ExpenseFormActions
              isMultiMode={isMultiMode}
              isOverExceeded={isOverExceeded}
              isSubmitting={status === "submitting"}
              onEnterMultiMode={handleEnterMultiMode}
            />
          </Stack>
        </form>

        <QueuePanelRegistered className="input-workbench-queue-registered input-workbench-queue-block" />
        <QueuePanelDialogs categories={categories} />
      </Box>

      <ConfirmDifferenceDialog
        onCancel={handleCancelConfirm}
        onConfirm={handleConfirmSave}
        open={showConfirmDialog}
        pendingDifference={pendingDifference}
      />

      <Snackbar
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        open={snackbar.open}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AiExpenseQueuePanelProvider>
  );
}
