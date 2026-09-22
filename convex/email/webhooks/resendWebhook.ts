import { Resend, type WebhookEventPayload } from "resend";
import { httpAction } from "../../_generated/server";
import { isResendWebhookEventType } from "../../../lib/domain/email/rules";
import { createResendEventSubmitter } from "../../../lib/convex/email/emailEventSubmitter";

type WebhookVerifier = (
  payload: Parameters<Resend["webhooks"]["verify"]>[0],
) => WebhookEventPayload;

export function createResendWebhookHandler(
  verifier: WebhookVerifier,
): ReturnType<typeof httpAction> {
  return httpAction(async (ctx, req) => {
    const rawBody = await req.text();
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return new Response("Missing webhook secret", { status: 500 });
    }

    const id = req.headers.get("svix-id") ?? req.headers.get("webhook-id") ?? "";
    const timestamp =
      req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp") ?? "";
    const signature =
      req.headers.get("svix-signature") ?? req.headers.get("webhook-signature") ?? "";

    let event: WebhookEventPayload;
    try {
      event = verifier({ payload: rawBody, headers: { id, timestamp, signature }, webhookSecret });
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }

    const processedAt = Date.now();

    if (!isResendWebhookEventType(event.type)) {
      return new Response("ok", { status: 200 });
    }

    await createResendEventSubmitter(ctx).submit({
      svixId: id,
      provider: "resend",
      eventType: event.type,
      payloadJson: JSON.stringify(event.data),
      processedAt,
    });

    return new Response("ok", { status: 200 });
  });
}

export const resendWebhookHandler = createResendWebhookHandler((payload) =>
  new Resend("").webhooks.verify(payload),
);
