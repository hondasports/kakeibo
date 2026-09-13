import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { createGroupDeletionMutationDeps } from "../../../lib/convex/groupDeletion/groupDeletionDeps";
import { processGroupDeletionFailureNotification } from "../../../lib/usecase/groupDeletion/processGroupDeletionFailureNotification";

type EnqueueFailureEmailFn = (
  ctx: MutationCtx,
  groupName: string,
  jobId: string,
  recipientEmail: string | undefined,
  businessDedupeKey: string,
) => Promise<void>;

export async function processGroupDeletionFailureNotificationHandler(
  ctx: MutationCtx,
  args: { jobId: Id<"groupDeletionJobs"> },
  enqueueFailureEmail?: EnqueueFailureEmailFn,
) {
  const override =
    enqueueFailureEmail === undefined
      ? undefined
      : (emailArgs: {
          groupName: string;
          jobId: string;
          recipientEmail: string | undefined;
          businessDedupeKey: string;
        }) =>
          enqueueFailureEmail(
            ctx,
            emailArgs.groupName,
            emailArgs.jobId,
            emailArgs.recipientEmail,
            emailArgs.businessDedupeKey,
          );
  return await processGroupDeletionFailureNotification(
    createGroupDeletionMutationDeps(ctx),
    { jobId: args.jobId },
    override,
  );
}
