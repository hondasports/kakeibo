// @vitest-environment node
/// <reference types="vite/client" />

import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import { convexTestModules } from "../../test.setup";

const signingKey = Buffer.from("test-key-only-test-key-only-test");

async function setup(legacy = false) {
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
      providerMessageId: "message-id",
      status: legacy ? "delivered" : "sent",
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
  return { t, send, read };
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
