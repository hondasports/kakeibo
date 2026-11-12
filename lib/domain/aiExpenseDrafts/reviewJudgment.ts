/**
 * 金額・税内訳の解決に関係しない案内のid（店名・日付・カテゴリ・読み取り確認）。
 * これ以外の案内（税内訳、未配分、割引、明細の金額不備、カテゴリ別合計など）は
 * 金額・税内訳の理由を残す根拠にする。
 */
export function isUnrelatedToAmountTaxGuidanceId(id: string): boolean {
  return (
    id === "document" ||
    id === "shopName" ||
    id === "date" ||
    id === "category" ||
    id === "reading" ||
    id.startsWith("category-")
  );
}
