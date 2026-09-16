/**
 * グループ削除のスケジューラ・ポート（domain interface）。
 * バッチ処理・失敗通知の遅延スケジュールを抽象化する。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
export interface GroupDeletionScheduler {
  /** 削除バッチ処理を delayMs 後にスケジュールする。 */
  scheduleBatch(jobId: string, delayMs?: number): Promise<void>;
  /** 失敗通知処理を delayMs 後にスケジュールする。 */
  scheduleFailureNotification(jobId: string, delayMs?: number): Promise<void>;
}
