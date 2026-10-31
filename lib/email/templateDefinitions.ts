import * as v from "valibot";
import { type TransactionalEmailPayload, type TransactionalEmailType } from "./model";
import { GROUP_ROLES } from "../domain/groups/role";

export type TemplateMetadata = {
  type: TransactionalEmailType;
  subject: string;
  schema: v.BaseSchema<
    unknown,
    TransactionalEmailPayload[TransactionalEmailType],
    v.BaseIssue<unknown>
  >;
};

export const EMAIL_DELIVERY_TEST_TYPE: TransactionalEmailType = "email_delivery_test";

export const GROUP_MEMBERSHIP_REMOVED_TYPE: TransactionalEmailType = "group_membership_removed";
export const GROUP_ROLE_CHANGED_TYPE: TransactionalEmailType = "group_role_changed";
export const GROUP_OWNERSHIP_RECEIVED_TYPE: TransactionalEmailType = "group_ownership_received";
export const GROUP_OWNERSHIP_TRANSFERRED_TYPE: TransactionalEmailType =
  "group_ownership_transferred";
export const GROUP_DELETION_STARTED_TYPE: TransactionalEmailType = "group_deletion_started";
export const GROUP_DELETION_FAILED_TYPE: TransactionalEmailType = "group_deletion_failed";
export const GROUP_DELETED_TYPE: TransactionalEmailType = "group_deleted";
export const AI_REVIEW_REQUIRED_TYPE: TransactionalEmailType = "ai_review_required";
export const ACCOUNT_DELETION_COMPLETED_TYPE: TransactionalEmailType = "account_deletion_completed";

export const emailDeliveryTestSubject = "Suzumemo メール配信テスト";
export const groupMembershipRemovedSubject = "「{groupName}」から外れました | Suzumemo";
export const groupRoleChangedSubject = "「{groupName}」での権限が変更されました | Suzumemo";
export const groupOwnershipReceivedSubject = "「{groupName}」のオーナーになりました | Suzumemo";
export const groupOwnershipTransferredSubject =
  "「{groupName}」のオーナー権限を譲渡しました | Suzumemo";
export const groupDeletedSubject = "「{groupName}」が削除されました | Suzumemo";
export const groupDeletionStartedSubject = "「{groupName}」の削除を開始しました | Suzumemo";
export const groupDeletionFailedSubject = "「{groupName}」の削除を完了できませんでした | Suzumemo";
export const aiReviewRequiredSubject = "確認が必要なレシートが{pendingCount}件あります | Suzumemo";
export const accountDeletionCompletedSubject = "Suzumemoの退会が完了しました";

function makeSubjectTemplate(subject: string) {
  return (payload: Record<string, string | number>) =>
    subject.replace(/\{([^}]+)\}/g, (_, key) => String(payload[key] ?? ""));
}

export const emailDeliveryTestPayloadSchema = v.object({
  to: v.string(),
  groupName: v.optional(v.string()),
});

export const groupMembershipRemovedPayloadSchema = v.object({
  groupName: v.pipe(v.string(), v.trim(), v.minLength(1, "groupName is required")),
});

export const groupRoleChangedPayloadSchema = v.pipe(
  v.object({
    groupName: v.pipe(v.string(), v.trim(), v.minLength(1, "groupName is required")),
    previousRole: v.union(GROUP_ROLES.map((role) => v.literal(role))),
    newRole: v.union(GROUP_ROLES.map((role) => v.literal(role))),
  }),
  v.check(
    (input) => input.previousRole !== input.newRole,
    "previousRole and newRole must be different",
  ),
);

export const groupOwnershipReceivedPayloadSchema = v.object({
  groupName: v.pipe(v.string(), v.trim(), v.minLength(1, "groupName is required")),
});

export const groupOwnershipTransferredPayloadSchema = v.object({
  groupName: v.pipe(v.string(), v.trim(), v.minLength(1, "groupName is required")),
  newOwnerDisplayName: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "newOwnerDisplayName is required"),
  ),
});

export const groupDeletedPayloadSchema = v.object({
  groupName: v.pipe(v.string(), v.trim(), v.minLength(1, "groupName is required")),
});

export const groupDeletionStartedPayloadSchema = groupDeletedPayloadSchema;
export const groupDeletionFailedPayloadSchema = v.object({
  groupName: v.pipe(v.string(), v.trim(), v.minLength(1, "groupName is required")),
  jobId: v.pipe(v.string(), v.trim(), v.minLength(1, "jobId is required")),
});

export const aiReviewRequiredPayloadSchema = v.object({
  pendingCount: v.pipe(v.number(), v.integer(), v.minValue(1, "pendingCount must be at least 1")),
});

