/**
 * groupDeletion ユースケースの依存組み立て（composition root）。
 * ctx に束縛したポート実装をまとめて返す。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import {
  createGroupDeletionJobReader,
  createGroupDeletionJobStore,
} from "./convexGroupDeletionJobStore";
import {
  createGroupDeletionPurgeReadStore,
  createGroupDeletionPurgeStore,
} from "./convexGroupPurgeStore";
import { createGroupDeletionRecipientStore } from "./convexGroupDeletionRecipientStore";
import { createGroupDeletionScheduler } from "./convexGroupDeletionScheduler";
import { createGroupRepository, createGroupReadRepository } from "../groups/convexGroupRepository";
import { createUserDirectory, createUserDirectoryRead } from "../groups/convexUserDirectory";
import { createGroupEmailNotificationQueue } from "../groups/convexGroupEmailNotifications";

/** purge のみ必要な軽量コンテキスト向け（deleteSimpleDocuments 等の shim 用）。 */
export function createGroupDeletionPurgeDeps(ctx: MutationCtx) {
  return {
    purge: createGroupDeletionPurgeStore(ctx),
    users: createUserDirectory(ctx),
  };
}

export function createGroupDeletionMutationDeps(ctx: MutationCtx) {
  return {
    jobs: createGroupDeletionJobStore(ctx),
    purge: createGroupDeletionPurgeStore(ctx),
    recipients: createGroupDeletionRecipientStore(ctx),
    scheduler: createGroupDeletionScheduler(ctx),
    groups: createGroupRepository(ctx),
    users: createUserDirectory(ctx),
    emailQueue: createGroupEmailNotificationQueue(ctx),
  };
}

/** 読み取り専用コンテキスト（query）向けの依存組み立て。 */
export function createGroupDeletionQueryDeps(ctx: Pick<QueryCtx, "db">) {
  return {
    jobs: createGroupDeletionJobReader(ctx),
    purge: createGroupDeletionPurgeReadStore(ctx),
    groups: createGroupReadRepository(ctx),
    users: createUserDirectoryRead(ctx),
  };
}
