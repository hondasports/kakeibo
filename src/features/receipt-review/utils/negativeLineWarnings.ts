import type { ReceiptItemLineType } from "../../../../lib/domain/receipt/discountItems";

const NEGATIVE_LINE_WARNINGS = new Set([
  "negative_amount_line_type_uncertain",
  "negative_amount_on_product_line",
]);

export function reconcileNegativeLineWarnings(
  warnings: string[] | undefined,
  lineType: ReceiptItemLineType | undefined,
  amountYen: number,
) {
  const next = (warnings ?? []).filter((warning) => !NEGATIVE_LINE_WARNINGS.has(warning));
  if (amountYen >= 0) return next;

  const warning =
    lineType === "unknown" || lineType === undefined
      ? "negative_amount_line_type_uncertain"
      : lineType === "item"
        ? "negative_amount_on_product_line"
        : undefined;
  return warning ? [...next, warning] : next;
}
