// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const identity = (userId: string) => ({
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
  email: `${userId}@example.test`,
});

function seedUser(
  t: ReturnType<typeof convexTest>,
  userId: string,
  extra: Record<string, unknown> = {},
) {
  return t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      userId,
      displayName: `ユーザー${userId}`,
      email: `${userId}@example.test`,
      createdAt: 1,
      updatedAt: 1,
      ...extra,
    });
  });
}

function seedSystemAdmin(t: ReturnType<typeof convexTest>, userDocId: Id<"users">) {
  return t.run(async (ctx) => {
    await ctx.db.insert("systemAdmins", {
      userId: userDocId,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
      grantedAt: 1,
      grantReason: "test",
    });
  });
}

describe("my notification settings", () => {
  it("rejects unauthenticated callers", async () => {
    const t = convexTest(schema, convexTestModules);
    await expect(t.query(api.notifications.queries.getMyNotificationSettings, {})).rejects.toThrow(
      "Not authenticated",
    );
    await expect(
      t.mutation(api.notifications.mutations.updateMyNotificationPreference, {
        type: "ai_review_required",
        channel: "email",
        enabled: false,
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("returns defaults for an existing user and exposes no admin metadata", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedUser(t, "user-1");
    const result = await t
      .withIdentity(identity("user-1"))
      .query(api.notifications.queries.getMyNotificationSettings, {});
    expect(result).toEqual({
      emailEnabled: true,
      lineEnabled: false,
      lineLinked: false,
      emailGloballyEnabled: true,
      lineGloballyEnabled: false,
    });
    expect("updatedByUserId" in result).toBe(false);
    expect("adminUserId" in result).toBe(false);
  });

  it("rejects callers without a user doc", async () => {
    const t = convexTest(schema, convexTestModules);
    await expect(
      t
        .withIdentity(identity("ghost"))
        .query(api.notifications.queries.getMyNotificationSettings, {}),
    ).rejects.toThrow();
  });

  it("persists email opt-out and keeps the other channel untouched", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedUser(t, "user-1");
    const asUser = t.withIdentity(identity("user-1"));

    const updated = await asUser.mutation(
      api.notifications.mutations.updateMyNotificationPreference,
      {
        type: "ai_review_required",
        channel: "email",
        enabled: false,
      },
    );
    expect(updated).toEqual({ emailEnabled: false, lineEnabled: false });

    const prefs = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", "user-1"))
        .unique();
      return user?.notificationPreferences;
    });
    expect(prefs).toEqual({
      aiReviewRequiredEmailEnabled: false,
      aiReviewRequiredLineEnabled: false,
    });
  });

  it("refuses to enable LINE without exactly one active link, allows disabling", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedUser(t, "user-1");
    const asUser = t.withIdentity(identity("user-1"));

    await expect(
      asUser.mutation(api.notifications.mutations.updateMyNotificationPreference, {
        type: "ai_review_required",
        channel: "line",
        enabled: true,
      }),
    ).rejects.toThrow();

    await t.run(async (ctx) => {
      await ctx.db.insert("lineAccountLinks", {
        userId: "user-1",
        lineUserId: "line-u-1",
        status: "active",
        linkedAt: 10,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    const enabled = await asUser.mutation(
      api.notifications.mutations.updateMyNotificationPreference,
      {
        type: "ai_review_required",
        channel: "line",
        enabled: true,
      },
    );
    expect(enabled).toEqual({ emailEnabled: true, lineEnabled: true });
  });

  it("rejects mutation for non-AI notification types via arg validation", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedUser(t, "user-1");
    await expect(
      t
        .withIdentity(identity("user-1"))
        .mutation(api.notifications.mutations.updateMyNotificationPreference, {
          type: "group_deleted" as never,
          channel: "email",
          enabled: false,
        }),
    ).rejects.toThrow();
  });

  it("one user's preference write never alters another user's settings", async () => {
    const t = convexTest(schema, convexTestModules);
    const userB = await seedUser(t, "user-b");
    await seedUser(t, "user-a");

    await t
      .withIdentity(identity("user-a"))
      .mutation(api.notifications.mutations.updateMyNotificationPreference, {
        type: "ai_review_required",
        channel: "email",
        enabled: false,
      });

    const userBSettings = await t
      .withIdentity(identity("user-b"))
      .query(api.notifications.queries.getMyNotificationSettings, {});
    expect(userBSettings.emailEnabled).toBe(true);

    const userBDoc = await t.run(async (ctx) => await ctx.db.get(userB));
    expect(userBDoc?.notificationPreferences).toBeUndefined();
  });

  it("rejects a caller-supplied userId argument and writes nothing", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedUser(t, "user-a");
    await seedUser(t, "user-b");

    await expect(
      t
        .withIdentity(identity("user-a"))
        .mutation(api.notifications.mutations.updateMyNotificationPreference, {
          type: "ai_review_required",
          channel: "email",
          enabled: false,
          userId: "user-b",
        } as never),
    ).rejects.toThrow();

    const users = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(users.every((u) => u.notificationPreferences === undefined)).toBe(true);
  });
});

describe("admin notification settings", () => {
  it("rejects unauthenticated and non-admin callers", async () => {
    const t = convexTest(schema, convexTestModules);
    await expect(t.query(api.notificationSettings.getNotificationSettings, {})).rejects.toThrow();
    await expect(
      t.mutation(api.notificationSettings.updateNotificationSetting, {
        type: "ai_review_required",
        channel: "line",
        enabled: true,
        reason: "enable",
      }),
    ).rejects.toThrow();

    await seedUser(t, "plain-user");
    await expect(
      t
        .withIdentity(identity("plain-user"))
        .query(api.notificationSettings.getNotificationSettings, {}),
    ).rejects.toThrow();
  });

  it("denies non-admin mutations without writing settings or audit", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedUser(t, "plain-user");
    await expect(
      t
        .withIdentity(identity("plain-user"))
        .mutation(api.notificationSettings.updateNotificationSetting, {
          type: "ai_review_required",
          channel: "line",
          enabled: true,
          reason: "not an admin",
        }),
    ).rejects.toThrow();

    const rows = await t.run(async (ctx) => ({
      settings: await ctx.db.query("notificationSettings").collect(),
      audits: await ctx.db.query("systemAdminAuditLogs").collect(),
    }));
    expect(rows.settings).toHaveLength(0);
    expect(rows.audits).toHaveLength(0);
  });

  it("lists all supported pairs with defaults for admins", async () => {
    const t = convexTest(schema, convexTestModules);
    const adminDoc = await seedUser(t, "admin-1");
    await seedSystemAdmin(t, adminDoc);
    const result = await t
      .withIdentity(identity("admin-1"))
      .query(api.notificationSettings.getNotificationSettings, {});
    expect(result.items).toHaveLength(11);
    expect(result.items.filter((i) => i.channel === "line").map((i) => i.type)).toEqual([
      "ai_review_required",
    ]);
    expect(
      result.items.find((i) => i.type === "ai_review_required" && i.channel === "line"),
    ).toMatchObject({ enabled: false, mandatory: false, configured: false });
  });

  it("updates a setting and writes audit with before/after", async () => {
    const t = convexTest(schema, convexTestModules);
    const adminDoc = await seedUser(t, "admin-1");
    await seedSystemAdmin(t, adminDoc);
    const asAdmin = t.withIdentity(identity("admin-1"));

    const result = await asAdmin.mutation(api.notificationSettings.updateNotificationSetting, {
      type: "ai_review_required",
      channel: "line",
      enabled: true,
      reason: "  LINE通知を有効化する  ",
    });
    expect(result).toEqual({ changed: true, enabled: true });

    const rows = await t.run(async (ctx) => {
      return {
        settings: await ctx.db.query("notificationSettings").collect(),
        audits: await ctx.db.query("systemAdminAuditLogs").collect(),
      };
    });
    expect(rows.settings).toHaveLength(1);
    expect(rows.settings[0]).toMatchObject({
      type: "ai_review_required",
      channel: "line",
      enabled: true,
    });
    expect(rows.audits).toHaveLength(1);
    expect(rows.audits[0]).toMatchObject({
      action: "system_admin_notification_setting_changed",
      targetKind: "notification_setting",
      targetId: "ai_review_required:line",
      actorType: "system_admin",
      beforeNotificationEnabled: false,
      afterNotificationEnabled: true,
      result: "success",
      reason: "LINE通知を有効化する",
    });
  });

  it("requires explicit confirmation to disable mandatory email and audits nothing on rejection", async () => {
    const t = convexTest(schema, convexTestModules);
    const adminDoc = await seedUser(t, "admin-1");
    await seedSystemAdmin(t, adminDoc);
    const asAdmin = t.withIdentity(identity("admin-1"));

    await expect(
      asAdmin.mutation(api.notificationSettings.updateNotificationSetting, {
        type: "group_deleted",
        channel: "email",
        enabled: false,
        reason: "停止する",
      }),
    ).rejects.toThrow();

    const after = await t.run(async (ctx) => ({
      settings: await ctx.db.query("notificationSettings").collect(),
      audits: await ctx.db.query("systemAdminAuditLogs").collect(),
    }));
    expect(after.settings).toHaveLength(0);
    expect(after.audits).toHaveLength(0);

    const ok = await asAdmin.mutation(api.notificationSettings.updateNotificationSetting, {
      type: "group_deleted",
      channel: "email",
      enabled: false,
      reason: "停止する",
      confirmMandatoryEmailDisable: true,
    });
    expect(ok).toEqual({ changed: true, enabled: false });
  });

  it("rejects unsupported channel pairs and invalid reasons", async () => {
    const t = convexTest(schema, convexTestModules);
    const adminDoc = await seedUser(t, "admin-1");
    await seedSystemAdmin(t, adminDoc);
    const asAdmin = t.withIdentity(identity("admin-1"));

    await expect(
      asAdmin.mutation(api.notificationSettings.updateNotificationSetting, {
        type: "group_deleted",
        channel: "line",
        enabled: true,
        reason: "valid reason",
      }),
    ).rejects.toThrow();

    await expect(
      asAdmin.mutation(api.notificationSettings.updateNotificationSetting, {
        type: "ai_review_required",
        channel: "line",
        enabled: true,
        reason: "   ",
      }),
    ).rejects.toThrow();
  });

  it("rejects revoked admins", async () => {
    const t = convexTest(schema, convexTestModules);
    const adminDoc = await seedUser(t, "admin-1");
    await t.run(async (ctx) => {
      await ctx.db.insert("systemAdmins", {
        userId: adminDoc,
        status: "revoked",
        createdAt: 1,
        updatedAt: 1,
        grantedAt: 1,
        grantReason: "test",
        revokedAt: 2,
        revokeReason: "test",
      });
    });
    await expect(
      t
        .withIdentity(identity("admin-1"))
        .query(api.notificationSettings.getNotificationSettings, {}),
    ).rejects.toThrow();
    await expect(
      t
        .withIdentity(identity("admin-1"))
        .mutation(api.notificationSettings.updateNotificationSetting, {
          type: "ai_review_required",
          channel: "line",
          enabled: true,
          reason: "revoked admin",
        }),
    ).rejects.toThrow();

    const rows = await t.run(async (ctx) => ({
      settings: await ctx.db.query("notificationSettings").collect(),
      audits: await ctx.db.query("systemAdminAuditLogs").collect(),
    }));
    expect(rows.settings).toHaveLength(0);
    expect(rows.audits).toHaveLength(0);
  });

  it("returns before/after enabled fields through the public audit log query", async () => {
    const t = convexTest(schema, convexTestModules);
    const adminDoc = await seedUser(t, "admin-1");
    await seedSystemAdmin(t, adminDoc);
    const asAdmin = t.withIdentity(identity("admin-1"));

    await asAdmin.mutation(api.notificationSettings.updateNotificationSetting, {
      type: "ai_review_required",
      channel: "line",
      enabled: true,
      reason: "roundtrip",
    });
    await asAdmin.mutation(api.notificationSettings.updateNotificationSetting, {
      type: "ai_review_required",
      channel: "line",
      enabled: false,
      reason: "roundtrip back",
    });

    const result = await asAdmin.query(api.systemAdmins.listSystemAdminAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
      action: "system_admin_notification_setting_changed",
    });
    expect(result.page.length).toBeGreaterThanOrEqual(2);
    const latest = result.page[0];
    expect(latest).toMatchObject({
      action: "system_admin_notification_setting_changed",
      beforeNotificationEnabled: true,
      afterNotificationEnabled: false,
    });
  });
});

