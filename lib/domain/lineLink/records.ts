/** LINE 連携リクエストの状態の全値。schema・API validator はこの並びに合わせる。 */
export const LINE_LINK_REQUEST_STATUSES = [
  "pending",
  "claimed",
  "completed",
  "failed",
  "expired",
] as const;

/** LINE 連携リクエストの状態。 */
export type LineLinkRequestStatus = (typeof LINE_LINK_REQUEST_STATUSES)[number];

/** LINE アカウント連携の状態の全値。 */
export const LINE_LINK_STATUSES = ["active", "revoked"] as const;

/** LINE アカウント連携の状態。 */
export type LineLinkStatus = (typeof LINE_LINK_STATUSES)[number];

/** LINE 連携の監査アクションの全値。 */
export const LINE_LINK_AUDIT_ACTIONS = ["started", "linked", "unlinked", "failed"] as const;

/** LINE 連携の監査アクション。 */
export type LineLinkAuditAction = (typeof LINE_LINK_AUDIT_ACTIONS)[number];

/** LINE 連携の監査結果の全値。 */
export const LINE_LINK_AUDIT_RESULTS = ["success", "failure"] as const;

/** LINE 連携の監査結果。 */
export type LineLinkAuditResult = (typeof LINE_LINK_AUDIT_RESULTS)[number];

export type LineLinkRequestFields = {
  userId: string;
  stateHash: string;
  nonceHash: string;
  codeVerifier: string;
  status: LineLinkRequestStatus;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  claimedAt?: number;
  completedAt?: number;
};

export type LineLinkRequestRecord = LineLinkRequestFields & { id: string };

export type LineAccountLinkFields = {
  userId: string;
  lineUserId: string;
  status: LineLinkStatus;
  linkedAt: number;
  createdAt: number;
  updatedAt: number;
  revokedAt?: number;
};

export type LineAccountLinkRecord = LineAccountLinkFields & { id: string };

export type LineLinkAuditFields = {
  userId: string;
  action: LineLinkAuditAction;
  result: LineLinkAuditResult;
  reasonCode?: string;
  createdAt: number;
};

export type LineLinkAuditRecord = LineLinkAuditFields & { id: string };
