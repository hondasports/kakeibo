/**
 * トランザクショナルメールジョブ投入のポート（domain interface）。
 * テンプレート検証・ジョブ永続化は infrastructure 層（convex/email/jobs）が担う。
 */
export interface TransactionalEmailQueue {
  /** トランザクショナルメールジョブを enqueue し、採番されたジョブ ID を返す。 */
  enqueue(args: {
    templateType: string;
    payloadJson: string;
    recipientEmail: string;
    businessDedupeKey?: string;
  }): Promise<string>;
}
