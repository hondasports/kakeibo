/**
 * AI 下書きキュー操作に対するユーザー向け固定メッセージ。
 * エラーログは呼び出し側（UI/Convex アダプタ）で行う。
 */
export function getAiExpenseQueueRegistrationErrorMessage(): string {
  return "登録に失敗しました。時間をおいて再度お試しください。";
}

export function getAiExpenseQueueDeleteErrorMessage(): string {
  return "削除に失敗しました。時間をおいて再度お試しください。";
}

export function getAiExpenseQueueReviewErrorMessage(): string {
  return "保存に失敗しました。入力内容を確認して再度お試しください。";
}
