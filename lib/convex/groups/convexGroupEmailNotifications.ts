/**
 * GroupEmailNotificationQueue の Convex 実装。
 * 実際の enqueue は email ドメインの jobs エンドポイントへ委譲する。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { GroupEmailNotificationQueue } from "../../domain/groups/groupServices";
import { enqueueTransactionalEmailJobHandler } from "../../../convex/email/jobs";

export function createGroupEmailNotificationQueue(ctx: MutationCtx): GroupEmailNotificationQueue {
  return {
    async membershipRemoved({ groupName, recipientEmail }) {
      if (!recipientEmail) return;
      await enqueueTransactionalEmailJobHandler(ctx, {
        templateType: "group_membership_removed",
        payloadJson: JSON.stringify({ groupName }),
        recipientEmail,
      });
    },
    async roleChanged({ groupName, previousRole, newRole, recipientEmail }) {
      if (!recipientEmail) return;
      await enqueueTransactionalEmailJobHandler(ctx, {
        templateType: "group_role_changed",
        payloadJson: JSON.stringify({ groupName, previousRole, newRole }),
        recipientEmail,
      });
    },
    async ownershipReceived({ groupName, recipientEmail }) {
      if (!recipientEmail) return;
      await enqueueTransactionalEmailJobHandler(ctx, {
        templateType: "group_ownership_received",
        payloadJson: JSON.stringify({ groupName }),
        recipientEmail,
      });
    },
    async ownershipTransferred({ groupName, newOwnerDisplayName, recipientEmail }) {
      if (!recipientEmail) return;
      await enqueueTransactionalEmailJobHandler(ctx, {
        templateType: "group_ownership_transferred",
        payloadJson: JSON.stringify({ groupName, newOwnerDisplayName }),
        recipientEmail,
      });
    },
    async groupDeleted({ groupName, recipientEmail, businessDedupeKey }) {
      if (!recipientEmail) return;
      await enqueueTransactionalEmailJobHandler(ctx, {
        templateType: "group_deleted",
        payloadJson: JSON.stringify({ groupName }),
        recipientEmail,
        businessDedupeKey,
      });
    },
    async deletionStarted({ groupName, recipientEmail, businessDedupeKey }) {
      if (!recipientEmail) return;
      await enqueueTransactionalEmailJobHandler(ctx, {
        templateType: "group_deletion_started",
        payloadJson: JSON.stringify({ groupName }),
        recipientEmail,
        businessDedupeKey,
      });
    },
    async deletionFailed({ groupName, jobId, recipientEmail, businessDedupeKey }) {
      if (!recipientEmail) return;
      await enqueueTransactionalEmailJobHandler(ctx, {
        templateType: "group_deletion_failed",
        payloadJson: JSON.stringify({ groupName, jobId }),
        recipientEmail,
        businessDedupeKey,
      });
    },
  };
}
