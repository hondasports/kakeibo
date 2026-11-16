/**
 * レシート画像抽出のユースケース。
 * 認証は presentation 層で済んでいる前提。
 */
import type {
  ExtractReceiptFieldsInput,
  ReceiptExtractorDeps,
} from "../../domain/receiptImageExtraction/ports";
import {
  assertValidImageDataUrl,
  resolveExtractionPlan,
} from "../../domain/receiptImageExtraction/rules";

export async function extractReceiptFields<TResult>(
  deps: ReceiptExtractorDeps<TResult>,
  args: ExtractReceiptFieldsInput,
): Promise<TResult> {
  assertValidImageDataUrl(args.imageDataUrl);

  const plan = resolveExtractionPlan(deps.readEnvironment());

  if (plan.kind === "mock") {
    return deps.extractMock();
  }

  return await deps.extractReal({
    imageDataUrl: args.imageDataUrl,
    apiKey: plan.apiKey,
    telemetryId: args.telemetryId,
    categories: args.categories,
  });
}
