import { getLineIntegrationMode } from "../lineLink/lineIntegrationConfig";
import type { LinePushSendResult, LinePushSender } from "../../domain/notifications/runner";
import {
  LINE_NOTIFICATION_PROVIDER_TIMEOUT_MS,
  isValidRetryKey,
} from "../../domain/notifications/rules";

const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const MAX_PUSH_TEXT_LENGTH = 5_000;

export type LineFetch = typeof fetch;

export async function sendLineTextPush(
  input: { to: string; text: string; retryKey: string },
  fetchImpl: LineFetch = fetch,
): Promise<LinePushSendResult> {
  if (!input.to || !input.text || input.text.length > MAX_PUSH_TEXT_LENGTH) {
    return { kind: "permanent", errorCode: "invalid_request" };
  }
  if (!isValidRetryKey(input.retryKey)) {
    return { kind: "permanent", errorCode: "invalid_retry_key" };
  }

  let mode: ReturnType<typeof getLineIntegrationMode>;
  try {
    mode = getLineIntegrationMode();
  } catch {
    return { kind: "permanent", errorCode: "configuration_error" };
  }
  if (mode === "mock") {
    return { kind: "sent" };
  }

  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    return { kind: "permanent", errorCode: "configuration_error" };
  }

  let response: Response;
  try {
    response = await fetchImpl(LINE_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": input.retryKey,
      },
      signal: AbortSignal.timeout(LINE_NOTIFICATION_PROVIDER_TIMEOUT_MS),
      body: JSON.stringify({
        to: input.to,
        messages: [{ type: "text", text: input.text }],
      }),
    });
  } catch {
    return { kind: "retryable", errorCode: "provider_unavailable" };
  }

  if (response.status >= 200 && response.status < 300) {
    const providerRequestId = response.headers.get("x-line-request-id");
    return {
      kind: "sent",
      ...(providerRequestId === null ? {} : { providerRequestId }),
    };
  }

  if (response.status === 409) {
    const acceptedRequestId = response.headers.get("x-line-accepted-request-id");
    if (acceptedRequestId) {
      return { kind: "sent", providerRequestId: acceptedRequestId };
    }
    return { kind: "permanent", errorCode: "provider_conflict" };
  }

  if (response.status >= 500) {
    return { kind: "retryable", errorCode: "provider_server_error" };
  }

  return { kind: "permanent", errorCode: "provider_rejected" };
}

export function createLinePushSender(fetchImpl: LineFetch = fetch): LinePushSender {
  return {
    send: (input) => sendLineTextPush(input, fetchImpl),
  };
}