describe("internal AI review notification enqueue", () => {
  async function seedBatchFixture(
    t: ReturnType<typeof convexTest>,
    opts: { lineOptIn?: boolean; lineGlobal?: boolean; withLink?: boolean } = {},
  ) {
    const { lineOptIn = true, lineGlobal = true, withLink = true } = opts;
    const userDoc = await seedUser(
      t,
      "creator",
      lineOptIn
        ? {
            notificationPreferences: {
              aiReviewRequiredEmailEnabled: true,
              aiReviewRequiredLineEnabled: true,
            },
          }
        : {},
    );
    return await t
      .run(async (ctx) => {
        const groupId = await ctx.db.insert("groups", {
          name: "g",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("groupMembers", {
          groupId,
          userId: "creator",
          role: "owner",
          createdAt: 1,
          updatedAt: 1,
        });
        if (withLink) {
          await ctx.db.insert("lineAccountLinks", {
            userId: "creator",
            lineUserId: "line-u-creator",
            status: "active",
            linkedAt: 50,
            createdAt: 1,
            updatedAt: 1,
          });
        }
        if (lineGlobal) {
          await ctx.db.insert("notificationSettings", {
            type: "ai_review_required",
            channel: "line",
            enabled: true,
            updatedByUserId: userDoc,
            updatedAt: 1,
          });
        }
        const batchId = await ctx.db.insert("receiptAnalysisBatches", {
          groupId,
          createdByUserId: "creator",
          totalCount: 2,
          processedCount: 2,
          status: "completed",
          createdAt: 1,
          updatedAt: 1,
        });
        return { groupId, batchId };
      })
      .then((ids) => ids.batchId);
  }

  it("enqueues one email job and one LINE job per batch, deduped on repeat", async () => {
    const t = convexTest(schema, convexTestModules);
    const batchId = await seedBatchFixture(t);

    for (let i = 0; i < 2; i++) {
      await t.mutation(internal.notifications.internal.enqueueAiReviewNotifications, {
        batchId,
        userId: "creator",
        pendingCount: 2,
      });
    }

    const rows = await t.run(async (ctx) => ({
      emails: await ctx.db.query("transactionalEmailJobs").collect(),
      lines: await ctx.db.query("lineNotificationJobs").collect(),
      events: await ctx.db.query("lineNotificationEvents").collect(),
    }));
    expect(rows.emails).toHaveLength(1);
    expect(rows.emails[0]).toMatchObject({
      templateType: "ai_review_required",
      recipientUserId: "creator",
      businessDedupeKey: `ai-review-required/${batchId}`,
    });
    expect(rows.lines).toHaveLength(1);
    expect(rows.lines[0]).toMatchObject({
      userId: "creator",
      batchId,
      status: "queued",
      lineUserIdSnapshot: "line-u-creator",
      linkedAtSnapshot: 50,
    });
    expect(rows.events).toHaveLength(1);
    expect(rows.events[0]).toMatchObject({
      userId: "creator",
      batchId,
      outcome: "queued",
      dedupeKey: `ai-review-required-line/${batchId}`,
    });
  });

  it("does not enqueue LINE without opt-in or link, email still enqueued", async () => {
    const t = convexTest(schema, convexTestModules);
    const batchId = await seedBatchFixture(t, { lineOptIn: false });
    await t.mutation(internal.notifications.internal.enqueueAiReviewNotifications, {
      batchId,
      userId: "creator",
      pendingCount: 2,
    });
    const rows = await t.run(async (ctx) => ({
      emails: await ctx.db.query("transactionalEmailJobs").collect(),
      lines: await ctx.db.query("lineNotificationJobs").collect(),
      events: await ctx.db.query("lineNotificationEvents").collect(),
    }));
    expect(rows.emails).toHaveLength(1);
    expect(rows.lines).toHaveLength(0);
    expect(rows.events).toHaveLength(1);
    expect(rows.events[0]).toMatchObject({
      outcome: "skipped",
      reason: "notification_disabled",
    });

    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", "creator"))
        .unique();
      await ctx.db.patch(user!._id, {
        notificationPreferences: {
          aiReviewRequiredEmailEnabled: true,
          aiReviewRequiredLineEnabled: true,
        },
      });
    });
    await t.mutation(internal.notifications.internal.enqueueAiReviewNotifications, {
      batchId,
      userId: "creator",
      pendingCount: 2,
    });

    const replayed = await t.run(async (ctx) => ({
      lines: await ctx.db.query("lineNotificationJobs").collect(),
      events: await ctx.db.query("lineNotificationEvents").collect(),
    }));
    expect(replayed.lines).toHaveLength(0);
    expect(replayed.events).toHaveLength(1);
  });

  it("does not backfill LINE after consumed-event cleanup while the batch marker remains", async () => {
    const t = convexTest(schema, convexTestModules);
    const batchId = await seedBatchFixture(t, { lineGlobal: false });
    await t.mutation(internal.notifications.internal.enqueueAiReviewNotifications, {
      batchId,
      userId: "creator",
      pendingCount: 2,
    });

    const event = await t.run(
      async (ctx) => (await ctx.db.query("lineNotificationEvents").collect())[0],
    );
    expect(event?.outcome).toBe("skipped");
    const batch = await t.run(async (ctx) => await ctx.db.get(batchId));
    expect(batch?.aiReviewLineNotificationConsumedAt).toBeTypeOf("number");

    await t.run(async (ctx) => {
      const cutoff = Date.now() - 31 * 24 * 60 * 60 * 1000;
      await ctx.db.patch(event!._id, { createdAt: cutoff, updatedAt: cutoff });
      const user = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", "creator"))
        .unique();
      await ctx.db.insert("notificationSettings", {
        type: "ai_review_required",
        channel: "line",
        enabled: true,
        updatedByUserId: user!._id,
        updatedAt: cutoff,
      });
    });
    await t.mutation(internal.notifications.cleanup.cleanupOldLineNotificationJobs, {});
    await t.mutation(internal.notifications.internal.enqueueAiReviewNotifications, {
      batchId,
      userId: "creator",
      pendingCount: 2,
    });

    const rows = await t.run(async (ctx) => ({
      batch: await ctx.db.get(batchId),
      lines: await ctx.db.query("lineNotificationJobs").collect(),
      events: await ctx.db.query("lineNotificationEvents").collect(),
    }));
    expect(rows.batch?.aiReviewLineNotificationConsumedAt).toBeTypeOf("number");
    expect(rows.lines).toHaveLength(0);
    expect(rows.events).toHaveLength(0);
  });

  it("enqueues nothing when caller userId does not match batch creator", async () => {
    const t = convexTest(schema, convexTestModules);
    const batchId = await seedBatchFixture(t);
    await t.mutation(internal.notifications.internal.enqueueAiReviewNotifications, {
      batchId,
      userId: "attacker",
      pendingCount: 2,
    });
    const rows = await t.run(async (ctx) => ({
      emails: await ctx.db.query("transactionalEmailJobs").collect(),
      lines: await ctx.db.query("lineNotificationJobs").collect(),
    }));
    expect(rows.emails).toHaveLength(0);
    expect(rows.lines).toHaveLength(0);
  });
});

