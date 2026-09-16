export type LineLinkFeedback = {
  result: "success" | "failure";
  code: "success" | "expired" | "invalid" | "conflict" | "failed";
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
