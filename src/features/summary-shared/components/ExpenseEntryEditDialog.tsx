import { api } from "../../../../convex/_generated/api";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  isValidSignedLineItemAmount,
  sanitizeSignedYenInput,
} from "../../../../lib/domain/receipt/discountItems";
import type { ReceiptItem } from "../types/types";

type CategoryOption = {
  _id: string;
  name: string;
};

type EditableDraftItem = {
  itemId?: Id<"aiExpenseDraftItems">;
  itemName: string;
  amountYen: string;
  categoryId: string;
};

function DraftItemsLoader({
  draftId,
  setDraftItems,
  setDraftItemsLoading,
}: {
  draftId: Id<"aiExpenseDrafts">;
  setDraftItems: (items: EditableDraftItem[]) => void;
  setDraftItemsLoading: (loading: boolean) => void;
}) {
  const draftDetails = useQuery(api.aiExpenseDrafts.queries.getWithItems, { draftId });
  useEffect(() => {
    if (draftDetails === undefined) return;
    setDraftItems(
      (draftDetails?.items ?? []).map((item) => ({
        itemId: item._id,
        itemName: item.itemName,
        amountYen: String(item.printedAmountYen ?? item.normalizedAmountYen ?? item.amountYen),
        categoryId: item.categoryId ?? "",
      })),
    );
    setDraftItemsLoading(false);
  }, [draftDetails, setDraftItems, setDraftItemsLoading]);
  return null;
}

export function getEditableReceiptTitle(receipt: ReceiptItem): string {
  if (receipt.type === "income") {
    return receipt.bankName ?? "";
  }
  if (receipt.recordType === "expenseEntry") {
    if (receipt.aiExpenseDraftId) {
      return receipt.receiptShopName ?? receipt.shopName ?? "";
    }
    return receipt.itemName ?? receipt.shopName ?? "";
  }
  return receipt.receiptShopName ?? receipt.shopName ?? "";
}

