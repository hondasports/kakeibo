import type { ExpenseEntryPrefill } from "../../expense-entry/types/prefill";
import type { ReceiptItem } from "../types/types";

/** 一覧の支出1件を、入力フォームの初期値へ変換する。日付は引き継がない。 */
export function receiptItemToEntryPrefill(receipt: ReceiptItem): ExpenseEntryPrefill {
  return {
    // 明細行は明細名、単独行は店名をコピーする
    title: receipt.itemName ?? receipt.shopName ?? receipt.receiptShopName ?? "",
    amountYen: receipt.amountYen,
    categoryId: receipt.categoryId,
    memo: receipt.memo,
  };
}
