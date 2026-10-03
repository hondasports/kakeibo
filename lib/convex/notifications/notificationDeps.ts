import type { ActionCtx, MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import { createAccountDeletionRequestReader } from "../accountDeletion/convexAccountDeletionRequestStore";
import { createEmailJobStore } from "../email/convexEmailJobStore";
import { createEmailScheduler } from "../email/convexEmailScheduler";
import { createGroupReadRepository } from "../groups/convexGroupRepository";
import { createGroupMembershipReadRepository } from "../groups/convexGroupMembershipRepository";
import { createUserDirectoryRead } from "../groups/convexUserDirectory";
import { createLineAccountLinkReader } from "../lineLink/convexLineAccountLinkStore";
import {
  createReceiptAnalysisReader,
  createReceiptAnalysisStore,
} from "../receiptAnalysisJobs/convexReceiptAnalysisStore";
import { createSystemAdminReadStore } from "../systemAdmin/convexSystemAdminStore";
import { createSystemAdminAuditLogStore } from "../systemAdmin/convexSystemAdminAuditLogStore";
import { createUserReader, createUserStore } from "../users/convexUserStore";
import { createLineNotificationEventStore } from "./convexLineNotificationEventStore";
import { createLineNotificationJobStore } from "./convexLineNotificationJobStore";
import { createLineNotificationActionRunner } from "./convexNotificationRunner";
import { createLineNotificationScheduler } from "./convexNotificationScheduler";
import {
  createNotificationSettingReader,
  createNotificationSettingStore,
} from "./convexNotificationSettingStore";
import { createLinePushSender } from "./linePushSender";
import type {
  AiReviewNotificationEnqueueDeps,
  CleanupLineNotificationDeps,
  LineNotificationClaimDeps,
  LineNotificationCompletionDeps,
  NotificationAdminMutationDeps,
  NotificationAdminQueryDeps,
  NotificationUserMutationDeps,
  NotificationUserQueryDeps,
  ProcessLineNotificationJobDeps,
  StaleLineNotificationRecoveryDeps,
} from "../../usecase/notifications/deps";
import type { EmailDeliveryDecisionDeps } from "../../usecase/notifications/deliveryDecision";

export function createNotificationUserQueryDeps(
  ctx: Pick<QueryCtx, "db">,
): NotificationUserQueryDeps {
  return {
    settings: createNotificationSettingReader(ctx),
    users: createUserReader(ctx),
    links: createLineAccountLinkReader(ctx),
    accountDeletionRequests: createAccountDeletionRequestReader(ctx),
  };
}

export function createNotificationUserMutationDeps(
  ctx: Pick<MutationCtx, "db">,
): NotificationUserMutationDeps {
  return {
    users: createUserStore(ctx),
    links: createLineAccountLinkReader(ctx),
    accountDeletionRequests: createAccountDeletionRequestReader(ctx),
  };
}

export function createNotificationAdminQueryDeps(
  ctx: Pick<QueryCtx, "db">,
): NotificationAdminQueryDeps {
  return {
    admins: createSystemAdminReadStore(ctx),
    users: createUserDirectoryRead(ctx),
    settings: createNotificationSettingReader(ctx),
  };
}

export function createNotificationAdminMutationDeps(
  ctx: Pick<MutationCtx, "db">,
): NotificationAdminMutationDeps {
  return {
    admins: createSystemAdminReadStore(ctx),
    users: createUserDirectoryRead(ctx),
    settings: createNotificationSettingStore(ctx),
    auditLogs: createSystemAdminAuditLogStore(ctx),
  };
}

export function createEmailDeliveryDecisionDeps(
  ctx: Pick<QueryCtx, "db">,
): EmailDeliveryDecisionDeps {
  return {
    settings: createNotificationSettingReader(ctx),
    users: createUserReader(ctx),
    accountDeletionRequests: createAccountDeletionRequestReader(ctx),
  };
}

export function createAiReviewEnqueueDeps(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
): AiReviewNotificationEnqueueDeps {
  return {
    batches: createReceiptAnalysisStore(ctx),
    groups: createGroupReadRepository(ctx),
    memberships: createGroupMembershipReadRepository(ctx),
    users: createUserReader(ctx),
    accountDeletionRequests: createAccountDeletionRequestReader(ctx),
    settings: createNotificationSettingStore(ctx),
    links: createLineAccountLinkReader(ctx),
    emailJobs: createEmailJobStore(ctx),
    emailScheduler: createEmailScheduler(ctx),
    lineJobs: createLineNotificationJobStore(ctx),
    lineEvents: createLineNotificationEventStore(ctx),
    lineScheduler: createLineNotificationScheduler(ctx),
  };
}

export function createLineNotificationClaimDeps(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
): LineNotificationClaimDeps {
  return {
    jobs: createLineNotificationJobStore(ctx),
    settings: createNotificationSettingStore(ctx),
    users: createUserReader(ctx),
    links: createLineAccountLinkReader(ctx),
    batches: createReceiptAnalysisReader(ctx),
    groups: createGroupReadRepository(ctx),
    memberships: createGroupMembershipReadRepository(ctx),
    accountDeletionRequests: createAccountDeletionRequestReader(ctx),
    scheduler: createLineNotificationScheduler(ctx),
  };
}

export function createLineNotificationCompletionDeps(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
): LineNotificationCompletionDeps {
  return {
    jobs: createLineNotificationJobStore(ctx),
    scheduler: createLineNotificationScheduler(ctx),
  };
}

export function createProcessLineNotificationJobDeps(
  ctx: Pick<ActionCtx, "runMutation">,
): ProcessLineNotificationJobDeps {
  return {
    runner: createLineNotificationActionRunner(ctx),
    sender: createLinePushSender(),
  };
}

export function createStaleLineNotificationRecoveryDeps(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
): StaleLineNotificationRecoveryDeps {
  return {
    jobs: createLineNotificationJobStore(ctx),
    scheduler: createLineNotificationScheduler(ctx),
  };
}

export function createCleanupLineNotificationDeps(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
): CleanupLineNotificationDeps {
  return {
    jobs: createLineNotificationJobStore(ctx),
    lineEvents: createLineNotificationEventStore(ctx),
    scheduler: createLineNotificationScheduler(ctx),
  };
}
