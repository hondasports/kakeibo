/**
 * レシート・AI 下書きの割引明細に関するドメインルール。
 * UI / Convex の両方から利用できる純粋関数のみを含む。
 */

const DISCOUNT_ITEM_PATTERN = /(割引|値引|クーポン|割戻|割り戻|ポイント利用|ポイント充当)/;

export const RECEIPT_ITEM_LINE_TYPES = [
  "item",
  "discount",
  "promotion_adjustment",
  "unknown",
] as const;

export type ReceiptItemLineType = (typeof RECEIPT_ITEM_LINE_TYPES)[number];

function isAdjustmentLineType(lineType: ReceiptItemLineType | undefined): boolean {
  return lineType === "discount" || lineType === "promotion_adjustment";
}

/** 明細名が割引・値引・クーポン・ポイント利用等かどうかを判定する。 */
export function isDiscountItemName(itemName: string): boolean {
  return DISCOUNT_ITEM_PATTERN.test(itemName.trim());
}

/** 明示された行種別を優先し、旧データだけ品名から割引行を推定する。 */
export function isDiscountLine(itemName: string, lineType?: ReceiptItemLineType): boolean {
  return isAdjustmentLineType(lineType) || (lineType === undefined && isDiscountItemName(itemName));
}

/**
 * 符号付き明細金額が有効かどうかを判定する。
 * 通常明細は正の整数のみ、割引明細は負の整数も許容する。0 と非整数は不可。
 */
export function isValidSignedLineItemAmount(
  itemName: string,
  amountYen: number,
  lineType?: ReceiptItemLineType,
): boolean {
  if (!Number.isInteger(amountYen) || amountYen === 0) {
    return false;
  }
  return amountYen > 0 || isDiscountLine(itemName, lineType);
}

/**
 * ユーザー入力された金額文字列を正規化する。
 * 割引明細で先頭が "-" の場合は負数を維持し、それ以外は数字のみを残す。
 */
export function sanitizeSignedYenInput(
  itemName: string,
  value: string,
  lineType?: ReceiptItemLineType,
): string {
  const digits = value.replace(/[^\d]/g, "");
  const acceptsNegativeInput = lineType === "unknown" || isDiscountLine(itemName, lineType);
  if (!digits) {
    return value.trim() === "-" && acceptsNegativeInput ? "-" : "";
  }
  return value.trimStart().startsWith("-") && acceptsNegativeInput ? `-${digits}` : digits;
}
