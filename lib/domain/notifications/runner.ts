import type { NotificationDeliveryDecision } from "./model";
import type { LineNotificationJobRecord } from "./records";

export type LineNotificationClaimResult =
  | { claimed: true; job: LineNotificationJobRecord }
  | { claimed: false };

export type LineNotificationCompletion =
  | { outcome: "sent"; providerRequestId?: string }
  | { outcome: "retrying"; nextRetryAt: number; errorCode?: string }
  | { outcome: "failed"; errorCode?: string }
  | { outcome: "suppressed"; errorCode?: string };

export interface LineNotificationActionRunner {
  claimJob(args: {
    jobId: string;
    retryKeyCandidate: string;
    leaseMs: number;
    now: number;
  }): Promise<LineNotificationClaimResult>;
  authorizeSend(args: {
    jobId: string;
    attemptCount: number;
    retryKey: string;
    leaseMs: number;
    now: number;
  }): Promise<LineNotificationClaimResult>;
  completeJob(args: {
    jobId: string;
    attemptCount: number;
    completion: LineNotificationCompletion;
    now: number;
  }): Promise<void>;
}

export type LinePushSendResult =
  | { kind: "sent"; providerRequestId?: string }
  | { kind: "retryable"; errorCode: string }
  | { kind: "permanent"; errorCode: string };

export interface LinePushSender {
  send(input: { to: string; text: string; retryKey: string }): Promise<LinePushSendResult>;
}

export type { NotificationDeliveryDecision };
