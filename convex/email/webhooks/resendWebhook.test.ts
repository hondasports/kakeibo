import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WebhookEventPayload } from "resend";
import type { ActionCtx } from "../../_generated/server";
import { createResendWebhookHandler } from "./resendWebhook";

// PublicHttpAction は callable として型付けされていないため、テストでは any として呼び出す
const asAny = (value: unknown): any => value as any;

class MockResponse {
  status: number;
  body: string;

  constructor(body: string, init?: { status?: number }) {
    this.body = body;
    this.status = init?.status ?? 200;
  }
}

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Response = MockResponse;
});

function createActionCtx(): ActionCtx {
  return {
    runMutation: vi.fn().mockResolvedValue(undefined),
    runQuery: vi.fn().mockResolvedValue(null),
    runAction: vi.fn().mockResolvedValue(undefined),
    scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
    auth: { getUserIdentity: vi.fn().mockResolvedValue(null) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as ActionCtx;
}

function createRequest({ body, headers }: { body: string; headers: Record<string, string> }): {
  text: () => Promise<string>;
  headers: { get: (name: string) => string | null };
} {
  const headersMap = new Map(Object.entries(headers));
  return {
    text: () => Promise.resolve(body),
    headers: {
      get: (name: string) => (headersMap.get(name) ?? null) as string | null,
    },
  };
}

describe("createResendWebhookHandler", () => {
  it("returns 401 when verification fails", async () => {
    const handler = createResendWebhookHandler(() => {
      throw new Error("invalid signature");
    });
    const ctx = createActionCtx();
    const req = createRequest({
      body: "{}",
      headers: {
        "svix-id": "id-1",
        "svix-timestamp": "1000",
        "svix-signature": "sig",
      },
    });

    const response = (await asAny(handler)(ctx, req as any)) as MockResponse;

    expect(response.status).toBe(401);
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("returns 500 when webhook secret is missing", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const handler = createResendWebhookHandler(
      () =>
        asAny({
          type: "email.delivered",
          data: {},
        }) as WebhookEventPayload,
    );
    const ctx = createActionCtx();
    const req = createRequest({
      body: "{}",
      headers: {
        "svix-id": "id-1",
        "svix-timestamp": "1000",
        "svix-signature": "sig",
      },
    });

    const response = (await asAny(handler)(ctx, req as any)) as MockResponse;

    expect(response.status).toBe(500);
  });

  it("returns 200 and processes email webhook events", async () => {
    const handler = createResendWebhookHandler(
      () =>
        asAny({
          type: "email.delivered",
          created_at: "2026-07-10T12:00:00Z",
          data: {
            email_id: "msg-1",
            created_at: "2026-07-10T12:00:00Z",
            to: ["test@example.com"],
            from: "noreply@example.com",
            subject: "test",
          },
        }) as WebhookEventPayload,
    );

    const ctx = createActionCtx();
    const req = createRequest({
      body: "{}",
      headers: {
        "svix-id": "id-1",
        "svix-timestamp": "1000",
        "svix-signature": "sig",
      },
    });

    const response = (await asAny(handler)(ctx, req as any)) as MockResponse;

    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        svixId: "id-1",
        provider: "resend",
        eventType: "email.delivered",
      }),
    );
  });

  it("accepts webhook-* headers as a fallback", async () => {
    const handler = createResendWebhookHandler(
      () =>
        asAny({
          type: "email.delivered",
          data: {},
        }) as WebhookEventPayload,
    );

    const ctx = createActionCtx();
    const req = createRequest({
      body: "{}",
      headers: {
        "webhook-id": "id-fallback",
        "webhook-timestamp": "1000",
        "webhook-signature": "sig",
      },
    });

    const response = (await asAny(handler)(ctx, req as any)) as MockResponse;

    expect(response.status).toBe(200);
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ svixId: "id-fallback" }),
    );
  });

  it("returns 200 without processing for unsupported event types", async () => {
    const handler = createResendWebhookHandler(
      () =>
        asAny({
          type: "email.clicked",
          data: {},
        }) as WebhookEventPayload,
    );

    const ctx = createActionCtx();
    const req = createRequest({
      body: "{}",
      headers: {
        "svix-id": "id-1",
        "svix-timestamp": "1000",
        "svix-signature": "sig",
      },
    });

    const response = (await asAny(handler)(ctx, req as any)) as MockResponse;

    expect(response.status).toBe(200);
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });
});
