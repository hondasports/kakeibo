/**
 * lineWebhookEvents ストアのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { LineWebhookEventFields, LineWebhookEventRecord } from "./records";

export interface LineWebhookEventReader {
  /** webhookEventId で1件取得する。重複検知用。存在しなければ null。 */
  findByWebhookEventId(webhookEventId: string): Promise<LineWebhookEventRecord | null>;
}

export interface LineWebhookEventStore extends LineWebhookEventReader {
  /** イベントを新規保存する。 */
  insert(fields: LineWebhookEventFields): Promise<void>;
  /** createdAt が cutoff 未満のイベントを最大 limit 件取得する（cleanup 用）。 */
  takeOlderThan(cutoff: number, limit: number): Promise<LineWebhookEventRecord[]>;
  /** イベントを削除する。 */
  deleteById(id: string): Promise<void>;
}
