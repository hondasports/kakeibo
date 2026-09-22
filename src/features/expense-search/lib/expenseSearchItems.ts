import type { ExpenseSearchReceipt } from "../../../../lib/convex/expenseSearch/searchExpenses";
import type { IncomeItem, ReceiptItem } from "../../summary-shared/types/types";

export function mergeSearchPage(current: ExpenseSearchReceipt[], next: ExpenseSearchReceipt[]) {
  const itemKey = (item: ExpenseSearchReceipt) => `${item.recordType}:${item._id}`;
  const items = new Map(current.map((item) => [itemKey(item), item]));
  next.forEach((item) => items.set(itemKey(item), item));
  return Array.from(items.values());
}

export function toReceiptItem(item: ExpenseSearchReceipt): ReceiptItem {
  return {
    _id: item._id,
    date: item.date,
    type: "expense",
    shopName: item.shopName,
    amountYen: item.amountYen,
    categoryId: item.categoryId ?? "",
    categoryName: item.categoryName ?? "不明",
    categoryColor: item.categoryColor ?? "#AAB7C4",
    memo: item.memo,
    recordType: item.recordType,
    itemName: item.itemName,
    receiptGroupId: item.receiptGroupId,
    receiptShopName: item.receiptShopName,
    receiptTotalAmountYen: item.receiptTotalAmountYen,
  };
}

export function toIncomeItem(item: ExpenseSearchReceipt): IncomeItem {
  return {
    _id: item._id,
    date: item.date,
    type: "income",
    bankName: item.bankName,
    amountYen: item.amountYen,
    memo: item.memo,
    recordType: item.recordType,
  };
}
