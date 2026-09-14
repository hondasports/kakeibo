/**
 * レシート画像抽出のユースケース。
 * 認証は presentation 層で済んでいる前提。
 */
import type {
  ExtractReceiptFieldsInput,
  ReceiptExtractionContextReader,
  ReceiptExtractorDeps,
} from "../../domain/receiptImageExtraction/ports";
import {
  assertGroupSelected,
  assertReceiptImageConsent,
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
    categoryNames: args.categoryNames ?? [],
    categories: args.categories,
  });
}

/**
 * 公開 action 用: グループ選択と外部 API 同意を確認し、有効カテゴリをヒントとして抽出する。
 */
export async function extractReceiptFieldsForCurrentGroup<TGroup, TResult>(
  reader: ReceiptExtractionContextReader<TGroup>,
  extract: (args: ExtractReceiptFieldsInput) => Promise<TResult>,
  args: { imageDataUrl: string },
): Promise<TResult> {
  assertGroupSelected(await reader.getMyGroup());

  const [consent, categories] = await Promise.all([
    reader.getReceiptImageConsent(),
    reader.listActiveCategories(),
  ]);
  assertReceiptImageConsent(consent);

  return await extract({ ...args, categories });
}
