// @vitest-environment node
/// <reference types="vite/client" />

import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import { convexTestModules } from "../../test.setup";

const signingKey = Buffer.from("test-key-only-test-key-only-test");

async function setup(legacy = false, linked = true) {
  vi.stubEnv("RESEND_API_KEY", "re_test_synthetic");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${signingKey.toString("base64")}`);
  const t = convexTest(schema, convexTestModules);
  const jobId = await t.run((ctx) =>
    ctx.db.insert("transactionalEmailJobs", {
      templateType: "email_delivery_test",
      payloadJson: "{}",
      recipientEmail: "test@example.invalid",
      normalizedRecipientEmail: "test@example.invalid",
      subject: "test",
      provider: "resend",
      ...(linked ? { providerMessageId: "message-id" } : {}),
      status: legacy ? "delivered" : linked ? "sent" : "queued",
      attemptCount: 1,
      maxAttempts: 6,
      createdAt: 1,
      updatedAt: 1,
      ...(legacy ? { lastProviderEventAt: 100 } : {}),
    }),
  );
  const send = async (id: string, type: string, createdAt: string) => {
    const body = JSON.stringify({
      type,
      created_at: createdAt,
      data: {
        email_id: "message-id",
        created_at: "2026-01-01T00:00:00Z",
        to: ["test@example.invalid"],
      },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", signingKey)
      .update(`${id}.${ts}.${body}`)
      .digest("base64");
    return await t.fetch("/webhooks/resend", {
      method: "POST",
      headers: {
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": `v1,${signature}`,
      },
      body,
    });
  };
  const read = () =>
    t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      events: await ctx.db.query("emailWebhookEvents").collect(),
      suppressions: await ctx.db.query("emailSuppressions").collect(),
    }));
  const completeSend = () =>
    t.mutation(internal.email.internal.updateJobForSend, {
      jobId,
      providerMessageId: "message-id",
      status: "sent",
      updatedAt: Date.now(),
    });
  return { t, send, read, completeSend };
}

describe("署名済みResend webhookの順序", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it("配信完了後の古い送信通知で状態を戻さず重複を保存しない", async () => {
    const { send, read } = await setup();
    const delivered = "2026-01-01T00:05:00Z";
    expect((await send("evt-delivered", "email.delivered", delivered)).status).toBe(200);
    expect((await send("evt-sent", "email.sent", "2026-01-01T00:00:01Z")).status).toBe(200);
    expect((await send("evt-delivered", "email.delivered", delivered)).status).toBe(200);
    expect((await send("evt-bounce", "email.bounced", "2026-01-01T00:00:30Z")).status).toBe(200);
    const result = await read();
    expect(result.job).toMatchObject({
      status: "delivered",
      lastVerifiedProviderEventAt: Date.parse(delivered),
    });
    expect(result.events).toHaveLength(3);
    expect(result.suppressions).toEqual([
      expect.objectContaining({ reason: "bounce", normalizedEmail: "test@example.invalid" }),
    ]);
    expect(result.events.find((event) => event.svixId === "evt-delivered")?.eventCreatedAt).toBe(
      Date.parse(delivered),
    );
  });
  it("送信から配信完了への通常順を反映する", async () => {
    const { send, read } = await setup();
    expect((await send("sent", "email.sent", "2026-01-01T00:00:01Z")).status).toBe(200);
    expect((await send("delivered", "email.delivered", "2026-01-01T00:05:00Z")).status).toBe(200);
    expect((await read()).job).toMatchObject({ status: "delivered" });
  });
  it.each([
    ["email.delivered", "delivered", undefined],
    ["email.bounced", "bounced", "bounce"],
    ["email.complained", "complained", "complaint"],
  ] as const)(
    "送信結果保存前の%sを保存時に回収し、再送でも重複しない",
    async (type, status, reason) => {
      const { send, read, completeSend } = await setup(false, false);
      const createdAt = "2026-01-01T00:05:00Z";
      expect((await send("early", type, createdAt)).status).toBe(200);
      const pending = await read();
      expect(pending.job?.status).toBe("queued");
      expect(pending.suppressions).toHaveLength(0);
      expect(pending.events).toHaveLength(1);
      expect(pending.events[0].appliedAt).toBeUndefined();

      await completeSend();
      const result = await read();
      expect(result.job).toMatchObject({
        status,
        lastVerifiedProviderEventAt: Date.parse(createdAt),
      });
      expect(result.suppressions).toEqual(reason ? [expect.objectContaining({ reason })] : []);
      expect(result.events).toHaveLength(1);

      expect((await send("early", type, createdAt)).status).toBe(200);
      await completeSend();
      expect(await read()).toEqual(result);
    },
  );
  it.each([
    ["email.delivered", "delivered", undefined],
    ["email.bounced", "bounced", "bounce"],
    ["email.complained", "complained", "complaint"],
  ] as const)("保存処理と%sの同時呼び出しでも副作用を失わない", async (type, status, reason) => {
    const { send, read, completeSend } = await setup(false, false);
    const [response] = await Promise.all([
      send("concurrent", type, "2026-01-01T00:05:00Z"),
      completeSend(),
    ]);
    expect(response.status).toBe(200);
    const result = await read();
    expect(result.job?.status).toBe(status);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].appliedAt).toEqual(expect.any(Number));
    expect(result.suppressions).toEqual(reason ? [expect.objectContaining({ reason })] : []);
  });
  it.each([true, false])(
    "先着イベントの回収でも時刻順と配信停止を守る（bounceが先=%s）",
    async (bounceFirst) => {
      const { send, read, completeSend } = await setup(false, false);
      const events = [
        ["bounce", "email.bounced", "2026-01-01T00:01:00Z"],
        ["delivered", "email.delivered", "2026-01-01T00:05:00Z"],
      ];
      for (const [id, type, time] of bounceFirst ? events : events.reverse()) {
        expect((await send(id, type, time)).status).toBe(200);
      }
      expect((await send("delay", "email.delivery_delayed", "2026-01-01T00:10:00Z")).status).toBe(
        200,
      );
      await completeSend();
      expect((await send("late-sent", "email.sent", "2026-01-01T00:00:01Z")).status).toBe(200);
      const result = await read();
      expect(result.job).toMatchObject({
        status: "delivered",
        lastVerifiedProviderEventAt: Date.parse("2026-01-01T00:05:00Z"),
      });
      expect(result.suppressions).toEqual([expect.objectContaining({ reason: "bounce" })]);
    },
  );
  it.each([true, false])(
    "回収でも同時刻は配信完了を送信より優先する（配信完了が先=%s）",
    async (deliveredFirst) => {
      const { send, read, completeSend } = await setup(false, false);
      for (const type of deliveredFirst
        ? ["email.delivered", "email.sent"]
        : ["email.sent", "email.delivered"]) {
        expect((await send(type, type, "2026-01-01T00:05:00Z")).status).toBe(200);
      }
      await completeSend();
      expect((await read()).job?.status).toBe("delivered");
    },
  );
  it.each([true, false])(
    "同時刻の通知は到着順に依らず配信完了を優先する（配信完了が先=%s）",
    async (deliveredFirst) => {
      const { send, read } = await setup();
      const order = deliveredFirst
        ? ["email.delivered", "email.sent"]
        : ["email.sent", "email.delivered"];
      for (const type of order)
        expect((await send(type, type, "2026-01-01T00:05:00Z")).status).toBe(200);
      expect((await read()).job).toMatchObject({ status: "delivered" });
    },
  );
  it("別のメッセージの先着イベントは回収せず配信停止を登録しない", async () => {
    const { t, send, read } = await setup(false, false);
    expect((await send("unknown", "email.bounced", "2026-01-01T00:05:00Z")).status).toBe(200);
    const otherJob = await t.run((ctx) =>
      ctx.db.insert("transactionalEmailJobs", {
        templateType: "email_delivery_test",
        payloadJson: "{}",
        recipientEmail: "other@example.invalid",
        normalizedRecipientEmail: "other@example.invalid",
        subject: "test",
        provider: "resend",
        status: "queued",
        attemptCount: 1,
        maxAttempts: 6,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await t.mutation(internal.email.internal.updateJobForSend, {
      jobId: otherJob,
      providerMessageId: "another-message-id",
      status: "sent",
      updatedAt: 2,
    });
    const result = await read();
    expect(result.job?.status).toBe("queued");
    expect(result.events[0].appliedAt).toBeUndefined();
    expect(result.suppressions).toHaveLength(0);
  });
  it("時刻のない旧イベントは推測で回収しない", async () => {
    const { t, read, completeSend } = await setup(false, false);
    await t.run((ctx) =>
      ctx.db.insert("emailWebhookEvents", {
        svixId: "legacy-event",
        provider: "resend",
        eventType: "email.bounced",
        providerMessageId: "message-id",
        recipientEmail: "test@example.invalid",
        payloadJson: JSON.stringify({ email_id: "message-id" }),
        processedAt: 1,
        createdAt: 1,
      }),
    );
    await completeSend();
    const result = await read();
    expect(result.job?.status).toBe("sent");
    expect(result.job?.lastVerifiedProviderEventAt).toBeUndefined();
    expect(result.events[0].appliedAt).toBeUndefined();
    expect(result.suppressions).toHaveLength(0);
  });
  it("旧形式の状態は送信結果の再保存でも上書きしない", async () => {
    const { send, read, completeSend } = await setup(true);
    expect((await send("legacy-bounce", "email.bounced", "2026-01-01T00:05:00Z")).status).toBe(200);
    const before = await read();
    await completeSend();
    expect(await read()).toEqual(before);
    expect(before.job?.status).toBe("delivered");
    expect(before.job?.lastVerifiedProviderEventAt).toBeUndefined();
  });
  it("先着イベントの回収が失敗したら送信結果・副作用・適用印もcommitしない", async () => {
    const { t, send, read, completeSend } = await setup(false, false);
    expect((await send("early-bounce", "email.bounced", "2026-01-01T00:05:00Z")).status).toBe(200);
    await t.run((ctx) =>
      ctx.db.insert("emailWebhookEvents", {
        svixId: "corrupt-event",
        provider: "resend",
        eventType: "email.delivered",
        providerMessageId: "message-id",
        payloadJson: "not-json",
        eventCreatedAt: Date.parse("2026-01-01T00:10:00Z"),
        processedAt: 1,
        createdAt: 1,
      }),
    );
    const before = await read();
    await expect(completeSend()).rejects.toThrow("Invalid webhook payload JSON");
    expect(await read()).toEqual(before);
    await t.run((ctx) =>
      ctx.db.delete(before.events.find((event) => event.svixId === "corrupt-event")!._id),
    );
    await completeSend();
    expect((await read()).job?.status).toBe("bounced");
    expect((await read()).suppressions).toHaveLength(1);
  });
  it("旧形式の状態を保留しつつイベント記録と配信停止を続ける", async () => {
    const { send, read } = await setup(true);
    expect((await send("sent", "email.sent", "2026-01-01T00:00:01Z")).status).toBe(200);
    expect((await send("bounce", "email.bounced", "2026-01-01T00:05:00Z")).status).toBe(200);
    const result = await read();
    expect(result.job).toMatchObject({ status: "delivered", lastProviderEventAt: 100 });
    expect(result.job?.lastVerifiedProviderEventAt).toBeUndefined();
    expect(result.job!.updatedAt).toBeGreaterThan(1);
    expect(result.events).toHaveLength(2);
    expect(result.suppressions).toEqual([expect.objectContaining({ reason: "bounce" })]);
  });
  it("旧形式への通知後も保持期間を維持し、cleanup後のbounceで配信停止を登録する", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));
    const { t, send, read } = await setup(true);
    expect((await send("legacy-delivered", "email.delivered", "2026-01-31T00:00:00Z")).status).toBe(
      200,
    );
    vi.setSystemTime(new Date("2026-02-02T00:00:00Z"));
    await t.mutation(internal.email.cleanup.cleanupOldEmailRecords, {});
    expect((await read()).job).toMatchObject({ status: "delivered", lastProviderEventAt: 100 });
    expect((await send("legacy-bounce", "email.bounced", "2026-02-01T00:01:00Z")).status).toBe(200);
    const result = await read();
    expect(result.job).toMatchObject({ status: "delivered", lastProviderEventAt: 100 });
    expect(result.suppressions).toEqual([expect.objectContaining({ reason: "bounce" })]);
  });
});
