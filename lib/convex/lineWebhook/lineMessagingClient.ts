/**
 * LINE Messaging API クライアント（infrastructure adapter）。
 * reply 送信とメッセージコンテンツ取得を担当する。
 */
import {
  LineImageContentTooLargeError,
  MAX_LINE_IMAGE_RAW_BYTES,
  type LineImageContent,
} from "../../domain/lineImage/content";
import { getLineIntegrationMode } from "../../../convex/lineLink/model";
import { getAppBaseUrl } from "../../email/url";
import {
  LINE_WEB_APP_PATH,
  toLineQuickReplyPayload,
  type LineQuickReplyAction,
} from "../../domain/lineSummary/quickReply";

export { LINE_UNLINKED_GUIDANCE_MESSAGE } from "../../domain/lineWebhook/reply";

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";
const LINE_CONTENT_ENDPOINT_PREFIX = "https://api-data.line.me/v2/bot/message/";
const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_REPLY_TEXT_LENGTH = 5_000;
const MAX_MESSAGE_ID_LENGTH = 256;

export const MOCK_LINE_IMAGE_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

export type LineFetch = typeof fetch;

export async function sendLineTextReply(
  replyToken: string,
  text: string,
  fetchImpl: LineFetch = fetch,
  quickReplyActions: LineQuickReplyAction[] = [],
): Promise<void> {
  if (!replyToken || replyToken.length > 2048) {
    throw new Error("LINE reply token is invalid");
  }
  if (!text || text.length > MAX_REPLY_TEXT_LENGTH) {
    throw new Error("LINE reply text is invalid");
  }

  const mode = getLineIntegrationMode();
  if (mode === "mock") return;

  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("LINE messaging integration is unavailable");

  const webUrl = `${getAppBaseUrl()}${LINE_WEB_APP_PATH}`;
  const quickReply = toLineQuickReplyPayload(quickReplyActions, webUrl);
  const message: Record<string, unknown> = { type: "text", text };
  if (quickReply !== undefined) {
    message.quickReply = quickReply;
  }

  let response: Response;
  try {
    response = await fetchImpl(LINE_REPLY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      body: JSON.stringify({
        replyToken,
        messages: [message],
      }),
    });
  } catch {
    throw new Error("LINE messaging provider is unavailable");
  }

  if (!response.ok) throw new Error("LINE messaging provider rejected the reply");
}

export async function getLineMessageContent(
  messageId: string,
  fetchImpl: LineFetch = fetch,
): Promise<LineImageContent> {
  if (!messageId || messageId.length > MAX_MESSAGE_ID_LENGTH || messageId.trim().length === 0) {
    throw new Error("LINE message id is invalid");
  }

  const mode = getLineIntegrationMode();
  if (mode === "mock") {
    return { bytes: MOCK_LINE_IMAGE_BYTES, contentType: "image/jpeg" };
  }

  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("LINE messaging integration is unavailable");

  let response: Response;
  try {
    response = await fetchImpl(
      `${LINE_CONTENT_ENDPOINT_PREFIX}${encodeURIComponent(messageId)}/content`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    );
  } catch {
    throw new Error("LINE messaging provider is unavailable");
  }

  if (!response.ok) throw new Error("LINE messaging provider rejected the content request");

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = await readLimitedBody(response, MAX_LINE_IMAGE_RAW_BYTES);
  return { bytes, contentType };
}

function parseContentLength(headers: Headers): number | null {
  const raw = headers.get("content-length");
  if (raw === null) return null;
  const length = Number(raw);
  if (!Number.isSafeInteger(length) || length < 0) return null;
  return length;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = parseContentLength(response.headers);
  if (declaredLength !== null && declaredLength > maxBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // Content-Length 超過時は本文を破棄して読取りを止める。
    }
    throw new LineImageContentTooLargeError();
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel("LINE image content too large");
        } catch {
          // 読み込み停止が既に完了している場合も上限超過として扱う。
        }
        throw new LineImageContentTooLargeError();
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
  return bytes;
}
