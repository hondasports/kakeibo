/**
 * users テーブルから LINE 画像処理に必要な項目だけを読むポート（domain interface）。
 */
export interface LineWebhookUserReader {
  /** receiptImageExternalApiConsent の同意時刻。未同意またはユーザー不在なら undefined。 */
  findReceiptImageConsentAcceptedAt(userId: string): Promise<number | undefined>;
}
