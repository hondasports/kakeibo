/**
 * ユーザー設定のリポジトリポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
export interface UserSettingsRepository {
  /** ユーザーの週開始曜日（0=日〜6=土）を解決する。未設定は既定値。 */
  resolveWeeklyStartDay(userId: string): Promise<number>;
}
