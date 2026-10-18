import { describe, expect, it } from "vitest";
import { LineWebhookPayloadError, MAX_EVENTS_PER_REQUEST, parseLineWebhookPayload } from "./model";

const source = { type: "user", userId: "line-user-private" };

describe("parseLineWebhookPayload", () => {
  it("メッセージIDは256文字まで許可し、空文字・空白・257文字を拒否する", () => {
    const payload = (messageId: string) => ({
      events: [
        {
          type: "message",
          webhookEventId: "event-image",
          source,
          message: { type: "image", id: messageId },
        },
      ],
    });
    expect(parseLineWebhookPayload(payload("a".repeat(256)))[0]?.messageId).toBe("a".repeat(256));
    for (const messageId of ["", " ", "a".repeat(257)]) {
      expect(() => parseLineWebhookPayload(payload(messageId))).toThrow(LineWebhookPayloadError);
    }
  });

  it("text/image/postback/follow/unfollowをallowlist済みイベントへ正規化する", () => {
    expect(
      parseLineWebhookPayload({
        events: [
          {
            type: "message",
            webhookEventId: "event-text",
            timestamp: 1_700_000_000_000,
            source,
            replyToken: "reply-text",
            message: { type: "text", id: "message-text", text: "今週の支出" },
          },
          {
            type: "message",
            webhookEventId: "event-image",
            source,
            message: { type: "image", id: "message-image" },
          },
          {
            type: "postback",
            webhookEventId: "event-postback",
            source,
            postback: { data: "action=summary" },
          },
          { type: "follow", webhookEventId: "event-follow", source },
          { type: "unfollow", webhookEventId: "event-unfollow", source },
        ],
      }),
    ).toEqual([
      {
        webhookEventId: "event-text",
        eventType: "text",
        lineUserId: "line-user-private",
        replyToken: "reply-text",
        messageId: "message-text",
        messageText: "今週の支出",
        eventTimestamp: 1_700_000_000_000,
      },
      {
        webhookEventId: "event-image",
        eventType: "image",
        lineUserId: "line-user-private",
        messageId: "message-image",
      },
      {
        webhookEventId: "event-postback",
        eventType: "postback",
        lineUserId: "line-user-private",
        postbackData: "action=summary",
      },
      {
        webhookEventId: "event-follow",
        eventType: "follow",
        lineUserId: "line-user-private",
      },
      {
        webhookEventId: "event-unfollow",
        eventType: "unfollow",
        lineUserId: "line-user-private",
      },
    ]);
  });

  it("スコープ外イベントはack対象から除外する", () => {
    expect(
      parseLineWebhookPayload({
        events: [
          {
            type: "message",
            webhookEventId: "event-video",
            source,
            message: { type: "video", id: "message-video" },
          },
          { type: "join", webhookEventId: "event-join" },
        ],
      }),
    ).toEqual([]);
  });

  it("group/room sourceは1:1連携の対象外としてpayload全体を拒否せず無視する", () => {
    expect(
      parseLineWebhookPayload({
        events: [
          { type: "follow", webhookEventId: "event-group", source: { type: "group" } },
          {
            type: "message",
            webhookEventId: "event-room",
            source: { type: "room" },
            message: { type: "text", id: "message-room", text: "対象外" },
          },
          { type: "follow", webhookEventId: "event-user", source },
        ],
      }),
    ).toEqual([
      {
        webhookEventId: "event-user",
        eventType: "follow",
        lineUserId: "line-user-private",
      },
    ]);
  });

  it.each([
    ["eventsがない", {}],
    ["event idがない", { events: [{ type: "follow", source }] }],
    [
      "source typeが不正",
      {
        events: [
          { type: "follow", webhookEventId: "id", source: { type: "bot", userId: "line-user" } },
        ],
      },
    ],
    [
      "text messageのtextがない",
      {
        events: [
          {
            type: "message",
            webhookEventId: "id",
            source,
            message: { type: "text", id: "message" },
          },
        ],
      },
    ],
    [
      "postback dataがない",
      { events: [{ type: "postback", webhookEventId: "id", source, postback: {} }] },
    ],
    [
      "event数が多すぎる",
      {
        events: Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, (_, index) => ({
          type: "follow",
          webhookEventId: `event-${index}`,
          source,
        })),
      },
    ],
  ])("不正payloadを拒否する: %s", (_label, payload) => {
    expect(() => parseLineWebhookPayload(payload)).toThrow(LineWebhookPayloadError);
  });
});
