import { validateExpenseAmount, type ExpenseAmountError } from "../expenseEntries/expenseEntryItem";
import { isValidIsoDateString } from "../week/weekDates";
import { isPlausibleReceiptYear } from "./receiptDate";

export type ReceiptShopNameError = "empty" | "too_long";

export const RECEIPT_SHOP_NAME_MAX_LENGTH = 100;

/** レシートの店舗名・支払先を検証・正規化する。空文字 / 超過を拒否し、trim して返す。 */
export function validateReceiptShopName(
  shopName: string,
): { success: true; shopName: string } | { success: false; error: ReceiptShopNameError } {
  const trimmed = shopName.trim();
  if (trimmed === "") {
    return { success: false, error: "empty" };
  }
  if (trimmed.length > RECEIPT_SHOP_NAME_MAX_LENGTH) {
    return { success: false, error: "too_long" };
  }
  return { success: true, shopName: trimmed };
}

export type ExtractedIsoDateError = "invalid";

/** OCR 抽出された ISO 日付を検証する。空文字を許容する。 */
export function validateExtractedIsoDate(
  date: string,
): { success: true; date: string } | { success: false; error: ExtractedIsoDateError } {
  if (date === "") {
    return { success: true, date };
  }
  if (!isValidIsoDateString(date)) {
    return { success: false, error: "invalid" };
  }
  if (!isPlausibleReceiptYear(Number(date.slice(0, 4)))) {
    return { success: false, error: "invalid" };
  }
  return { success: true, date };
}

/** レシートの合計金額を検証する。 */
export function validateReceiptTotalAmount(
  amount: number,
): { success: true; amount: number } | { success: false; error: ExpenseAmountError } {
  const result = validateExpenseAmount(amount);
  if (!result.success) {
    return result;
  }
  return { success: true, amount };
}
