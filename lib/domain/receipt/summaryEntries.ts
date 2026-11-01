import type { SpendingEntry } from "./spendingEntry";
import type { EntryKind } from "../common/entryKind";
import type { AiExpenseRegistrationMode } from "../aiExpenseDrafts/receiptDataContract";

export type CategoryInfoMap = Map<string, { name: string; color: string }>;

export type SummaryReceiptEntry = {
  _id: string;
  date: string;
  type?: EntryKind;
  shopName?: string;
  bankName?: string;
  amountYen: number;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  memo?: string;
  recordType: "expenseEntry" | "receipt";
  itemName?: string;
  receiptGroupId?: string;
  receiptShopName?: string;
  receiptTotalAmountYen?: number;
  aiExpenseDraftId?: string;
  registrationMode?: AiExpenseRegistrationMode;
};

/** 支出エントリをサマリ応答項目へ変換する。カテゴリ情報が無い場合はフォールバックを使う。 */
export function mapSpendingEntryToSummaryReceipt(
  receipt: SpendingEntry,
  categoryInfoMap: CategoryInfoMap,
): SummaryReceiptEntry {
  const categoryId = receipt.categoryId;
  const info = categoryInfoMap.get(categoryId);
  return {
    _id: receipt._id,
    date: receipt.date,
    type: receipt.type,
    shopName: receipt.shopName,
    bankName: receipt.bankName,
    amountYen: receipt.amountYen,
    categoryId,
    categoryName: info?.name ?? "不明",
    categoryColor: info?.color ?? "#AAB7C4",
    memo: receipt.memo,
    recordType: receipt.recordType,
    itemName: receipt.itemName,
    receiptGroupId: receipt.receiptGroupId,
    receiptShopName: receipt.receiptShopName,
    receiptTotalAmountYen: receipt.receiptTotalAmountYen,
    aiExpenseDraftId: receipt.aiExpenseDraftId,
    registrationMode: receipt.registrationMode,
  };
}
