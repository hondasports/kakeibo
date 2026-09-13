import type { SendEmailInput, SendEmailResult } from "../../email/model";
import type {
  EmailSuppressionRecord,
  EmailWebhookEventRecord,
  TransactionalEmailJobRecord,
} from "./records";
import type {
  MarkJobRetryingFields,
  MarkJobSentFields,
  MarkJobTerminalFields,
  UpdateJobStatusFromWebhookFields,
  UpsertEmailSuppressionArgs,
} from "./store";

/**
 * アクションコンテキスト側のジョブ処理に必要な読み書きブリッジ。
 * Convex 実装は ctx.runQuery / ctx.runMutation 経由で internal endpoint を呼ぶ。
 */
export interface EmailJobActionRunner {
  getJob(jobId: string): Promise<TransactionalEmailJobRecord | null>;
  findSuppression(normalizedEmail: string): Promise<EmailSuppressionRecord | null>;
  markJobSent(fields: MarkJobSentFields): Promise<void>;
  markJobRetrying(fields: MarkJobRetryingFields): Promise<void>;
  markJobTerminal(fields: MarkJobTerminalFields): Promise<void>;
}

/**
 * processResendEvent（mutation）から internal endpoint へ橋渡しするブリッジ。
 * ベース実装の runQuery / runMutation 呼出順序を維持するためのポート。
 */
export interface ResendEventRunner {
  findEventBySvixId(svixId: string): Promise<EmailWebhookEventRecord | null>;
  findJobByProviderMessageId(
    providerMessageId: string,
  ): Promise<TransactionalEmailJobRecord | null>;
  findLatestEventForProviderMessageId(
    providerMessageId: string,
  ): Promise<EmailWebhookEventRecord | null>;
  updateJobStatusFromWebhook(fields: UpdateJobStatusFromWebhookFields): Promise<void>;
  upsertSuppression(args: UpsertEmailSuppressionArgs): Promise<string>;
}

/**
 * HTTP webhook ハンドラから processResendEvent mutation への送出ポート。
 */
export interface ResendEventSubmitter {
  submit(args: {
    svixId: string;
    provider: string;
    eventType: string;
    payloadJson: string;
    processedAt: number;
  }): Promise<void>;
}

/**
 * メール送信ポート。from アドレスはインフラ側（env 解決）が注入する。
 */
export interface EmailSender {
  send(input: Omit<SendEmailInput, "from">): Promise<SendEmailResult>;
}
