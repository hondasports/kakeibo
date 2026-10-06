import { afterEach, describe, expect, it, vi } from "vitest";
import { sendLineTextPush } from "./linePushSender";

const RETRY_KEY = "550e8400-e29b-41d4-a716-446655440000";
const INPUT = { to: "U0123456789", text: "テスト通知", retryKey: RETRY_KEY };

function response(status: number, headers: Record<string, string> = {}) {
  return new Response("{}", { status, headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendLineTextPush", () => {
  it("returns sent without any fetch in mock mode", async () => {
    vi.stubEnv("LINE_INTEGRATION_MODE", "mock");
    vi.stubEnv("APP_ENV", "development");
    const fetchImpl = vi.fn();
    const result = await sendLineTextPush(INPUT, fetchImpl as never);
    expect(result).toEqual({ kind: "sent" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails permanently when LINE_INTEGRATION_MODE is unset or invalid", async () => {
    vi.stubEnv("LINE_INTEGRATION_MODE", "");
    const fetchImpl = vi.fn();
    const result = await sendLineTextPush(INPUT, fetchImpl as never);
    expect(result).toEqual({ kind: "permanent", errorCode: "configuration_error" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails permanently when the channel token is missing in real mode", async () => {
    vi.stubEnv("LINE_INTEGRATION_MODE", "real");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "");
    const fetchImpl = vi.fn();
    const result = await sendLineTextPush(INPUT, fetchImpl as never);
    expect(result).toEqual({ kind: "permanent", errorCode: "configuration_error" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects invalid retry keys before calling the provider", async () => {
    vi.stubEnv("LINE_INTEGRATION_MODE", "real");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "token");
    const fetchImpl = vi.fn();
    const result = await sendLineTextPush({ ...INPUT, retryKey: "bad" }, fetchImpl as never);
    expect(result).toEqual({ kind: "permanent", errorCode: "invalid_retry_key" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends push with Authorization and X-Line-Retry-Key headers", async () => {
    vi.stubEnv("LINE_INTEGRATION_MODE", "real");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "token-value");
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { "x-line-request-id": "req-1" }));
    const result = await sendLineTextPush(INPUT, fetchImpl as never);

    expect(result).toEqual({ kind: "sent", providerRequestId: "req-1" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-value");
    expect(init.headers["X-Line-Retry-Key"]).toBe(RETRY_KEY);
    const body = JSON.parse(init.body);
    expect(body).toEqual({ to: INPUT.to, messages: [{ type: "text", text: INPUT.text }] });
  });

  it("treats 409 with x-line-accepted-request-id as sent", async () => {
    vi.stubEnv("LINE_INTEGRATION_MODE", "real");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "token");
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response(409, { "x-line-accepted-request-id": "accepted-1" }));
    const result = await sendLineTextPush(INPUT, fetchImpl as never);
    expect(result).toEqual({ kind: "sent", providerRequestId: "accepted-1" });
  });

  it("treats 409 without the accepted-request-id header as permanent", async () => {
    vi.stubEnv("LINE_INTEGRATION_MODE", "real");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "token");
    const fetchImpl = vi.fn().mockResolvedValue(response(409));
    const result = await sendLineTextPush(INPUT, fetchImpl as never);
    expect(result).toEqual({ kind: "permanent", errorCode: "provider_conflict" });
  });

  it("treats 5xx and network errors as retryable", async () => {
    vi.stubEnv("LINE_INTEGRATION_MODE", "real");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "token");

    const fetch5xx = vi.fn().mockResolvedValue(response(500));
    expect(await sendLineTextPush(INPUT, fetch5xx as never)).toEqual({
      kind: "retryable",
      errorCode: "provider_server_error",
    });

    const fetchDown = vi.fn().mockRejectedValue(new Error("socket hangup"));
    expect(await sendLineTextPush(INPUT, fetchDown as never)).toEqual({
      kind: "retryable",
      errorCode: "provider_unavailable",
    });
  });

  it("treats other 4xx as permanent (no blind retry on 4xx)", async () => {
    vi.stubEnv("LINE_INTEGRATION_MODE", "real");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "token");
    for (const status of [400, 401, 403, 429]) {
      const fetchImpl = vi.fn().mockResolvedValue(response(status));
      const result = await sendLineTextPush(INPUT, fetchImpl as never);
      expect(result).toEqual({ kind: "permanent", errorCode: "provider_rejected" });
    }
  });

  it("does not leak token, recipient or response body into errors", async () => {
    vi.stubEnv("LINE_INTEGRATION_MODE", "real");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "secret-token");
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: "detail" }), { status: 500 }));
    const result = await sendLineTextPush(INPUT, fetchImpl as never);
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain(INPUT.to);
    expect(JSON.stringify(result)).not.toContain("detail");
  });
});
