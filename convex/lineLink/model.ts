import { v } from "convex/values";
import {
  LINE_LINK_AUDIT_ACTIONS,
  LINE_LINK_AUDIT_RESULTS,
  LINE_LINK_REQUEST_STATUSES,
  LINE_LINK_STATUSES,
} from "../../lib/domain/lineLink/records";
import {
  LINE_LINK_FEEDBACK_CODES,
  LINE_LINK_FEEDBACK_RESULTS,
} from "../../lib/domain/lineLink/feedback";

export const lineLinkRequestStatusValidator = v.union(
  ...LINE_LINK_REQUEST_STATUSES.map((value) => v.literal(value)),
);

export const lineLinkStatusValidator = v.union(
  ...LINE_LINK_STATUSES.map((value) => v.literal(value)),
);

export const lineLinkAuditActionValidator = v.union(
  ...LINE_LINK_AUDIT_ACTIONS.map((value) => v.literal(value)),
);

export const lineLinkAuditResultValidator = v.union(
  ...LINE_LINK_AUDIT_RESULTS.map((value) => v.literal(value)),
);

export const lineLinkFeedbackValidator = v.object({
  result: v.union(...LINE_LINK_FEEDBACK_RESULTS.map((value) => v.literal(value))),
  code: v.union(...LINE_LINK_FEEDBACK_CODES.map((value) => v.literal(value))),
});

/** 外部連携の内部詳細をUIへ伝播させないための有限な結果コード。 */
export { getLineLinkFeedback } from "../../lib/domain/lineLink/feedback";
export type { LineLinkFeedback } from "../../lib/domain/lineLink/feedback";
export { getLineIntegrationMode } from "../../lib/convex/lineLink/lineIntegrationConfig";
