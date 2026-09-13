import { httpAction } from "../_generated/server";
import {
  parseLineWebhookPayload,
  LineWebhookPayloadError,
} from "../../lib/domain/lineWebhook/payload";
import { verifyLineSignature } from "../../lib/domain/lineWebhook/signature";
import { runClaimEvents } from "../../lib/convex/lineWebhook/webhookIngress";

export const MAX_RAW_BODY_BYTES = 1_000_000;

export type LineSignatureVerifier = (
  rawBody: Uint8Array,
  signature: string,
  channelSecret: string,
) => Promise<boolean>;

async function readRawBody(req: Request): Promise<{ bytes: Uint8Array; tooLarge: boolean }> {
  if (!req.body) return { bytes: new Uint8Array(), tooLarge: false };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_RAW_BODY_BYTES) {
        try {
          await reader.cancel("LINE webhook payload too large");
        } catch {
          // 読み込み停止が既に完了している場合も413を返す。
        }
        return { bytes: new Uint8Array(), tooLarge: true };
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, tooLarge: false };
}

export function createLineWebhookHandler(
  verifySignature: LineSignatureVerifier = verifyLineSignature,
): ReturnType<typeof httpAction> {
  return httpAction(async (ctx, req) => {
    const { bytes: rawBodyBytes, tooLarge } = await readRawBody(req);
    if (tooLarge) {
      return new Response("Payload Too Large", { status: 413 });
    }
    const rawBody = new TextDecoder().decode(rawBodyBytes);
    const channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
    if (!channelSecret) return new Response("Webhook unavailable", { status: 500 });

    const signature = req.headers.get("x-line-signature");
    if (!signature) return new Response("Unauthorized", { status: 401 });

    let validSignature = false;
    try {
      validSignature = await verifySignature(rawBodyBytes, signature, channelSecret);
    } catch {
      validSignature = false;
    }
    if (!validSignature) return new Response("Unauthorized", { status: 401 });

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    let events;
    try {
      events = parseLineWebhookPayload(payload);
    } catch (error) {
      if (error instanceof LineWebhookPayloadError) {
        return new Response("Bad Request", { status: 400 });
      }
      return new Response("Bad Request", { status: 400 });
    }

    await runClaimEvents(ctx, events);

    return new Response("ok", { status: 200 });
  });
}

export const lineWebhookHandler = createLineWebhookHandler();
