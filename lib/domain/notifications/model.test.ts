import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATALOG,
  defaultNotificationEnabled,
  getNotificationCatalogEntry,
  isMandatoryEmailType,
  resolveNotificationDelivery,
  supportsNotificationChannel,
} from "./model";

describe("notification catalog", () => {
  it("covers all 10 email types with ai_review_required as the only LINE type", () => {
    expect(NOTIFICATION_CATALOG).toHaveLength(10);
    expect(NOTIFICATION_CATALOG.filter((entry) => entry.lineSupported).map((e) => e.type)).toEqual([
      "ai_review_required",
    ]);
  });

  it("marks only ai_review_required and email_delivery_test as non-mandatory", () => {
    for (const entry of NOTIFICATION_CATALOG) {
      const expected = entry.type !== "ai_review_required" && entry.type !== "email_delivery_test";
      expect(entry.mandatory, entry.type).toBe(expected);
    }
  });

  it("supports email for every type and line only for ai_review_required", () => {
    for (const entry of NOTIFICATION_CATALOG) {
      expect(supportsNotificationChannel(entry.type, "email")).toBe(true);
      expect(supportsNotificationChannel(entry.type, "line")).toBe(
        entry.type === "ai_review_required",
      );
    }
  });

  it("defaults email on and line off", () => {
    expect(defaultNotificationEnabled("ai_review_required", "email")).toBe(true);
    expect(defaultNotificationEnabled("group_deleted", "email")).toBe(true);
    expect(defaultNotificationEnabled("ai_review_required", "line")).toBe(false);
  });

  it("defaults user preferences to email on / line off", () => {
    expect(DEFAULT_USER_NOTIFICATION_PREFERENCES).toEqual({
      aiReviewRequiredEmailEnabled: true,
      aiReviewRequiredLineEnabled: false,
    });
  });
});

describe("resolveNotificationDelivery", () => {
  it("rejects unsupported channel pairs", () => {
    expect(
      resolveNotificationDelivery({
        type: "group_deleted",
        channel: "line",
        globalEnabled: true,
        personalEnabled: true,
      }),
    ).toEqual({ enabled: false, reason: "unsupported_channel" });
  });

  it("global off wins over personal preference", () => {
    expect(
      resolveNotificationDelivery({
        type: "ai_review_required",
        channel: "email",
        globalEnabled: false,
        personalEnabled: true,
      }),
    ).toEqual({ enabled: false, reason: "globally_disabled" });
    expect(
      resolveNotificationDelivery({
        type: "ai_review_required",
        channel: "line",
        globalEnabled: false,
        personalEnabled: true,
      }),
    ).toEqual({ enabled: false, reason: "globally_disabled" });
  });

  it("mandatory email ignores personal opt-out values", () => {
    expect(
      resolveNotificationDelivery({
        type: "group_deleted",
        channel: "email",
        globalEnabled: true,
        personalEnabled: false,
      }),
    ).toEqual({ enabled: true });
    expect(
      resolveNotificationDelivery({
        type: "email_delivery_test",
        channel: "email",
        globalEnabled: true,
        personalEnabled: false,
      }),
    ).toEqual({ enabled: true });
  });

  it("ai_review_required email honors personal opt-out only for boolean false", () => {
    expect(
      resolveNotificationDelivery({
        type: "ai_review_required",
        channel: "email",
        globalEnabled: true,
        personalEnabled: false,
      }),
    ).toEqual({ enabled: false, reason: "user_opted_out" });
    for (const malformed of [undefined, null, "off", 0, {}]) {
      expect(
        resolveNotificationDelivery({
          type: "ai_review_required",
          channel: "email",
          globalEnabled: true,
          personalEnabled: malformed,
        }),
      ).toEqual({ enabled: true });
    }
  });

  it("line requires explicit personal opt-in", () => {
    expect(
      resolveNotificationDelivery({
        type: "ai_review_required",
        channel: "line",
        globalEnabled: true,
        personalEnabled: true,
      }),
    ).toEqual({ enabled: true });
    for (const value of [undefined, null, false, "yes", 1]) {
      expect(
        resolveNotificationDelivery({
          type: "ai_review_required",
          channel: "line",
          globalEnabled: true,
          personalEnabled: value,
        }),
      ).toEqual({ enabled: false, reason: "line_not_opted_in" });
    }
  });
});

describe("catalog helpers", () => {
  it("isMandatoryEmailType mirrors the catalog", () => {
    expect(isMandatoryEmailType("group_deleted")).toBe(true);
    expect(isMandatoryEmailType("ai_review_required")).toBe(false);
    expect(isMandatoryEmailType("email_delivery_test")).toBe(false);
  });

  it("throws for unknown catalog entry access via type", () => {
    expect(() => getNotificationCatalogEntry("unknown" as never)).toThrow();
  });
});
