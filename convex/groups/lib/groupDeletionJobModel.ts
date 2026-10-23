import {
  GROUP_DELETION_JOB_SOURCES,
  GROUP_DELETION_JOB_STATUSES,
} from "../../../lib/domain/groupDeletion/groupDeletionJob";
import { GROUP_DELETION_JOB_STAGES } from "../../../lib/domain/groupDeletion/stages";
import { v } from "convex/values";

export const groupDeletionSourceValidator = v.union(
  ...GROUP_DELETION_JOB_SOURCES.map((value) => v.literal(value)),
);

export const groupDeletionStatusValidator = v.union(
  ...GROUP_DELETION_JOB_STATUSES.map((value) => v.literal(value)),
);

export const groupDeletionStageValidator = v.union(
  ...GROUP_DELETION_JOB_STAGES.map((value) => v.literal(value)),
);

export const groupDeletionCountsValidator = v.object({
  receiptAnalysisImageJobs: v.number(),
  aiExpenseDraftItems: v.number(),
  aiExpenseDrafts: v.number(),
  receiptAnalysisBatches: v.number(),
  expenseEntries: v.number(),
  receipts: v.number(),
  sourceDocuments: v.number(),
  storageFiles: v.number(),
  weekSessions: v.number(),
  categories: v.number(),
  groupInvitations: v.number(),
  managementAuditLogs: v.number(),
  groupMembers: v.number(),
  groups: v.number(),
});

export type { GroupDeletionJobStatus as GroupDeletionStatus } from "../../../lib/domain/groupDeletion/groupDeletionJob";
export type { GroupDeletionJobStage as GroupDeletionStage } from "../../../lib/domain/groupDeletion/groupDeletionJob";
