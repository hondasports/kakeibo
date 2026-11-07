import type { EntryKind } from "../../../../lib/domain/common/entryKind";
import type { RecordType } from "../../../../lib/domain/common/recordKind";
import type { AiExpenseRegistrationMode } from "../../../../lib/domain/aiExpenseDrafts/receiptDataContract";

export type CategorySummary = {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  totalAmountYen: number;
  count: number;
};

export type ReceiptItem = {
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
  recordType: RecordType;
  itemName?: string;
  receiptGroupId?: string;
  receiptShopName?: string;
  receiptTotalAmountYen?: number;
  aiExpenseDraftId?: string;
  registrationMode?: AiExpenseRegistrationMode;
};

export type ReceiptGroup = {
  id: string;
  date: string;
  shopName: string;
  amountYen: number;
  items: ReceiptItem[];
};

export function groupReceiptItems(receipts: ReceiptItem[]): ReceiptGroup[] {
  const groups = new Map<string, ReceiptGroup>();

  receipts.forEach((receipt) => {
    const groupId = receipt.receiptGroupId ?? `${receipt.recordType}:${receipt._id}`;
    const existing = groups.get(groupId);
    if (existing) {
      existing.items.push(receipt);
      if (receipt.receiptTotalAmountYen !== undefined) {
        existing.amountYen = receipt.receiptTotalAmountYen;
      }
      return;
    }

    groups.set(groupId, {
      id: groupId,
      date: receipt.date,
      shopName: receipt.receiptShopName ?? receipt.shopName ?? "不明",
      amountYen: receipt.receiptTotalAmountYen ?? receipt.amountYen,
      items: [receipt],
    });
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    amountYen: group.amountYen ?? group.items.reduce((sum, item) => sum + item.amountYen, 0),
  }));
}

export type IncomeItem = {
  _id: string;
  date: string;
  type: "income";
  bankName?: string;
  amountYen: number;
  memo?: string;
  recordType: RecordType;
};

export function incomeItemToReceiptItem(income: IncomeItem): ReceiptItem {
  return {
    _id: income._id,
    date: income.date,
    type: "income",
    bankName: income.bankName,
    amountYen: income.amountYen,
    memo: income.memo,
    recordType: income.recordType,
    categoryId: "",
    categoryName: "",
    categoryColor: "#AAB7C4",
  };
}