export const accountDeletionCompletedPayloadSchema = v.object({
  leftGroupCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  deletedGroupCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const templateDefinitions: TemplateMetadata[] = [
  {
    type: EMAIL_DELIVERY_TEST_TYPE,
    subject: emailDeliveryTestSubject,
    schema: emailDeliveryTestPayloadSchema as unknown as v.BaseSchema<
      unknown,
      TransactionalEmailPayload[typeof EMAIL_DELIVERY_TEST_TYPE],
      v.BaseIssue<unknown>
    >,
  },
  {
    type: GROUP_MEMBERSHIP_REMOVED_TYPE,
    subject: groupMembershipRemovedSubject,
    schema: groupMembershipRemovedPayloadSchema as unknown as v.BaseSchema<
      unknown,
      TransactionalEmailPayload[typeof GROUP_MEMBERSHIP_REMOVED_TYPE],
      v.BaseIssue<unknown>
    >,
  },
  {
    type: GROUP_ROLE_CHANGED_TYPE,
    subject: groupRoleChangedSubject,
    schema: groupRoleChangedPayloadSchema as unknown as v.BaseSchema<
      unknown,
      TransactionalEmailPayload[typeof GROUP_ROLE_CHANGED_TYPE],
      v.BaseIssue<unknown>
    >,
  },
  {
    type: GROUP_OWNERSHIP_RECEIVED_TYPE,
    subject: groupOwnershipReceivedSubject,
    schema: groupOwnershipReceivedPayloadSchema as unknown as v.BaseSchema<
      unknown,
      TransactionalEmailPayload[typeof GROUP_OWNERSHIP_RECEIVED_TYPE],
      v.BaseIssue<unknown>
    >,
  },
  {
    type: GROUP_OWNERSHIP_TRANSFERRED_TYPE,
    subject: groupOwnershipTransferredSubject,
    schema: groupOwnershipTransferredPayloadSchema as unknown as v.BaseSchema<
      unknown,
      TransactionalEmailPayload[typeof GROUP_OWNERSHIP_TRANSFERRED_TYPE],
      v.BaseIssue<unknown>
    >,
  },
  {
    type: GROUP_DELETION_STARTED_TYPE,
    subject: groupDeletionStartedSubject,
    schema: groupDeletionStartedPayloadSchema as unknown as v.BaseSchema<
      unknown,
      TransactionalEmailPayload[typeof GROUP_DELETION_STARTED_TYPE],
      v.BaseIssue<unknown>
    >,
  },
  {
    type: GROUP_DELETION_FAILED_TYPE,
    subject: groupDeletionFailedSubject,
    schema: groupDeletionFailedPayloadSchema as unknown as v.BaseSchema<
      unknown,
      TransactionalEmailPayload[typeof GROUP_DELETION_FAILED_TYPE],
      v.BaseIssue<unknown>
    >,
  },
  {
    type: GROUP_DELETED_TYPE,
    subject: groupDeletedSubject,
    schema: groupDeletedPayloadSchema as unknown as v.BaseSchema<
      unknown,
      TransactionalEmailPayload[typeof GROUP_DELETED_TYPE],
      v.BaseIssue<unknown>
    >,
  },
  {
    type: AI_REVIEW_REQUIRED_TYPE,
    subject: aiReviewRequiredSubject,
    schema: aiReviewRequiredPayloadSchema as unknown as v.BaseSchema<
      unknown,
      TransactionalEmailPayload[typeof AI_REVIEW_REQUIRED_TYPE],
      v.BaseIssue<unknown>
    >,
  },
  {
    type: ACCOUNT_DELETION_COMPLETED_TYPE,
    subject: accountDeletionCompletedSubject,
    schema: accountDeletionCompletedPayloadSchema as unknown as v.BaseSchema<
      unknown,
      TransactionalEmailPayload[typeof ACCOUNT_DELETION_COMPLETED_TYPE],
      v.BaseIssue<unknown>
    >,
  },
];

export const subjectRenderers: Record<
  TransactionalEmailType,
  (payload: Record<string, string | number>) => string
> = {
  [EMAIL_DELIVERY_TEST_TYPE]: makeSubjectTemplate(emailDeliveryTestSubject),
  [GROUP_MEMBERSHIP_REMOVED_TYPE]: makeSubjectTemplate(groupMembershipRemovedSubject),
  [GROUP_ROLE_CHANGED_TYPE]: makeSubjectTemplate(groupRoleChangedSubject),
  [GROUP_OWNERSHIP_RECEIVED_TYPE]: makeSubjectTemplate(groupOwnershipReceivedSubject),
  [GROUP_OWNERSHIP_TRANSFERRED_TYPE]: makeSubjectTemplate(groupOwnershipTransferredSubject),
  [GROUP_DELETION_STARTED_TYPE]: makeSubjectTemplate(groupDeletionStartedSubject),
  [GROUP_DELETION_FAILED_TYPE]: makeSubjectTemplate(groupDeletionFailedSubject),
  [GROUP_DELETED_TYPE]: makeSubjectTemplate(groupDeletedSubject),
  [AI_REVIEW_REQUIRED_TYPE]: makeSubjectTemplate(aiReviewRequiredSubject),
  [ACCOUNT_DELETION_COMPLETED_TYPE]: makeSubjectTemplate(accountDeletionCompletedSubject),
};

export const templateDefinitionsByType = new Map<TransactionalEmailType, TemplateMetadata>(
  templateDefinitions.map((def) => [def.type, def]),
);

export function validatePayloadForTemplate<T extends TransactionalEmailType>(
  type: T,
  payload: unknown,
):
  | { success: true; data: TransactionalEmailPayload[T] }
  | { success: false; issues: v.BaseIssue<unknown>[] } {
  const definition = templateDefinitionsByType.get(type);
  if (!definition) {
    return {
      success: false,
      issues: [
        { message: `Unknown template type: ${type}`, path: [{ key: "type" }] },
      ] as unknown as v.BaseIssue<unknown>[],
    };
  }
  const result = v.safeParse(definition.schema, payload);
  if (result.success) {
    return { success: true, data: result.output as TransactionalEmailPayload[T] };
  }
  return { success: false, issues: result.issues };
}

export function getTemplateSubject(type: TransactionalEmailType): string | undefined {
  return templateDefinitionsByType.get(type)?.subject;
}