export function ExpenseEntryEditDialog({
  categories,
  open,
  receipt,
  onClose,
  onSaved,
}: {
  categories: CategoryOption[];
  open: boolean;
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
    }
  }

  const handleSave = async () => {
    if (!receipt) {
      return;
    }
    if (receipt.aiExpenseDraftId && registrationMode === "detailed" && draftItemsLoading) {
      return;
    }
    const parsedAmount = Number(amountYen.replace(/[^\d]/g, ""));
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setError("金額は1円以上の整数で入力してください。");
      return;
    }
    if (!title.trim()) {
      setError("タイトルを入力してください。");
      return;
    }
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
            shopName: title.trim(),
            memo: memo.trim(),
            registrationMode,
            items: registrationMode === "detailed" ? submittedItems : undefined,
          });
        } else if (receipt.type === "income") {
          await updateExpenseEntry({
            expenseEntryId: receipt._id as Id<"expenseEntries">,
            date,
            amountYen: parsedAmount,
            title: title.trim(),
            memo: memo.trim() || undefined,
          });
        } else {
          await updateExpenseEntry({
            expenseEntryId: receipt._id as Id<"expenseEntries">,
            date,
            amountYen: parsedAmount,
            categoryId: categoryId as Id<"categories">,
            title: title.trim(),
            memo: memo.trim() || undefined,
          });
        }
      } else if (receipt.type === "income") {
        await updateReceipt({
          receiptId: receipt._id as Id<"receipts">,
          date,
          amountYen: parsedAmount,
          bankName: title.trim(),
          memo: memo.trim() || undefined,
        });
      } else {
        await updateReceipt({
          receiptId: receipt._id as Id<"receipts">,
          date,
          amountYen: parsedAmount,
          categoryId: categoryId as Id<"categories">,
          shopName: title.trim(),
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

  const entryLabel = receipt?.type === "income" ? "収入" : "支出";
  const isIncome = receipt?.type === "income";
  const isDraftItemsLoading = Boolean(
    receipt?.aiExpenseDraftId && registrationMode === "detailed" && draftItemsLoading,
  );

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
      {receipt?.aiExpenseDraftId ? (
        <DraftItemsLoader
          draftId={receipt.aiExpenseDraftId as Id<"aiExpenseDrafts">}
          setDraftItems={setDraftItems}
          setDraftItemsLoading={setDraftItemsLoading}
        />
      ) : null}
      <DialogTitle>{entryLabel}を編集</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" variant="outlined">
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            label="日付"
            onChange={(event) => setDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            type="date"
            value={date}
          />
          <TextField
            fullWidth
            label="金額"
            onChange={(event) => setAmountYen(event.target.value.replace(/[^\d]/g, ""))}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            value={amountYen}
          />
          {receipt?.aiExpenseDraftId && !isIncome ? (
            <TextField
              fullWidth
              label="登録方法"
              onChange={(event) =>
                setRegistrationMode(event.target.value as "detailed" | "totalOnly")
              }
              select
              value={registrationMode}
            >
              <MenuItem value="detailed">明細ごとに保存</MenuItem>
              <MenuItem value="totalOnly">レシート合計だけで保存</MenuItem>
            </TextField>
          ) : null}
          {receipt?.aiExpenseDraftId && registrationMode === "totalOnly" ? (
            <Alert severity="info" variant="outlined">
              この金額だけを集計します。OCRの商品明細と税内訳は集計に使われません。
            </Alert>
          ) : null}
          {receipt?.aiExpenseDraftId && registrationMode === "detailed" ? (
            <Stack aria-label="登録明細" spacing={1.5}>
              <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
                登録明細
              </Typography>
              {draftItemsLoading ? (
                <Typography color="text.secondary" variant="body2">
                  明細を読み込んでいます。
                </Typography>
              ) : draftItems.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  保存済みの明細はありません。レシート合計を1件の支出として登録します。
                </Typography>
              ) : (
                draftItems.map((item, index) => (
                  <Stack key={item.itemId ?? index} spacing={1}>
                    <TextField
                      fullWidth
                      label={`明細名 ${index + 1}`}
                      onChange={(event) =>
                        setDraftItems((current) =>
                          current.map((currentItem, currentIndex) =>
                            currentIndex === index
                              ? { ...currentItem, itemName: event.target.value }
                              : currentItem,
                          ),
                        )
                      }
                      value={item.itemName}
                    />
                    <TextField
                      fullWidth
                      label={`明細金額 ${index + 1}`}
                      onChange={(event) =>
                        setDraftItems((current) =>
                          current.map((currentItem, currentIndex) =>
                            currentIndex === index
                              ? {
                                  ...currentItem,
                                  amountYen: sanitizeSignedYenInput(
                                    currentItem.itemName,
                                    event.target.value,
                                  ),
                                }
                              : currentItem,
                          ),
                        )
                      }
                      slotProps={{ htmlInput: { inputMode: "text" } }}
                      value={item.amountYen}
                    />
                    <TextField
                      fullWidth
                      label={`明細カテゴリ ${index + 1}`}
                      onChange={(event) =>
                        setDraftItems((current) =>
                          current.map((currentItem, currentIndex) =>
                            currentIndex === index
                              ? { ...currentItem, categoryId: event.target.value }
                              : currentItem,
                          ),
                        )
                      }
                      select
                      value={item.categoryId}
                    >
                      {categories.map((category) => (
                        <MenuItem key={category._id} value={category._id}>
                          {category.name}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      color="error"
                      onClick={() =>
                        setDraftItems((current) =>
                          current.filter((_, currentIndex) => currentIndex !== index),
                        )
                      }
                      type="button"
                      variant="text"
                    >
                      明細{index + 1}を削除
                    </Button>
                  </Stack>
                ))
              )}
              <Button
                onClick={() =>
                  setDraftItems((current) => [
                    ...current,
                    {
                      itemName: "",
                      amountYen: "",
                      categoryId,
                    },
                  ])
                }
                type="button"
                variant="outlined"
              >
                明細を追加
              </Button>
            </Stack>
          ) : null}
          {!isIncome && (
            <TextField
              fullWidth
              label="カテゴリ"
              onChange={(event) => setCategoryId(event.target.value)}
              select
              value={categoryId}
            >
              {categories.map((category) => (
                <MenuItem key={category._id} value={category._id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            fullWidth
            label={receipt?.type === "income" ? "内容" : "タイトル"}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <TextField
            fullWidth
            label="メモ"
            minRows={2}
            multiline
            onChange={(event) => setMemo(event.target.value)}
            value={memo}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onClose} type="button">
          キャンセル
        </Button>
        <Button
          disabled={saving || isDraftItemsLoading}
          onClick={() => void handleSave()}
          type="button"
          variant="contained"
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
