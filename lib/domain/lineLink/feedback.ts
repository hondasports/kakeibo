/** LINE 連携フィードバックの結果の全値。 */
export const LINE_LINK_FEEDBACK_RESULTS = ["success", "failure"] as const;

/** LINE 連携フィードバックの結果。 */
export type LineLinkFeedbackResult = (typeof LINE_LINK_FEEDBACK_RESULTS)[number];

/** LINE 連携フィードバックのコードの全値。 */
export const LINE_LINK_FEEDBACK_CODES = [
  "success",
  "expired",
  "invalid",
  "conflict",
  "failed",
] as const;

/** LINE 連携フィードバックのコード。 */
export type LineLinkFeedbackCode = (typeof LINE_LINK_FEEDBACK_CODES)[number];

export type LineLinkFeedback = {
  result: LineLinkFeedbackResult;
  code: LineLinkFeedbackCode;
};

export function getLineLinkFeedback(reason: string): LineLinkFeedback {
  switch (reason) {
    case "SUCCESS":
      return { result: "success", code: "success" };
    case "STATE_EXPIRED":
      return { result: "failure", code: "expired" };
    case "LINE_LINK_CONFLICT":
      return { result: "failure", code: "conflict" };
    case "INVALID_CALLBACK":
    case "INVALID_NONCE":
    case "INVALID_AUDIENCE":
    case "INVALID_ISSUER":
    case "INVALID_EXPIRY":
      return { result: "failure", code: "invalid" };
    default:
      return { result: "failure", code: "failed" };
  }
}
