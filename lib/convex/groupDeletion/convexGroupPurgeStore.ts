/**
 * GroupDeletionPurgeStore の Convex 実装。
 * ステージ名（＝テーブル名）とクエリインデックスの対応付けをここに集約する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id, TableNames } from "../../../convex/_generated/dataModel";
import type {
  GroupDeletionPurgeReadStore,
  GroupDeletionPurgeStore,
  PurgeDocument,
} from "../../domain/groupDeletion/groupPurgeStore";
import type { PurgeStage } from "../../domain/groupDeletion/stages";
import { readQueryDocs } from "../../../convex/groups/lib/groupQueryHelpers";

type GroupScopedTable = Extract<TableNames, PurgeStage>;
type GroupDoc = Doc<GroupScopedTable>;

/** バッチ purge（take）で使うインデックス名。既存 groupDeletionStagePurge の対応を維持。 */
const STAGE_INDEX: Record<PurgeStage, string> = {
  receiptAnalysisImageJobs: "by_group_id_and_status",
  aiExpenseDraftItems: "by_group_id_and_draft_id",
  aiExpenseDrafts: "by_group_id_and_created_at",
  receiptAnalysisBatches: "by_group_id_and_created_at",
  expenseEntries: "by_group_id_and_date",
  receipts: "by_group_id_and_date",
  sourceDocuments: "by_group_id_and_date",
  weekSessions: "by_group_id_and_week_start_date",
  categories: "by_group_id_and_sort_order",
  groupInvitations: "by_group_id",
  managementAuditLogs: "by_group_id_and_created_at",
  groupMembers: "by_group_id",
};

/** 全件削除（collect）で使うインデックス名。既存 deleteGroupPhysically の対応を維持。 */
const STAGE_INDEX_ALL: Record<PurgeStage, string> = {
  ...STAGE_INDEX,
  groupInvitations: "by_group_id_and_status",
};

function toPurgeDocument(doc: GroupDoc): PurgeDocument {
  const candidate = doc as GroupDoc & { imageStorageId?: string; userId?: string };
  return {
    id: doc._id,
    imageStorageId: candidate.imageStorageId,
    userId: candidate.userId,
  };
}

function createPurgeRead(ctx: Pick<QueryCtx, "db">): GroupDeletionPurgeReadStore {
  return {
    async takeStageDocuments(stage, groupId, limit) {
      const docs = await ctx.db
        .query(stage as GroupScopedTable)
        .withIndex(STAGE_INDEX[stage] as never, (q) => q.eq("groupId" as never, groupId as never))
        .take(limit);
      return docs.map(toPurgeDocument);
    },
    async listAllStageDocuments(stage, groupId) {
      const docs = await readQueryDocs(
        ctx.db
          .query(stage as GroupScopedTable)
          .withIndex(STAGE_INDEX_ALL[stage] as never, (q) =>
            q.eq("groupId" as never, groupId as never),
          ),
      );
      return docs.map(toPurgeDocument);
    },
    async hasStageDocuments(stage, groupId) {
      return (
        (
          await ctx.db
            .query(stage as GroupScopedTable)
            .withIndex(STAGE_INDEX[stage] as never, (q) =>
              q.eq("groupId" as never, groupId as never),
            )
            .take(1)
        ).length > 0
      );
    },
  };
}

export function createGroupDeletionPurgeStore(
  ctx: Pick<MutationCtx, "db" | "storage">,
): GroupDeletionPurgeStore {
  return {
    ...createPurgeRead(ctx),
    async deleteDocument(id) {
      await ctx.db.delete(id as Id<TableNames>);
    },
    async deleteGroup(groupId) {
      await ctx.db.delete(groupId as Id<"groups">);
    },
    async storageMetadataExists(storageId) {
      const metadata = await ctx.db.system.get("_storage", storageId as Id<"_storage">);
      return metadata !== null;
    },
    async deleteStorageFile(storageId) {
      await ctx.storage.delete(storageId as Id<"_storage">);
    },
  };
}

/** 読み取り専用コンテキスト（query）向けの走査ポート実装。 */
export function createGroupDeletionPurgeReadStore(
  ctx: Pick<QueryCtx, "db">,
): GroupDeletionPurgeReadStore {
  return createPurgeRead(ctx);
}
