import { describe, expect, it, vi } from "vitest";
import { getEmailDeliveryDecision } from "./deliveryDecision";

function makeDeps({
  setting = null,
  user = null,
  deletionRequests = [],
}: {
  setting?: { enabled: boolean } | null;
  user?: { notificationPreferences?: { aiReviewRequiredEmailEnabled?: boolean } } | null;
  deletionRequests?: { status: string }[];
} = {}) {
  return {
    settings: {
      findByTypeAndChannel: vi.fn().mockResolvedValue(setting),
      listAll: vi.fn().mockResolvedValue([]),
    },
    users: { findByUserId: vi.fn().mockResolvedValue(user) },
    accountDeletionRequests: { listByUser: vi.fn().mockResolvedValue(deletionRequests) },
  };
}

describe("getEmailDeliveryDecision", () => {
  it("allows mandatory emails by default", async () => {
    const decision = await getEmailDeliveryDecision(makeDeps(), { type: "group_deleted" });
    expect(decision).toEqual({ enabled: true });
  });

  it("denies when globally disabled, even for mandatory types", async () => {
    const decision = await getEmailDeliveryDecision(makeDeps({ setting: { enabled: false } }), {
      type: "group_deleted",
    });
    expect(decision).toEqual({ enabled: false, reason: "globally_disabled" });
  });

  it("allows ai_review_required by default for legacy jobs without userId", async () => {
    const deps = makeDeps();
    const decision = await getEmailDeliveryDecision(deps, { type: "ai_review_required" });
    expect(decision).toEqual({ enabled: true });
    expect(deps.users.findByUserId).not.toHaveBeenCalled();
  });

  it("honors personal opt-out only for ai_review_required", async () => {
    const user = { notificationPreferences: { aiReviewRequiredEmailEnabled: false } };
    const denied = await getEmailDeliveryDecision(makeDeps({ user }), {
      type: "ai_review_required",
      userId: "user-1",
    });
    expect(denied).toEqual({ enabled: false, reason: "user_opted_out" });

    const mandatory = await getEmailDeliveryDecision(makeDeps({ user }), {
      type: "group_deleted",
      userId: "user-1",
    });
    expect(mandatory).toEqual({ enabled: true });
  });

  it("does not infer identity from email for jobs without recipientUserId", async () => {
    const deps = makeDeps({
      user: { notificationPreferences: { aiReviewRequiredEmailEnabled: false } },
    });
    const decision = await getEmailDeliveryDecision(deps, { type: "ai_review_required" });
    expect(decision).toEqual({ enabled: true });
    expect(deps.users.findByUserId).not.toHaveBeenCalled();
  });

  it("denies ai_review_required when the recipient user is gone", async () => {
    const decision = await getEmailDeliveryDecision(makeDeps({ user: null }), {
      type: "ai_review_required",
      userId: "gone-user",
    });
    expect(decision).toEqual({ enabled: false, reason: "user_deleted" });
  });

  it.each(["requested", "preparing_groups", "failed", "identity_deleted"])(
    "denies ai_review_required while account deletion is active (%s)",
    async (status) => {
      const decision = await getEmailDeliveryDecision(
        makeDeps({
          user: { notificationPreferences: { aiReviewRequiredEmailEnabled: true } },
          deletionRequests: [{ status }],
        }),
        { type: "ai_review_required", userId: "user-1" },
      );
      expect(decision).toEqual({ enabled: false, reason: "user_deleting" });
    },
  );

  it("keeps globally_disabled precedence over user_deleted", async () => {
    const deps = makeDeps({ setting: { enabled: false }, user: null });
    const decision = await getEmailDeliveryDecision(deps, {
      type: "ai_review_required",
      userId: "gone-user",
    });
    expect(decision).toEqual({ enabled: false, reason: "globally_disabled" });
    expect(deps.users.findByUserId).not.toHaveBeenCalled();
  });

  it("treats a deleted user as default preference (mandatory still sends)", async () => {
    const deps = makeDeps({ user: null });
    const decision = await getEmailDeliveryDecision(deps, {
      type: "account_deletion_completed",
      userId: "gone-user",
    });
    expect(decision).toEqual({ enabled: true });
    expect(deps.users.findByUserId).not.toHaveBeenCalled();
  });
});
