import { v } from "convex/values";

export const lineLinkRequestStatusValidator = v.union(
  v.literal("pending"),
  v.literal("claimed"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("expired"),
);

export const lineLinkStatusValidator = v.union(v.literal("active"), v.literal("revoked"));

export const lineLinkAuditActionValidator = v.union(
  v.literal("started"),
  v.literal("linked"),
  v.literal("unlinked"),
  v.literal("failed"),
);

export const lineLinkFeedbackValidator = v.object({
  result: v.union(v.literal("success"), v.literal("failure")),
  code: v.union(
    v.literal("success"),
    v.literal("expired"),
    v.literal("invalid"),
    v.literal("conflict"),
    v.literal("failed"),
  ),
});

/** 外部連携の内部詳細をUIへ伝播させないための有限な結果コード。 */
export { getLineLinkFeedback } from "../../lib/domain/lineLink/feedback";
export type { LineLinkFeedback } from "../../lib/domain/lineLink/feedback";
export { getLineIntegrationMode } from "../../lib/convex/lineLink/lineIntegrationConfig";
