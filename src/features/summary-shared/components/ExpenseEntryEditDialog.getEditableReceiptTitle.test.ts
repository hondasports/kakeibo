import { describe, expect, it } from "vitest";
import { getEditableReceiptTitle } from "./ExpenseEntryEditDialog";
import type { ReceiptItem } from "../types/types";

const baseReceipt: ReceiptItem = {
  _id: "receipt-1",
  date: "2026-06-21",
  type: "expense",
  shopName: "食料品",
  amountYen: 1280,
  categoryId: "cat-food",
  categoryName: "食費",
  categoryColor: "#AAB7C4",
  recordType: "expenseEntry",
};

describe("getEditableReceiptTitle", () => {
  it("expenseEntry は内訳の項目名を編集タイトルにする", () => {
    expect(
      getEditableReceiptTitle({ ...baseReceipt, itemName: "牛乳", shopName: "スーパー北浜" }),
    ).toBe("牛乳");
  });

  it("legacy receipt は itemName ではなくレシートの店名を編集タイトルにする", () => {
    expect(
      getEditableReceiptTitle({
        ...baseReceipt,
        itemName: "食料品",
        shopName: "旧店名",
        receiptShopName: "スーパー北浜",
        recordType: "receipt",
      }),
    ).toBe("スーパー北浜");
  });

  it("income は振込元の名前を編集タイトルにする", () => {
    expect(
      getEditableReceiptTitle({
        ...baseReceipt,
        type: "income",
        bankName: "給与口座",
        recordType: "expenseEntry",
      }),
    ).toBe("給与口座");
  });
});
