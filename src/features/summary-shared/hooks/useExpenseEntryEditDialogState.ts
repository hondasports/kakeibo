import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useMutation } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { isValidSignedLineItemAmount } from "../../../../lib/domain/receipt/discountItems";
import {
  getExpenseItemFieldErrorMessage,
  parseExpenseAmountString,
  validateExpenseTitle,
} from "../../../../lib/domain/expenseEntries/expenseEntryItem";
import type { ReceiptItem } from "../types/types";
import { getEditableReceiptTitle } from "../components/ExpenseEntryEditDialog";
import type { EditableDraftItem } from "../components/ExpenseEntryDraftItemsEditor";

export function useExpenseEntryEditDialogState({
  receipt,
  onClose,
  onSaved,
}: {
  receipt: ReceiptItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateExpenseEntry = useMutation(api.expenseEntries.mutations.updateExpenseEntry);
  const updateReceipt = useMutation(api.receipts.crud.updateReceipt);
  const updateRegisteredDraft = useMutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft);
  const [date, setDate] = useState("");
  const [amountYen, setAmountYen] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [registrationMode, setRegistrationMode] = useState<"detailed" | "totalOnly">("detailed");
  const [draftItems, setDraftItems] = useState<EditableDraftItem[]>([]);
  const [draftItemsLoading, setDraftItemsLoading] = useState(false);
  const [error, setError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [titleError, setTitleError] = useState("");
  const [saving, setSaving] = useState(false);

  const [prevReceipt, setPrevReceipt] = useState<ReceiptItem | null>(null);
  if (prevReceipt !== receipt) {
    setPrevReceipt(receipt);
    if (receipt) {
      setDate(receipt.date);
      setAmountYen(
        String(
          receipt.aiExpenseDraftId
            ? (receipt.receiptTotalAmountYen ?? receipt.amountYen)
            : receipt.amountYen,
        ),
      );
      setCategoryId(receipt.categoryId);
      setTitle(getEditableReceiptTitle(receipt));
      setMemo(receipt.memo ?? "");
      setRegistrationMode(receipt.registrationMode ?? "detailed");
      setDraftItems([]);
      setDraftItemsLoading(Boolean(receipt.aiExpenseDraftId));
      setError("");
      setAmountError("");
      setTitleError("");
    }
  }

  const handleSave = async () => {
    if (!receipt) {
      return;
    }
    if (receipt.aiExpenseDraftId && registrationMode === "detailed" && draftItemsLoading) {
      return;
    }
    const amountResult = parseExpenseAmountString(amountYen);
    const titleResult = validateExpenseTitle(title);
    setError("");
    setAmountError(
      amountResult.success ? "" : getExpenseItemFieldErrorMessage("amountYen", amountResult.error),
    );
    setTitleError(
      titleResult.success ? "" : getExpenseItemFieldErrorMessage("title", titleResult.error),
    );
    if (!amountResult.success || !titleResult.success) {
      return;
    }
    const parsedAmount = amountResult.amountYen;
    if (!date.trim()) {
      setError("日付を入力してください。");
      return;
    }
    const submittedItems = draftItems.map((item) => ({
      itemId: item.itemId,
      itemName: item.itemName.trim(),
      amountYen: Number(item.amountYen),
      categoryId: item.categoryId as Id<"categories">,
    }));
    if (
      receipt.aiExpenseDraftId &&
      registrationMode === "detailed" &&
      submittedItems.some(
        (item) =>
          !item.itemName ||
          !isValidSignedLineItemAmount(item.itemName, item.amountYen) ||
          !item.categoryId,
      )
    ) {
      setError("明細名、明細金額、カテゴリを確認してください。");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (receipt.recordType === "expenseEntry") {
        if (receipt.aiExpenseDraftId && receipt.type !== "income") {
          await updateRegisteredDraft({
            draftId: receipt.aiExpenseDraftId as Id<"aiExpenseDrafts">,
            date,
            amountYen: parsedAmount,
            categoryId: categoryId as Id<"categories">,
            shopName: titleResult.title,
            memo: memo.trim(),
            registrationMode,
            items: registrationMode === "detailed" ? submittedItems : undefined,
          });
        } else if (receipt.type === "income") {
          await updateExpenseEntry({
            expenseEntryId: receipt._id as Id<"expenseEntries">,
            date,
            amountYen: parsedAmount,
            title: titleResult.title,
            memo: memo.trim() || undefined,
          });
        } else {
          await updateExpenseEntry({
            expenseEntryId: receipt._id as Id<"expenseEntries">,
            date,
            amountYen: parsedAmount,
            categoryId: categoryId as Id<"categories">,
            title: titleResult.title,
            memo: memo.trim() || undefined,
          });
        }
      } else if (receipt.type === "income") {
        await updateReceipt({
          receiptId: receipt._id as Id<"receipts">,
          date,
          amountYen: parsedAmount,
          bankName: titleResult.title,
          memo: memo.trim() || undefined,
        });
      } else {
        await updateReceipt({
          receiptId: receipt._id as Id<"receipts">,
          date,
          amountYen: parsedAmount,
          categoryId: categoryId as Id<"categories">,
          shopName: titleResult.title,
          memo: memo.trim() || undefined,
        });
      }
      onSaved();
      onClose();
    } catch {
      setError("保存に失敗しました。入力内容を確認して再度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const isDraftItemsLoading = Boolean(
    receipt?.aiExpenseDraftId && registrationMode === "detailed" && draftItemsLoading,
  );

  return {
    date,
    setDate,
    amountYen,
    setAmountYen,
    categoryId,
    setCategoryId,
    title,
    setTitle,
    memo,
    setMemo,
    registrationMode,
    setRegistrationMode,
    draftItems,
    setDraftItems,
    draftItemsLoading,
    setDraftItemsLoading,
    error,
    amountError,
    setAmountError,
    titleError,
    setTitleError,
    saving,
    handleSave,
    isDraftItemsLoading,
  };
}
