import type { Id } from "../../../../convex/_generated/dataModel";
import { useExpenseEntryMode } from "./useExpenseEntryMode";
import { useExpenseEntrySubmit } from "./useExpenseEntrySubmit";

export type { ExpenseItemState } from "./useExpenseEntryMode";

type UseExpenseEntryFormArgs = {
  weekStartDate: string;
  weekEndDate: string;
  categories: Array<{ _id: Id<"categories">; name: string; color: string }>;
};

export function useExpenseEntryForm({ weekStartDate, categories }: UseExpenseEntryFormArgs) {
  const mode = useExpenseEntryMode({ weekStartDate, categories });

  const submit = useExpenseEntrySubmit({
    date: mode.date,
    categories,
    shopName: mode.shopName,
    sourceAmount: mode.sourceAmount,
    isMultiMode: mode.isMultiMode,
    items: mode.items,
    memo: mode.memo,
    difference: mode.difference,
    singleAmountNum: mode.singleAmountNum,
    sourceAmountNum: mode.sourceAmountNum,
    setShopNameError: mode.setShopNameError,
    setSourceAmountError: mode.setSourceAmountError,
    setItemErrors: mode.setItemErrors,
    setMemoError: mode.setMemoError,
    resetAfterSave: mode.resetAfterSave,
  });

  return {
    shopName: mode.shopName,
    sourceAmount: mode.sourceAmount,
    date: mode.date,
    isMultiMode: mode.isMultiMode,
    items: mode.items,
    shopNameError: mode.shopNameError,
    sourceAmountError: mode.sourceAmountError,
    itemErrors: mode.itemErrors,
    memo: mode.memo,
    memoError: mode.memoError,
    difference: mode.difference,
    status: submit.status,
    apiError: submit.apiError,
    snackbar: submit.snackbar,
    showConfirmDialog: submit.showConfirmDialog,
    pendingDifference: submit.pendingDifference,
    setShopName: mode.setShopName,
    setSourceAmount: mode.setSourceAmount,
    setMemo: mode.setMemo,
    setDate: mode.setDate,
    handleEnterMultiMode: mode.handleEnterMultiMode,
    handleAddItem: mode.handleAddItem,
    handleRemoveItem: mode.handleRemoveItem,
    handleItemChange: mode.handleItemChange,
    showExitMultiConfirm: mode.showExitMultiConfirm,
    handleExitMultiMode: mode.handleExitMultiMode,
    handleConfirmExitMultiMode: mode.handleConfirmExitMultiMode,
    handleCancelExitMultiMode: mode.handleCancelExitMultiMode,
    handleSubmit: submit.handleSubmit,
    handleConfirmSave: submit.handleConfirmSave,
    handleCancelConfirm: submit.handleCancelConfirm,
    handleSnackbarClose: submit.handleSnackbarClose,
  };
}
