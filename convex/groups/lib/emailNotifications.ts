import type { MutationCtx } from "../../_generated/server";
import { createGroupEmailNotificationQueue } from "../../../lib/convex/groups/convexGroupEmailNotifications";

export async function enqueueGroupMembershipRemovedEmail(
  ctx: MutationCtx,
  groupName: string,
  recipientEmail: string | undefined,
): Promise<void> {
  await createGroupEmailNotificationQueue(ctx).membershipRemoved({ groupName, recipientEmail });
}

export async function enqueueGroupRoleChangedEmail(
  ctx: MutationCtx,
  groupName: string,
  previousRole: "owner" | "member",
  newRole: "owner" | "member",
  recipientEmail: string | undefined,
): Promise<void> {
  await createGroupEmailNotificationQueue(ctx).roleChanged({
    groupName,
    previousRole,
    newRole,
    recipientEmail,
  });
}

export async function enqueueGroupOwnershipReceivedEmail(
  ctx: MutationCtx,
  groupName: string,
  recipientEmail: string | undefined,
): Promise<void> {
  await createGroupEmailNotificationQueue(ctx).ownershipReceived({ groupName, recipientEmail });
}

export async function enqueueGroupOwnershipTransferredEmail(
  ctx: MutationCtx,
  groupName: string,
  newOwnerDisplayName: string,
  recipientEmail: string | undefined,
): Promise<void> {
  await createGroupEmailNotificationQueue(ctx).ownershipTransferred({
    groupName,
    newOwnerDisplayName,
    recipientEmail,
  });
}

export async function enqueueGroupDeletedEmail(
  ctx: MutationCtx,
  groupName: string,
  recipientEmail: string | undefined,
  businessDedupeKey?: string,
): Promise<void> {
  await createGroupEmailNotificationQueue(ctx).groupDeleted({
    groupName,
    recipientEmail,
    businessDedupeKey,
  });
}

export async function enqueueGroupDeletionStartedEmail(
  ctx: MutationCtx,
  groupName: string,
  recipientEmail: string | undefined,
  businessDedupeKey: string,
): Promise<void> {
  await createGroupEmailNotificationQueue(ctx).deletionStarted({
    groupName,
    recipientEmail,
    businessDedupeKey,
  });
}

export async function enqueueGroupDeletionFailedEmail(
  ctx: MutationCtx,
  groupName: string,
  jobId: string,
  recipientEmail: string | undefined,
  businessDedupeKey: string,
): Promise<void> {
  await createGroupEmailNotificationQueue(ctx).deletionFailed({
    groupName,
    jobId,
    recipientEmail,
    businessDedupeKey,
  });
}
