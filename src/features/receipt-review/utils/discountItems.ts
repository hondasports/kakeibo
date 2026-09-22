/**
 * 割引明細に関する UI アダプタ。
 * 純粋なドメインルールは lib/domain/receipt/discountItems.ts に委ねる。
 */
import {
  isDiscountItemName as isDiscountItemNameDomain,
  isDiscountLine,
  isValidSignedLineItemAmount,
  sanitizeSignedYenInput as sanitizeSignedYenInputDomain,
} from "../../../../lib/domain/receipt/discountItems";

export { isDiscountItemNameDomain as isDiscountItemName };
export { isDiscountLine };
export { sanitizeSignedYenInputDomain as sanitizeSignedYenInput };

/** フロントエンドでの别名。 signed line item amount と同じルールを使う。 */
export function isValidReviewItemAmount(
  itemName: string,
  amountYen: number,
  lineType?: import("../../../../lib/domain/receipt/discountItems").ReceiptItemLineType,
): boolean {
  return isValidSignedLineItemAmount(itemName, amountYen, lineType);
}
