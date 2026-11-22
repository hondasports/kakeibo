import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Alert, Box, Button, Snackbar, Stack } from "@mui/material";
import {
  AiExpenseQueuePanelProvider,
  QueuePanelActive,
  QueuePanelDialogs,
  QueuePanelHeader,
  QueuePanelRegistered,
} from "../../ai-expense-queue";
import { ConfirmDifferenceDialog } from "./ConfirmDifferenceDialog";
import { EntryFavoritesDialog } from "./EntryFavoritesDialog";
import { ExitMultiModeDialog } from "./ExitMultiModeDialog";
import { ExpenseFormActions } from "./ExpenseFormActions";
import { ExpenseFormHeading } from "./ExpenseFormHeading";
import { ExpenseMemoField } from "./ExpenseMemoField";
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
  memo,
  memoError,
  difference,
  status,
  apiError,
  snackbar,
  showConfirmDialog,
  pendingDifference,
  setShopName,
  setSourceAmount,
  setMemo,
  setDate,
  handleEnterMultiMode,
  handleAddItem,
  handleRemoveItem,
  handleItemChange,
  showExitMultiConfirm,
  handleExitMultiMode,
  handleConfirmExitMultiMode,
  handleCancelExitMultiMode,
  handleSubmit,
  handleConfirmSave,
  handleCancelConfirm,
  applyEntryPrefill,
  handleSnackbarClose,
}: ExpenseEntryWorkbenchProps) {
  const sourceAmountNum = parseInt(sourceAmount || "0", 10) || 0;
  const isOverExceeded = difference !== null && difference < 0;
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const saveEntryFavorite = useMutation(api.entryFavorites.mutations.saveEntryFavorite);

  const currentCategoryId = items[0]?.categoryId ?? "";
  const canSaveFavorite =
    !isMultiMode && shopName.trim() !== "" && sourceAmountNum > 0 && currentCategoryId !== "";

  const handleSaveFavorite = async () => {
    try {
      await saveEntryFavorite({
        title: shopName,
        categoryId: currentCategoryId as Id<"categories">,
        amountYen: sourceAmountNum,
        memo: memo || undefined,
      });
      setFavoriteMessage("お気に入りに保存しました");
    } catch {
      setFavoriteMessage("お気に入りの保存に失敗しました");
    }
  };

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
                memo={memo}
                memoError={memoError}
                shopName={shopName}
                shopNameError={shopNameError}
                sourceAmount={sourceAmount}
                sourceAmountError={sourceAmountError}
                onCategoryChange={(categoryId) => handleItemChange(0, "categoryId", categoryId)}
                onMemoChange={setMemo}
                onShopNameChange={setShopName}
                onSourceAmountChange={setSourceAmount}
              />
            )}

            {isMultiMode && (
              <MultiEntryFields
                categories={categories}
                difference={difference}
                isSubmitting={status === "submitting"}
                itemErrors={itemErrors}
                items={items}
                sourceAmount={sourceAmountNum}
                onAddItem={handleAddItem}
                onItemChange={handleItemChange}
                onRemoveItem={handleRemoveItem}
                onExitMultiMode={handleExitMultiMode}
              />
            )}

            {isMultiMode && (
              <ExpenseMemoField memo={memo} memoError={memoError} onMemoChange={setMemo} />
            )}

            {!isMultiMode && (
              <Stack direction="row" spacing={1}>
                <Button
                  onClick={() => setFavoritesOpen(true)}
                  size="small"
                  sx={{ minHeight: 44 }}
                  type="button"
                  variant="outlined"
                >
                  お気に入りから入力
                </Button>
                <Button
                  disabled={!canSaveFavorite}
                  onClick={() => void handleSaveFavorite()}
                  size="small"
                  sx={{ minHeight: 44 }}
                  type="button"
                  variant="text"
                >
                  お気に入りに保存
                </Button>
              </Stack>
            )}
            {favoriteMessage && (
              <Alert onClose={() => setFavoriteMessage("")} severity="info" variant="outlined">
                {favoriteMessage}
              </Alert>
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

      <EntryFavoritesDialog
        categoryNames={new Map(categories.map((category) => [category._id, category.name]))}
        open={favoritesOpen}
        onApply={(prefill) => {
          applyEntryPrefill(prefill);
          setFavoritesOpen(false);
        }}
        onClose={() => setFavoritesOpen(false)}
      />

      <ExitMultiModeDialog
        onCancel={handleCancelExitMultiMode}
        onConfirm={handleConfirmExitMultiMode}
        open={showExitMultiConfirm}
      />

      <Snackbar
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        open={snackbar.open}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity="success"
          sx={{ width: "100%" }}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AiExpenseQueuePanelProvider>
  );
}
