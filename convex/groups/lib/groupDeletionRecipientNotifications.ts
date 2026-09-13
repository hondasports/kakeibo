import type { MutationCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { createGroupDeletionMutationDeps } from "../../../lib/convex/groupDeletion/groupDeletionDeps";
import { groupDeletionJobDocToRecord } from "../../../lib/convex/groupDeletion/convexGroupDeletionJobStore";
import { processRecipientNotificationBatch as runRecipientNotificationBatch } from "../../../lib/usecase/groupDeletion/processRecipientNotificationBatch";

export async function processRecipientNotificationBatch(
  ctx: MutationCtx,
  job: Doc<"groupDeletionJobs">,
  event: "started" | "completed",
) {
  await runRecipientNotificationBatch(
    createGroupDeletionMutationDeps(ctx),
    groupDeletionJobDocToRecord(job),
    event,
  );
}
