import { ConvexError } from "convex/values";
import type {
  ExtractReceiptFieldsResult,
  OpenAIReceiptExtractorArgs,
  OpenAIResponsesApiResponse,
} from "./types";
import { buildOpenAIReceiptExtractionRequestBody } from "../../../lib/domain/receiptImageExtraction/extractionRequest";
import { parseOpenAIResponse } from "./parseExtraction";
import { logReceiptExtractionStage } from "./telemetry";

const OPENAI_RECEIPT_TIMEOUT_MS = 120_000;

function isTimeoutError(err: unknown) {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

export async function callOpenAIReceiptExtractor({
  imageDataUrl,
  apiKey,
  telemetryId,
  categories,
  categoryNames = [],
}: OpenAIReceiptExtractorArgs): Promise<ExtractReceiptFieldsResult> {
  const requestBody = buildOpenAIReceiptExtractionRequestBody(
    imageDataUrl,
    categories ?? categoryNames,
  );

  let response: Response;
  const httpStartedAt = Date.now();
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(OPENAI_RECEIPT_TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = isTimeoutError(err);
    logReceiptExtractionStage({
      telemetryId,
      stage: "openai_http",
      durationMs: Date.now() - httpStartedAt,
      outcome: "failure",
      failureKind: timeout ? "timeout" : "network",
    });
    throw new ConvexError(
      timeout
        ? "[receipt_extraction:timeout] OpenAI API への接続がタイムアウトしました"
        : "[receipt_extraction:network] OpenAI API への接続に失敗しました",
    );
  }

  logReceiptExtractionStage({
    telemetryId,
    stage: "openai_http",
    durationMs: Date.now() - httpStartedAt,
    outcome: response.ok ? "success" : "failure",
    httpStatus: response.status,
    failureKind: response.ok ? undefined : "http_error",
  });

  if (!response.ok) {
    throw new ConvexError(
      `[receipt_extraction:http_error] OpenAI API がエラーを返しました（HTTP ${response.status}）`,
    );
  }

  let data: OpenAIResponsesApiResponse;
  const jsonStartedAt = Date.now();
  try {
    data = (await response.json()) as OpenAIResponsesApiResponse;
  } catch (err) {
    const failureKind = isTimeoutError(err)
      ? "timeout"
      : err instanceof SyntaxError
        ? "malformed_json"
        : "network";
    logReceiptExtractionStage({
      telemetryId,
      stage: "json_parse",
      durationMs: Date.now() - jsonStartedAt,
      outcome: "failure",
      failureKind,
    });
    throw new ConvexError(
      failureKind === "timeout"
        ? "[receipt_extraction:timeout] OpenAI API のレスポンス受信がタイムアウトしました"
        : failureKind === "malformed_json"
          ? "[receipt_extraction:malformed_json] OpenAI API のレスポンスを JSON としてパースできませんでした"
          : "[receipt_extraction:network] OpenAI API のレスポンス受信に失敗しました",
    );
  }

  logReceiptExtractionStage({
    telemetryId,
    stage: "json_parse",
    durationMs: Date.now() - jsonStartedAt,
    outcome: "success",
    responseStatus: data.status,
    incompleteReason: data.incomplete_details?.reason,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    totalTokens: data.usage?.total_tokens,
  });

  if (data.status === "incomplete" || data.incomplete_details) {
    throw new ConvexError(
      `[receipt_extraction:incomplete] OpenAI API の出力が途中で終了しました${
        data.incomplete_details?.reason ? `（${data.incomplete_details.reason}）` : ""
      }`,
    );
  }

  const validationStartedAt = Date.now();
  try {
    const parsed = parseOpenAIResponse(data);
    logReceiptExtractionStage({
      telemetryId,
      stage: "domain_validation",
      durationMs: Date.now() - validationStartedAt,
      outcome: "success",
    });
    return parsed;
  } catch (err) {
    logReceiptExtractionStage({
      telemetryId,
      stage: "domain_validation",
      durationMs: Date.now() - validationStartedAt,
      outcome: "failure",
      failureKind: "domain_validation",
      failureDetail: err instanceof Error ? err.message.slice(0, 160) : "unknown_validation_error",
    });
    throw new ConvexError(
      "[receipt_extraction:domain_validation] OpenAI API の応答後検証に失敗しました",
    );
  }
}
