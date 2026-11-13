import { ConvexError } from "convex/values";
import { DRAFT_JUDGMENT_ITEM_LIMIT } from "./judgmentItemWindow";
import { getReviewItemReplaceErrorMessage } from "./reviewItemReplace";

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

export function getDraftItemWindowErrorMessage(error: unknown): string | undefined {
  if (
    error instanceof ConvexError &&
    error.data === getReviewItemReplaceErrorMessage("existing_items_exceed_window")
  ) {
    return `明細が${DRAFT_JUDGMENT_ITEM_LIMIT}件を超えるため、この下書きは保存・再解析できません。`;
  }
  return undefined;
}
