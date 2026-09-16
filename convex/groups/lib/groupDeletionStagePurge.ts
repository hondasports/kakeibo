import type { MutationCtx } from "../../_generated/server";
import type { Id, TableNames } from "../../_generated/dataModel";
import {
  createGroupDeletionMutationDeps,
  createGroupDeletionPurgeDeps,
} from "../../../lib/convex/groupDeletion/groupDeletionDeps";
import {
  nextDeletionStage,
  GROUP_DELETION_PURGE_STAGES,
} from "../../../lib/domain/groupDeletion/stages";
import { runPurgeStage } from "../../../lib/usecase/groupDeletion/runPurgeStage";
import type { GroupDeletionStage } from "./groupDeletionJobModel";
import type { PurgeStage, StageProgress } from "./groupDeletionTypes";

export async function deleteSimpleDocuments(
  ctx: MutationCtx,
  documents: Array<{ _id: Id<TableNames> }>,
  progress: StageProgress,
): Promise<void> {
  const deps = createGroupDeletionPurgeDeps(ctx);
  for (const document of documents) {
    await deps.purge.deleteDocument(document._id);
    progress.deleted += 1;
  }
}

export async function deleteStageBatch(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  stage: PurgeStage,
  progress: StageProgress,
): Promise<void> {
  await runPurgeStage(createGroupDeletionMutationDeps(ctx), stage, groupId, progress);
}

export async function hasDocumentsForStage(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  stage: PurgeStage,
): Promise<boolean> {
  return await createGroupDeletionPurgeDeps(ctx).purge.hasStageDocuments(stage, groupId);
}

export async function findRemainingStage(
  ctx: MutationCtx,
  groupId: Id<"groups">,
): Promise<PurgeStage | null> {
  const deps = createGroupDeletionPurgeDeps(ctx);
  for (const stage of GROUP_DELETION_PURGE_STAGES) {
    if (await deps.purge.hasStageDocuments(stage, groupId)) {
      return stage;
    }
  }
  return null;
}

export function nextStage(stage: GroupDeletionStage): GroupDeletionStage {
  return nextDeletionStage(stage);
}
