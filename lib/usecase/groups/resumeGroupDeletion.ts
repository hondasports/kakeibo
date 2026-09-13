/**
 * グループ削除ジョブ再開ユースケース（mutation）。
 * 本人が owner として開始したジョブのみ再開可能。
 */
import { ConvexError } from "convex/values";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";

export async function resumeGroupDeletion(
  ctx: Pick<UsecaseGroupContext, "userId">,
  deps: Pick<GroupMutationDeps, "deletionJobs" | "deletionWorkflow">,
  args: { jobId: string },
): Promise<null> {
  const job = await deps.deletionJobs.get(args.jobId);
  if (job === null || job.actorUserIdSnapshot !== ctx.userId || job.source !== "owner") {
    throw new ConvexError("削除ジョブが見つかりません");
  }
  return await deps.deletionWorkflow.resume({ jobId: args.jobId });
}
