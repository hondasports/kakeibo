type ReceiptExtractionStage = "openai_http" | "json_parse" | "domain_validation" | "save";

type ReceiptExtractionTelemetry = {
  telemetryId?: string;
  stage: ReceiptExtractionStage;
  durationMs: number;
  outcome: "success" | "failure";
  httpStatus?: number;
  responseStatus?: string;
  incompleteReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  failureKind?: string;
  failureDetail?: string;
  saveKind?: "result_draft" | "failure_draft";
};

/** レシート本文・画像を含めない、段階別の構造化ログ。 */
export function logReceiptExtractionStage(event: ReceiptExtractionTelemetry) {
  console.info("receipt_extraction_stage", event);
}

export async function measureReceiptExtractionSave<T>(
  telemetryId: string | undefined,
  saveKind: "result_draft" | "failure_draft",
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    logReceiptExtractionStage({
      telemetryId,
      stage: "save",
      durationMs: Date.now() - startedAt,
      outcome: "success",
      saveKind,
    });
    return result;
  } catch (err) {
    logReceiptExtractionStage({
      telemetryId,
      stage: "save",
      durationMs: Date.now() - startedAt,
      outcome: "failure",
      failureKind: "draft_save",
      saveKind,
    });
    throw err;
  }
}
