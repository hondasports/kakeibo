/**
 * lineImageJobs ストアのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { LineImageJobFields, LineImageJobRecord } from "./records";

export interface LineImageJobReader {
  /** webhookEventId で1件取得する。存在しなければ null。 */
  findByWebhookEventId(webhookEventId: string): Promise<LineImageJobRecord | null>;
}

export interface LineImageJobStore extends LineImageJobReader {
  /** ジョブを新規保存する。 */
  insert(fields: LineImageJobFields): Promise<void>;
  /** 既存ジョブへ部分更新する。 */
  patch(jobId: string, fields: Partial<LineImageJobFields>): Promise<void>;
  /** createdAt が cutoff 未満のジョブを最大 limit 件取得する（cleanup 用）。 */
  takeOlderThan(cutoff: number, limit: number): Promise<LineImageJobRecord[]>;
  /** ジョブを削除する。 */
  deleteById(id: string): Promise<void>;
}
