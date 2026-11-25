import { v } from "convex/values";
import { GROUP_ROLES } from "../../lib/domain/groups/role";
import { GROUP_DELETION_PREVIEW_ACCURACIES } from "../../lib/domain/groupDeletion/groupDeletionWorkflow";

export const groupRoleValidator = v.union(...GROUP_ROLES.map((value) => v.literal(value)));

export const groupMemberListItemValidator = v.object({
  userId: v.string(),
  role: groupRoleValidator,
  displayName: v.string(),
  email: v.union(v.string(), v.null()),
  isActiveGroup: v.boolean(),
  createdAt: v.number(),
});

export const groupPendingInvitationListItemValidator = v.object({
  _id: v.id("groupInvitations"),
  email: v.string(),
  status: v.literal("pending"),
  createdAt: v.number(),
});

export const groupDeletionPreviewAccuracyValidator = v.union(
  ...GROUP_DELETION_PREVIEW_ACCURACIES.map((accuracy) => v.literal(accuracy)),
);

const groupDeletionPreviewCountValidator = v.object({
  count: v.number(),
  accuracy: groupDeletionPreviewAccuracyValidator,
});

export const groupDeletionPreviewValidator = v.object({
  groupName: v.string(),
  members: groupDeletionPreviewCountValidator,
  invitations: groupDeletionPreviewCountValidator,
  sourceDocuments: groupDeletionPreviewCountValidator,
  expenseEntries: groupDeletionPreviewCountValidator,
  receipts: groupDeletionPreviewCountValidator,
  receiptImages: groupDeletionPreviewCountValidator,
  categories: groupDeletionPreviewCountValidator,
  aiDrafts: groupDeletionPreviewCountValidator,
  aiDraftItems: groupDeletionPreviewCountValidator,
  analysisBatches: groupDeletionPreviewCountValidator,
  analysisJobs: groupDeletionPreviewCountValidator,
  weekSessions: groupDeletionPreviewCountValidator,
  managementAuditLogs: groupDeletionPreviewCountValidator,
  recurringRules: groupDeletionPreviewCountValidator,
});
