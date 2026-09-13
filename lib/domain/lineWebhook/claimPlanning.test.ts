import { describe, expect, it } from "vitest";
import {
  buildLinkedWebhookEventFields,
  buildPendingImageJobFields,
  buildUnlinkedWebhookEventFields,
  resolveUniqueActiveUserId,
} from "./claimPlanning";

describe("resolveUniqueActiveUserId", () => {
  it("activeリンクが1件ならそのuserIdを返す", () => {
    expect(resolveUniqueActiveUserId([{ userId: "u1" }])).toBe("u1");
  });

  it("0件または2件以上ならundefinedを返す", () => {
    expect(resolveUniqueActiveUserId([])).toBeUndefined();
    expect(resolveUniqueActiveUserId([{ userId: "u1" }, { userId: "u2" }])).toBeUndefined();
  });

  it("同一userIdの重複リンクは一意とみなす", () => {
    expect(resolveUniqueActiveUserId([{ userId: "u1" }, { userId: "u1" }])).toBe("u1");
  });
});

describe("buildLinkedWebhookEventFields", () => {
  it("任意項目は存在する場合だけ含める", () => {
    const fields = buildLinkedWebhookEventFields(
      {
        webhookEventId: "ev1",
        eventType: "text",
        lineUserId: "lu1",
        replyToken: "rt",
        messageId: "m1",
        messageText: "こんにちは",
        eventTimestamp: 123,
      },
      "u1",
      999,
    );
    expect(fields).toEqual({
      webhookEventId: "ev1",
      eventType: "text",
      delivery: "linked",
      userId: "u1",
      messageId: "m1",
      messageText: "こんにちは",
      eventTimestamp: 123,
      createdAt: 999,
    });
  });

  it("replyTokenは永続化しない", () => {
    const fields = buildLinkedWebhookEventFields(
      { webhookEventId: "ev1", eventType: "follow", lineUserId: "lu1", replyToken: "rt" },
      "u1",
      1,
    );
    expect("replyToken" in fields).toBe(false);
    expect("lineUserId" in fields).toBe(false);
  });
});

describe("buildUnlinkedWebhookEventFields", () => {
  it("userId・message系項目を持たないunlinkedレコードを返す", () => {
    const fields = buildUnlinkedWebhookEventFields(
      {
        webhookEventId: "ev1",
        eventType: "text",
        lineUserId: "lu1",
        messageId: "m1",
        messageText: "t",
      },
      42,
    );
    expect(fields).toEqual({
      webhookEventId: "ev1",
      eventType: "text",
      delivery: "unlinked",
      createdAt: 42,
    });
  });
});

describe("buildPendingImageJobFields", () => {
  it("pendingジョブ項目を組み立てる", () => {
    expect(buildPendingImageJobFields("ev1", "u1", "m1", 7)).toEqual({
      webhookEventId: "ev1",
      userId: "u1",
      messageId: "m1",
      status: "pending",
      createdAt: 7,
      updatedAt: 7,
    });
  });
});
