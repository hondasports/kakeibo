import {
  RECEIPT_ANALYSIS_DAILY_LIMIT_CARD_HINT,
  RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG,
} from "../receiptAnalysisJobs/dailyUsage";
import type { AiExpenseDraftStatus } from "./constants";

/**
 * 画像読み取り失敗時にユーザーに表示するヒントメッセージを返す。
 * failed ステータス以外では undefined を返す。
 */
export function getImageCaptureFailureHint(
  status: AiExpenseDraftStatus,
  warnings: string[] = [],
): string | undefined {
  if (status !== "failed") return undefined;

  const detail = warnings.join("\n");
  // 利用上限による終了は撮影品質の問題ではないので、再開時刻の案内を返す。
  if (detail.includes(RECEIPT_ANALYSIS_DAILY_LIMIT_WARNING_TAG)) {
    return RECEIPT_ANALYSIS_DAILY_LIMIT_CARD_HINT;
  }
  if (detail.includes("[receipt_extraction:timeout]")) {
    return "画像の送信がタイムアウトしました。通信状態を確認して、もう一度お試しください。";
  }
  if (detail.includes("[receipt_extraction:incomplete]")) {
    return "読み取り結果が途中で終了しました。もう一度試すか、長いレシートは明細を確認してください。";
  }
  if (
    detail.includes("[receipt_extraction:malformed_json]") ||
    detail.includes("[receipt_extraction:domain_validation]")
  ) {
    return "画像の送信は完了しましたが、読み取り結果の形式を確認できませんでした。もう一度お試しください。";
  }
  if (
    detail.includes("[receipt_extraction:network]") ||
    detail.includes("[receipt_extraction:http_error]")
  ) {
    return "画像の送信中に通信エラーが発生しました。時間をおいて、もう一度お試しください。";
  }
  return "明るい場所で、影や反射を避け、レシート全体を正面から撮影してください。";
}
