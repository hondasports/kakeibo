import { v } from "convex/values";

/** カテゴリ別集計（名称・色・合計・件数）の共通 validator。 */
export const categorySummaryValidator = v.object({
  categoryId: v.string(),
  categoryName: v.string(),
  categoryColor: v.string(),
  totalAmountYen: v.number(),
  count: v.number(),
});
