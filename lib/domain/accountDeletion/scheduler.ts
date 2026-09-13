/**
 * アカウント削除パイプラインのスケジューラ・ポート（domain interface）。
 * 内部 endpoint 名は infrastructure 層（lib/convex）が担う。
 */
export interface AccountDeletionScheduler {
  /** グループ準備バッチ（prepareAccountDeletionBatch）をスケジュールする。 */
  schedulePrepareBatch(requestId: string): Promise<void>;
  /** メイン処理（processAccountDeletion action）を delayMs 後にスケジュールする。 */
  scheduleProcess(requestId: string, delayMs?: number): Promise<void>;
  /** 完了処理（finalizeAccountDeletion）をスケジュールする。 */
  scheduleFinalize(requestId: string): Promise<void>;
  /** 失敗 purge のリセット（resetFailedAccountDeletionPurges）をスケジュールする。 */
  scheduleResetFailedPurges(requestId: string): Promise<void>;
  /** 完了済みリクエスト掃除（cleanupCompletedRequests）をスケジュールする。 */
  scheduleCleanup(): Promise<void>;
  /** グループ削除ジョブの再開（groupDeletion.resumeGroupDeletion）をスケジュールする。 */
  scheduleResumeGroupDeletion(jobId: string): Promise<void>;
}
