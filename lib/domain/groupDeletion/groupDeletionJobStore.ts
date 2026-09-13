/**
 * groupDeletionJobs の書き込みポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type {
  GroupDeletionJobFields,
  GroupDeletionJobRecord,
  GroupDeletionJobReader,
} from "./groupDeletionJob";

export interface GroupDeletionJobStore extends GroupDeletionJobReader {
  /** 新規ジョブを保存し、採番された ID を返す。 */
  insert(fields: GroupDeletionJobFields): Promise<string>;
  /** 既存ジョブへ部分更新する。 */
  patch(jobId: string, fields: Partial<GroupDeletionJobFields>): Promise<void>;
  /** 同じ対象グループのアクティブジョブを1件取得する。 */
  findActiveByTargetSnapshot(targetGroupIdSnapshot: string): Promise<GroupDeletionJobRecord | null>;
  /** snapshot 文字列を groups の内部 ID に解決する。解決不能なら null。 */
  resolveGroupId(targetGroupIdSnapshot: string): string | null;
}
