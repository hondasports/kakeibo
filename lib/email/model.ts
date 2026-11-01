export {
  TRANSACTIONAL_EMAIL_TYPES,
  TRANSACTIONAL_EMAIL_JOB_STATUSES,
  EMAIL_SUPPRESSION_REASONS,
  EMAIL_WEBHOOK_EVENT_TYPES,
} from "../domain/email/model";
export type {
  TransactionalEmailType,
  TransactionalEmailJobStatus,
  EmailSuppressionReason,
  EmailWebhookEventType,
} from "../domain/email/model";
import type { GroupRole } from "../domain/groups/role";

export type EmailDeliveryTestPayload = {
  to: string;
  groupName?: string;
};

export type GroupMembershipRemovedPayload = {
  groupName: string;
};

export type GroupRoleChangedPayload = {
  groupName: string;
  previousRole: GroupRole;
  newRole: GroupRole;
};

export type GroupOwnershipReceivedPayload = {
  groupName: string;
};

export type GroupOwnershipTransferredPayload = {
  groupName: string;
  newOwnerDisplayName: string;
};

export type GroupDeletedPayload = {
  groupName: string;
};

export type GroupDeletionStartedPayload = GroupDeletedPayload;
export type GroupDeletionFailedPayload = GroupDeletedPayload & { jobId: string };

export type AiReviewRequiredPayload = {
  pendingCount: number;
};

export type AccountDeletionCompletedPayload = {
  leftGroupCount: number;
  deletedGroupCount: number;
};

export type TransactionalEmailPayload = {
  email_delivery_test: EmailDeliveryTestPayload;
  group_membership_removed: GroupMembershipRemovedPayload;
  group_role_changed: GroupRoleChangedPayload;
  group_ownership_received: GroupOwnershipReceivedPayload;
  group_ownership_transferred: GroupOwnershipTransferredPayload;
  group_deletion_started: GroupDeletionStartedPayload;
  group_deletion_failed: GroupDeletionFailedPayload;
  group_deleted: GroupDeletedPayload;
  ai_review_required: AiReviewRequiredPayload;
  account_deletion_completed: AccountDeletionCompletedPayload;
};

export type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
};

export type SendEmailInput = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type SendEmailSuccess = {
  ok: true;
  providerMessageId: string;
};

export type SendEmailFailure = {
  ok: false;
  error: EmailProviderError;
};

export type SendEmailResult = SendEmailSuccess | SendEmailFailure;

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export type EmailProviderErrorCode =
  | "rate_limited"
  | "timeout"
  | "server_error"
  | "invalid_request"
  | "unknown"
  | "suppressed"
  | "configuration_error";

export class EmailProviderError extends Error {
  readonly code: EmailProviderErrorCode;
  readonly retryable: boolean;
  readonly provider: string;
  readonly underlyingError?: unknown;

  constructor(
    code: EmailProviderErrorCode,
    message: string,
    retryable: boolean,
    provider: string,
    underlyingError?: unknown,
  ) {
    super(message);
    this.name = "EmailProviderError";
    this.code = code;
    this.retryable = retryable;
    this.provider = provider;
    this.underlyingError = underlyingError;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
