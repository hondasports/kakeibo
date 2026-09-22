import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useMutation } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  validateExpenseItems,
  type ExpenseItemEntryErrors,
  type ExpenseItemEntryInput,
} from "../validation/expenseItems";
import type { ExpenseItemState } from "./useExpenseEntryMode";

type UseExpenseEntrySubmitArgs = {
  date: string;
  categories: Array<{ _id: Id<"categories">; name: string; color: string }>;
  shopName: string;
  sourceAmount: string;
  isMultiMode: boolean;
  items: ExpenseItemState[];
  difference: number | null;
  singleAmountNum: number;
  sourceAmountNum: number;
  setShopNameError: (error: string) => void;
  setSourceAmountError: (error: string) => void;
  setItemErrors: (errors: ExpenseItemEntryErrors[]) => void;
  resetAfterSave: () => void;
};

export function useExpenseEntrySubmit({
  date,
  categories: _categories,
  shopName,
  sourceAmount,
  isMultiMode,
  items,
  difference,
  singleAmountNum,
  sourceAmountNum,
  setShopNameError,
  setSourceAmountError,
  setItemErrors,
  resetAfterSave,
}: UseExpenseEntrySubmitArgs) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [apiError, setApiError] = useState("");
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    severity: "success" | "error";
    message: string;
  }>({ open: false, severity: "success", message: "" });
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingDifference, setPendingDifference] = useState(0);

  const createExpenseEntries = useMutation(api.expenseEntries.mutations.createExpenseEntries);

  const doSave = async () => {
    setStatus("submitting");
    setApiError("");

    const itemInputs: ExpenseItemEntryInput[] = isMultiMode
      ? items.map((item) => ({
          categoryId: item.categoryId,
          amountYen: item.amountYen,
          title: item.title,
          memo: item.memo || undefined,
        }))
      : [
          {
            categoryId: items[0]?.categoryId ?? "",
            amountYen: singleAmountNum > 0 ? String(singleAmountNum) : sourceAmount,
            title: shopName,
            memo: items[0]?.memo || undefined,
          },
        ];

    const validation = validateExpenseItems({
      sourceAmount: isMultiMode && sourceAmountNum > 0 ? sourceAmountNum : undefined,
      items: itemInputs,
    });

    if (!validation.success) {
      if (validation.reason === "item_errors") {
        setItemErrors(validation.itemErrors);
        setStatus("idle");
        return;
      }
      if (validation.reason === "no_items") {
        setApiError("支出項目を1件以上入力してください");
        setStatus("error");
        return;
      }
      // amount_exceeded: 保存禁止（UIで既にブロック済み）
      setStatus("idle");
      return;
    }

    try {
      await createExpenseEntries({
        date,
        shopName: shopName.trim(),
        sourceAmountYen: sourceAmountNum > 0 ? sourceAmountNum : undefined,
        items: validation.data.items.map((item) => ({
          categoryId: item.categoryId,
          amountYen: item.amountYen,
          title: item.title,
          memo: item.memo,
        })),
      });

      // 保存成功 → リセット
      resetAfterSave();
      setStatus("idle");
      setSnackbar({ open: true, severity: "success", message: "支出項目を保存しました" });
    } catch (err) {
      setStatus("error");
      const message =
        err instanceof Error ? err.message : "保存に失敗しました。もう一度お試しください。";
      setApiError(message);
      setSnackbar({ open: true, severity: "error", message });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 単一モードのバリデーション
    if (!isMultiMode) {
      let hasError = false;
      if (!shopName.trim()) {
        setShopNameError("店舗名 / 支払先は必須です");
        hasError = true;
      }
      if (!sourceAmount || parseInt(sourceAmount, 10) <= 0) {
        setSourceAmountError("金額は必須です");
        hasError = true;
      }
      if (hasError) return;
    }

    // 複数モード: 差額プラスなら確認ダイアログ
    if (isMultiMode && difference !== null && difference > 0) {
      setPendingDifference(difference);
      setShowConfirmDialog(true);
      return;
    }

    await doSave();
  };

  const handleConfirmSave = async () => {
    setShowConfirmDialog(false);
    await doSave();
  };

  const handleCancelConfirm = () => {
    setShowConfirmDialog(false);
    setStatus("idle");
  };

  return {
    status,
    apiError,
    snackbar,
    showConfirmDialog,
    pendingDifference,
    handleSubmit,
    handleConfirmSave,
    handleCancelConfirm,
    handleSnackbarClose: () => setSnackbar((prev) => ({ ...prev, open: false })),
  };
}
