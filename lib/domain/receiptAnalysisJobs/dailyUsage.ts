/**
 * Web のレシート画像解析の日次利用上限（純粋ドメインルール）。
 * 有料解析の開始回数をグループ・日本時間の暦日で制限する。正本はこのファイル。
 */

/** 1グループあたり日本時間の暦日ごとに開始できる解析の上限。再試行も1回として数える。 */
export const RECEIPT_ANALYSIS_DAILY_LIMIT = 100;

/**
 * 上限で終端した失敗下書きの warnings に保存する構造化タグ。
 * 表示文言へは lib/domain/aiExpenseDrafts/failure.ts が変換し、生のタグは利用者へ出さない。
 */
export const RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG = "[receipt_analysis:daily_limit]";

/**
 * 上限到達の直後に利用者へ表示する文言。action のエラー（再試行の案内）で使う正本。
 * 日本時間の翌0時に再開できることが分かる案内にする。
 */
export const RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR = `本日の画像解析は${RECEIPT_ANALYSIS_DAILY_LIMIT}回の上限に達しました。日本時間の翌0時を過ぎてから再度お試しください`;

/**
 * 保存済みの失敗カードへ表示する文言。カードは後日開き直されることがあるため、
 * 「本日」「翌0時まで待つ」という案内は使わず、発生時点とリセット周期が分かる表現にする。
 */
export const RECEIPT_ANALYSIS_DAILY_LIMIT_CARD_HINT =
  "解析時に日次上限に達しました。上限は日本時間の毎日午前0時にリセットされます。";

/** 上限カウントの対象日が変わっていれば 0 にリセットした当日の使用回数を返す。 */
export function resolveEffectiveDailyUsageCount(
  record: { jstDate: string; count: number } | null,
  todayJstDate: string,
): number {
  if (!record || record.jstDate !== todayJstDate) return 0;
  return record.count;
}

/** 当日の使用回数が上限に達しているか。 */
export function isReceiptAnalysisDailyLimitReached(effectiveCount: number): boolean {
  return effectiveCount >= RECEIPT_ANALYSIS_DAILY_LIMIT;
}

/**
 * warnings から日次上限タグだけを取り除く。完全一致で判定するので、
 * タグを文字列の一部に含む別の警告はそのまま保持する。
 */
export function withoutDailyLimitWarningTag(warnings: string[]): string[] {
  return warnings.filter((warning) => warning !== RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG);
}

/** warnings に日次上限タグが無ければ追加する。他の警告はそのまま保持する。 */
export function withDailyLimitWarningTag(warnings: string[]): string[] {
  if (warnings.some((warning) => warning === RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG))
    return warnings;
  return [...warnings, RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG];
}
