/**
 * LINE webhook payload の解析ルール（純粋関数）。
 * Convex validator は convex/lineWebhook/model.ts が保持する。
 */

export type LineWebhookEventType = "text" | "image" | "postback" | "follow" | "unfollow";

export type LineWebhookEventInput = {
  webhookEventId: string;
  eventType: LineWebhookEventType;
  lineUserId: string;
  replyToken?: string;
  messageId?: string;
  messageText?: string;
  postbackData?: string;
  eventTimestamp?: number;
};

export const MAX_EVENTS_PER_REQUEST = 20;
const MAX_EVENT_ID_LENGTH = 256;
const MAX_LINE_USER_ID_LENGTH = 256;
const MAX_REPLY_TOKEN_LENGTH = 2048;
const MAX_MESSAGE_ID_LENGTH = 256;
const MAX_MESSAGE_TEXT_LENGTH = 10_000;
const MAX_POSTBACK_DATA_LENGTH = 10_000;

export class LineWebhookPayloadError extends Error {
  constructor() {
    super("Invalid LINE webhook payload");
    this.name = "LineWebhookPayloadError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, maxLength: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    value.trim().length === 0
  ) {
    throw new LineWebhookPayloadError();
  }
  return value;
}

function readOptionalString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  return readRequiredString(value, maxLength);
}

function readOptionalTimestamp(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new LineWebhookPayloadError();
  }
  return value;
}

function readSourceUserId(event: Record<string, unknown>): string | null {
  const source = event.source;
  if (!isRecord(source)) throw new LineWebhookPayloadError();
  const sourceType = readRequiredString(source.type, 16);
  if (sourceType !== "user" && sourceType !== "group" && sourceType !== "room") {
    throw new LineWebhookPayloadError();
  }
  // kakeiboのLINE連携は1:1のuser sourceだけを対象にする。
  // group/roomはuserIdが省略される正当なpayloadがあるため、payload全体を400にせず無視する。
  if (sourceType !== "user") return null;
  return readRequiredString(source.userId, MAX_LINE_USER_ID_LENGTH);
}

function readReplyToken(event: Record<string, unknown>): string | undefined {
  return readOptionalString(event.replyToken, MAX_REPLY_TOKEN_LENGTH);
}

function parseEvent(event: unknown): LineWebhookEventInput | null {
  if (!isRecord(event)) throw new LineWebhookPayloadError();

  const webhookEventId = readRequiredString(event.webhookEventId, MAX_EVENT_ID_LENGTH);
  const eventType = readRequiredString(event.type, 64);
  const eventTimestamp = readOptionalTimestamp(event.timestamp);

  if (eventType === "message") {
    const lineUserId = readSourceUserId(event);
    if (lineUserId === null) return null;
    if (!isRecord(event.message)) throw new LineWebhookPayloadError();
    const messageType = readRequiredString(event.message.type, 32);
    const messageId = readRequiredString(event.message.id, MAX_MESSAGE_ID_LENGTH);
    const replyToken = readReplyToken(event);

    if (messageType === "text") {
      const messageText = readRequiredString(event.message.text, MAX_MESSAGE_TEXT_LENGTH);
      return {
        webhookEventId,
        eventType: "text",
        lineUserId,
        ...(replyToken === undefined ? {} : { replyToken }),
        messageId,
        messageText,
        ...(eventTimestamp === undefined ? {} : { eventTimestamp }),
      };
    }

    if (messageType === "image") {
      return {
        webhookEventId,
        eventType: "image",
        lineUserId,
        ...(replyToken === undefined ? {} : { replyToken }),
        messageId,
        ...(eventTimestamp === undefined ? {} : { eventTimestamp }),
      };
    }

    // video/audio/file/locationなど、今回のスコープ外のmessageは安全に無視する。
    return null;
  }

  if (eventType === "postback") {
    const lineUserId = readSourceUserId(event);
    if (lineUserId === null) return null;
    if (!isRecord(event.postback)) throw new LineWebhookPayloadError();
    const replyToken = readReplyToken(event);
    const postbackData = readRequiredString(event.postback.data, MAX_POSTBACK_DATA_LENGTH);
    return {
      webhookEventId,
      eventType: "postback",
      lineUserId,
      ...(replyToken === undefined ? {} : { replyToken }),
      postbackData,
      ...(eventTimestamp === undefined ? {} : { eventTimestamp }),
    };
  }

  if (eventType === "follow" || eventType === "unfollow") {
    const lineUserId = readSourceUserId(event);
    if (lineUserId === null) return null;
    const replyToken = readReplyToken(event);
    return {
      webhookEventId,
      eventType,
      lineUserId,
      ...(replyToken === undefined ? {} : { replyToken }),
      ...(eventTimestamp === undefined ? {} : { eventTimestamp }),
    };
  }

  // join/leave/unsendなど、後続Issueの対象外イベントはackだけして無視する。
  return null;
}

export function parseLineWebhookPayload(payload: unknown): LineWebhookEventInput[] {
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    throw new LineWebhookPayloadError();
  }
  if (payload.events.length > MAX_EVENTS_PER_REQUEST) {
    throw new LineWebhookPayloadError();
  }
  return payload.events.flatMap((event) => {
    const parsed = parseEvent(event);
    return parsed ? [parsed] : [];
  });
}
