import type { EmailSuppressionReason, EmailWebhookEventType } from "./model";

export type StatusAndSuppression = {
  statusUpdate: "sent" | "delivered" | "bounced" | "complained" | "suppressed" | "failed";
  suppressionReason?: EmailSuppressionReason;
  suppressionSource?: string;
};

export function resolveStatusAndSuppression(
  eventType: EmailWebhookEventType,
  data: {
    bounce?: { type?: string };
    complaint?: { type?: string };
    suppressed?: { type?: string };
    failed?: { reason?: string };
  },
): StatusAndSuppression | undefined {
  switch (eventType) {
    case "email.sent":
      return { statusUpdate: "sent" };
    case "email.delivered":
      return { statusUpdate: "delivered" };
    case "email.delivery_delayed":
      return undefined;
    case "email.complained":
      return {
        statusUpdate: "complained",
        suppressionReason: "complaint",
        suppressionSource: data.complaint?.type,
      };
    case "email.bounced":
      return {
        statusUpdate: "bounced",
        suppressionReason: "bounce",
        suppressionSource: data.bounce?.type,
      };
    case "email.suppressed":
      return {
        statusUpdate: "suppressed",
        suppressionReason: "provider_suppressed",
        suppressionSource: data.suppressed?.type,
      };
    case "email.failed":
      return { statusUpdate: "failed" };
    default:
      return undefined;
  }
}

const SAME_TIME_STATUS_PRIORITY = {
  sent: 0,
  delivered: 1,
  failed: 2,
  suppressed: 3,
  bounced: 4,
  complained: 5,
} as const;

export function shouldApplyWebhookStatus(
  currentStatus: string,
  nextStatus: StatusAndSuppression["statusUpdate"],
  watermark: number | undefined,
  eventCreatedAt: number,
): boolean {
  if (watermark === undefined || eventCreatedAt > watermark) return true;
  if (eventCreatedAt < watermark) return false;
  const currentPriority =
    SAME_TIME_STATUS_PRIORITY[currentStatus as keyof typeof SAME_TIME_STATUS_PRIORITY];
  return currentPriority === undefined || SAME_TIME_STATUS_PRIORITY[nextStatus] > currentPriority;
}
