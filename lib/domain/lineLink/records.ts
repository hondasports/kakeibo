export type LineLinkRequestStatus = "pending" | "claimed" | "completed" | "failed" | "expired";
export type LineLinkStatus = "active" | "revoked";
export type LineLinkAuditAction = "started" | "linked" | "unlinked" | "failed";

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
  result: "success" | "failure";
  reasonCode?: string;
  createdAt: number;
};

export type LineLinkAuditRecord = LineLinkAuditFields & { id: string };