describe("email delivery decision", () => {
  it("returns enabled for defaults and globally_disabled for admin-off", async () => {
    const t = convexTest(schema, convexTestModules);
    const on = await t.query(internal.notifications.internal.getEmailDeliveryDecision, {
      type: "group_deleted",
    });
    expect(on).toEqual({ enabled: true });

    const adminDoc = await seedUser(t, "admin-1");
    await t.run(async (ctx) => {
      await ctx.db.insert("notificationSettings", {
        type: "group_deleted",
        channel: "email",
        enabled: false,
        updatedByUserId: adminDoc,
        updatedAt: 1,
      });
    });
    const off = await t.query(internal.notifications.internal.getEmailDeliveryDecision, {
      type: "group_deleted",
    });
    expect(off).toEqual({ enabled: false, reason: "globally_disabled" });
  });
});

describe("internal LINE job claim and completion", () => {
  async function seedClaimableJob(t: ReturnType<typeof convexTest>) {
    const userDoc = await seedUser(t, "creator", {
      notificationPreferences: {
        aiReviewRequiredEmailEnabled: true,
        aiReviewRequiredLineEnabled: true,
      },
    });
    return await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "g",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("groupMembers", {
        groupId,
        userId: "creator",
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("notificationSettings", {
        type: "ai_review_required",
        channel: "line",
        enabled: true,
        updatedByUserId: userDoc,
        updatedAt: 1,
      });
      const linkId = await ctx.db.insert("lineAccountLinks", {
        userId: "creator",
        lineUserId: "line-u-creator",
        status: "active",
        linkedAt: 50,
        createdAt: 1,
        updatedAt: 1,
      });
      const batchId = await ctx.db.insert("receiptAnalysisBatches", {
        groupId,
        createdByUserId: "creator",
        totalCount: 2,
        processedCount: 2,
        status: "completed",
        createdAt: 1,
        updatedAt: 1,
      });
      const jobId = await ctx.db.insert("lineNotificationJobs", {
        userId: "creator",
        batchId,
        type: "ai_review_required",
        pendingCount: 2,
        linkId,
        linkedAtSnapshot: 50,
        lineUserIdSnapshot: "line-u-creator",
        text: "pending 2",
        status: "queued",
        attemptCount: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      return jobId;
    });
  }

  it("claims with snapshot/lease fields and completes retrying inside the mutation", async () => {
    const t = convexTest(schema, convexTestModules);
    const jobId = await seedClaimableJob(t);
    const retryKey = "550e8400-e29b-41d4-a716-446655440000";

    const claim = await t.mutation(internal.notifications.internal.claimLineNotificationJob, {
      jobId,
      retryKeyCandidate: retryKey,
      leaseMs: 30_000,
      now: 10_000,
    });
    expect(claim.claimed).toBe(true);

    const processing = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(processing).toMatchObject({
      status: "processing",
      attemptCount: 1,
      retryKey,
      leaseUntil: 40_000,
      firstAttemptAt: 10_000,
    });

    const leasedClaim = await t.mutation(internal.notifications.internal.claimLineNotificationJob, {
      jobId,
      retryKeyCandidate: retryKey,
      leaseMs: 30_000,
      now: 20_000,
    });
    expect(leasedClaim.claimed).toBe(false);

    await t.mutation(internal.notifications.internal.completeLineNotificationJob, {
      jobId,
      attemptCount: 1,
      completion: {
        outcome: "retrying",
        nextRetryAt: 70_000,
        errorCode: "provider_unavailable",
      },
      now: 20_000,
    });

    const retrying = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(retrying).toMatchObject({
      status: "retrying",
      attemptCount: 1,
      nextRetryAt: 70_000,
      errorCode: "provider_unavailable",
      retryKey,
    });

    await t.mutation(internal.notifications.internal.completeLineNotificationJob, {
      jobId,
      attemptCount: 2,
      completion: { outcome: "sent" },
      now: 30_000,
    });
    const stillRetrying = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(stillRetrying?.status).toBe("retrying");

    const reclaim = await t.mutation(internal.notifications.internal.claimLineNotificationJob, {
      jobId,
      retryKeyCandidate: retryKey,
      leaseMs: 30_000,
      now: 70_000,
    });
    expect(reclaim.claimed).toBe(true);
    const reprocessing = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(reprocessing).toMatchObject({
      status: "processing",
      attemptCount: 2,
      retryKey,
      firstAttemptAt: 10_000,
    });
  });

  it("rejects send authorization after lease recovery turns the claimed attempt stale", async () => {
    const t = convexTest(schema, convexTestModules);
    const jobId = await seedClaimableJob(t);
    const retryKey = "550e8400-e29b-41d4-a716-446655440000";

    const claim = await t.mutation(internal.notifications.internal.claimLineNotificationJob, {
      jobId,
      retryKeyCandidate: retryKey,
      leaseMs: 30_000,
      now: 10_000,
    });
    expect(claim.claimed).toBe(true);

    await t.mutation(internal.notifications.internal.recoverLineNotificationLease, {
      jobId,
      attemptCount: 1,
    });

    const authorization = await t.mutation(
      internal.notifications.internal.authorizeLineNotificationSend,
      {
        jobId,
        attemptCount: 1,
        retryKey,
        leaseMs: 30_000,
        now: Date.now() + 1_000,
      },
    );
    expect(authorization.claimed).toBe(false);
  });

  it("send authorization re-checks the latest opt-out state before external delivery", async () => {
    const t = convexTest(schema, convexTestModules);
    const jobId = await seedClaimableJob(t);
    const retryKey = "550e8400-e29b-41d4-a716-446655440000";
    const claim = await t.mutation(internal.notifications.internal.claimLineNotificationJob, {
      jobId,
      retryKeyCandidate: retryKey,
      leaseMs: 30_000,
      now: 10_000,
    });
    expect(claim.claimed).toBe(true);

    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", "creator"))
        .unique();
      await ctx.db.patch(user!._id, {
        notificationPreferences: {
          aiReviewRequiredEmailEnabled: true,
          aiReviewRequiredLineEnabled: false,
        },
      });
    });

    const authorization = await t.mutation(
      internal.notifications.internal.authorizeLineNotificationSend,
      {
        jobId,
        attemptCount: 1,
        retryKey,
        leaseMs: 30_000,
        now: 20_000,
      },
    );
    expect(authorization.claimed).toBe(false);
    const job = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(job).toMatchObject({ status: "suppressed", errorCode: "notification_disabled" });
  });

  it("stale-job recovery reschedules a queued job that lost its process action", async () => {
    const t = convexTest(schema, convexTestModules);
    const jobId = await seedClaimableJob(t);

    await t.mutation(internal.notifications.internal.recoverStaleLineNotificationJobs, {});

    const scheduledNames = (await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map((row) => row.name),
    )) as string[];
    expect(
      scheduledNames.filter((name) => name.includes("processLineNotificationJob")),
    ).toHaveLength(1);
    const job = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(job?.status).toBe("queued");
  });

  it("fails the job instead of claiming once the attempt budget is exhausted", async () => {
    const t = convexTest(schema, convexTestModules);
    const jobId = await seedClaimableJob(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, {
        status: "retrying",
        attemptCount: 6,
        nextRetryAt: 5_000,
        retryKey: "550e8400-e29b-41d4-a716-446655440000",
        firstAttemptAt: 1_000,
      });
    });

    const claim = await t.mutation(internal.notifications.internal.claimLineNotificationJob, {
      jobId,
      retryKeyCandidate: "550e8400-e29b-41d4-a716-446655440000",
      leaseMs: 30_000,
      now: 10_000,
    });
    expect(claim.claimed).toBe(false);

    const job = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(job).toMatchObject({ status: "failed", errorCode: "max_attempts_reached" });
  });

  it("fails the job instead of claiming when the retry key TTL has passed", async () => {
    const t = convexTest(schema, convexTestModules);
    const jobId = await seedClaimableJob(t);
    const ttl = 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, {
        status: "retrying",
        attemptCount: 2,
        nextRetryAt: 5_000,
        retryKey: "550e8400-e29b-41d4-a716-446655440000",
        firstAttemptAt: 1_000,
      });
    });

    const claim = await t.mutation(internal.notifications.internal.claimLineNotificationJob, {
      jobId,
      retryKeyCandidate: "550e8400-e29b-41d4-a716-446655440000",
      leaseMs: 30_000,
      now: 1_000 + ttl,
    });
    expect(claim.claimed).toBe(false);

    const job = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(job).toMatchObject({ status: "failed", errorCode: "retry_key_expired" });
  });

  it("retry completion queues one process action and stale completions queue none", async () => {
    const t = convexTest(schema, convexTestModules);
    const jobId = await seedClaimableJob(t);
    const retryKey = "550e8400-e29b-41d4-a716-446655440000";
    const scheduledNames = async () =>
      (await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())).map(
        (row) => row.name,
      );

    await t.mutation(internal.notifications.internal.claimLineNotificationJob, {
      jobId,
      retryKeyCandidate: retryKey,
      leaseMs: 30_000,
      now: 10_000,
    });
    const afterClaim = await scheduledNames();
    expect(afterClaim.filter((name) => name.includes("recoverLineNotificationLease"))).toHaveLength(
      1,
    );
    expect(afterClaim.filter((name) => name.includes("processLineNotificationJob"))).toHaveLength(
      0,
    );

    await t.mutation(internal.notifications.internal.completeLineNotificationJob, {
      jobId,
      attemptCount: 99,
      completion: {
        outcome: "retrying",
        nextRetryAt: 80_000,
        errorCode: "stale_attempt",
      },
      now: 20_000,
    });
    const afterStaleProcessing = await scheduledNames();
    expect(
      afterStaleProcessing.filter((name) => name.includes("processLineNotificationJob")),
    ).toHaveLength(0);
    const stillProcessing = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(stillProcessing).toMatchObject({ status: "processing", attemptCount: 1 });

    await t.mutation(internal.notifications.internal.completeLineNotificationJob, {
      jobId,
      attemptCount: 1,
      completion: {
        outcome: "retrying",
        nextRetryAt: 70_000,
        errorCode: "provider_unavailable",
      },
      now: 20_000,
    });
    const afterRetry = await scheduledNames();
    expect(afterRetry.filter((name) => name.includes("processLineNotificationJob"))).toHaveLength(
      1,
    );

    await t.mutation(internal.notifications.internal.completeLineNotificationJob, {
      jobId,
      attemptCount: 99,
      completion: {
        outcome: "retrying",
        nextRetryAt: 80_000,
        errorCode: "stale_attempt",
      },
      now: 30_000,
    });
    const afterStale = await scheduledNames();
    expect(afterStale.filter((name) => name.includes("processLineNotificationJob"))).toHaveLength(
      1,
    );
    const stillRetrying = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(stillRetrying).toMatchObject({
      status: "retrying",
      attemptCount: 1,
      nextRetryAt: 70_000,
      errorCode: "provider_unavailable",
    });
  });
});
